# free@home for Gladys Assistant

Independent external integration for connecting free@home to Gladys Assistant.

## Status

Project initialization only. No device discovery, control, or production integration
has been implemented yet. The free@home controller model, available API and initial
device scope still need to be established.

## Local development

- Repository: `~/Herd/gladys-freeathome`
- Node.js: 24 (`nvm use` with nvm loaded)
- Shared Gladys checkout: `~/Herd/gladys`
- Local Gladys API: `http://localhost:1443`
- Local Gladys frontend: `http://localhost:1444`

This integration must use its own registration, credentials and process. Never reuse
the FF-Agent integration's registration or tokens. There is no `npm start` script
for this repository yet; the official SDK/template setup is the next step.

## References

- [Gladys external integrations](https://gladysassistant.com/docs/dev/external-integrations/)
- [Official JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
- Living contracts in `../gladys/docs/specs/external-integrations/`

The repository starts private. No Gladys Store listing, image publication or release
is configured.
