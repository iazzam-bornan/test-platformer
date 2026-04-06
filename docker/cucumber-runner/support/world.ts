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

  // Chromium-specific args needed to run stably inside Xvfb/tigervnc
  const chromiumStreamArgs = [
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-software-rasterizer",
    "--window-size=1280,720",
    "--start-maximized",
  ]

  switch (name) {
    case "firefox":
      _browser = await firefox.launch({ headless })
      break
    case "webkit":
      // Webkit under X11/Xvfb is upstream-experimental and may render poorly.
      // We still launch it so tests execute, but the stream may be blank or
      // glitchy for complex pages.
      _browser = await webkit.launch({ headless })
      break
    case "chromium":
    default:
      _browser = await chromium.launch({
        headless,
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
