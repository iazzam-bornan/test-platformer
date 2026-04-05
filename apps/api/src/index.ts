import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { platform } from "./platform"
import { scenarioRoutes } from "./modules/scenarios/routes"
import { createRunRoutes } from "./routes"

const app = new Hono()

app.use("*", logger())
app.use("*", cors())

app.get("/health", async (c) => {
  const dockerOk = await platform.checkDocker()
  return c.json({
    status: "ok",
    docker: dockerOk ? "available" : "unavailable",
  })
})

app.get("/docker/status", async (c) => {
  const dockerOk = await platform.checkDocker()
  return c.json({ available: dockerOk })
})

app.route("/scenarios", scenarioRoutes)
app.route("/runs", createRunRoutes(platform))

const port = Number(process.env.PORT) || 4000

console.log(`API server starting on port ${port}`)

export default {
  port,
  fetch: app.fetch,
}
