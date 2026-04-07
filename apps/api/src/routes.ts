import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import path from "path"
import type { TestPlatform, RunState, RunConfig } from "@testplatform/core"
import { loadScenarioById, getScenariosDir } from "./modules/scenarios/loader"
import type { Run, ServiceRunInfo } from "@workspace/shared/types/run"
import type { Artifact } from "@workspace/shared/types/api"

// Map core RunState -> frontend Run shape
function toFrontendRun(
  state: RunState,
  scenarioId?: string,
  scenarioName?: string
): Run {
  return {
    id: state.id,
    scenarioId: scenarioId ?? (state as any).scenarioId ?? state.id,
    scenarioName: scenarioName ?? (state as any).scenarioName ?? state.id,
    status: state.status as Run["status"],
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    config: state.config as any,
    overrides: (state as any).overrides,
    services: state.services.map((s) => ({
      name: s.name,
      image: s.image,
      containerId: s.containerId,
      healthStatus: s.health,
      mappedPorts: s.ports,
    })),
    exitCode: state.exitCode,
    plannedTotal: state.plannedTotal,
    queuePosition: state.queuePosition,
    preserveOnFailure: state.config.cleanup?.onFail === "preserve",
    preserveAlways:
      state.config.cleanup?.onPass === "preserve" &&
      state.config.cleanup?.onFail === "preserve",
    error: state.error,
  } as Run
}

// Store scenario metadata alongside runs (the core doesn't know about scenarios)
const runMeta = new Map<
  string,
  { scenarioId: string; scenarioName: string; overrides?: any }
>()

