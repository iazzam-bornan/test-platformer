import { Hono } from "hono"
import { loadScenarios, loadScenarioById } from "./loader"

export const scenarioRoutes = new Hono()

scenarioRoutes.get("/", async (c) => {
  const scenarios = await loadScenarios()
  return c.json({ data: scenarios })
})

scenarioRoutes.get("/:id", async (c) => {
  const id = c.req.param("id")
  const scenario = await loadScenarioById(id)
  if (!scenario) {
    return c.json({ error: "Scenario not found" }, 404)
  }
  return c.json({ data: scenario })
})
