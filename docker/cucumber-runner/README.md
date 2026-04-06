# testplatform-cucumber-runner

Docker image that runs Cucumber + Playwright tests with zero boilerplate. Used by `@testplatform/core` as the default image for `CucumberTest`.

## What's Inside

- Node.js + Playwright browsers (chromium, firefox, webkit) via `mcr.microsoft.com/playwright` base
- `@cucumber/cucumber` pre-installed
- `ts-node` for TypeScript step definitions
- A managed `CustomWorld` class exposing `this.page`, `this.context`, `this.request`, `this.baseUrl`
- Auto-capture of screenshots on scenario failure
- A results parser that converts cucumber JSON output into `@@RESULT@@` lines (the protocol used by `@testplatform/core`)

## Building

```bash
cd docker/cucumber-runner
docker build -t testplatform/cucumber-runner:latest .
```

## Standalone Usage

```bash
docker run --rm \
  -e BASE_URL=http://host.docker.internal:3000 \
  -e BROWSER=chromium \
  -e HEADLESS=true \
  -v $PWD/features:/project/features:ro \
  -v $PWD/steps:/project/steps:ro \
  -v $PWD/results:/results \
  testplatform/cucumber-runner:latest
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BASE_URL` | `http://localhost` | Injected into `this.baseUrl` |
| `BROWSER` | `chromium` | `chromium`, `firefox`, or `webkit` |
| `HEADLESS` | `true` | Set to `false` for headed mode (dev only) |
| `TAGS` | — | Cucumber tag filter, e.g. `@smoke and not @slow` |
| `FEATURES_DIR` | `/project/features` | Override feature path |
| `STEPS_DIR` | `/project/steps` | Override steps path |

## World Class

Step definitions have access to:

```typescript
this.page       // Playwright Page (fresh per scenario)
this.context    // Playwright BrowserContext
this.browser    // Shared Playwright Browser
this.request    // APIRequestContext for backend calls
this.baseUrl    // From BASE_URL env var
```

## Example Step Definition

```typescript
import { Given, When, Then } from "@cucumber/cucumber"
import { expect } from "@playwright/test"
import type { CustomWorld } from "/runner/support/world"

Given("I visit the homepage", async function (this: CustomWorld) {
  await this.page.goto(this.baseUrl)
})

Then("the page title should not be empty", async function (this: CustomWorld) {
  const title = await this.page.title()
  expect(title.length).toBeGreaterThan(0)
})
```
