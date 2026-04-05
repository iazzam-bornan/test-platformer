import type { Scenario } from "../schemas/scenario"

export type RunStatus =
  | "pending"
  | "cloning"
  | "building"
  | "booting"
  | "waiting_healthy"
  | "testing"
  | "passed"
  | "failed"
  | "cancelled"
  | "error"
  | "cleaning_up"

export type ServiceHealthStatus = "unknown" | "starting" | "healthy" | "unhealthy"

export interface ServiceRunInfo {
  name: string
  image: string
  containerId?: string
  healthStatus: ServiceHealthStatus
  mappedPorts: Record<number, number>
}

export interface Run {
  id: string
  scenarioId: string
  scenarioName: string
  status: RunStatus
  startedAt: string
  finishedAt?: string
  config: Scenario
  overrides?: RunOverrides
  services: ServiceRunInfo[]
  exitCode?: number
  preserveOnFailure: boolean
  preserveAlways: boolean
  error?: string
}

export interface RunOverrides {
  refs?: Record<string, string>
  env?: Record<string, Record<string, string>>
  images?: Record<string, string>
  preserveOnFailure?: boolean
  preserveAlways?: boolean
}

export interface CreateRunRequest {
  scenarioId: string
  overrides?: RunOverrides
}
