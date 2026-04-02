import fs from "fs/promises"
import path from "path"
import YAML from "yaml"
import { scenarioSchema } from "@workspace/shared/schemas/scenario"
import type { ScenarioDetail, ScenarioListItem } from "@workspace/shared/types/api"

// Resolve scenarios dir: try relative to CWD first (when run from apps/api),
// then relative to this file (fallback)
const SCENARIOS_DIR = (() => {
  const fromCwd = path.resolve(process.cwd(), "../../scenarios")
  const fromFile = path.resolve(import.meta.dirname, "../../../../scenarios")
  const fromMonoroot = path.resolve(process.cwd(), "scenarios")
  // If running from monorepo root
  try {
    const fs = require("fs")
    if (fs.existsSync(fromMonoroot)) return fromMonoroot
    if (fs.existsSync(fromCwd)) return fromCwd
  } catch {}
  return fromFile
})()

console.log(`[scenarios] Loading from: ${SCENARIOS_DIR}`)

export async function loadScenarios(): Promise<ScenarioListItem[]> {
  const files = await fs.readdir(SCENARIOS_DIR).catch((err) => {
    console.error(`[scenarios] Failed to read ${SCENARIOS_DIR}:`, err.message)
    return [] as string[]
  })
  const scenarios: ScenarioListItem[] = []

  for (const file of files) {
    if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue

    const filePath = path.join(SCENARIOS_DIR, file)
    const content = await fs.readFile(filePath, "utf-8")
    const raw = YAML.parse(content)
    const parsed = scenarioSchema.safeParse(raw)

    if (parsed.success) {
      scenarios.push({
        id: path.basename(file, path.extname(file)),
        name: parsed.data.name,
        description: parsed.data.description,
        tags: parsed.data.tags,
        filePath: file,
      })
    }
  }

  return scenarios
}

export async function loadScenarioById(
  id: string
): Promise<ScenarioDetail | null> {
  const files = await fs.readdir(SCENARIOS_DIR).catch(() => [])
  const match = files.find(
    (f) =>
      path.basename(f, path.extname(f)) === id &&
      (f.endsWith(".yaml") || f.endsWith(".yml"))
  )

  if (!match) return null

  const filePath = path.join(SCENARIOS_DIR, match)
  const content = await fs.readFile(filePath, "utf-8")
  const raw = YAML.parse(content)
  const parsed = scenarioSchema.safeParse(raw)

  if (!parsed.success) return null

  return {
    id,
    name: parsed.data.name,
    description: parsed.data.description,
    tags: parsed.data.tags,
    filePath: match,
    config: parsed.data,
  }
}
