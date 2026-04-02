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
        portMap[name] = {}
        for (const p of infra.ports) {
          if (typeof p.hostPort === "number") {
            if (!svc.ports) svc.ports = []
            svc.ports.push(`${p.hostPort}:${p.containerPort}`)
            portMap[name][p.containerPort] = p.hostPort
          }
          // "auto" or undefined = no host mapping, containers use internal network
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
      portMap[name] = {}
      for (const p of service.ports) {
        if (typeof p.hostPort === "number") {
          if (!svc.ports) svc.ports = []
          svc.ports.push(`${p.hostPort}:${p.containerPort}`)
          portMap[name][p.containerPort] = p.hostPort
        }
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
  const testSvc: ComposeService = {}
  const useHttpChecks = !runner.command && runner.httpChecks && runner.httpChecks.length > 0

  if (runner.command) {
    testSvc.command = runner.command
  } else if (useHttpChecks) {
    // Command will run the generated test script
    testSvc.command = ["node", "/test-script.mjs"]
  }

  if (runner.image) {
    testSvc.image = runner.image
  } else if (useHttpChecks && !runner.build) {
    testSvc.image = "node:20-slim"
  } else if (runner.build) {
    testSvc.build = {
      context: runner.build.context,
      dockerfile: runner.build.dockerfile,
    }
  }

  if (runner.env) {
    testSvc.environment = runner.env
  }

  // Volumes: mount repos, test script, and results dir
  testSvc.volumes = []

  if (runner.mountRepos) {
    for (const repo of runner.mountRepos) {
      testSvc.volumes.push(`${path.join(reposDir, repo)}:/app/${repo}`)
    }
    if (!testSvc.working_dir) {
      testSvc.working_dir = `/app/${runner.mountRepos[0]}`
    }
  }

  if (useHttpChecks) {
    // Mount the generated test script (results stream via stderr, no file needed)
    testSvc.volumes.push(`${path.join(reposDir, "..", "test-script.mjs")}:/test-script.mjs:ro`)
  }

  if (testSvc.volumes.length === 0) {
    delete testSvc.volumes
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
      // Fallback chain: wget (alpine), curl (full images), node fetch (node images)
      test = [
        "CMD-SHELL",
        `wget --spider -q http://localhost:${hc.port}${hc.path} || curl -sf http://localhost:${hc.port}${hc.path} > /dev/null || node -e "fetch('http://localhost:${hc.port}${hc.path}').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"`,
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
