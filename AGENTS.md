# free@home integration guidance

This is a standalone Gladys Assistant external integration, separate from both
`../gladys` (core) and `../gladys-ff-agent`. Use Node.js 24 and the official
JavaScript SDK/template and external-integration contracts, not an in-core service.

## Scope

- Work locally on this Mac. Do not create or configure orbs.
- Read the official integration documentation and the living contracts under
  `../gladys/docs/specs/external-integrations/` before implementation.
- Establish the user's free@home controller model, firmware/API availability and
  desired initial devices before choosing a transport or inventing an API.
- Do not change Gladys core or FF-Agent here. A necessary core fix belongs in a
  separate Gladys Core project thread and worktree.
- The shared development instance runs on ports 1443 (API) and 1444 (frontend).
  Use a unique integration selector, its own process and its own credentials;
  never reuse or alter FF-Agent's registration, tokens or configuration.
- Read FF-Agent's development helper as a reference if useful, but do not copy
  credentials, personal configuration or integration-specific behavior.
- Do not operate physical devices or alter the free@home installation without
  explicit authorization. Tests should inject/mock provider requests.
- Never commit or log credentials, device identifiers, private network details or
  personal data. Keep local secrets in ignored files with restrictive permissions.

## Workflow

- Continue development directly on `main`, as requested by Stefan. Keep changes
  scoped and reviewable.
- Ask before pushing further work, opening PRs, making the repository public,
  publishing images/releases, or submitting to the Gladys Store.
- No Store-discovery topic (`gladys-assistant-integration`) at this stage.
- Verify behavior using the SDK's testing tools and inspect real Gladys rendering
  for UI changes. Follow the established English/French/German localization pattern.
- See README.md for implemented scope, verified behavior and remaining publication
  steps. Public source code does not imply a published Docker image or release.
- Follow docs/releasing.md for CI, release types, bare X.Y.Z tags and publication
  checks. Normal main pushes must not publish; release jobs require explicit approval.
