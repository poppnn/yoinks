# yoinks

**English** · [Français](README.fr.md)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
  <img src="assets/logo-light.svg" alt="yoinks" width="288">
</picture>

yoink any video. paste. yoink. done.

Download videos from YouTube, X/Twitter, Instagram, Threads, TikTok and
1,800+ other sites — right from your terminal. Paste a url, pick a
resolution (or audio-only mp3), done. No popups, no fake download buttons,
no sketchy redirects.

<img src="assets/home.png" alt="yoinks home screen — paste a link and hit yoink" width="100%">

## Install

```sh
npm install -g yoinks-cli
```

Or try it without installing anything:

```sh
npx yoinks-cli
```

The command is `yoinks` either way. Requires Node 22+. Everything else
(yt-dlp, ffmpeg) is fetched or bundled automatically.

> **yoinks-cli** is the maintained fork of
> [pablostanley/yoinks](https://github.com/pablostanley/yoinks), whose npm
> package `yoinks` stopped at 0.3.1. Both install a `yoinks` command, so
> remove the old one first: `npm uninstall -g yoinks`.

## Usage

```sh
$ yoinks https://youtu.be/dQw4w9WgXcQ    # straight to the format picker
$ yoinks                                 # prompts for a url
$ yoinks <playlist url>                  # tick the items you want
$ yoinks -o ~/Videos <url>               # save to a folder of your choice
$ yoinks --mp3 <url>                     # no interface: for scripts
$ yoinks --help                          # everything else
```

yoinks takes over the terminal (full-screen, centered — and restores your
scrollback on exit). Pick a format with ↑/↓ (or j/k, or number keys) and
hit enter. `esc` goes back, `^c` quits. Or just use the mouse — the yoink
button, the format list and the footer hints are all clickable, and
clicking the logo takes you back home. Files are saved to your Downloads
folder — the one your system uses, even if you moved it — or to any folder
with `-o <dir>`, under the video's title or the name you give with
`-n <name>`. The file path is printed to your terminal when you're done.
When it's saved, `o` opens its folder and `c` copies the file itself, ready
to paste into a chat or another folder.

Videos come as H.264 with AAC audio where the site has it — that plays
everywhere, QuickTime included. Above 1080p YouTube only has AV1 or VP9,
and the picker says so (`2160p · mp4 · AV1`). mp3s get artist and title
tags and the thumbnail as cover art; videos keep their chapters.

The default `auto` theme uses your terminal's own foreground and background,
so it follows light and dark terminal themes without guessing. Press `^t` or
click the theme control in the footer to cycle through `auto`, `light`, and
`dark` for the current session. Use `--theme auto`, `--theme light`, or
`--theme dark` to choose the starting theme for one launch.

<img src="assets/download-options.png" alt="yoinks format picker — resolutions with estimated file sizes, plus audio-only mp3" width="100%">

### Accessibility

- `--plain` keeps everything in the normal scrollback, at its natural
  height, with no mouse tracking and no animation — the mode to use with a
  screen reader. It is also used when `TERM=dumb`.
- `--no-mouse` leaves text selection to your terminal.
- `--no-motion` keeps the logo still.
- The default `auto` theme prints no colours at all, only bold, dim and
  inverse, so it already honours `NO_COLOR`.

Each has a config setting, so you can set it once.

## Playlists

Paste a playlist link — a YouTube playlist, a channel's videos, an album —
and yoinks lists its items, all ticked:

- `↑`/`↓` move, `space` ticks or unticks, `a` ticks all or none, `↵` goes on
- then pick a format: up to 1080p, 720p or 360p, or mp3
- the items download one after the other, into a folder named after the
  playlist (or `-n <name>`), numbered so they keep their order:
  `03 - Title.mp3`

One item failing — a private video, say — doesn't stop the others; the
done screen lists what didn't make it. A link to a video inside a playlist
(`watch?v=…&list=…`) is still just that video.

## Scripting

`--best` (highest quality video) or `--mp3` (audio only) skip the picker
and the interface: progress goes to stderr, and the saved file's path is
the only thing printed on stdout.

```sh
f=$(yoinks --mp3 -n "my song" https://youtu.be/dQw4w9WgXcQ) && echo "got $f"
```

For a playlist, `--best` means up to 1080p, each saved path is printed as
it lands, one per line, and `--items` picks entries by their number in the
playlist:

```sh
yoinks --mp3 --items 1-3,7,10- <playlist url>
```

The exit code is 0 when everything is saved, 1 on failure (any item, for
a playlist) and 130 when you press ^c. When stdout isn't a terminal — a
pipe, a script — yoinks runs this way on its own, with `--best` unless you
pass `--mp3`.

## Configuration

Settings you'd otherwise pass every time go in
`~/.config/yoinks/config.json` (the same path on every OS):

```json
{
  "output": "~/Videos",
  "cookies": "~/cookies.txt",
  "theme": "dark",
  "format": "mp3"
}
```

| Setting | Same as | Notes |
|---|---|---|
| `output` | `-o` | relative paths are relative to the config file |
| `cookies` | `--cookies` | |
| `cookiesFromBrowser` | `--cookies-from-browser` | not together with `cookies` |
| `theme` | `--theme` | `auto`, `light` or `dark` |
| `format` | — | `best` or `mp3`: highlighted in the picker, and used when the picker is skipped |
| `plain` | `--plain` | `true` or `false` |
| `mouse` | `--no-mouse` | `false` turns it off |
| `motion` | `--no-motion` | `false` turns it off |

Options on the command line win over the file. A setting yoinks doesn't
know is an error rather than silently ignored, so a typo can't go
unnoticed.

## Passing options to yt-dlp

Anything after `--` goes to yt-dlp as is:

```sh
yoinks <url> -- --proxy socks5://127.0.0.1:9050
yoinks <url> -- --write-auto-subs --embed-subs --sub-langs en
```

Files yt-dlp writes alongside the download (subtitles, thumbnails…) are
kept next to it. Options that would break yoinks are refused, with what to
use instead: output paths, the format (the picker chooses it), playlist
selection (use `--items`), and anything that changes the output yoinks
reads for progress.

## Signing in

Some videos need an account: age-restricted ones, members-only ones, many
Instagram posts. yoinks never signs in on its own — pass your login as
cookies, for that run:

```sh
yoinks --cookies ~/cookies.txt <url>           # a cookies.txt you exported
yoinks --cookies-from-browser firefox <url>    # read them from a browser
```

If yoinks can't read the cookies, it carries on without them and tells you
why, so public videos still download.

**On Windows, prefer `--cookies`.** Chrome, Edge and other Chromium
browsers lock their cookies away from other apps, so
`--cookies-from-browser chrome` usually fails there. Firefox works.

**Exporting a cookies.txt that lasts.** YouTube rotates its session
cookies, so cookies exported from your everyday browser window stop working
within hours. Instead:

1. Open a private window and sign in to YouTube there.
2. Open a new tab and close the one you signed in with.
3. Export the cookies with a cookies.txt extension — prefer an open-source
   one that works offline: an extension that can read cookies can read
   all your sessions.
4. Close the private window. **Don't sign out**: that would invalidate the
   cookies you just exported.

A cookies.txt is as good as your password: don't share it or commit it.

## How it works

- Powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp). On first run,
  yoinks downloads the standalone yt-dlp binary to `~/.yoinks/bin` —
  no Python required — and checks its SHA-256 against the release.
