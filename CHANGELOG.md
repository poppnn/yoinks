# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Sign in for videos that need an account** with `--cookies <file>` or
  `--cookies-from-browser <browser>`. Never on by default. If the cookies
  can't be read — common on Windows, where Chromium browsers lock them —
  yoinks carries on without them and says why, so public videos still
  download. (#11)
- `-o, --output <dir>` saves somewhere else. (#34, thanks @lennin331)
- `-n, --name <name>` picks the file name. (#6; validation from #7,
  thanks @aliabedi1)
- `--best` and `--mp3` skip the picker and the interface, for scripts:
  only the file path goes to stdout. yoinks also runs this way on its own
  when its output isn't a terminal.
- `~/.config/yoinks/config.json` for defaults: output folder, cookies,
  theme, format.
- Press `o` when done to open the folder. (from #23, thanks
  @SuperProCoolName)
- MP3s get artist and title tags (from "Artist - Title" names) and the
  thumbnail as cover art; videos get their tags and chapters. Needs
  ffmpeg, which yoinks bundles. (#12, #3)
- `yoinks --update` updates yoinks' own yt-dlp right away.
- Continuous integration on Linux, macOS and Windows with Node 22 and 24.
- `CONTRIBUTING.md`, `ROADMAP.md` and this changelog.

### Changed

- Downloads go to your system's Downloads folder even if you moved it
  (Windows Known Folder, `XDG_DOWNLOAD_DIR` on Linux), instead of always
  `~/Downloads`. (#22)
- Fragmented streams (X, Twitch, Vimeo…) download four fragments at a
  time. (from #23)
- **Videos play everywhere.** yt-dlp's own preference gave VP9 or AV1
  with Opus audio, which QuickTime and many players can't play — sound but
  no picture. yoinks now asks for H.264 with AAC (YouTube has it up to
  1080p), then AV1 with AAC. Rows that aren't H.264 name their codec in
  the picker, e.g. `2160p · mp4 · AV1`. (#32, thanks @g9i)
- **yoinks now keeps its own yt-dlp up to date.** It used to prefer any
  yt-dlp on your PATH, however old, and never updated the copy it had
  downloaded — the cause of most "format not available" and 403 errors (#8).
  It now uses its own copy in `~/.yoinks/bin`, checks for a new release at
  most once a day, and verifies every download against the release's
  SHA-256 checksums. Set `YOINKS_YT_DLP` to use a different yt-dlp.
- Node.js 22 or later is now required — `ink@7` never ran on older versions.
  The `yoinks` command now exits with a clear message instead of crashing
  on startup. (#37, thanks @agammann)

### Fixed

- The size shown for each resolution is the size of what gets downloaded,
  not just the audio's. (thanks @g9i)
- **You no longer get an old file instead of the one you picked.** yt-dlp
  won't overwrite an existing file, so a second download with the same
  name (another resolution, or another video with the same title) handed
  back the earlier file. Downloads now get a free name such as
  `clip (1).mp4`. Cancelled downloads leave no partial files behind.
  (thanks @g9i; the partial-file cleanup also covers #18, thanks @Mr-Neutr0n)
- Quitting during a download stops it instead of hanging the terminal
  until it finishes. (thanks @g9i)
- The shell prompt no longer prints over the "✓ yoinked →" line. (thanks @g9i)
- Temporary video-info files are deleted instead of piling up in the temp
  folder, several MB each for long videos. (thanks @g9i)
- "Try again" after an error keeps the link. (thanks @g9i)
- The url field and its button fit terminals narrower than 72 columns.
  (thanks @g9i)
- ^v pastes into the url field in terminals that send it as a key instead
  of pasting, such as most Linux terminals and the legacy Windows console.
  (#29)
- Errors are explained in plain words when a video needs a signed-in
  account, or when yt-dlp is likely out of date, instead of yt-dlp advice
  about flags yoinks doesn't have.
- Centering no longer collapses spacer rows when the leftover space is odd.
- The dim auto-theme button no longer splits into bands.

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
