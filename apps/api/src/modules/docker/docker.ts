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

function execStreaming(
  command: string,
  args: string[],
  options?: { cwd?: string; timeout?: number },
  onOutput?: (line: string) => void
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
      const text = data.toString()
      stdout += text
      if (onOutput) {
        for (const line of text.split("\n").filter(Boolean)) {
          onOutput(line.trim())
        }
      }
    })

    proc.stderr.on("data", (data: Buffer) => {
      const text = data.toString()
      stderr += text
      if (onOutput) {
        for (const line of text.split("\n").filter(Boolean)) {
          onOutput(line.trim())
        }
      }
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
  projectName: string,
  onOutput?: (line: string) => void
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return execStreaming(
    "docker",
    ["compose", "-p", projectName, "up", "-d", "--build"],
    { cwd: workspaceDir, timeout: 600_000 },
    onOutput
  )
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
    "-a",
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

/**
 * Stream container logs in real-time via `docker logs -f`.
 * Returns an abort function to stop streaming.
 */
export function streamContainerLogs(
  containerId: string,
  onLine: (line: string) => void
): () => void {
  const proc = spawn("docker", ["logs", "-f", "--timestamps", containerId], {
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  })

  const handleData = (data: Buffer) => {
    const text = data.toString()
    for (const line of text.split("\n")) {
      const trimmed = line.trim()
      if (trimmed) onLine(trimmed)
    }
  }

  proc.stdout.on("data", handleData)
  proc.stderr.on("data", handleData)

  return () => {
    try {
      proc.kill()
    } catch {}
  }
}

const RESULT_PREFIX = "@@RESULT@@"

/**
 * Stream test-runner container logs, splitting:
 * - stdout lines -> onLog (human-readable)
 * - stderr lines with @@RESULT@@ prefix -> onResult (parsed JSON)
 * - other stderr lines -> onLog
 */
export function streamTestRunnerLogs(
  containerId: string,
  onLog: (line: string) => void,
  onResult: (json: string) => void
): () => void {
  // Use --timestamps on stdout, raw stderr to avoid docker prepending timestamps to our JSON
  const proc = spawn("docker", ["logs", "-f", containerId], {
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  })

  proc.stdout.on("data", (data: Buffer) => {
    for (const line of data.toString().split("\n")) {
      const trimmed = line.trim()
      if (trimmed) onLog(trimmed)
    }
  })

  proc.stderr.on("data", (data: Buffer) => {
    for (const line of data.toString().split("\n")) {
      const trimmed = line.trim()
      if (!trimmed) continue
      if (trimmed.startsWith(RESULT_PREFIX)) {
        onResult(trimmed.slice(RESULT_PREFIX.length))
      } else {
        onLog(trimmed)
      }
    }
  })

  return () => {
    try {
      proc.kill()
    } catch {}
  }
}
