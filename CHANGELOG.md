# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Node.js 22 or later is now required — `ink@7` never ran on older versions.
  The `yoinks` command now exits with a clear message instead of crashing
  on startup. (#37, thanks @agammann)

### Fixed

- Centering no longer collapses spacer rows when the leftover space is odd.
- The dim auto-theme button no longer splits into bands.

### Added

- Continuous integration on Linux, macOS and Windows with Node 22 and 24.
- `CONTRIBUTING.md`, `ROADMAP.md` and this changelog.

## [0.3.1] - 2026-07-16

### Fixed

- Layout no longer shifts between phases.
- The downloading screen lines up with the other phases.
- Button fill brightness matches in the auto theme.

## [0.3.0] - 2026-07-16

### Added

- Terminal-aware light and dark themes, with `--theme auto|light|dark`.

## [0.2.0] - 2026-07-16

### Added

- Everything on screen is clickable.

### Changed

- `--version` is read from `package.json` instead of a hardcoded constant.
- The format picker title is left-aligned.

## [0.1.1] - 2026-07-16

First public release: paste a url, pick a format, get the file in
`~/Downloads`. Animated logo, input history, clipboard url offered with ⇥,
esc to cancel, progress bar with part labels for merged downloads.

[Unreleased]: https://github.com/poppnn/yoinks/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/poppnn/yoinks/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/poppnn/yoinks/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/poppnn/yoinks/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/poppnn/yoinks/releases/tag/v0.1.1
