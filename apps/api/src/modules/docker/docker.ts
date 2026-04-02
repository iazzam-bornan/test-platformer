import { spawn } from "child_process"
import fs from "fs/promises"
import path from "path"

function exec(
  command: string,
  args: string[],
  options?: { cwd?: string; timeout?: number }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: options?.cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options?.timeout,
    })

    let stdout = ""
    let stderr = ""

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 })
    })

    proc.on("error", (err) => {
      resolve({ stdout, stderr: err.message, exitCode: 1 })
    })
  })
}

export async function writeComposeFile(
  workspaceDir: string,
  composeYaml: string
): Promise<string> {
  const filePath = path.join(workspaceDir, "docker-compose.yml")
  await fs.writeFile(filePath, composeYaml, "utf-8")
  return filePath
}

export async function composeUp(
  workspaceDir: string,
  projectName: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return exec("docker", ["compose", "-p", projectName, "up", "-d", "--build"], {
    cwd: workspaceDir,
    timeout: 600_000, // 10 minutes for builds
  })
}

export async function composeDown(
  workspaceDir: string,
  projectName: string,
  removeVolumes = true
): Promise<void> {
  const args = ["compose", "-p", projectName, "down"]
  if (removeVolumes) args.push("-v")
  args.push("--remove-orphans")
  await exec("docker", args, { cwd: workspaceDir })
}

export async function getContainerIds(
  projectName: string
): Promise<Record<string, string>> {
  const result = await exec("docker", [
    "compose",
    "-p",
    projectName,
    "ps",
    "--format",
    "{{.Service}}={{.ID}}",
  ])

  const map: Record<string, string> = {}
  if (result.exitCode === 0) {
    for (const line of result.stdout.trim().split("\n")) {
      const [service, id] = line.split("=")
      if (service && id) map[service] = id
    }
  }
  return map
}

export async function getServiceHealth(
  containerId: string
): Promise<"starting" | "healthy" | "unhealthy" | "none"> {
  const result = await exec("docker", [
    "inspect",
    "--format",
    "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}",
    containerId,
  ])

  const status = result.stdout.trim()
  if (status === "healthy" || status === "unhealthy" || status === "starting") {
    return status
  }
  return "none"
}

export async function waitForHealthy(
  projectName: string,
  timeoutMs = 300_000
): Promise<boolean> {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const containers = await getContainerIds(projectName)
    const entries = Object.entries(containers).filter(
      ([name]) => name !== "test-runner"
    )

    if (entries.length === 0) {
      await new Promise((r) => setTimeout(r, 2000))
      continue
    }

    let allHealthy = true
    for (const [, containerId] of entries) {
      const health = await getServiceHealth(containerId)
      if (health === "unhealthy") return false
      if (health !== "healthy" && health !== "none") allHealthy = false
    }

    if (allHealthy) return true
    await new Promise((r) => setTimeout(r, 3000))
  }

  return false
}

export async function getContainerLogs(
  containerId: string,
  since?: string
): Promise<string> {
  const args = ["logs", containerId]
  if (since) args.push("--since", since)
  args.push("--timestamps")
  const result = await exec("docker", args)
  return result.stdout + result.stderr
}

export async function getContainerExitCode(
  containerId: string
): Promise<number | null> {
  const result = await exec("docker", [
    "inspect",
    "--format",
    "{{.State.ExitCode}}",
    containerId,
  ])

  if (result.exitCode !== 0) return null
  const code = parseInt(result.stdout.trim(), 10)
  return isNaN(code) ? null : code
}

export async function isContainerRunning(
  containerId: string
): Promise<boolean> {
  const result = await exec("docker", [
    "inspect",
    "--format",
    "{{.State.Running}}",
    containerId,
  ])
  return result.stdout.trim() === "true"
}

export async function waitForTestRunner(
  projectName: string,
  timeoutMs = 600_000
): Promise<{ exitCode: number; logs: string }> {
  const start = Date.now()

  // Wait for the test-runner container to appear
  let containerId = ""
  while (Date.now() - start < timeoutMs) {
    const containers = await getContainerIds(projectName)
    if (containers["test-runner"]) {
      containerId = containers["test-runner"]
      break
    }
    await new Promise((r) => setTimeout(r, 2000))
  }

  if (!containerId) {
    return { exitCode: 1, logs: "Test runner container never started" }
  }

  // Wait for it to finish
  while (Date.now() - start < timeoutMs) {
    const running = await isContainerRunning(containerId)
    if (!running) {
      const exitCode = await getContainerExitCode(containerId)
      const logs = await getContainerLogs(containerId)
      return { exitCode: exitCode ?? 1, logs }
    }
    await new Promise((r) => setTimeout(r, 3000))
  }

  const logs = await getContainerLogs(containerId)
  return { exitCode: 1, logs: logs + "\n[TIMEOUT] Test runner exceeded time limit" }
}

export async function copyFromContainer(
  containerId: string,
  containerPath: string,
  hostPath: string
): Promise<boolean> {
  const result = await exec("docker", [
    "cp",
    `${containerId}:${containerPath}`,
    hostPath,
  ])
  return result.exitCode === 0
}

export async function isDockerAvailable(): Promise<boolean> {
  const result = await exec("docker", ["info"])
  return result.exitCode === 0
}
