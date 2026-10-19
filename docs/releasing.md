# Maintainer release guide

This repository owns its release process. The global integration-development
skill is general guidance, not a dependency or a substitute for this runbook.
Use [development.md](development.md) for local registration and [the README](../README.md)
for supported functions, hardware verification and known limitations.

## Current delivery state and approvals

Version **0.1.0 was published on 2026-10-19** using the manual `initial` workflow.
The source repository and GHCR package are public. Anonymous downloads and the
11 runtime tests passed for both AMD64 and ARM64; full Store validation and a
separate GitHub-URL installation with real controller discovery and restart
also passed. The temporary registration was removed without altering existing
registrations or devices. No device commands were sent during release checks.
Store discovery is deliberately disabled; `1.0.0` is not yet published.

Preparing files and running local checks do not authorize publication. Obtain
explicit approval before pushing source, triggering a release or publishing an
image. Making the GHCR package public is a separate, irreversible visibility
decision. Adding the `gladys-assistant-integration` repository topic needs separate
approval; it is not required for GitHub-URL installation.

Package and image metadata declare `Apache-2.0`, matching FF-Agent. A standalone
license file is deliberately deferred at the maintainer's request; dependencies
retain their own licenses and vendor trademarks are not licensed.

## Workflow responsibilities

| File                                   | Entry point                                                     | Effects                                                                                    |
| -------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `.github/workflows/ci.yml`             | Push to `main`, pull request, or release call with exact commit | Format, lint, tests, metadata validation; build and test amd64/arm64 without pushing       |
| `.github/workflows/release.yml`        | Manual request on `main` or stable `X.Y.Z` tag push             | Prepare version if manual, validate candidate, call CI, publish image, then GitHub Release |
| `.github/workflows/build.yml`          | Reusable workflow only, after successful CI                     | Publish version and `latest` images to GHCR                                                |
| `.github/workflows/github-release.yml` | Reusable workflow only, after image publication                 | Create the GitHub Release from changelog notes                                             |

Ordinary commits on `main` do not bump versions, create tags or publish images.
Write changes under `CHANGELOG.md` → `Unreleased`; release a deliberate group of
changes, not every commit. No personal access token or controller credentials
are needed in Actions. The jobs use `GITHUB_TOKEN` with scoped `contents: write`
and `packages: write` where needed. Repository/branch/package policies must allow
those operations; do not weaken protections to work around a failed release.

## 1. Verify the candidate locally

Use Node 24:

```sh
npm ci
npm run format:check
npm run lint
npm test
npx --yes github:GladysAssistant/integration-store --skip-image-check .
```

The validator downloads the public cover. Skipping image checks validates only
metadata, not registry access or installation. Review the changelog and the
manifest's compatibility range before publishing. Slats, the separate down
command and the second tested rocker side are not hardware-verified; do not
describe synthetic tests as physical tests. Dimming was manually confirmed at
31% and 73% with matching feedback and off at 0%.

Build and execute both packaged runtimes without publishing:

```sh
for arch in arm64 amd64; do
  docker build --platform "linux/$arch" -t "gladys-freeathome-release-check:$arch" .
  docker run --rm --platform "linux/$arch" --network none --read-only \
    --cap-drop ALL --security-opt no-new-privileges \
    --memory 256m --cpus 0.5 --pids-limit 100 \
    --mount "type=bind,src=$PWD/test,dst=/app/test,readonly" \
    "gladys-freeathome-release-check:$arch" \
    node --test test/app.test.js test/controller.test.js
done
```

These are the runtime tests only: release-tooling tests need development
dependencies and run on the host in `npm test`. Offline runtime tests use a
synthetic HTTP/WebSocket controller, never the real installation. Docker Desktop
emulation does not replace a real host of each architecture.

Separately verify the actual container in local Gladys: SDK/controller status,
read-only connection test, discovery, secret-redacted configuration roundtrip,
restart, stop/start and update in place. Compare registration, devices, names,
rooms and configuration before/after. Do not uninstall the existing development
registration or run another SDK client with its selector. Any physical command
needs explicit approval, including tests of a production installation.

## 2. Publish an approved release

After approval and after pushing the checked source, use **Actions → Release →
Run workflow**, choose branch `main`, and select the release type:

| Selection | Current `0.1.0` becomes | Meaning                                           |
| --------- | ----------------------- | ------------------------------------------------- |
| `initial` | `0.1.0`                 | First release, only before any version tag exists |
| `patch`   | `0.1.1`                 | Compatible fixes                                  |
| `minor`   | `0.2.0`                 | Compatible additions                              |
| `major`   | `1.0.0`                 | Explicit major version transition                 |

`initial` records the completed first publication above and is no longer
available. For the planned stable launch from `0.1.0`, choose `major` only after
approval. Store discovery remains a separate gate; the release workflow never
adds the repository topic.

