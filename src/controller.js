import WebSocket from 'ws';

/** Official local API. Only datapoint commands write; no installation changes. */
export class FreeAtHomeController {
  constructor({ controller_url, api_username, api_password }, { fetch = globalThis.fetch } = {}) {
    let url;
    try {
      url = new URL(controller_url);
    } catch {
      throw new Error('Enter a valid controller URL including http:// or https://.');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        'Use only the controller origin, without credentials, path, query or fragment.',
      );
    }
    if (
      typeof api_username !== 'string' ||
      !api_username ||
      /[:\r\n]/.test(api_username) ||
      typeof api_password !== 'string' ||
      !api_password ||
      /[\r\n]/.test(api_password)
    ) {
      throw new Error('Enter the local API username and password.');
    }
    this.url = new URL('/fhapi/v1/api/rest/configuration', url);
    this.authorization = `Basic ${Buffer.from(`${api_username}:${api_password}`).toString('base64')}`;
    this.fetch = fetch;
  }

  async request(path, { method = 'GET', body, signal = AbortSignal.timeout(5000) } = {}) {
    let response;
    try {
      response = await this.fetch(new URL(path, this.url), {
        method,
        body,
        headers: {
          Authorization: this.authorization,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'text/plain' }),
        },
        redirect: 'error',
        signal,
      });
    } catch {
      throw new Error(
        'Controller request failed. Check reachability, URL and TLS certificate trust.',
      );
    }
    if (!response.ok) {
      throw new Error(`Controller API returned HTTP ${response.status}.`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error('Controller API did not return JSON configuration.');
    }
  }

  async getConfiguration() {
    const configuration = await this.request('/fhapi/v1/api/rest/configuration');
    if (
      !configuration ||
      typeof configuration !== 'object' ||
      Array.isArray(configuration) ||
      Object.keys(configuration).length === 0 ||
      Object.values(configuration).some(
        (sysap) =>
          !sysap?.devices || typeof sysap.devices !== 'object' || Array.isArray(sysap.devices),
      )
    ) {
      throw new Error('Controller API returned an unexpected configuration format.');
    }
    return configuration;
  }

  datapointPath({ system, serial, channel, point }) {
    const path = [system, serial, channel, point];
    if (path.some((part) => typeof part !== 'string' || !/^[a-z0-9_-]+$/i.test(part))) {
      throw new Error('Invalid datapoint target.');
    }
    return `/fhapi/v1/api/rest/datapoint/${system}/${serial}.${channel}.${point}`;
  }

  async getDatapoint(target, options) {
    const response = await this.request(this.datapointPath(target), options);
    const value = response?.[target.system]?.values?.[0];
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new Error('Controller returned an unexpected datapoint value.');
    }
    return value;
  }

  async setDatapoint(target, value, options) {
    if (!target.point.startsWith('idp') || !/^-?\d+(\.\d+)?$/.test(value)) {
      throw new Error('Invalid datapoint command.');
    }
    // Do not retry writes: a lost response does not mean the command failed.
    const response = await this.request(this.datapointPath(target), {
      ...options,
      method: 'PUT',
      body: value,
    });
    if (response?.[target.system]?.result !== 'OK')
      throw new Error('Controller did not confirm the command.');
  }

  subscribe(
    { onConnect, onEvent, onDisconnect, onError },
    { reconnectMs = 1000, heartbeatMs = 30000 } = {},
  ) {
    const url = new URL('/fhapi/v1/api/ws', this.url);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    let stopped = false;
    let socket;
    let retry;
    let attempts = 0;
    let heartbeat;
    function connect() {
      let ready = false;
      let alive = true;
      let queue = Promise.resolve();
      socket = new WebSocket(url, {
        headers: { Authorization: this.authorization },
        handshakeTimeout: 5000,
        maxPayload: 32 * 1024 * 1024,
      });
      const current = socket;
      current.on('error', () => {}); // Never leak raw ws errors (URL/headers).
      current.on('pong', () => {
        alive = true;
      });
      current.on('open', () => {
        queue = onConnect()
          .then(() => {
            if (stopped || socket !== current || current.readyState !== WebSocket.OPEN) return;
            attempts = 0;
            ready = true;
          })
          .catch(() => {
            onError();
            current.terminate();
          });
        heartbeat = setInterval(() => {
          if (!alive) return current.terminate();
          alive = false;
          current.ping();
        }, heartbeatMs);
      });
      current.on('message', (data) => {
        const live = ready;
        queue = queue
          .then(async () => {
            if (stopped || socket !== current || current.readyState !== WebSocket.OPEN) return;
            let payload;
            try {
              payload = JSON.parse(data.toString());
            } catch {
              return;
            }
            if (payload && typeof payload === 'object' && !Array.isArray(payload))
              await onEvent(payload, { live });
          })
          .catch(() => {
            onError();
            current.terminate();
          });
      });
      current.on('close', () => {
        ready = false;
        clearInterval(heartbeat);
        if (stopped) return;
        onDisconnect();
        retry = setTimeout(
          connect.bind(this),
          Math.min(60000, reconnectMs * 2 ** Math.min(attempts++, 6)),
        );
      });
    }
    connect.call(this);
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(heartbeat);
      socket.terminate();
    };
  }
}
