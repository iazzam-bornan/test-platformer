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

  // When streaming, inject a visible cursor on every page so the user can
  // SEE where Playwright is clicking. Playwright dispatches input via CDP,
  // which doesn't move the OS cursor — but the synthetic mousemove events
  // DO fire on the page, so this listener tracks them.
  if (process.env.STREAM_BROWSER === "true") {
    await this.context.addInitScript(() => {
      const id = "__pw_test_cursor__"
      const ensureCursor = () => {
        if (!document.body || document.getElementById(id)) return
        const c = document.createElement("div")
        c.id = id
        c.style.cssText = [
          "position: fixed",
          "top: 0",
          "left: 0",
          "width: 22px",
          "height: 22px",
          "border-radius: 50%",
          "background: rgba(255, 30, 60, 0.55)",
          "border: 2px solid white",
          "box-shadow: 0 0 12px rgba(255, 0, 0, 0.6)",
          "pointer-events: none",
          "z-index: 2147483647",
          "transform: translate(-50%, -50%)",
          "transition: top 120ms ease, left 120ms ease, transform 80ms ease",
          "will-change: top, left, transform",
        ].join("; ")
        document.body.appendChild(c)
      }
      const move = (x: number, y: number) => {
        const c = document.getElementById(id) as HTMLElement | null
        if (!c) return
        c.style.left = x + "px"
        c.style.top = y + "px"
      }
      const press = () => {
        const c = document.getElementById(id) as HTMLElement | null
        if (!c) return
        c.style.transform = "translate(-50%, -50%) scale(0.6)"
        c.style.background = "rgba(255, 200, 30, 0.9)"
      }
      const release = () => {
        const c = document.getElementById(id) as HTMLElement | null
        if (!c) return
        c.style.transform = "translate(-50%, -50%) scale(1)"
        c.style.background = "rgba(255, 30, 60, 0.55)"
      }
      // Try to set up immediately; if body isn't ready, wait for it
      if (document.body) ensureCursor()
      else
        document.addEventListener("DOMContentLoaded", ensureCursor, { once: true })

      // useCapture so we get events even if the page calls stopPropagation
      document.addEventListener(
        "mousemove",
        (e) => {
          ensureCursor()
          move(e.clientX, e.clientY)
        },
        true
      )
      document.addEventListener("mousedown", press, true)
      document.addEventListener("mouseup", release, true)
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
