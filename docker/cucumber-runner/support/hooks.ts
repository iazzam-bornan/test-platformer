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
  this.page = await this.context.newPage()
  this.request = await createRequestContext()

  // When streaming, monkey-patch page.mouse so every Playwright mouse action
  // also draws a visible cursor on the page. Playwright dispatches input via
  // CDP, which doesn't move the OS cursor — patching at this level catches
  // ALL clicks (via locators OR direct page.mouse.* calls) because every
  // path eventually goes through page.mouse.move/down/up.
  if (process.env.STREAM_BROWSER === "true") {
    const page = this.page
    let lastX = 0
    let lastY = 0

    const updateCursor = async (
      x: number,
      y: number,
      action: "move" | "down" | "up"
    ) => {
      try {
        await page.evaluate(
          ({ x, y, action }) => {
            const id = "__pw_test_cursor__"
            let c = document.getElementById(id) as HTMLElement | null
            if (!c) {
              c = document.createElement("div")
              c.id = id
              c.style.cssText = [
                "position: fixed",
                "top: 0",
                "left: 0",
                "width: 24px",
                "height: 24px",
                "border-radius: 50%",
                "background: rgba(255, 30, 60, 0.6)",
                "border: 2px solid white",
                "box-shadow: 0 0 12px rgba(255, 0, 0, 0.7)",
                "pointer-events: none",
                "z-index: 2147483647",
                "transform: translate(-50%, -50%)",
                "transition: top 200ms ease, left 200ms ease, transform 120ms ease, background 120ms ease",
                "will-change: top, left, transform",
              ].join("; ")
              ;(document.body || document.documentElement).appendChild(c)
            }
            c.style.left = x + "px"
            c.style.top = y + "px"
            if (action === "down") {
              c.style.transform = "translate(-50%, -50%) scale(0.55)"
              c.style.background = "rgba(255, 220, 30, 0.95)"
            } else if (action === "up") {
              c.style.transform = "translate(-50%, -50%) scale(1)"
              c.style.background = "rgba(255, 30, 60, 0.6)"
            }
          },
          { x, y, action }
        )
      } catch {
        // Page might be navigating or detached; ignore
      }
    }

    const origMove = page.mouse.move.bind(page.mouse)
    page.mouse.move = async (x: number, y: number, opts?: { steps?: number }) => {
      lastX = x
      lastY = y
      await updateCursor(x, y, "move")
      return origMove(x, y, opts)
    }

    const origDown = page.mouse.down.bind(page.mouse)
    page.mouse.down = async (opts?: any) => {
      await updateCursor(lastX, lastY, "down")
      return origDown(opts)
    }

    const origUp = page.mouse.up.bind(page.mouse)
    page.mouse.up = async (opts?: any) => {
      await updateCursor(lastX, lastY, "up")
      return origUp(opts)
    }
  }
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
