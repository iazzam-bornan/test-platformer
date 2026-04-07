import {
  Browser,
  BrowserContext,
  Page,
  chromium,
  firefox,
  webkit,
  APIRequestContext,
  request as playwrightRequest,
} from "playwright"
import { setWorldConstructor, World, IWorldOptions } from "@cucumber/cucumber"

export type BrowserName = "chromium" | "firefox" | "webkit"

/**
 * CustomWorld — auto-wired Playwright context available in every scenario.
 *
 * Step definitions can use:
 *   this.page       — Playwright Page (fresh per scenario)
 *   this.context    — Playwright BrowserContext
 *   this.browser    — Shared Playwright Browser
 *   this.request    — APIRequestContext for backend calls
 *   this.baseUrl    — From BASE_URL env var
 */
export class CustomWorld extends World {
  browser!: Browser
  context!: BrowserContext
  page!: Page
  request!: APIRequestContext
  baseUrl: string

  constructor(options: IWorldOptions) {
    super(options)
    this.baseUrl = process.env.BASE_URL || "http://localhost"
  }
}

setWorldConstructor(CustomWorld)

// Singleton browser shared across all scenarios
let _browser: Browser | undefined

export async function getBrowser(): Promise<Browser> {
  if (_browser) return _browser

  const name = (process.env.BROWSER || "chromium") as BrowserName
  const streamBrowser = process.env.STREAM_BROWSER === "true"
  // When streaming, non-headless is required regardless of HEADLESS env.
  const headless = streamBrowser ? false : process.env.HEADLESS !== "false"

  // SLOW MOTION when streaming so the user can actually watch.
  // Playwright's slowMo adds a delay before every action (click, fill,
  // navigation) so they're visible in the live VNC stream.
  // Default: 500ms when streaming, 0 otherwise. Override via STREAM_SLOW_MO.
  const slowMoEnv = process.env.STREAM_SLOW_MO
  const slowMo = slowMoEnv !== undefined
    ? parseInt(slowMoEnv, 10) || 0
    : streamBrowser
      ? 500
      : 0

  // Chromium-specific args needed to run stably inside Xvfb/tigervnc.
  //
  // Browser-only mode (STREAM_DESKTOP=false): kiosk fullscreen, fills the
  // entire X display. The iframe shows ONLY the page being tested — no
  // chromium UI, no desktop background.
  //
  // Desktop mode (STREAM_DESKTOP=true): no kiosk, smaller window so other
  // desktop apps (terminal, file manager) are visible alongside the browser.
  const streamDesktop = process.env.STREAM_DESKTOP === "true"
  const chromiumStreamArgs = streamDesktop
    ? [
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-software-rasterizer",
        "--window-size=1100,700",
        "--window-position=460,40",
      ]
    : [
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-software-rasterizer",
        "--kiosk",
        "--window-size=1600,900",
        "--window-position=0,0",
      ]

  switch (name) {
    case "firefox":
      _browser = await firefox.launch({ headless, slowMo })
      break
    case "webkit":
      // Webkit under X11/Xvfb is upstream-experimental and may render poorly.
      // We still launch it so tests execute, but the stream may be blank or
      // glitchy for complex pages.
      _browser = await webkit.launch({ headless, slowMo })
      break
    case "chromium":
    default:
      _browser = await chromium.launch({
        headless,
        slowMo,
        args: streamBrowser ? chromiumStreamArgs : [],
      })
      break
  }

  return _browser
}

export async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close()
    _browser = undefined
  }
}

export async function createRequestContext(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({
    baseURL: process.env.BASE_URL,
  })
}
