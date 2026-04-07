import { Before, After, BeforeAll, AfterAll, Status, ITestCaseHookParameter } from "@cucumber/cucumber"
import { CustomWorld, getBrowser, closeBrowser, createRequestContext } from "./world"

BeforeAll({ timeout: 60_000 }, async function () {
  await getBrowser()
})

Before(async function (this: CustomWorld) {
  this.browser = await getBrowser()
  this.context = await this.browser.newContext({
    baseURL: this.baseUrl,
    viewport: { width: 1600, height: 900 },
    ignoreHTTPSErrors: true,
  })

  // When streaming, inject a visible "click pulse" cursor into every page.
  // Playwright's locator clicks go through a private rawMouse path that
  // bypasses page.mouse, so we can't intercept at the Node level. Instead
  // we listen for the DOM mousedown/click events the browser fires when
  // playwright dispatches input — those reliably fire on the page side.
  //
  // Result: a big red dot pulses at every click location and animates as
  // it presses. This won't show smooth cursor movement (we don't get those
  // events), but it makes every click visible in the live stream.
  if (process.env.STREAM_BROWSER === "true") {
    await this.context.addInitScript(() => {
      const id = "__pw_test_cursor__"

      const ensureCursor = (): HTMLElement | null => {
        const root = document.body || document.documentElement
        if (!root) return null
        let c = document.getElementById(id) as HTMLElement | null
        if (c) return c
        c = document.createElement("div")
        c.id = id
        c.style.cssText = [
          "position: fixed",
          "top: -100px",
          "left: -100px",
          "width: 32px",
          "height: 32px",
          "border-radius: 50%",
          "background: rgba(255, 30, 60, 0.55)",
          "border: 3px solid white",
          "box-shadow: 0 0 20px 4px rgba(255, 0, 60, 0.7)",
          "pointer-events: none",
          "z-index: 2147483647",
          "transform: translate(-50%, -50%)",
          "transition: top 220ms ease, left 220ms ease, transform 160ms ease, background 160ms ease, box-shadow 160ms ease",
          "will-change: top, left, transform",
        ].join("; ")
        root.appendChild(c)
        return c
      }

      const moveTo = (x: number, y: number) => {
        const c = ensureCursor()
        if (!c) return
        c.style.left = x + "px"
        c.style.top = y + "px"
      }

      const press = (x: number, y: number) => {
        const c = ensureCursor()
        if (!c) return
        c.style.left = x + "px"
        c.style.top = y + "px"
        c.style.transform = "translate(-50%, -50%) scale(0.55)"
        c.style.background = "rgba(255, 220, 30, 0.95)"
        c.style.boxShadow = "0 0 30px 8px rgba(255, 220, 0, 0.9)"
      }

      const release = () => {
        const c = ensureCursor()
        if (!c) return
        c.style.transform = "translate(-50%, -50%) scale(1)"
        c.style.background = "rgba(255, 30, 60, 0.55)"
        c.style.boxShadow = "0 0 20px 4px rgba(255, 0, 60, 0.7)"
      }

      // Initialize as soon as body exists
      const init = () => {
        ensureCursor()
      }
      if (document.body) init()
      else
        document.addEventListener("DOMContentLoaded", init, { once: true })

      // Listen with useCapture so we get events even if the page calls
      // stopPropagation on its own listeners.
      document.addEventListener(
        "mousedown",
        (e) => press((e as MouseEvent).clientX, (e as MouseEvent).clientY),
        true
      )
      document.addEventListener("mouseup", release, true)
      document.addEventListener(
        "click",
        (e) => moveTo((e as MouseEvent).clientX, (e as MouseEvent).clientY),
        true
      )
      // Catch mousemove too in case it ever fires (some playwright actions
      // do dispatch move events)
      document.addEventListener(
        "mousemove",
        (e) => moveTo((e as MouseEvent).clientX, (e as MouseEvent).clientY),
        true
      )
    })
  }

  this.page = await this.context.newPage()
  this.request = await createRequestContext()
})

After(async function (this: CustomWorld, scenario: ITestCaseHookParameter) {
  // Auto-capture screenshot on failure
  if (scenario.result?.status === Status.FAILED && this.page) {
    try {
      const screenshot = await this.page.screenshot({ fullPage: true })
      await this.attach(screenshot, "image/png")
    } catch {
      // Ignore screenshot errors — don't fail the scenario for this
    }
  }

  // Clean up
  if (this.page) await this.page.close().catch(() => {})
  if (this.context) await this.context.close().catch(() => {})
  if (this.request) await this.request.dispose().catch(() => {})
})

AfterAll(async function () {
  await closeBrowser()
})