// Routes
export function createRunRoutes(platform: TestPlatform): Hono {
  const routes = new Hono()

  // Queue status snapshot
  routes.get("/queue", async (c) => {
    return c.json({ data: platform.getQueueStatus() })
  })

  // Update max concurrent runs at runtime
  routes.put("/queue/max", async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const max = Number(body?.max)
    if (!Number.isFinite(max) || max < 0) {
      return c.json({ error: "max must be a non-negative number" }, 400)
    }
    await platform.setMaxConcurrentRuns(max)
    return c.json({ data: platform.getQueueStatus() })
  })

  // List all runs
  routes.get("/", async (c) => {
    const states = await platform.listRuns()
    const runs = states.map((s) => {
      const meta = runMeta.get(s.id)
      return toFrontendRun(s, meta?.scenarioId, meta?.scenarioName)
    })
    return c.json({ data: runs })
  })

  // Get single run
  routes.get("/:id", async (c) => {
    const state = await platform.getRun(c.req.param("id"))
    if (!state) return c.json({ error: "Run not found" }, 404)
    const meta = runMeta.get(state.id)
    return c.json({
      data: toFrontendRun(state, meta?.scenarioId, meta?.scenarioName),
    })
  })

  // Create run
  routes.post("/", async (c) => {
    const body = await c.req.json()
    const { scenarioId, overrides } = body

    if (!scenarioId) {
      return c.json({ error: "scenarioId is required" }, 400)
    }

    const scenario = await loadScenarioById(scenarioId)
    if (!scenario) {
      return c.json({ error: `Scenario '${scenarioId}' not found` }, 404)
    }

    // Convert scenario YAML config + overrides -> RunConfig for the core
    const config = scenarioToRunConfig(scenario.config, overrides, getScenariosDir())

    const run = await platform.createRun(config)

    // Store metadata the core doesn't care about
    runMeta.set(run.id, {
      scenarioId,
      scenarioName: scenario.name,
      overrides,
    })

    const state = run.getState()
    return c.json(
      { data: toFrontendRun(state, scenarioId, scenario.name) },
      201
    )
  })

  // Cancel run
  routes.post("/:id/cancel", async (c) => {
    const id = c.req.param("id")
    await platform.cancelRun(id)
    return c.json({ data: { id, status: "cancelled" } })
  })

  // Cleanup preserved run
  routes.post("/:id/cleanup", async (c) => {
    const id = c.req.param("id")
    await platform.destroyRun(id)
    return c.json({ data: { id, cleaned: true } })
  })

  // SSE: orchestrator logs (live or historical)
  routes.get("/:id/logs", async (c) => {
    const id = c.req.param("id")
    const state = await platform.getRun(id)
    if (!state) return c.json({ error: "Run not found" }, 404)

    return streamSSE(c, async (stream) => {
      // Send existing logs
      for (const line of state.logs) {
        await stream.writeSSE({ data: line, event: "log" })
      }

      const isTerminal = (s: string) =>
        ["passed", "failed", "cancelled", "error"].includes(s)

      if (isTerminal(state.status)) {
        await stream.writeSSE({ data: state.status, event: "status" })
        return
      }

      // Live: subscribe to new logs
      const handler = (runId: string, line: string) => {
        if (runId === id) {
          stream.writeSSE({ data: line, event: "log" }).catch(() => {})
        }
      }
      platform.on("log", handler)

      while (true) {
        const current = await platform.getRun(id)
        if (!current || isTerminal(current.status)) {
          await stream.writeSSE({
            data: current?.status ?? "unknown",
            event: "status",
          })
          break
        }
        await stream.sleep(1000)
      }

      platform.off("log", handler)
    })
  })

  // SSE: per-service Docker logs (live or historical)
  routes.get("/:id/logs/service/:service", async (c) => {
    const id = c.req.param("id")
    const service = c.req.param("service")
    const state = await platform.getRun(id)
    if (!state) return c.json({ error: "Run not found" }, 404)

    const isTerminal = (s: string) =>
      ["passed", "failed", "cancelled", "error"].includes(s)

    // Historical: serve from stored service logs
    if (isTerminal(state.status) && state.serviceLogs[service]) {
      return streamSSE(c, async (stream) => {
        for (const line of state.serviceLogs[service].split("\n")) {
          if (line.trim()) {
            await stream.writeSSE({ data: line, event: "log" })
          }
        }
        await stream.writeSSE({ data: state.status, event: "status" })
      })
    }

    // Live: stream from Docker
    const { getContainerIds, streamContainerLogs } =
      await import("@testplatform/core/docker")

    return streamSSE(c, async (stream) => {
      let containerId = ""
      const projectName = `tp-${id}`
      for (let i = 0; i < 10; i++) {
        const ids = await getContainerIds(projectName)
        if (ids[service]) {
          containerId = ids[service]
          break
        }
        await stream.sleep(2000)
      }

      if (!containerId) {
        await stream.writeSSE({
          data: `Container '${service}' not found`,
          event: "error",
        })
        return
      }

      const stop = streamContainerLogs(
        containerId,
        (line: string) =>
          stream.writeSSE({ data: line, event: "log" }).catch(() => stop()),
        (line: string) =>
          stream.writeSSE({ data: line, event: "log" }).catch(() => stop())
      )

      while (true) {
        const current = await platform.getRun(id)
        if (!current || isTerminal(current.status)) {
          stop()
          await stream.writeSSE({
            data: current?.status ?? "unknown",
            event: "status",
          })
          break
        }
        await stream.sleep(1000)
      }
    })
  })

  // SSE: test results (live or historical).
  // Always replays existing results first, then polls for new ones, so the
  // client never misses results that streamed in before they connected.
  routes.get("/:id/results", async (c) => {
    const id = c.req.param("id")
    const state = await platform.getRun(id)
    if (!state) return c.json({ error: "Run not found" }, 404)

    const isTerminal = (s: string) =>
      ["passed", "failed", "cancelled", "error"].includes(s)

    return streamSSE(c, async (stream) => {
      let resultsSent = 0
      let logsSent = 0

      const flushResults = async () => {
        const current = await platform.getRun(id)
        if (!current) return
        // Emit a synthetic "plan" event so the client gets plannedTotal even
        // if it connected after the runner already emitted it.
        if (resultsSent === 0 && typeof current.plannedTotal === "number") {
          await stream
            .writeSSE({
              data: JSON.stringify({
                type: "plan",
                totalChecks: current.plannedTotal,
              }),
              event: "result",
            })
            .catch(() => {})
        }
        for (let i = resultsSent; i < current.testResults.length; i++) {
          await stream
            .writeSSE({
              data: JSON.stringify(current.testResults[i]),
              event: "result",
            })
            .catch(() => {})
        }
        resultsSent = current.testResults.length

        // Also stream test-runner log lines (lines tagged "[test]")
        for (let i = logsSent; i < current.logs.length; i++) {
          const line = current.logs[i]
          if (line && line.includes("[test]")) {
            await stream
              .writeSSE({ data: line, event: "log" })
              .catch(() => {})
          }
        }
        logsSent = current.logs.length
      }

      // Initial replay
      await flushResults()

      // If already terminal, send the final status and we're done
      if (isTerminal(state.status)) {
        await stream.writeSSE({ data: state.status, event: "status" })
        return
      }

      // Live: poll until terminal
      while (true) {
        const current = await platform.getRun(id)
        if (!current) {
          await stream.writeSSE({ data: "unknown", event: "status" })
          break
        }
        await flushResults()
        if (isTerminal(current.status)) {
          await stream.writeSSE({ data: current.status, event: "status" })
          break
        }
        await stream.sleep(500)
      }
    })
  })

  // Browser streaming: return the WebSocket endpoint for the run's test-runner
  // noVNC server. The frontend connects directly.
  routes.get("/:id/browser-stream", async (c) => {
    const id = c.req.param("id")
    console.log(`[BROWSER-STREAM] request for run ${id}`)

    const state = await platform.getRun(id)
    if (!state) {
      console.log(`[BROWSER-STREAM] run ${id} not found`)
      return c.json({ error: "Run not found" }, 404)
    }

    // Verify streaming is actually enabled for this run
    const cucumber =
      "cucumber" in state.config.test ? state.config.test.cucumber : null
    console.log(
      `[BROWSER-STREAM] cucumber config:`,
      cucumber
        ? {
            hasStreamBrowser: cucumber.streamBrowser,
            hasStreamInteractive: cucumber.streamInteractive,
          }
        : "(not a cucumber test)"
    )
    if (!cucumber?.streamBrowser) {
      return c.json({ error: "Browser streaming not enabled for this run" }, 400)
    }

    // Look up the test-runner container and its mapped port
    const { getContainerIds, getContainerHostPort } = await import(
      "@testplatform/core/docker"
    )
    const projectName = `tp-${id}`
    const ids = await getContainerIds(projectName)
    console.log(`[BROWSER-STREAM] containers in project ${projectName}:`, ids)
    const containerId = ids["test-runner"]
    if (!containerId) {
      console.log(`[BROWSER-STREAM] test-runner container not found in project`)
      return c.json(
        {
          error: "Test runner container not found (not yet started?)",
          debug: { projectName, containers: ids },
        },
        404
      )
    }

    console.log(`[BROWSER-STREAM] looking up port 6080 on container ${containerId}`)

    // Run `docker inspect <id>` (no template) and parse the JSON output.
    // We avoid `--format '{{json ...}}'` because on Windows + shell:true the
    // {{ }} braces get mangled by the shell, producing
    //   "template parsing error: template: :1: unclosed action"
    // The full JSON inspect output is bigger but reliable across platforms.
    const { spawn } = await import("child_process")
    const inspectResult = await new Promise<{
      stdout: string
      stderr: string
      code: number
    }>((resolve) => {
      const proc = spawn("docker", ["inspect", containerId], {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      })
      let stdout = ""
      let stderr = ""
      proc.stdout.on("data", (d) => (stdout += d.toString()))
      proc.stderr.on("data", (d) => (stderr += d.toString()))
      proc.on("close", (code) =>
        resolve({ stdout, stderr, code: code ?? 1 })
      )
      proc.on("error", (err) =>
        resolve({ stdout, stderr: String(err), code: 1 })
      )
    })

    console.log(`[BROWSER-STREAM] docker inspect exit code:`, inspectResult.code)
    if (inspectResult.stderr.trim()) {
      console.log(`[BROWSER-STREAM] docker inspect stderr:`, inspectResult.stderr.trim())
    }

    let portsMap: Record<
      string,
      Array<{ HostIp: string; HostPort: string }> | null
    > = {}
    try {
      const parsed = JSON.parse(inspectResult.stdout.trim() || "null")
      // `docker inspect <id>` returns an array of one container object
      if (Array.isArray(parsed) && parsed.length > 0) {
        portsMap = parsed[0]?.NetworkSettings?.Ports ?? {}
      }
    } catch (err) {
      console.log(`[BROWSER-STREAM] failed to parse docker inspect output`, err)
    }

    console.log(`[BROWSER-STREAM] parsed ports map:`, portsMap)

    const bindings = portsMap["6080/tcp"]
    if (!bindings || bindings.length === 0) {
      console.log(
        `[BROWSER-STREAM] 6080/tcp not in ports map. Available keys: ${Object.keys(portsMap).join(", ") || "(none)"}`
      )
      return c.json(
        {
          error: "VNC port not mapped yet",
          debug: {
            containerId,
            availablePorts: Object.keys(portsMap),
            inspectStdout: inspectResult.stdout.trim(),
            inspectStderr: inspectResult.stderr.trim(),
            inspectExit: inspectResult.code,
          },
        },
        404
      )
    }

    // Pick first IPv4 binding (HostIp doesn't contain ":")
    const ipv4 = bindings.find((b) => b.HostIp && !b.HostIp.includes(":")) ?? bindings[0]
    const port = parseInt(ipv4.HostPort, 10)
    const host =
      !ipv4.HostIp || ipv4.HostIp === "0.0.0.0" || ipv4.HostIp === "::"
        ? "127.0.0.1"
        : ipv4.HostIp

    // Also try the cached core helper as a sanity check
    const helperResult = await getContainerHostPort(containerId, 6080).catch(
      (e) => ({ error: String(e) })
    )
    console.log(`[BROWSER-STREAM] core helper returned:`, helperResult)

    console.log(`[BROWSER-STREAM] resolved ${host}:${port}`)

    return c.json({
      data: {
        host,
        port,
        path: "websockify",
        interactive: cucumber.streamInteractive ?? false,
      },
    })
  })

  // Get collected service log files
  routes.get("/:id/logs/files", async (c) => {
    const id = c.req.param("id")
    const state = await platform.getRun(id)
    if (!state) return c.json({ error: "Run not found" }, 404)
    return c.json({ data: state.serviceLogs })
  })

  // List artifacts (from service logs as files for now)
  routes.get("/:id/artifacts", async (c) => {
    const id = c.req.param("id")
    const state = await platform.getRun(id)
    if (!state) return c.json({ error: "Run not found" }, 404)

    const artifacts: Artifact[] = Object.keys(state.serviceLogs).map((svc) => ({
      id: `${id}-${svc}`,
      runId: id,
      type: "log" as const,
      name: `${svc}.log`,
      path: `${svc}.log`,
      createdAt: state.finishedAt ?? state.startedAt,
    }))

    return c.json({ data: artifacts })
  })

  // Download artifact
  routes.get("/:id/artifacts/:name", async (c) => {
    const id = c.req.param("id")
    const name = c.req.param("name")
    const state = await platform.getRun(id)
    if (!state) return c.json({ error: "Run not found" }, 404)

    const svcName = name.replace(".log", "")
    const content = state.serviceLogs[svcName]
    if (!content) return c.json({ error: "Artifact not found" }, 404)

    c.header("Content-Type", "text/plain")
    return c.body(content)
  })

  return routes
}

