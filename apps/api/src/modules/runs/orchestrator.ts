import type { Scenario } from "@workspace/shared/schemas/scenario"
import type { RunOverrides, ServiceRunInfo } from "@workspace/shared/types/run"
import { store } from "./store"
import { createWorkspace, destroyWorkspace, getReposDir, getLogsDir, getArtifactsDir } from "../workspace/manager"
import { cloneAllRepos } from "../git/clone"
import { generateCompose, composeToYaml } from "../docker/compose-generator"
import {
  writeComposeFile,
  composeUp,
  composeDown,
  getContainerIds,
  getServiceHealth,
  waitForHealthy,
  waitForTestRunner,
  getContainerLogs,
  copyFromContainer,
} from "../docker/docker"
import { logEmitter } from "../logs/emitter"
import fs from "fs/promises"
import path from "path"

export async function executeRun(
  runId: string,
  scenario: Scenario,
  overrides?: RunOverrides
): Promise<void> {
  const projectName = `tp-${runId}`

  function log(message: string) {
    const line = `[${new Date().toISOString()}] ${message}`
    logEmitter.emit(runId, line)
  }

  try {
    // --- CLONING ---
    store.updateStatus(runId, "cloning")
    log("Creating workspace...")
    const workspaceDir = await createWorkspace(runId)
    const reposDir = getReposDir(runId)

    log(`Cloning ${Object.keys(scenario.repos).length} repositories...`)
    await cloneAllRepos(scenario.repos, overrides?.refs, reposDir)
    log("All repositories cloned successfully.")

    // --- BUILDING ---
    store.updateStatus(runId, "building")
    log("Generating Docker Compose configuration...")
    const { compose, portMap } = generateCompose(
      scenario,
      runId,
      reposDir,
      overrides
    )
    const composeYaml = composeToYaml(compose)
    await writeComposeFile(workspaceDir, composeYaml)
    log("Docker Compose file written.")

    // Update services in the run with port mappings
    const serviceInfos: ServiceRunInfo[] = []
    for (const [name, ports] of Object.entries(portMap)) {
      const svcConfig = scenario.services[name]
      const infraConfig = scenario.infrastructure?.[name]
      serviceInfos.push({
        name,
        image: infraConfig?.image ?? svcConfig?.image ?? `build:${name}`,
        healthStatus: "starting",
        mappedPorts: ports,
      })
    }
    // Add any services without ports
    for (const name of Object.keys(scenario.services)) {
      if (!portMap[name]) {
        serviceInfos.push({
          name,
          image: scenario.services[name].image ?? `build:${name}`,
          healthStatus: "starting",
          mappedPorts: {},
        })
      }
    }
    store.updateServices(runId, serviceInfos)

    // --- BOOTING ---
    store.updateStatus(runId, "booting")
    log("Starting Docker Compose stack...")
    const upResult = await composeUp(workspaceDir, projectName)
    if (upResult.exitCode !== 0) {
      log(`Docker Compose up failed:\n${upResult.stderr}`)
      throw new Error(`Docker Compose up failed: ${upResult.stderr}`)
    }
    log("Docker Compose stack started.")

    // Update container IDs
    const containerIds = await getContainerIds(projectName)
    for (const svc of serviceInfos) {
      svc.containerId = containerIds[svc.name]
    }
    store.updateServices(runId, serviceInfos)

    // --- WAITING FOR HEALTH ---
    store.updateStatus(runId, "waiting_healthy")
    log("Waiting for services to become healthy...")

    const healthy = await waitForHealthy(projectName, 300_000)
    if (!healthy) {
      // Update individual health statuses
      for (const svc of serviceInfos) {
        if (svc.containerId) {
          const health = await getServiceHealth(svc.containerId)
          svc.healthStatus = health === "none" ? "healthy" : health
        }
      }
      store.updateServices(runId, serviceInfos)

      log("Some services failed health checks.")
      throw new Error("Services failed to become healthy within timeout")
    }

    // Update health statuses to healthy
    for (const svc of serviceInfos) {
      svc.healthStatus = "healthy"
    }
    store.updateServices(runId, serviceInfos)
    log("All services are healthy.")

    // --- TESTING ---
    store.updateStatus(runId, "testing")
    log("Test runner starting...")

    const testResult = await waitForTestRunner(projectName, 600_000)

    // Save test logs
    const logsDir = getLogsDir(runId)
    await fs.writeFile(
      path.join(logsDir, "test-runner.log"),
      testResult.logs,
      "utf-8"
    )
    log(`Test runner finished with exit code ${testResult.exitCode}`)

    // Collect logs from all services
    await collectServiceLogs(runId, projectName, containerIds)

    // Collect artifacts if configured
    if (scenario.artifacts) {
      await collectArtifacts(
        runId,
        projectName,
        containerIds,
        scenario
      )
    }

    // Set final status
    store.updateExitCode(runId, testResult.exitCode)
    if (testResult.exitCode === 0) {
      store.updateStatus(runId, "passed")
      log("Run PASSED.")
    } else {
      store.updateStatus(runId, "failed")
      log("Run FAILED.")
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`Run error: ${message}`)
    store.updateError(runId, message)

    const run = store.getRun(runId)
    // If the run was cancelled while in progress, don't override
    if (run && run.status !== "cancelled") {
      store.updateStatus(runId, "error")
    }
  } finally {
    const run = store.getRun(runId)
    const shouldPreserve =
      run &&
      run.preserveOnFailure &&
      (run.status === "failed" || run.status === "error")

    if (shouldPreserve) {
      log("Environment preserved for debugging (preserve-on-failure enabled).")
    } else {
      // --- CLEANUP ---
      store.updateStatus(
        runId,
        run?.status === "passed" ||
          run?.status === "failed" ||
          run?.status === "cancelled" ||
          run?.status === "error"
          ? run.status
          : "cleaning_up"
      )
      log("Cleaning up Docker environment...")
      try {
        await composeDown(
          path.join(getReposDir(runId), ".."),
          projectName
        )
        await destroyWorkspace(runId)
        log("Cleanup complete.")
      } catch {
        log("Cleanup encountered errors (non-fatal).")
      }
    }
  }
}

