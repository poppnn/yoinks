# Contributing to yoinks

Thanks for helping. yoinks aims to stay small: **paste. yoink. done.**
Before starting on a feature, check [ROADMAP.md](ROADMAP.md) or open an
issue so we can agree on the approach first.

## Setup

Requires Node.js 22 or later.

```sh
npm ci
npm run build
node bin/yoinks.js <url>
```

`npm run dev` rebuilds on change. `npm link` installs your working copy
as the global `yoinks` command.

## Before you open a pull request

Run the same checks as CI:

```sh
npm run typecheck
npm test
npm run build
```

Tests live next to the code they cover (`src/**/*.test.ts`) and run with
Node's built-in test runner through `tsx`. Bug fixes should come with a
test that fails without the fix whenever the code can be tested without a
terminal.

## Pull requests

- **One topic per pull request.** Small PRs get reviewed and merged
  quickly; a PR that touches many unrelated things will be asked to split.
- **One commit per logical change**, with a message that says what it fixes
  or adds (`fix: …`, `feat: …`, `docs: …`, `ci: …`).
- Add a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md)
  for anything a user would notice.
- Explain how you verified the change, especially on platforms you could
  test (Windows, macOS, Linux).

## yt-dlp options

yoinks drives yt-dlp and parses its output for progress. Options that
change that output (`--quiet`, `--print`, `-o`, progress templates) can
silently break the progress bar or the final file path, so changes to
the arguments in `src/lib/ytdlp.ts` need extra care.

**Never enable an option by default if it can fail on some machines.**
For example, `--cookies-from-browser` aborts every download when cookie
extraction fails — including public videos — so it must stay opt-in.

## Reporting bugs

Include:

- the output of `yoinks --version` and `yt-dlp --version`;
- your OS and terminal;
- the url (if it is public) and the exact error message.

Many download failures come from an outdated yt-dlp; update it first.