- Sites change all the time and an outdated yt-dlp is the most common
  reason a download fails, so yoinks looks for a new yt-dlp release once
  a day and updates its copy. `yoinks --update` does it right away.
- To use your own yt-dlp instead, set `YOINKS_YT_DLP` to its name or
  path. Your system yt-dlp is also used as a fallback when yoinks can't
  get its own copy, e.g. offline on first run or on Termux.
- ffmpeg (needed for merging high-res streams, mp3 extraction and
  embedding tags) is found on your PATH, with `ffmpeg-static` as a
  bundled fallback.
- The UI is [Ink](https://github.com/vadimdemedes/ink) — React for the
  terminal.

## Development

```sh
npm ci
npm run build        # bundle to dist/ with tsup
npm run dev          # rebuild on change
node bin/yoinks.js <url>
npm run typecheck
npm test
```

To try it as a global command without publishing: `npm link`, then run
`yoinks` anywhere. See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a
pull request.

## Roadmap

See [ROADMAP.md](ROADMAP.md) and the [changelog](CHANGELOG.md).

## Credits

yoinks was created by [Pablo Stanley](https://github.com/pablostanley).
This fork builds on fixes and ideas from the community's pull requests to
the original — thank you @agammann, @g9i, @lennin331, @aliabedi1,
@SuperProCoolName, @EmekC, @juan-multi-7575 and @Mr-Neutr0n.

## A note on fair use

yoinks is a personal-archiving tool. Downloading content may violate a
platform's terms of service — only download what you have the right to
keep, and be excellent to creators.

## License

[MIT](LICENSE)
