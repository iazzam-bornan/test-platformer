import { Hono } from "hono"
import fs from "fs/promises"
import path from "path"
import { store } from "../runs/store"
import { getArtifactsDir } from "../workspace/manager"
import type { Artifact } from "@workspace/shared/types/api"

export const artifactRoutes = new Hono()

// List artifacts for a run
artifactRoutes.get("/:runId/artifacts", async (c) => {
  const runId = c.req.param("runId")
  const run = store.getRun(runId)
  if (!run) return c.json({ error: "Run not found" }, 404)

  const artifactsDir = getArtifactsDir(runId)
  try {
    const artifacts = await scanArtifacts(runId, artifactsDir)
    return c.json({ data: artifacts })
  } catch {
    return c.json({ data: [] })
  }
})

// Download a specific artifact
artifactRoutes.get("/:runId/artifacts/:artifactName", async (c) => {
  const runId = c.req.param("runId")
  const artifactName = c.req.param("artifactName")
  const artifactsDir = getArtifactsDir(runId)
  const filePath = path.join(artifactsDir, artifactName)

  try {
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) {
      const files = await fs.readdir(filePath)
      return c.json({ data: files })
    }

    const content = await fs.readFile(filePath)
    const ext = path.extname(artifactName).toLowerCase()
    const mimeTypes: Record<string, string> = {
      ".html": "text/html",
      ".json": "application/json",
      ".xml": "application/xml",
      ".txt": "text/plain",
      ".log": "text/plain",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".webm": "video/webm",
      ".mp4": "video/mp4",
    }
    c.header("Content-Type", mimeTypes[ext] ?? "application/octet-stream")
    return c.body(content)
  } catch {
    return c.json({ error: "Artifact not found" }, 404)
  }
})

async function scanArtifacts(
  runId: string,
  dir: string,
  prefix = ""
): Promise<Artifact[]> {
  const artifacts: Artifact[] = []
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        const nested = await scanArtifacts(
          runId,
          path.join(dir, entry.name),
          relativePath
        )
        artifacts.push(...nested)
      } else {
        const stat = await fs.stat(path.join(dir, entry.name))
        const ext = path.extname(entry.name).toLowerCase()
        let type: Artifact["type"] = "report"
        if (ext === ".log") type = "log"
        else if ([".png", ".jpg", ".jpeg"].includes(ext)) type = "screenshot"
        else if ([".mp4", ".webm"].includes(ext)) type = "video"
        else if (entry.name.includes("coverage")) type = "coverage"

        artifacts.push({
          id: `${runId}-${relativePath}`,
          runId,
          type,
          name: entry.name,
          path: relativePath,
          createdAt: stat.mtime.toISOString(),
        })
      }
    }
  } catch {
    // Directory may not exist yet
  }
  return artifacts
}
