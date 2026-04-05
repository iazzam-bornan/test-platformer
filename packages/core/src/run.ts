import { EventEmitter } from "events"
import path from "path"
import fs from "fs/promises"
import type {
  RunConfig,
  RunState,
  RunStatus,
  ServiceState,
  ServiceHealth,
  TestResult,
  PlatformEvents,
  Storage,
} from "./types"
import {
  generateComposeFile,
  composeUp,
  composeDown,
  getContainerIds,
  getContainerHealth,
  getContainerLogs,
  getContainerExitCode,
  isContainerRunning,
  streamContainerLogs,
  writeFile,
} from "./docker"
import { generateTestScript } from "./test-script"

const RESULT_PREFIX = "@@RESULT@@"

export class Run {
  readonly id: string
  private state: RunState
  private emitter: EventEmitter
  private storage: Storage
  private workspaceDir: string
  private projectName: string
  private cancelled = false
  private stopPolling = false

  constructor(
    id: string,
    config: RunConfig,
    emitter: EventEmitter,
    storage: Storage,
    workspaceDir: string
  ) {
    this.id = id
    this.emitter = emitter
    this.storage = storage
    this.workspaceDir = path.join(workspaceDir, id)
    this.projectName = `tp-${id}`

    this.state = {
      id,
      status: "pending",
      config,
      services: [],
      startedAt: new Date().toISOString(),
      logs: [],
      testResults: [],
      serviceLogs: {},
    }
  }

  /** Get a snapshot of the current state */
  getState(): RunState {
    return { ...this.state }
  }

  /** Cancel the run and tear down containers */
  async cancel(): Promise<void> {
    this.cancelled = true
    this.stopPolling = true
    await this.setStatus("cancelled")
    await composeDown(this.workspaceDir, this.projectName).catch(() => {})
    await this.cleanup()
  }

  /** Destroy a preserved environment */
  async destroy(): Promise<void> {
    await composeDown(this.workspaceDir, this.projectName).catch(() => {})
    await this.cleanup()
  }

  /** Execute the full run lifecycle */
  async execute(): Promise<RunState> {
    try {
      await this.boot()
      if (this.cancelled) return this.state

      await this.waitForHealth()
      if (this.cancelled) return this.state

      await this.runTests()
    } catch (err) {
      if (!this.cancelled) {
        const msg = err instanceof Error ? err.message : String(err)
        this.log(`Error: ${msg}`)
        this.state.error = msg
        await this.setStatus("error")
      }
    } finally {
      this.stopPolling = true

      // Collect service logs
      await this.collectServiceLogs()

      // Persist final state
      await this.storage.saveRun(this.state)
      this.emitter.emit("finished", this.id, this.getState())

      // Cleanup based on config
      const cleanup = this.state.config.cleanup
      const shouldPreserve =
        (this.state.status === "passed" && cleanup?.onPass === "preserve") ||
        (this.state.status === "failed" && cleanup?.onFail === "preserve") ||
        (this.state.status === "error" && cleanup?.onFail === "preserve")

      if (shouldPreserve) {
        this.log("Environment preserved.")
      } else if (this.state.status !== "cancelled") {
        await this.teardown()
      }
    }

    return this.state
  }

  // ---- Private lifecycle methods ----

  private async boot(): Promise<void> {
    await this.setStatus("booting")
    await fs.mkdir(this.workspaceDir, { recursive: true })

    // Generate test script if using httpChecks
    let testScriptPath: string | undefined
    if ("httpChecks" in this.state.config.test) {
      const t = this.state.config.test
      const script = generateTestScript(
        t.httpChecks,
        t.iterations ?? 10,
        t.delayMs ?? 1000
      )
      testScriptPath = path.join(this.workspaceDir, "test-script.mjs")
      await writeFile(testScriptPath, script)
      this.log(`Generated test script: ${t.httpChecks.length} URLs x ${t.iterations ?? 10} iterations`)
    }

    // Generate compose file
    const { yaml, portMaps } = generateComposeFile(
      this.state.config,
      this.id,
      undefined,
      testScriptPath
    )
    await writeFile(path.join(this.workspaceDir, "docker-compose.yml"), yaml)
    this.log("Docker Compose file written.")

    // Build initial service state
    const services: ServiceState[] = []
    const allSvcs = {
      ...this.state.config.infra,
      ...this.state.config.services,
    }
    for (const [name, svc] of Object.entries(allSvcs)) {
      services.push({
        name,
        image: svc.image,
        health: "unknown",
        ports: portMaps[name] ?? {},
      })
    }
    this.state.services = services
    await this.persist()

    // Start containers
    this.log("Starting Docker Compose stack...")
    const result = await composeUp(this.workspaceDir, this.projectName, (line) => {
      this.log(`[docker] ${line}`)
    })

    if (result.exitCode !== 0) {
      throw new Error(`Docker Compose up failed: ${result.stderr.slice(-500)}`)
    }

    // Update container IDs
    const ids = await getContainerIds(this.projectName)
    for (const svc of this.state.services) {
      svc.containerId = ids[svc.name]
      svc.health = "starting"
    }
    await this.persist()
    this.log("Docker Compose stack started.")
  }

