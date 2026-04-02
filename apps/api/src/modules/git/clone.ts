import { spawn } from "child_process"
import path from "path"
import type { RepoConfig } from "@workspace/shared/schemas/scenario"

function exec(
  command: string,
  args: string[],
  cwd?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
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

export async function cloneRepo(
  repoName: string,
  config: RepoConfig,
  ref: string,
  targetDir: string
): Promise<void> {
  const repoDir = path.join(targetDir, repoName)

  const cloneResult = await exec("git", [
    "clone",
    "--depth",
    "1",
    "--branch",
    ref,
    config.url,
    repoDir,
  ])

  if (cloneResult.exitCode !== 0) {
    // If --branch fails (e.g., for a commit SHA), do a full clone + checkout
    const fullClone = await exec("git", ["clone", config.url, repoDir])

    if (fullClone.exitCode !== 0) {
      throw new Error(
        `Failed to clone ${config.url}: ${fullClone.stderr}`
      )
    }

    const checkout = await exec("git", ["checkout", ref], repoDir)
    if (checkout.exitCode !== 0) {
      throw new Error(
        `Failed to checkout ref '${ref}' in ${repoName}: ${checkout.stderr}`
      )
    }
  }
}

export async function cloneAllRepos(
  repos: Record<string, RepoConfig>,
  refOverrides: Record<string, string> | undefined,
  reposDir: string
): Promise<void> {
  const tasks = Object.entries(repos).map(([name, config]) => {
    const ref = refOverrides?.[name] ?? config.ref
    return cloneRepo(name, config, ref, reposDir)
  })

  await Promise.all(tasks)
}
