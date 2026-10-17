import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { FreeAtHomeController } from '../src/controller.js';
import { prompt } from './prompt.js';

const directory = new URL('../data/', import.meta.url);
const file = new URL('controller.json', directory);

try {
  const command = process.argv[2];
  if (command === 'setup') {
    if (!process.stdin.isTTY) {
      console.error('Run setup in an interactive terminal on the Mac.');
      process.exit(1);
    }
    console.error(
      'Controller setup: enter the three values below. No network request will be sent.',
    );
    const config = {
      controller_url: (await prompt('Local controller URL (http:// or https://): ')).trim(),
      api_username: await prompt('Local API username: ', true),
      api_password: await prompt('Local API password: ', true),
    };
    new FreeAtHomeController(config); // Validate locally; setup makes no network request.
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    // Exclusive creation never overwrites existing credentials (or follows a symlink).
    await writeFile(file, `${JSON.stringify(config)}\n`, { mode: 0o600, flag: 'wx' });
    console.log('Saved local diagnostic credentials with mode 600. No controller request sent.');
  } else if (command === 'check') {
    const controller = new FreeAtHomeController(JSON.parse(await readFile(file, 'utf8')));
    const configuration = await controller.getConfiguration();
    const systems = Object.values(configuration);
    const devices = systems.flatMap((system) => Object.values(system.devices));
    console.log(
      `Read-only API check OK: ${systems.length} controller(s), ${devices.length} device(s).`,
    );
    console.log('No identifiers, names or configuration were printed; no devices were operated.');
  } else {
    throw new Error('Use npm run setup:controller or npm run check:controller.');
  }
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error('Local credentials missing. Run npm run setup:controller on the Mac first.');
  } else if (error.code === 'EEXIST') {
    console.error(
      'Credentials already exist. Edit data/controller.json locally; setup will not overwrite it.',
    );
  } else {
    // File parse errors can include secret source text; never print arbitrary errors.
    console.error(
      'Controller setup/check failed. Check the local settings, API access and TLS trust.',
    );
  }
  process.exitCode = 1;
}