  private async waitForHealth(): Promise<void> {
    await this.setStatus("waiting_healthy")
    this.log("Waiting for services to become healthy...")

    // Start background health polling
    this.stopPolling = false
    const pollPromise = this.pollHealth()

    const timeout = 300_000
    const start = Date.now()

    while (Date.now() - start < timeout) {
      if (this.cancelled) return

      const ids = await getContainerIds(this.projectName)
      const entries = Object.entries(ids).filter(([n]) => n !== "test-runner")

      if (entries.length === 0) {
        await sleep(2000)
        continue
      }

      let allHealthy = true
      for (const [, containerId] of entries) {
        const health = await getContainerHealth(containerId)
        if (health === "unhealthy") {
          this.stopPolling = true
          await pollPromise
          throw new Error("Service health check failed")
        }
        if (health !== "healthy" && health !== "none") allHealthy = false
      }

      if (allHealthy) {
        this.stopPolling = true
        await pollPromise
        this.log("All services are healthy.")
        return
      }

      await sleep(3000)
    }

    this.stopPolling = true
    await pollPromise
    throw new Error("Services failed to become healthy within timeout")
  }

  private async pollHealth(): Promise<void> {
    while (!this.stopPolling) {
      try {
        const ids = await getContainerIds(this.projectName)
        for (const svc of this.state.services) {
          const cid = ids[svc.name] ?? svc.containerId
          if (cid) {
            if (cid !== svc.containerId) svc.containerId = cid
            const h = await getContainerHealth(cid)
            const mapped: ServiceHealth = h === "none" ? "healthy" : h
            if (mapped !== svc.health) {
              svc.health = mapped
              this.emitter.emit("service:health", this.id, svc.name, mapped)
            }
          }
        }
        await this.persist()
      } catch {}
      await sleep(3000)
    }
  }

  private async runTests(): Promise<void> {
    await this.setStatus("testing")
    this.log("Test runner starting...")

    // Wait for test-runner container to appear
    let containerId = ""
    const start = Date.now()
    while (Date.now() - start < 60_000) {
      const ids = await getContainerIds(this.projectName)
      if (ids["test-runner"]) {
        containerId = ids["test-runner"]
        break
      }
      await sleep(2000)
    }

    if (!containerId) {
      throw new Error("Test runner container never started")
    }

    // Stream test runner output -- parse results from stderr
    const stopStream = streamContainerLogs(
      containerId,
      (line) => {
        this.log(`[test] ${line}`)
      },
      (line) => {
        if (line.startsWith(RESULT_PREFIX)) {
          const json = line.slice(RESULT_PREFIX.length)
          try {
            const result: TestResult = JSON.parse(json)
            this.state.testResults.push(result)
            this.emitter.emit("result", this.id, result)
          } catch {}
        } else {
          this.log(`[test] ${line}`)
        }
      }
    )

    // Wait for container to exit
    while (Date.now() - start < 600_000) {
      if (this.cancelled) {
        stopStream()
        return
      }
      const running = await isContainerRunning(containerId)
      if (!running) break
      await sleep(2000)
    }

    stopStream()

    const exitCode = await getContainerExitCode(containerId)
    this.state.exitCode = exitCode ?? 1

    this.log(`Test runner finished with exit code ${this.state.exitCode}`)

    if (this.state.exitCode === 0) {
      await this.setStatus("passed")
      this.log("Run PASSED.")
    } else {
      await this.setStatus("failed")
      this.log("Run FAILED.")
    }
  }

  private async collectServiceLogs(): Promise<void> {
    try {
      const ids = await getContainerIds(this.projectName)
      for (const [service, containerId] of Object.entries(ids)) {
        try {
          const logs = await getContainerLogs(containerId)
          this.state.serviceLogs[service] = logs
        } catch {}
      }
    } catch {}
  }

  private async teardown(): Promise<void> {
    this.log("Cleaning up Docker environment...")
    try {
      await composeDown(this.workspaceDir, this.projectName)
      await fs.rm(this.workspaceDir, { recursive: true, force: true })
      this.log("Cleanup complete.")
    } catch {
      this.log("Cleanup encountered errors (non-fatal).")
    }
  }

  private async cleanup(): Promise<void> {
    try {
      await fs.rm(this.workspaceDir, { recursive: true, force: true })
    } catch {}
  }

  private log(message: string): void {
    const line = `[${new Date().toISOString()}] ${message}`
    this.state.logs.push(line)
    this.emitter.emit("log", this.id, line)
  }

  private async setStatus(status: RunStatus): Promise<void> {
    this.state.status = status
    if (["passed", "failed", "cancelled", "error"].includes(status)) {
      this.state.finishedAt = new Date().toISOString()
    }
    this.emitter.emit("status", this.id, status)
    await this.persist()
  }

  private async persist(): Promise<void> {
    await this.storage.saveRun(this.state).catch(() => {})
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
