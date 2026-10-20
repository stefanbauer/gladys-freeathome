# Changelog

Changes to free@home for Gladys Assistant. Unreleased entries are not yet published.

## [Unreleased]

### Added

- Discover impulse actuators (`FID_TRIGGER`, `0x0045`) as writable Gladys push
  buttons. Each press sends one trigger to pairing ID `2`; pulse duration stays
  in free@home, without a software reset or invented actuator/door feedback.
- SDK regression coverage for repeated presses, input pairing resolution,
  rejected values, ownership, lost responses and removed trigger inputs.
  Physical impulse actuation has not been tested.

### Documentation

- Record verified stable images, GitHub-URL installation, local-artifact privacy
  checks and approved Store-topic activation; catalog indexing remains separate.

## [1.0.0] - 2026-10-19

### Stable release

- Promote the verified local free@home integration to the first stable release.
  Device behavior is unchanged from `0.1.0`; hardware verification limits below
  still apply. Public catalog discovery is enabled separately after image checks.
- Exclude local `.amp/in/` review artifacts in the shared Git ignore rules;
  these files were never tracked and remain excluded from Docker builds.

### Documentation

- Document published `0.1.0` images and GitHub-URL installation, with anonymous
  pull, packaged-runtime and fresh-install verification results.

## [0.1.0] - 2026-10-19

### Added

- Local REST and WebSocket integration for switched outputs, dimmable lights,
  blinds/shutters, optional slat opening and button-triggered Gladys scenes.
- Per-channel discovery with stable identifiers, user-owned device lifecycle
  and channel suffixes when supported channels on one device share a name.
- Controller reconnection, feedback-based states, snapshot resynchronization
  without synthetic button events, and no automatic retries of device commands.
- Non-root Docker runtime and isolated local development helpers.
- English, French and German documentation and independent integration artwork.
- Deliberate versioned release pipeline: CI before multi-architecture image
  publication, matching package/manifest/tag metadata, and changelog release notes.

### Verification and limits

- Local checks confirmed switched-light control, blind positioning/up/stop,
  repeated button scene events, dimming at 31% and 73%, and switch-off at 0%.
- Lamella control, the separate downward command and the second tested rocker
  side remain synthetic-test coverage only. Slats use percentage, not degrees.
- Button events during disconnect/resynchronization are not replayed. ABB's
  combined stop/step command retains a documented read/write race.

[Unreleased]: https://github.com/stefanbauer/gladys-freeathome/compare/1.0.0...HEAD
[1.0.0]: https://github.com/stefanbauer/gladys-freeathome/compare/0.1.0...1.0.0
[0.1.0]: https://github.com/stefanbauer/gladys-freeathome/releases/tag/0.1.0