The workflow does not infer release types from commit messages. Normal
development does not change the package version. `initial` keeps the current
version; the other choices use `npm version --no-git-tag-version`. The workflow
then:

1. Synchronizes package/lockfile versions, manifest version and GHCR image tag.
2. Moves non-empty `Unreleased` notes to a dated version section, creating links.
3. Atomically pushes a release commit to `main` and an annotated `X.Y.Z` Git tag.
4. Confirms stable tag syntax, tag-to-commit identity, ancestry on `main`, matching
   metadata and release notes with an empty `Unreleased` section.
5. Runs all CI checks on that **exact commit**, including both container variants.
6. Builds amd64/arm64 images from the same commit and publishes `:X.Y.Z` and
   `:latest`, including source/revision/version and Gladys manifest labels.
7. Creates the GitHub Release only after successful image publication.

All version tags and release titles use the bare number: **`0.1.0`, not `v0.1.0`**.
The manifest uses the versioned image, never `latest`. Only stable versions are
supported. For automation, the equivalent human-approved command is:

```sh
gh workflow run release.yml --ref main -f release-type=patch
```

This command publishes; it is **not a dry run**. The manual workflow continues
its own pipeline after the tag push because `GITHUB_TOKEN` pushes do not start
another workflow. Directly pushing an approved `X.Y.Z` tag is also supported,
but package/lockfile/manifest/changelog must already match that version on `main`;
no second version bump occurs. A `v`-prefixed tag does not start this pipeline.

The atomic push covers the branch and tag, not GHCR and GitHub Releases. The
manifest may temporarily reference an unavailable image while the build runs;
do not advertise installation until the checks below pass.

## 3. Verify public distribution

Once the package exists, and only after visibility approval, open **GitHub profile
→ Packages → gladys-freeathome → Package settings → Danger Zone → Change visibility
→ Public**. A public repository and OCI source label do not make its package
public. GitHub warns that a public package cannot be made private again.

Verify the exact released image anonymously without changing the user's Docker
login. Replace the version below for later releases:

```sh
image=ghcr.io/stefanbauer/gladys-freeathome:0.1.0
anonymous_config="$(mktemp -d)"
trap 'rm -rf "$anonymous_config"' EXIT
docker --config "$anonymous_config" manifest inspect "$image"
for arch in amd64 arm64; do
  docker --config "$anonymous_config" pull --platform "linux/$arch" "$image"
done
npx --yes github:GladysAssistant/integration-store .
```

Check that the remote index actually contains both architectures, and inspect
the source, revision, version and embedded-manifest labels. Run the packaged
runtime tests against each downloaded variant using test files from the exact
release commit. A successful build is not proof of an anonymous pull.

Install from `https://github.com/stefanbauer/gladys-freeathome` in a controlled
Gladys instance and verify connection, configuration, discovery and lifecycle.
Keep this separate from the existing image-only development registration: that
registration has no repository identity and is not automatically adopted by a
Store listing. Do not delete it to "migrate" its image; deletion removes devices
and configuration. Clean up only disposable test registrations after checking
that their deletion cannot remove user-owned data.

Update availability notices in README and EN/FR/DE documentation **after** the
release is anonymously pullable and installation succeeds. These actions are not
performed automatically by the release workflow. Record actual delivery status:
source pushed, tag created, image published, anonymous pulls checked, installation
verified and catalog indexing are different milestones.

## 4. Recovery and updates

- A transient failure after the tag push: inspect it and rerun **failed jobs**.
  Do not rerun the version-preparation job or the complete manual release.
- Never move an existing version tag or overwrite a versioned image with changed
  source. A source fix requires a new commit and version.
- If the image was published but GitHub Release creation failed, rerun that
  failed job, not the image build or version preparation.
- Each later release follows the same checks and chooses patch/minor/major.
- Existing users update through Gladys. Verify devices/configuration survive;
  never use uninstall/reinstall as an update mechanism.

## 5. Optional Store discovery

Store discovery remains **not approved**. Only after separate approval add the
repository topic `gladys-assistant-integration`. It is not a Git tag or issue
label, and no workflow sets it. The catalog normally indexes hourly; verify both
its index and rejection report before claiming the integration is listed.

Required documents are `docs/en.md` and `docs/fr.md`, each at least 300 characters.
The public root manifest must validate and its image must be anonymously pullable.
The optional cover must be direct HTTPS PNG/JPEG, 800 × 534 pixels, under 150 KB.
GitHub-URL installation needs the public manifest/image but no discovery topic.

## References

- [Official Gladys integration documentation](https://gladysassistant.com/docs/dev/external-integrations/)
- [GitHub package visibility](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility#configuring-visibility-of-packages-for-your-personal-account)
