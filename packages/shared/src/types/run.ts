import type { Scenario } from "../schemas/scenario"

export type RunStatus =
  | "queued"
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
  /**
   * Total number of expected test results, declared by the test runner via a
   * "plan" event before any actual results stream in. Undefined if the runner
   * could not declare it upfront (e.g. duration-based JMeter tests).
   */
  plannedTotal?: number
  /**
   * For runs in the "queued" status, the 1-indexed position in the queue.
   */
  queuePosition?: number
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