// Resolve relative volume paths (e.g. "./jmeter-load-test/file:/container:ro")
// against the scenarios directory so Docker can find them
function resolveVolumes(volumes: string[] | undefined, scenariosDir: string): string[] | undefined {
  if (!volumes) return undefined
  return volumes.map((v) => {
    const [hostPart, ...rest] = v.split(":")
    if (hostPart.startsWith("./") || hostPart.startsWith("../")) {
      return [path.resolve(scenariosDir, hostPart), ...rest].join(":")
    }
    return v
  })
}

// Convert YAML scenario config -> core RunConfig
function scenarioToRunConfig(scenario: any, overrides?: any, scenariosDir?: string): RunConfig {
  const config: RunConfig = {
    services: {},
    infra: {},
    test: { httpChecks: ["http://localhost"] }, // placeholder, overridden below
    cleanup: {
      onPass: overrides?.preserveAlways ? "preserve" : "destroy",
      onFail:
        overrides?.preserveAlways || overrides?.preserveOnFailure
          ? "preserve"
          : "destroy",
    },
  }

  // Services
  for (const [name, svc] of Object.entries(scenario.services ?? {})) {
    const s = svc as any
    const imageOverride = overrides?.images?.[name]
    config.services[name] = {
      image: imageOverride ?? s.image ?? `build:${name}`,
      env: { ...s.env, ...overrides?.env?.[name] },
      ports: s.ports?.map((p: any) => ({
        container: p.containerPort,
        host: typeof p.hostPort === "number" ? p.hostPort : undefined,
      })),
      healthcheck: s.healthcheck,
      dependsOn: s.dependsOn,
    }
  }

  // Infrastructure
  for (const [name, infra] of Object.entries(scenario.infrastructure ?? {})) {
    const i = infra as any
    const imageOverride = overrides?.images?.[name]
    config.infra![name] = {
      image: imageOverride ?? i.image,
      env: { ...i.env, ...overrides?.env?.[name] },
      ports: i.ports?.map((p: any) => ({
        container: p.containerPort,
        host: typeof p.hostPort === "number" ? p.hostPort : undefined,
      })),
      healthcheck: i.healthcheck,
      volumes: resolveVolumes(i.volumes, scenariosDir ?? ""),
    }
  }

  // Test
  const runner = scenario.tests?.runner
  if (runner) {
    if (runner.httpChecks) {
      config.test = {
        httpChecks: runner.httpChecks,
        iterations: 10,
        delayMs: 1000,
      }
    } else if (runner.jmeter) {
      const testPlanPath = runner.jmeter.testPlan.startsWith("./") || runner.jmeter.testPlan.startsWith("../")
        ? path.resolve(scenariosDir ?? "", runner.jmeter.testPlan)
        : runner.jmeter.testPlan

      config.test = {
        jmeter: {
          testPlan: testPlanPath,
          image: runner.jmeter.image,
          threads: runner.jmeter.threads,
          rampUp: runner.jmeter.rampUp,
          loops: runner.jmeter.loops,
          duration: runner.jmeter.duration,
          errorThreshold: runner.jmeter.errorThreshold,
          properties: runner.jmeter.properties,
        },
      }
    } else if (runner.cucumber) {
      const resolveHostPath = (p: string) =>
        p.startsWith("./") || p.startsWith("../")
          ? path.resolve(scenariosDir ?? "", p)
          : p

      const cu = runner.cucumber
      config.test = {
        cucumber: {
          // Local mode
          features: cu.features ? resolveHostPath(cu.features) : undefined,
          steps: cu.steps ? resolveHostPath(cu.steps) : undefined,
          // Repo mode (passed through as-is)
          repo: cu.repo
            ? {
                url: cu.repo.url,
                ref: cu.repo.ref,
                modules: cu.repo.modules,
                token: cu.repo.token,
              }
            : undefined,
          // Common
          image: cu.image,
          baseUrl: cu.baseUrl,
          browser: cu.browser,
          headless: cu.headless,
          tags: cu.tags,
          env: cu.env,
          // Live browser streaming — may be overridden per-run via overrides
          streamBrowser: overrides?.streamBrowser ?? cu.streamBrowser,
          streamInteractive: overrides?.streamInteractive ?? cu.streamInteractive,
        },
      }
    } else if (runner.command) {
      config.test = {
        image: runner.image ?? "node:20-slim",
        entrypoint: runner.entrypoint,
        command: runner.command,
        env: runner.env,
        volumes: resolveVolumes(runner.volumes, scenariosDir ?? ""),
      }
    }
  }

  return config
}
