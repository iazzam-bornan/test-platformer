import type { Run, RunOverrides, RunStatus, ServiceRunInfo } from "@workspace/shared/types/run"
import type { Scenario } from "@workspace/shared/schemas/scenario"
import {
  insertRun,
  updateRunStatus,
  updateRunServices,
  updateRunExitCode,
  updateRunError,
  getRunById,
  listAllRuns,
} from "../db/database"

// In-memory cache for active runs (fast access during orchestration)
const activeRuns = new Map<string, Run>()

function generateId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export const store = {
  createRun(
    scenarioId: string,
    scenarioName: string,
    config: Scenario,
    overrides?: RunOverrides
  ): Run {
    const run: Run = {
      id: generateId(),
      scenarioId,
      scenarioName,
      status: "pending",
      startedAt: new Date().toISOString(),
      config,
      overrides,
      services: [],
      preserveOnFailure:
        overrides?.preserveOnFailure ??
        config.cleanup?.preserveOnFailure ??
        false,
    }

    activeRuns.set(run.id, run)
    insertRun(run)
    return run
  },

  getRun(id: string): Run | undefined {
    // Check active cache first for live data
    const cached = activeRuns.get(id)
    if (cached) return cached

    // Fall back to database
    return getRunById(id)
  },

  listRuns(): Run[] {
    // Merge active runs with database runs
    const dbRuns = listAllRuns()
    const merged = new Map<string, Run>()

    for (const run of dbRuns) {
      merged.set(run.id, run)
    }
    // Active runs take precedence (more up-to-date)
    for (const [id, run] of activeRuns) {
      merged.set(id, run)
    }

    return [...merged.values()].sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    )
  },

  updateStatus(id: string, status: RunStatus): void {
    const run = activeRuns.get(id)
    if (run) {
      run.status = status
      if (
        status === "passed" ||
        status === "failed" ||
        status === "cancelled" ||
        status === "error"
      ) {
        run.finishedAt = new Date().toISOString()
      }
    }
    updateRunStatus(id, status)

    // Remove from active cache when terminal
    if (
      status === "passed" ||
      status === "failed" ||
      status === "cancelled" ||
      status === "error"
    ) {
      activeRuns.delete(id)
    }
  },

  updateServices(id: string, services: ServiceRunInfo[]): void {
    const run = activeRuns.get(id)
    if (run) {
      run.services = services
    }
    updateRunServices(id, services)
  },

  updateExitCode(id: string, exitCode: number): void {
    const run = activeRuns.get(id)
    if (run) {
      run.exitCode = exitCode
    }
    updateRunExitCode(id, exitCode)
  },

  updateError(id: string, error: string): void {
    const run = activeRuns.get(id)
    if (run) {
      run.error = error
    }
    updateRunError(id, error)
  },
}
