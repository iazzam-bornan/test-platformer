import { Given, When, Then } from "@cucumber/cucumber"
import { expect } from "@playwright/test"
import type { CustomWorld } from "/runner/support/world"

Given("I visit the homepage", async function (this: CustomWorld) {
  await this.page.goto(this.baseUrl, { waitUntil: "networkidle" })
})

Then("the page title should not be empty", async function (this: CustomWorld) {
  const title = await this.page.title()
  expect(title.length).toBeGreaterThan(0)
})

Then("I should see {string}", async function (this: CustomWorld, text: string) {
  const locator = this.page.getByText(text, { exact: false }).first()
  await expect(locator).toBeVisible({ timeout: 10_000 })
})

Then(
  "I should see an input with placeholder {string}",
  async function (this: CustomWorld, placeholder: string) {
    const input = this.page.getByPlaceholder(placeholder)
    await expect(input).toBeVisible()
  }
)

Then(
  "I should see a button with text {string}",
  async function (this: CustomWorld, buttonText: string) {
    const button = this.page.getByRole("button", { name: buttonText })
    await expect(button).toBeVisible()
  }
)

Then(
  "I should see {int} columns on the board",
  async function (this: CustomWorld, count: number) {
    const columns = this.page.locator(".column")
    await expect(columns).toHaveCount(count)
  }
)

When(
  "I type {string} into the {string} input",
  async function (this: CustomWorld, text: string, placeholder: string) {
    await this.page.getByPlaceholder(placeholder).fill(text)
  }
)

When(
  "I click the {string} button",
  async function (this: CustomWorld, buttonText: string) {
    await this.page.getByRole("button", { name: buttonText }).click()
    // Small delay for the UI to update after the POST
    await this.page.waitForTimeout(500)
  }
)
