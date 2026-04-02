import fs from "fs/promises"
import path from "path"
import os from "os"

const WORKSPACE_ROOT = path.join(os.tmpdir(), "test-platform-runs")

export async function ensureWorkspaceRoot(): Promise<void> {
  await fs.mkdir(WORKSPACE_ROOT, { recursive: true })
}

export async function createWorkspace(runId: string): Promise<string> {
  const dir = path.join(WORKSPACE_ROOT, runId)
  await fs.mkdir(dir, { recursive: true })
  await fs.mkdir(path.join(dir, "repos"), { recursive: true })
  await fs.mkdir(path.join(dir, "logs"), { recursive: true })
  await fs.mkdir(path.join(dir, "artifacts"), { recursive: true })
  return dir
}

export async function destroyWorkspace(runId: string): Promise<void> {
  const dir = path.join(WORKSPACE_ROOT, runId)
  await fs.rm(dir, { recursive: true, force: true })
}

export function getWorkspacePath(runId: string): string {
  return path.join(WORKSPACE_ROOT, runId)
}

export function getReposDir(runId: string): string {
  return path.join(WORKSPACE_ROOT, runId, "repos")
}

export function getLogsDir(runId: string): string {
  return path.join(WORKSPACE_ROOT, runId, "logs")
}

export function getArtifactsDir(runId: string): string {
  return path.join(WORKSPACE_ROOT, runId, "artifacts")
}
