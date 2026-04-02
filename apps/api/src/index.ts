import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { scenarioRoutes } from "./modules/scenarios/routes"
import { runRoutes } from "./modules/runs/routes"
import { artifactRoutes } from "./modules/artifacts/routes"
import { isDockerAvailable } from "./modules/docker/docker"
import { ensureWorkspaceRoot } from "./modules/workspace/manager"

const app = new Hono()

app.use("*", logger())
app.use("*", cors())

app.get("/health", async (c) => {
  const dockerOk = await isDockerAvailable()
  return c.json({
    status: "ok",
    docker: dockerOk ? "available" : "unavailable",
  })
})

app.get("/docker/status", async (c) => {
  const dockerOk = await isDockerAvailable()
  return c.json({ available: dockerOk })
})

app.route("/scenarios", scenarioRoutes)
app.route("/runs", runRoutes)
app.route("/runs", artifactRoutes)

const port = Number(process.env.PORT) || 4000

// Ensure workspace root exists on startup
await ensureWorkspaceRoot()

console.log(`API server starting on port ${port}`)

export default {
  port,
  fetch: app.fetch,
}
