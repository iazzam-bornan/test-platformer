import { EventEmitter } from "events"
import os from "os"
import path from "path"
import type {
  RunConfig,
  RunState,
  RunStatus,
  PlatformEvents,
  PlatformOptions,
  Storage,
} from "./types"
import { Run } from "./run"
import { MemoryStorage } from "./storage/memory"
import { isDockerAvailable } from "./docker"

export class TestPlatform {
  private emitter = new EventEmitter()
  private storage: Storage
  private workspaceDir: string
  private activeRuns = new Map<string, Run>()

  constructor(opts?: PlatformOptions) {
    this.storage = opts?.storage ?? new MemoryStorage()
    this.workspaceDir = opts?.workspaceDir ?? path.join(os.tmpdir(), "testplatform-runs")
  }

  // ---- Event subscription ----

  on<E extends keyof PlatformEvents>(event: E, listener: PlatformEvents[E]): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void)
    return this
  }

  off<E extends keyof PlatformEvents>(event: E, listener: PlatformEvents[E]): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void)
    return this
  }

  // ---- Run management ----

  /**
   * Create and start a run. Returns the Run handle immediately.
   * The run executes in the background.
   */
  async createRun(config: RunConfig): Promise<Run> {
    const id = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const run = new Run(id, config, this.emitter, this.storage, this.workspaceDir)

    this.activeRuns.set(id, run)

    // Execute in background
    run.execute().finally(() => {
      this.activeRuns.delete(id)
    })

    // Save initial state
    await this.storage.saveRun(run.getState())

    return run
  }

  /**
   * Create multiple identical runs in parallel.
   */
  async createParallelRuns(config: RunConfig, count: number): Promise<Run[]> {
    const runs: Run[] = []
    for (let i = 0; i < count; i++) {
      const run = await this.createRun(config)
      runs.push(run)
    }
    return runs
  }

  /**
   * Get an active run by ID (only works for in-progress runs).
   */
  getActiveRun(id: string): Run | undefined {
    return this.activeRuns.get(id)
  }

  /**
   * Get all active run IDs.
   */
  getActiveRunIds(): string[] {
    return [...this.activeRuns.keys()]
  }

  /**
   * Cancel an active run.
   */
  async cancelRun(id: string): Promise<void> {
    const run = this.activeRuns.get(id)
    if (run) {
      await run.cancel()
    }
  }

  /**
   * Destroy a preserved environment from a finished run.
   */
  async destroyRun(id: string): Promise<void> {
    const active = this.activeRuns.get(id)
    if (active) {
      await active.destroy()
      return
    }
    // For finished runs, try to compose down just in case
    const { composeDown } = await import("./docker")
    await composeDown(
      path.join(this.workspaceDir, id),
      `tp-${id}`
    ).catch(() => {})
  }

  // ---- Storage queries ----

  async getRun(id: string): Promise<RunState | null> {
    // Active run has the freshest state
    const active = this.activeRuns.get(id)
    if (active) return active.getState()

    return this.storage.getRun(id)
  }

  async listRuns(opts?: { status?: RunStatus; limit?: number }): Promise<RunState[]> {
    const dbRuns = await this.storage.listRuns(opts)

    // Merge active runs (they have fresher state)
    const merged = new Map<string, RunState>()
    for (const run of dbRuns) {
      merged.set(run.id, run)
    }
    for (const [id, run] of this.activeRuns) {
      const state = run.getState()
      if (!opts?.status || state.status === opts.status) {
        merged.set(id, state)
      }
    }

    let result = [...merged.values()]
    result.sort((a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    )

    if (opts?.limit) {
      result = result.slice(0, opts.limit)
    }

    return result
  }

  async deleteRun(id: string): Promise<void> {
    await this.storage.deleteRun(id)
  }

  // ---- Utilities ----

  async checkDocker(): Promise<boolean> {
    return isDockerAvailable()
  }
}
