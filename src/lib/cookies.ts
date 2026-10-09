/** Browsers yt-dlp can read cookies from. */
export const COOKIE_BROWSERS = ['brave', 'chrome', 'chromium', 'edge', 'firefox', 'opera', 'safari', 'vivaldi', 'whale']

/** How to sign in: a Netscape cookies.txt, or a browser to read cookies from. */
export type Cookies = {file: string} | {browser: string}

export function cookieArgs(cookies?: Cookies): string[] {
  if (!cookies) return []
  return 'file' in cookies ? ['--cookies', cookies.file] : ['--cookies-from-browser', cookies.browser]
}

/**
 * yt-dlp takes BROWSER[+KEYRING][:PROFILE][::CONTAINER]; only the browser
 * name is worth checking up front, to catch a typo before a slow probe.
 */
export function checkBrowserSpec(spec: string): string | undefined {
  const name = spec.split(/[+:]/)[0]!.toLowerCase()
  if (COOKIE_BROWSERS.includes(name)) return undefined
  return `unknown browser “${name}” — use one of ${COOKIE_BROWSERS.join(', ')}`
}