async function collectServiceLogs(
  runId: string,
  projectName: string,
  containerIds: Record<string, string>
): Promise<void> {
  const logsDir = getLogsDir(runId)
  for (const [service, containerId] of Object.entries(containerIds)) {
    try {
      const logs = await getContainerLogs(containerId)
      await fs.writeFile(
        path.join(logsDir, `${service}.log`),
        logs,
        "utf-8"
      )
    } catch {
      // Non-fatal
    }
  }
}

async function collectArtifacts(
  runId: string,
  _projectName: string,
  containerIds: Record<string, string>,
  scenario: Scenario
): Promise<void> {
  const artifactsDir = getArtifactsDir(runId)
  const testContainerId = containerIds["test-runner"]
  if (!testContainerId) return

  const artifactConfig = scenario.artifacts
  if (!artifactConfig) return

  // Copy custom artifact paths
  if (artifactConfig.paths) {
    for (const artifactPath of artifactConfig.paths) {
      const destPath = path.join(artifactsDir, path.basename(artifactPath))
      await copyFromContainer(testContainerId, artifactPath, destPath)
    }
  }

  // Try standard artifact locations
  const standardPaths = []
  if (artifactConfig.screenshots) {
    standardPaths.push("/app/test-results/screenshots")
    standardPaths.push("/app/screenshots")
  }
  if (artifactConfig.videos) {
    standardPaths.push("/app/test-results/videos")
    standardPaths.push("/app/videos")
  }
  if (artifactConfig.coverage) {
    standardPaths.push("/app/coverage")
  }

  for (const srcPath of standardPaths) {
    const dest = path.join(artifactsDir, path.basename(srcPath))
    await copyFromContainer(testContainerId, srcPath, dest)
  }
}
