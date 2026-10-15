# yoinks — Takeover roadmap

**English** · [Français](ROADMAP.fr.md)

> Diagnosis of 9 October 2026, on `pablostanley/yoinks@6f03720` (v0.3.1). Updated 12 October 2026: **phases 0 to 5 are done**, and v0.4.0 was published on npm as `yoinks-cli` on 12 October 2026.

## 1. Where things stood

| | |
|---|---|
| Code | ~1,900 lines of TypeScript (Ink + React), 29 commits, MIT licence |
| Audience | 5,577 stars, 470 forks |
| Waiting | 15 issues + 13 open PRs, **no answer from the maintainer** |
| Upstream activity | last push on **17 July 2026**, the day after the repository was created |
| npm | the name `yoinks` belongs to `pablostanley`; last published on 17 July |
| Quality | no CI, no changelog; tests only for `args.ts` and `panel.tsx` |
| Forks | none had taken over (the most active had 0 stars) |

The project found its audience, then was left as it was. The PR queue showed that contributors had already done much of the work: taking over meant **sorting, merging and stabilising** far more than rewriting.

### What the author had planned

The original README's "Roadmap" section is folded in here, so there is a single source:

| README item | Status | Where |
|---|---|---|
| Scriptable mode `--best` / `--mp3` (no picker) | ✅ done | Phase 2 |
| `-o <dir>` | ✅ done | Phase 2 |
| Playlists, threads with several videos | ✅ done | Phase 5 |
| Clipboard detection on launch | **already done** (`cli.tsx:56-62`, offered with ⇥) | — |
| yt-dlp self-update | ✅ done | Phase 1 (R1) |
| npm publishing | done | — |
| `curl yoinks.sh \| sh` installer | to decide | §5 |

## 2. Diagnosis: root causes

Each point was checked in the source. Nearly all issues come down to these nine causes.

| # | Root cause | Where | Symptoms |
|---|---|---|---|
| R1 | **yt-dlp never updated.** `ensureYtDlp` takes any system yt-dlp, however old, and never updates the copy it downloads itself. | `ytdlp.ts:39-59` | #8 (the most discussed issue: "it works after `yt-dlp --update`"), YouTube 403s (#17), probably #24 |
| R2 | **Binary run unverified.** The downloaded `yt-dlp.exe` isn't checked, although yt-dlp publishes a `SHA2-256SUMS` file. | `ytdlp.ts:48-57` | Supply-chain risk |
| R3 | **Wrong Node version.** `engines` says `>=18`, but `ink@7` needs `>=22` (checked in the installed dependencies). On Node 18/20 it crashes on startup. | `package.json` | #37 |
| R4 | **Wrong file delivered.** yt-dlp never overwrites an existing file: when the name is taken it skips the download, and yoinks says "yoinked!" pointing at the old file. | `ytdlp.ts:246-247` | #40 |
| R5 | **Unconstrained codecs.** `--merge-output-format mp4` with no codec preference gives AV1/Opus in an `.mp4`, which QuickTime and many players can't play. `scoreVideo` only affects the label shown, not the `-f` selector. | `ytdlp.ts:160-168, 190` | #32, #33, #40 |
| R6 | **No way to pass yt-dlp options.** Arguments are hard-coded and `parseArgs` rejects everything else. | `args.ts`, `ytdlp.ts:231` | #11 (cookies), #3 (chapters), #12 (metadata) |
| R7 | **Hard-coded output folder.** `homedir()/Downloads` ignores moved folders on Windows and `XDG_DOWNLOAD_DIR` on Linux. | `app.tsx:31` | #22, #34 |
| R8 | **^v swallowed.** The `if (key.ctrl)` branch returns without doing anything for `v`. In consoles that send a raw `^V` instead of pasting, pasting is impossible. | `text-input.tsx:140-150` | #29 |
| R9 | **Temporary files never deleted.** Every probe writes a `yoinks-info-*.json` to the temp folder, never removed. | `ytdlp.ts:130-131` | reported in #23 |

## 3. Phases

Estimated effort: **S** = under half a day · **M** = 1 to 2 days · **L** = more.

### Phase 0 — Foundations · before any feature

