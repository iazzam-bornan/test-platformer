import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { store } from "./store"
import { executeRun } from "./orchestrator"
import { loadScenarioById } from "../scenarios/loader"
import { logEmitter } from "../logs/emitter"

export const runRoutes = new Hono()

runRoutes.get("/", (c) => {
  const runs = store.listRuns()
  return c.json({ data: runs })
})

runRoutes.get("/:id", (c) => {
  const run = store.getRun(c.req.param("id"))
  if (!run) return c.json({ error: "Run not found" }, 404)
  return c.json({ data: run })
})

runRoutes.post("/", async (c) => {
  const body = await c.req.json()
  const { scenarioId, overrides } = body

  if (!scenarioId) {
    return c.json({ error: "scenarioId is required" }, 400)
  }

  const scenario = await loadScenarioById(scenarioId)
  if (!scenario) {
    return c.json({ error: `Scenario '${scenarioId}' not found` }, 404)
  }

  const run = store.createRun(
    scenarioId,
    scenario.name,
    scenario.config,
    overrides
  )

  // Start orchestration in the background (don't await)
  executeRun(run.id, scenario.config, overrides).catch((err) => {
    console.error(`Run ${run.id} failed:`, err)
  })

  return c.json({ data: run }, 201)
})

runRoutes.post("/:id/cancel", async (c) => {
  const run = store.getRun(c.req.param("id"))
  if (!run) return c.json({ error: "Run not found" }, 404)
  store.updateStatus(run.id, "cancelled")

  // Tear down the Docker environment
  const { composeDown } = await import("../docker/docker")
  const { getWorkspacePath, destroyWorkspace } = await import("../workspace/manager")
  const projectName = `tp-${run.id}`
  const workspaceDir = getWorkspacePath(run.id)

  composeDown(workspaceDir, projectName).then(() => {
    destroyWorkspace(run.id).catch(() => {})
  }).catch(() => {})

  return c.json({ data: { id: run.id, status: "cancelled" } })
})

runRoutes.post("/:id/cleanup", async (c) => {
  const run = store.getRun(c.req.param("id"))
  if (!run) return c.json({ error: "Run not found" }, 404)

  const { composeDown } = await import("../docker/docker")
  const { destroyWorkspace } = await import("../workspace/manager")

  try {
    await composeDown(".", `tp-${run.id}`)
    await destroyWorkspace(run.id)
    return c.json({ data: { id: run.id, cleaned: true } })
  } catch {
    return c.json({ error: "Cleanup failed" }, 500)
  }
})

// SSE endpoint for live log streaming
runRoutes.get("/:id/logs", (c) => {
  const runId = c.req.param("id")
  const run = store.getRun(runId)
  if (!run) return c.json({ error: "Run not found" }, 404)

  return streamSSE(c, async (stream) => {
    // Send existing log history
    const history = logEmitter.getHistory(runId)
    for (const line of history) {
      await stream.writeSSE({ data: line, event: "log" })
    }

    // Subscribe to new logs
    const unsubscribe = logEmitter.subscribe(runId, async (line) => {
      try {
        await stream.writeSSE({ data: line, event: "log" })
      } catch {
        // Client disconnected
        unsubscribe()
      }
    })

    // Keep the connection alive until the run finishes or client disconnects
    const isTerminal = (status: string) =>
      ["passed", "failed", "cancelled", "error"].includes(status)

    while (true) {
      const currentRun = store.getRun(runId)
      if (!currentRun || isTerminal(currentRun.status)) {
        // Send final status
        await stream.writeSSE({
          data: currentRun?.status ?? "unknown",
          event: "status",
        })
        break
      }
      await stream.sleep(1000)
    }

    unsubscribe()
  })
})

// Get collected logs as files
runRoutes.get("/:id/logs/files", async (c) => {
  const runId = c.req.param("id")
  const run = store.getRun(runId)
  if (!run) return c.json({ error: "Run not found" }, 404)

  const { getLogsDir } = await import("../workspace/manager")
  const fs = await import("fs/promises")
  const logsDir = getLogsDir(runId)

  try {
    const files = await fs.readdir(logsDir)
    const logs: Record<string, string> = {}
    for (const file of files) {
      const content = await fs.readFile(`${logsDir}/${file}`, "utf-8")
      logs[file.replace(".log", "")] = content
    }
    return c.json({ data: logs })
  } catch {
    return c.json({ data: {} })
  }
})
