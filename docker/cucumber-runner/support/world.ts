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
  const headless = process.env.HEADLESS !== "false"

  const launchOpts = { headless }

  switch (name) {
    case "firefox":
      _browser = await firefox.launch(launchOpts)
      break
    case "webkit":
      _browser = await webkit.launch(launchOpts)
      break
    case "chromium":
    default:
      _browser = await chromium.launch(launchOpts)
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
