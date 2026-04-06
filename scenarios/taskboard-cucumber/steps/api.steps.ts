import { Given, When, Then } from "@cucumber/cucumber"
import { expect } from "@playwright/test"
import type { APIResponse } from "playwright"
import type { CustomWorld } from "/runner/support/world"

// Extend CustomWorld at runtime with a response slot
interface ApiWorld extends CustomWorld {
  _response?: APIResponse
  _body?: unknown
}

When(
  "I send a GET request to the backend {string} endpoint",
  async function (this: ApiWorld, endpoint: string) {
    // The backend is reachable at http://backend:3000 inside the docker network
    const backendUrl = process.env.BACKEND_URL || "http://backend:3000"
    this._response = await this.request.get(`${backendUrl}${endpoint}`)
  }
)

Then(
  "the response status should be {int}",
  async function (this: ApiWorld, expectedStatus: number) {
    expect(this._response).toBeDefined()
    expect(this._response!.status()).toBe(expectedStatus)
  }
)

Then("the response should be a JSON array", async function (this: ApiWorld) {
  expect(this._response).toBeDefined()
  const body = await this._response!.json()
  this._body = body
  expect(Array.isArray(body)).toBe(true)
})

Then(
  "the response should contain field {string}",
  async function (this: ApiWorld, field: string) {
    expect(this._response).toBeDefined()
    if (!this._body) {
      this._body = await this._response!.json()
    }
    expect(this._body).toHaveProperty(field)
  }
)
