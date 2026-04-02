import type { Scenario } from "../schemas/scenario"
import type { Run } from "./run"

export interface ScenarioListItem {
  id: string
  name: string
  description?: string
  tags?: string[]
  filePath: string
  lastRun?: {
    status: Run["status"]
    finishedAt: string
  }
}

export interface ApiResponse<T> {
  data: T
}

export interface ApiError {
  error: string
  details?: unknown
}

export interface ScenarioDetail extends ScenarioListItem {
  config: Scenario
}

export interface RunListItem {
  id: string
  scenarioId: string
  scenarioName: string
  status: Run["status"]
  startedAt: string
  finishedAt?: string
  exitCode?: number
}

export interface Artifact {
  id: string
  runId: string
  type: "log" | "screenshot" | "video" | "coverage" | "report"
  name: string
  path: string
  createdAt: string
}
