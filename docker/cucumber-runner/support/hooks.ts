import { Before, After, BeforeAll, AfterAll, Status, ITestCaseHookParameter } from "@cucumber/cucumber"
import { CustomWorld, getBrowser, closeBrowser, createRequestContext } from "./world"

BeforeAll({ timeout: 60_000 }, async function () {
  await getBrowser()
})

Before(async function (this: CustomWorld) {
  this.browser = await getBrowser()
  this.context = await this.browser.newContext({
    baseURL: this.baseUrl,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  })
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
