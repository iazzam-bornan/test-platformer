import path from "path"
import YAML from "yaml"
import type { Scenario } from "@workspace/shared/schemas/scenario"
import type { RunOverrides } from "@workspace/shared/types/run"

interface ComposeService {
  image?: string
  build?: { context: string; dockerfile: string; args?: Record<string, string> }
  environment?: Record<string, string>
  ports?: string[]
  healthcheck?: {
    test: string[]
    interval: string
    timeout: string
    retries: number
  }
  depends_on?: Record<string, { condition: string }>
  volumes?: string[]
  working_dir?: string
  command?: string[]
}

interface ComposeFile {
  name: string
  services: Record<string, ComposeService>
  networks: { default: { name: string } }
}

let nextPort = 10000

function allocatePort(): number {
  return nextPort++
}

export function generateCompose(
  scenario: Scenario,
  runId: string,
  reposDir: string,
  overrides?: RunOverrides
): { compose: ComposeFile; portMap: Record<string, Record<number, number>> } {
  const projectName = `tp-${runId}`
  const services: Record<string, ComposeService> = {}
  const portMap: Record<string, Record<number, number>> = {}

  // Infrastructure services (postgres, redis, etc.)
  if (scenario.infrastructure) {
    for (const [name, infra] of Object.entries(scenario.infrastructure)) {
      const imageOverride = overrides?.images?.[name]
      const svc: ComposeService = {
        image: imageOverride ?? infra.image,
      }

      if (infra.env) {
        const envOverride = overrides?.env?.[name]
        svc.environment = { ...infra.env, ...envOverride }
      }

      if (infra.ports) {
        svc.ports = []
        portMap[name] = {}
        for (const p of infra.ports) {
          const hostPort =
            p.hostPort === "auto" || p.hostPort === undefined
              ? allocatePort()
              : p.hostPort
          svc.ports.push(`${hostPort}:${p.containerPort}`)
          portMap[name][p.containerPort] = hostPort
        }
      }

      if (infra.healthcheck) {
        svc.healthcheck = convertHealthcheck(infra.healthcheck)
      }

      if (infra.volumes) {
        svc.volumes = infra.volumes
      }

      services[name] = svc
    }
  }

  // Application services (frontend, backend, etc.)
  for (const [name, service] of Object.entries(scenario.services)) {
    const svc: ComposeService = {}
    const imageOverride = overrides?.images?.[name]

    if (imageOverride) {
      // Override always wins
      svc.image = imageOverride
    } else if (service.image) {
      // Pre-built image
      svc.image = service.image
    } else if (service.repo && service.build) {
      // Build from repo
      const repoDir = path.join(reposDir, service.repo)
      svc.build = {
        context: path.join(repoDir, service.build.context),
        dockerfile: service.build.dockerfile,
      }
      if (service.build.args) {
        svc.build.args = service.build.args
      }
    }

    if (service.workingDir && service.workingDir !== ".") {
      svc.working_dir = service.workingDir
    }

    if (service.env) {
      const envOverride = overrides?.env?.[name]
      svc.environment = { ...service.env, ...envOverride }
    }

    if (service.ports) {
      svc.ports = []
      portMap[name] = {}
      for (const p of service.ports) {
        const hostPort =
          p.hostPort === "auto" || p.hostPort === undefined
            ? allocatePort()
            : p.hostPort
        svc.ports.push(`${hostPort}:${p.containerPort}`)
        portMap[name][p.containerPort] = hostPort
      }
    }

    if (service.healthcheck) {
      svc.healthcheck = convertHealthcheck(service.healthcheck)
    }

    if (service.dependsOn) {
      svc.depends_on = {}
      for (const dep of service.dependsOn) {
        const depHasHealthcheck =
          scenario.infrastructure?.[dep]?.healthcheck ||
          scenario.services[dep]?.healthcheck
        svc.depends_on[dep] = {
          condition: depHasHealthcheck
            ? "service_healthy"
            : "service_started",
        }
      }
    }

    services[name] = svc
  }

  // Test runner service
  const runner = scenario.tests.runner
  const testSvc: ComposeService = {
    command: runner.command,
  }

  if (runner.image) {
    testSvc.image = runner.image
  } else if (runner.build) {
    testSvc.build = {
      context: runner.build.context,
      dockerfile: runner.build.dockerfile,
    }
  }

  if (runner.env) {
    testSvc.environment = runner.env
  }

  if (runner.mountRepos) {
    testSvc.volumes = runner.mountRepos.map(
      (repo) => `${path.join(reposDir, repo)}:/app/${repo}`
    )
    if (!testSvc.working_dir) {
      testSvc.working_dir = `/app/${runner.mountRepos[0]}`
    }
  }

  if (runner.dependsOn) {
    testSvc.depends_on = {}
    for (const dep of runner.dependsOn) {
      const depHasHealthcheck =
        scenario.infrastructure?.[dep]?.healthcheck ||
        scenario.services[dep]?.healthcheck
      testSvc.depends_on[dep] = {
        condition: depHasHealthcheck
          ? "service_healthy"
          : "service_started",
      }
    }
  }

  services["test-runner"] = testSvc

  const compose: ComposeFile = {
    name: projectName,
    services,
    networks: {
      default: { name: `${projectName}-net` },
    },
  }

  return { compose, portMap }
}

function convertHealthcheck(
  hc: NonNullable<
    | import("@workspace/shared/schemas/scenario").ServiceConfig["healthcheck"]
    | import("@workspace/shared/schemas/scenario").InfraServiceConfig["healthcheck"]
  >
): ComposeService["healthcheck"] {
  let test: string[]

  switch (hc.type) {
    case "http":
      test = [
        "CMD-SHELL",
        `curl -f http://localhost:${hc.port}${hc.path} || exit 1`,
      ]
      break
    case "command":
      test = ["CMD", ...hc.command]
      break
    case "tcp":
      test = [
        "CMD-SHELL",
        `nc -z localhost ${hc.port} || exit 1`,
      ]
      break
  }

  return {
    test,
    interval: `${hc.interval ?? 5}s`,
    timeout: `${hc.timeout ?? 10}s`,
    retries: hc.retries ?? 5,
  }
}

export function composeToYaml(compose: ComposeFile): string {
  return YAML.stringify(compose)
}