| Task | Effort | Ref. | Status |
|---|---|---|---|
| Pick the publishing name (see §5) and fork | S | — | ✅ fork `poppnn/yoinks`, npm name `yoinks-cli` |
| Open an upstream issue offering co-maintenance, or asking to bless an "official" fork | S | — | ✅ pablostanley/yoinks#41, unanswered as of 12 October |
| GitHub Actions CI: typecheck, tests, build on ubuntu/macos/windows × Node 22/24 | S | — | ✅ |
| Fix `engines` to `>=22`, with a guard at launch | S | PR #37 | ✅ |
| Add `CHANGELOG.md` and `CONTRIBUTING.md` (one PR = one topic) | S | — | ✅ |
| Check the test suite passes on `main` (PR #17 reported a failing theme test, unverified) | S | — | ✅ it passed: that test wasn't failing |

### Phase 1 — Reliability · v0.4 "it works"

The goal is to make failures go away first: that is what most users run into.

| Task | Effort | Ref. | Status |
|---|---|---|---|
| **yt-dlp lifecycle**: yoinks' own copy comes first, checked at most once a day. `YOINKS_YT_DLP` forces another binary, and the system yt-dlp is the fallback. `yoinks --update` command. | M | R1, #8 | ✅ |
| Check the binary's SHA-256 against `SHA2-256SUMS` before running it | S | R2 | ✅ |
| A staging folder per download, so an old file is never delivered | S | R4, PR #40 | ✅ from #40 |
| Hang on quit | S | PR #40 | ✅ from #40 |
| Remove partial files on cancel | S | PR #18 | ✅ covered by #40's staging folder |
| Delete `yoinks-info-*.json` after use, and on exit | S | R9 | ✅ from #40 |
| ^v: read the clipboard and insert it | S | R8, #29 | ✅ |
| Actionable error messages: account needed, yt-dlp likely outdated | S | — | ✅ |
| *Also from #40:* shell prompt overwriting "yoinked →", link kept after "try again", input too wide below 72 columns | S | PR #40 | ✅ |

Two departures from the plan, learned while doing it:

- **No warning based on yt-dlp's age.** A 50-day-old yt-dlp can well be the latest: there are sometimes weeks without a release. The local hash is compared with the latest release's instead, whatever the date.
- **A failed check counts as done.** Otherwise a network that silently blocks GitHub would make every launch wait 10 seconds.

### Phase 2 — User control · v0.5

| Task | Effort | Ref. | Status |
|---|---|---|---|
| Scriptable mode: `--best` / `--mp3` skip the picker; no interface when stdout isn't a TTY | M | original README | ✅ |
| `-o, --output <folder>` | S | #34, PR #35 | ✅ from #35, its test made portable to Windows |
| Default = the real Downloads folder: Known Folder on Windows, `XDG_DOWNLOAD_DIR` on Linux | S | R7, #22 | ✅ |
| Config file `~/.config/yoinks/config.json`: folder, default format, cookies, theme | M | — | ✅ |
| **Cookies, opt-in only**: `--cookies <file>` and `--cookies-from-browser <browser>`, or from the config | M | R6, #11 | ✅ with a fallback without cookies |
| Custom file name: `-n, --name` | S | #6, PR #7 | ✅ validation from #7 · ⏳ #7's `s` key in the picker not taken |
| Open the folder after downloading (`o` key) | S | PR #23 | ✅ without the timeout that killed the file manager |
| `--concurrent-fragments 4` | S | PR #23 | ✅ |

What doing it added or changed:

- **The config's "format" highlights a choice; it doesn't skip the picker.** Otherwise running `yoinks` without a link would become impossible. It only skips the picker where the picker is skipped anyway, in a pipe.
- **#35's test failed on Windows**, which nobody had seen upstream for lack of CI.
- **Seen while testing**: the "best" video came out as AV1/Opus in an `.mp4`. Phase 3's R5 was real.

> **About cookies.** On Windows, `--cookies-from-browser chrome` fails with Chrome 127+ ("Failed to decrypt with DPAPI", yt-dlp #10927, because of App-Bound Encryption), and Edge too. A failed extraction is **fatal for every download**, public videos included. Hence:
> - cookies stay opt-in, never on by default;
> - when extraction fails, retry without cookies so public content still works;
> - document exporting a `cookies.txt` (private window, then close it without signing out) and the Firefox route.

### Phase 3 — Formats · v0.6

| Task | Effort | Ref. | Status |
|---|---|---|---|
| Videos that play everywhere: H.264/AAC first, then AV1/AAC. Show the codec in the picker. | M | R5, #32 | ✅ selector from #40, codec shown when not H.264 |
| MP3: ID3 tags and cover art | S | #12 | ✅ |
| Embedded chapters | S | #3, PR #4 | ✅ through `--embed-metadata` |

What doing it changed:

- **An explicit selector rather than `-S` sorting.** #40 had already written and tested a clear selector (H.264 → AV1 → anything, AAC first, resolution guaranteed). The meaning of `-S vcodec:h264` ("up to h264 in the internal order") is harder to read. The choice was checked against the real yt-dlp (`--simulate`) on a 4K video, row by row.
- **MP3 tags use the `meta_` fields.** #12's proposal rewrote `title` before the file name was computed, which would have dropped the artist from it.
- **Metadata is only embedded when ffmpeg is there.** Without it, yt-dlp fails the whole download even when the file was fetched. Checked.
- **`--embed-chapters` isn't needed**: `--embed-metadata` already embeds chapters.

### Phase 4 — Accessibility and comfort · v0.7

| Task | Effort | Ref. | Status |
|---|---|---|---|
| `--no-mouse`, `--plain` (no alternate screen), `--no-motion`, honour `NO_COLOR` | M | PR #31 | ✅ also in the config · `NO_COLOR` was already honoured |
| Input readable by screen readers (contiguous spans) | S | PR #31 | ❌ dropped: no effect (see below) |
| Copy the file to the clipboard | S | PR #2 | ✅ `c` key, copies the file itself |
| Pass raw options to yt-dlp (`yoinks <url> -- --opt`), with a list of refused options | M | R6 | ✅ |
| *Also:* restore the terminal on `SIGINT`/`SIGTERM`/`SIGHUP` | S | PR #31 | ✅ |

What doing it changed:

- **#31 was split up here rather than sent back to its author**, since the project was taken over. Of its four topics, some were set aside for good reasons:
  - the current folder as default would have undone #22;
  - `^h` is Backspace in many terminals;
  - the reported progress-bar crash doesn't exist: `'█'.repeat(NaN)` returns an empty string.
- **`NO_COLOR` was already honoured**: the `auto` theme emits no colour at all. Tying it to the animation, as #31 did, mixed two topics.
- **"Input readable by screen readers" changes nothing**: a screen reader reads the terminal's text, which is the same whether Ink produces one node per character or one in all.
- **Checked by actually rendering** the interface into a fake 80×24 terminal: 22 frames in 1.5 s with the animation, 2 with `--no-motion`; mouse reporting only in the default mode; `--plain` is 13 rows tall.
- **#2 copies the file, not its path**, which is more useful. Its `^d` toggle and second settings file were replaced by an on-demand key.
- **Passing options exposed a bug**: any side file (subtitles, thumbnail…) was deleted with the staging folder. Fixed and checked.

### Phase 5 — Playlists · v0.8

| Task | Effort | Ref. | Status |
|---|---|---|---|
| Playlists and threads with several videos: pick items, overall progress | L | original README | ✅ |

What doing it changed:

- **`--no-playlist` stayed.** With `--flat-playlist` added, a real playlist is listed in 2 to 3 seconds without probing every item, while a link to a video inside a playlist (`watch?v=…&list=…`) stays a single video — almost always what is wanted.
- **Progress tracking didn't have to change.** Items download one at a time with `--yes-playlist -I <n>` on the playlist url, so each reuses the single-video path (staging folder, free name, progress, tags), with "2/5" shown above.
- **The playlist url rather than each item's**, because some extractors (X posts with several videos) have no reliable url per item.
- **One failed item doesn't stop the others.** The done screen and the exit code say so.
- **A pre-existing bug fixed on the way**: a playlist link gave a misleading 403, followed by an equally wrong "yt-dlp is out of date".
- **Checked with real keystrokes** sent to the interface in a fake terminal: unticking item 2 of a 3-item playlist saved only `01` and `03`.

### Release · v0.4.0

The five phases ship together as **v0.4.0**, rather than as v0.4 to v0.8 as planned: nothing was published in between, and a single version announces the change of name more clearly.

### Later, or not

| Request | Decision | Reason |
|---|---|---|
| Rewrite in Rust (#38) | **No** | No gain for users, and all the PR work would be lost |
| Docker (#10) | **No** | A terminal interface in a container makes little sense; use yt-dlp directly |
| Termux / Android (#39) | **Document** | Works with `pkg install yt-dlp ffmpeg nodejs`: with no standalone build for Android, yoinks falls back to the system yt-dlp. The guard is done (phase 1): yoinks no longer downloads a glibc Linux binary that can't run there. |
| Translations (#16, PR #16) | **Postponed** | High architectural cost while the interface is still moving |
| Install scripts (PR #9) | **To decide** (§5) | Planned by the original author. Still to settle: publishing a `curl \| sh` means signing and verifying what it downloads. |
| #24, #26, #36 | **Ask for details** | Too little information; #24 is probably R1 |

## 4. Sorting the open PRs

Each PR merges cleanly into `main` on its own, but **they overlap each other**: `app.tsx` is changed by #40, #31, #23, #35, #33 and #16. The merge order matters.

| Order | PR | Decision | Reason |
|---|---|---|---|
| 1 | #37 Node guard | **Taken** (phase 0) | Fixes R3, small, isolated |
| 2 | #40 wrong file, hang, QuickTime | **Taken in full** (6 commits in phase 1, 2 in phase 3) | The PR has 8 commits, not 3. |
| 3 | #18 cleanup on cancel | **Made unnecessary** | #40's staging folder removes all partial files and includes the wait for yt-dlp's exit that #18 had spotted. Credited in the changelog. |
| 4 | #35 `-o` option | **Taken, then adapted** (phase 2) | Wired to the config and the real Downloads folder; its test made portable to Windows |
| 5 | #7 file name | **Partly taken** (phase 2) | The validation, as `-n, --name`; not the picker's `s` key |
| 6 | #33 QuickTime H.264/AAC | **Not taken** (phase 3) | It added a "QuickTime" row next to rows still in AV1/Opus. #40 makes the default compatible for everyone, and its `.quicktime.mp4` suffix worked around a bug already fixed. |
| 7 | #2 copy to clipboard | **Partly taken** (phase 4) | The copy, not the `^d` toggle nor the `settings.json` file |
| — | #23 QoL | **Partly taken** (phase 2) | `--concurrent-fragments` and the `o` key; temp-file cleanup was already done through #40. **Refused**: hard-coded `--cookies-from-browser firefox`, fatal for anyone without Firefox. |
| — | #31 accessibility | **Split up and partly taken** (phase 4) | See phase 4 for what was set aside and why |
| — | #17 mweb fallback on 403 | **On hold** | Pinning a `player_client` ages badly; re-evaluate now that R1 is fixed, since an up-to-date yt-dlp often makes this workaround unnecessary |
| — | #4 chapters | **Made unnecessary** (phase 3) | Chapters come with `--embed-metadata` |
| — | #16 translations | **Postpone** | See above |
| — | #9 install scripts | **On hold** | Depends on the decision in §5 |

## 5. Decisions

1. **The npm name — settled: `yoinks-cli`.** `yoinks` belongs to `pablostanley`, and issue #41 offering co-maintenance went unanswered. Rather than the scoped `@poppnn/yoinks` first considered, an unscoped name was chosen: it doesn't depend on the npm username of whoever publishes, and it reads more easily. The installed command is still `yoinks`. If Pablo ever hands over `yoinks`, publishing there and running `npm deprecate` on `yoinks-cli` will be enough.
2. **Does the fork stay compatible with upstream?** If Pablo comes back, fixes should be able to flow back to him. That takes small PRs and a clean history.
3. **The `curl | sh` installer.** The original author wanted it. It would help people without Node, but adds a security surface (a script served from a domain, a binary to verify). A script-free alternative: standalone binaries through `node --experimental-sea` or bun, published as GitHub releases with their checksums.
4. **Scope.** yoinks should stay "paste, yoink, done". Every option added needs a sensible default: the interface must not turn into an exhaustive yt-dlp front-end.
