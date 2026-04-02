# TestPlatform

A Docker-based testing platform that orchestrates isolated multi-service environments from YAML scenario definitions. Define your entire stack -- services, databases, caches, and test runners -- in a single YAML file, then launch, monitor, and debug everything from a web UI.

---

## Quick Start

```bash
# Install dependencies
bun install

# Start both API and frontend
bun run dev

# API runs on http://localhost:4000
# Frontend runs on http://localhost:5173
```

**Requirements:** Bun >= 1.3.11, Docker running, Node >= 20

---

## Table of Contents

- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [YAML Scenario Reference](#yaml-scenario-reference)
- [Run Lifecycle](#run-lifecycle)
- [Docker Compose Generation](#docker-compose-generation)
- [Health Checks](#health-checks)
- [Log Streaming](#log-streaming)
- [Artifact Collection](#artifact-collection)
- [API Reference](#api-reference)
- [Frontend Architecture](#frontend-architecture)
- [Database & Persistence](#database--persistence)
- [Tech Stack](#tech-stack)

---

## How It Works

1. You write a YAML scenario describing your environment (services, infrastructure, tests)
2. Drop it in the `scenarios/` directory
3. Open the web UI, select the scenario, optionally override branches/images
4. Click "Launch Run"
5. The platform:
   - Clones repos (if building from source)
   - Generates a Docker Compose file from your YAML
   - Spins up all containers with health checks
   - Waits for everything to be healthy
   - Starts the test runner
   - Streams logs to the UI in real-time
   - Collects artifacts (logs, screenshots, videos)
   - Tears down the environment (or preserves it on failure for debugging)

All of this is driven by a state machine that transitions through well-defined stages, with every step logged and visible in the UI.

---

## Project Structure

```
test-plateform/
  apps/
    api/                              # Hono backend (Bun runtime)
      src/
        index.ts                      # Server entry, route mounting
        modules/
          scenarios/
            loader.ts                 # Reads & validates YAML files from scenarios/
            routes.ts                 # GET /scenarios, GET /scenarios/:id
          runs/
            store.ts                  # In-memory + SQLite hybrid state
            routes.ts                 # CRUD + SSE log streaming + cancel/cleanup
            orchestrator.ts           # The core: drives the full run lifecycle
          docker/
            compose-generator.ts      # YAML scenario -> docker-compose.yml
            docker.ts                 # Docker CLI wrapper (compose up/down, inspect, logs)
          git/
            clone.ts                  # Shallow clone with ref checkout
          logs/
            emitter.ts                # In-memory pub/sub for real-time log lines
          artifacts/
            routes.ts                 # List & download collected artifacts
          workspace/
            manager.ts                # Creates/destroys temp directories per run
          db/
            database.ts               # SQLite schema, migrations, queries
    web/                              # React frontend
      src/
        router.tsx                    # TanStack Router (5 routes)
        hooks/useApi.ts               # React Query hooks + SSE log hook
        components/layout.tsx         # Sidebar layout with Docker status
        pages/
          scenarios-list.tsx          # Browse & search scenarios
          scenario-detail.tsx         # View scenario config, launch run
          run-configuration.tsx       # Override branches, images, options
          run-live.tsx                # Live logs, service health, artifacts
          run-history.tsx             # Past runs table
  packages/
    shared/                           # Shared between api and web
      src/
        schemas/scenario.ts           # Zod schema for YAML validation
        types/run.ts                  # Run, RunStatus, ServiceRunInfo types
        types/api.ts                  # API response/request types
    ui/                               # shadcn/ui component library
  scenarios/                          # YAML scenario files (source of truth)
  storage/                            # SQLite database (auto-created)
```

---

## YAML Scenario Reference

A scenario file defines everything needed to run a test environment. Place `.yaml` files in the `scenarios/` directory.

### Complete Example

```yaml
version: 1

name: taskboard-e2e
description: Full-stack Task Board app with MongoDB and Redis
tags:
  - e2e
  - fullstack

# Git repos to clone (empty if using pre-built images)
repos: {}

# Application services
services:
  backend:
    image: ghcr.io/myorg/backend:latest    # Pre-built image
    env:
      MONGO_URL: mongodb://mongo:27017/app
      REDIS_URL: redis://redis:6379
    ports:
      - containerPort: 3000
        hostPort: auto                      # Internal only, no host mapping
    healthcheck:
      type: http
      path: /health
      port: 3000
    dependsOn:
      - mongo
      - redis

  frontend:
    image: ghcr.io/myorg/frontend:latest
    ports:
      - containerPort: 80
        hostPort: auto
    healthcheck:
      type: http
      path: /
      port: 80
    dependsOn:
      - backend

# Infrastructure (databases, caches, queues)
infrastructure:
  mongo:
    image: ghcr.io/myorg/mongo-seeded:latest
    ports:
      - containerPort: 27017
        hostPort: auto
    healthcheck:
      type: command
      command: ["mongosh", "--eval", "db.runCommand('ping').ok"]

  redis:
    image: redis:7-alpine
    ports:
      - containerPort: 6379
        hostPort: auto
    healthcheck:
      type: command
      command: ["redis-cli", "ping"]

# Test configuration
tests:
  runner:
    httpChecks:                             # Simple URL checks
      - http://backend:3000/health
      - http://frontend:80
    dependsOn:
      - frontend
      - backend
      - mongo
      - redis

# What to collect after the run
artifacts:
  logs: true
  screenshots: false
  videos: false

# Cleanup behavior
cleanup:
  destroyOnFinish: true
  preserveOnFailure: true                   # Keep containers alive on failure
```

### Field Reference

#### `repos` -- Git Repositories

```yaml
repos:
  my-app:
    source: git
    url: git@github.com:org/repo.git
    ref: main                               # Branch, tag, or commit SHA
```

Repos are cloned with `git clone --depth 1 --branch <ref>`. If the ref is a commit SHA (not a branch name), falls back to full clone + checkout.

Only needed if services use `repo` + `build` instead of `image`.

#### `services` -- Application Containers

Each service can use **either** a pre-built image or build from a cloned repo:

```yaml
services:
  # Option A: Pre-built image
  frontend:
    image: myorg/frontend:v2.1

  # Option B: Build from repo
  backend:
    repo: backend                           # Must match a key in repos
    build:
      dockerfile: Dockerfile
      context: .
      args:                                 # Optional build args
        NODE_ENV: production
```

Common fields for both:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `env` | `Record<string, string>` | -- | Environment variables |
| `ports` | `PortMapping[]` | -- | Port definitions |
| `healthcheck` | `Healthcheck` | -- | How to check if the service is ready |
| `dependsOn` | `string[]` | -- | Services that must start first |
| `workingDir` | `string` | `"."` | Container working directory |

#### `infrastructure` -- Databases, Caches, Queues

Same as services but always use a pre-built image (no build step):

```yaml
infrastructure:
  postgres:
    image: postgres:16
    env:
      POSTGRES_PASSWORD: secret
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      type: command
      command: ["pg_isready", "-U", "postgres"]
```

#### `ports` -- Port Mapping

```yaml
ports:
  - containerPort: 3000
    hostPort: auto         # No host mapping. Containers talk via Docker DNS.
  - containerPort: 5432
    hostPort: 15432        # Explicit host mapping (for debugging access)
```

Services inside the Docker network always communicate via DNS names (`backend:3000`, `mongo:27017`). Setting `hostPort: auto` or omitting it means "internal only." Only set a specific number if you need to access the service from your host machine.

#### `healthcheck` -- Readiness Probes

Three types:

```yaml
# HTTP -- hits an endpoint
healthcheck:
  type: http
  path: /health
  port: 3000
  interval: 5              # Seconds between checks (default: 5)
  timeout: 10              # Seconds before check times out (default: 10)
  retries: 5               # Failures before "unhealthy" (default: 5)

# Command -- runs inside the container
healthcheck:
  type: command
  command: ["pg_isready", "-U", "postgres"]

# TCP -- checks if port is open
healthcheck:
  type: tcp
  port: 5432
```

HTTP healthchecks generate a fallback chain in Docker: tries `wget`, then `curl`, then `node fetch()` -- so they work regardless of what tools are installed in the image.

#### `tests.runner` -- Test Execution

Two modes:

```yaml
# Simple: just list URLs to check
tests:
  runner:
    httpChecks:
      - http://backend:3000/health
      - http://frontend:80

# Custom: run any command
tests:
  runner:
    image: mcr.microsoft.com/playwright:v1.52.0
    command: ["npx", "playwright", "test"]
    mountRepos:
      - frontend                            # Mounts cloned repo at /app/frontend
    env:
      BASE_URL: http://frontend:80
```

| Field | Description |
|-------|-------------|
| `httpChecks` | List of URLs. Auto-generates a Node.js fetch script. Defaults to `node:20-slim`. |
| `command` | Custom Docker CMD. |
| `image` | Docker image for the runner. |
| `build` | Build the runner image from a repo. |
| `mountRepos` | Mount cloned repos as volumes at `/app/<repoName>`. |
| `dependsOn` | Wait for these services before starting. |

#### `artifacts` -- What to Collect

```yaml
artifacts:
  logs: true               # Container logs from every service
  screenshots: true        # Copies /app/test-results/screenshots from test runner
  videos: true             # Copies /app/test-results/videos from test runner
  coverage: true           # Copies /app/coverage from test runner
  paths:                   # Custom paths to copy from test runner
    - /app/custom-report
```

#### `cleanup` -- Post-Run Behavior

```yaml
cleanup:
  destroyOnFinish: true    # Tear down Docker stack after run (default: true)
  preserveOnFailure: true  # Keep containers alive if tests fail (default: false)
```

When `preserveOnFailure` is enabled and the run fails, the Docker stack stays up so you can inspect containers, check databases, etc. The UI shows a "Destroy Environment" button to manually clean up when you're done.

---

## Run Lifecycle

Every run passes through a strict state machine. Each transition is logged and visible in the UI.

```
PENDING
  |
  v
CLONING ---------> Creates temp workspace, clones repos
  |
  v
BUILDING --------> Generates docker-compose.yml from scenario
  |
  v
BOOTING ---------> Runs `docker compose up -d --build`
  |
  v
WAITING_HEALTHY -> Polls container health every 3 seconds
  |
  v
TESTING ---------> Waits for test-runner container to exit
  |
  +-----> exit 0 ------> PASSED
  +-----> exit != 0 ---> FAILED
  +-----> exception ----> ERROR
  |
  v
(cleanup: compose down, destroy workspace)
```

**Cancellation** can happen at any stage. It immediately sets the status to `CANCELLED` and tears down all Docker containers.

**Preserve on failure:** If enabled and the run ends in `FAILED` or `ERROR`, cleanup is skipped. Containers keep running for debugging.

### What Happens at Each Stage

| Stage | What it does |
|-------|-------------|
| **PENDING** | Run created, waiting to start |
| **CLONING** | Creates temp workspace at `{tmpdir}/test-platform-runs/{runId}/`, clones repos |
| **BUILDING** | Generates Docker Compose YAML, resolves images vs builds, applies overrides |
| **BOOTING** | Runs `docker compose -p tp-{runId} up -d --build`, streams output to logs |
| **WAITING_HEALTHY** | Polls `docker inspect` for each container's health every 3s. Timeout: 5 min. Fails fast on "unhealthy". |
| **TESTING** | Finds test-runner container (uses `docker compose ps -a` to include exited containers), waits for exit, captures exit code and logs |
| **PASSED/FAILED** | Collects logs from all containers, copies artifacts, persists to SQLite |
| **Cleanup** | Runs `docker compose down -v --remove-orphans`, deletes workspace |

### Background Health Polling

During `BOOTING` and `WAITING_HEALTHY`, a background loop runs every 3 seconds:

1. Gets all container IDs via `docker compose ps -a`
2. For each container, queries health via `docker inspect`
3. Updates the run's service list in the store
4. The frontend polls every 2 seconds, so the Services tab shows live health transitions (`starting` -> `healthy` / `unhealthy`)

---

## Docker Compose Generation

The platform generates Docker Compose files automatically from your YAML scenario. You never write Compose files yourself.

### How it works

1. **Infrastructure services** become Compose services with `image:`, env, ports, healthchecks, volumes
2. **Application services** become Compose services with either `image:` or `build:` (from cloned repo). Image overrides from the run config UI take precedence.
3. **Test runner** becomes a Compose service with `depends_on` conditions. If using `httpChecks`, the command is auto-generated.
4. **All services** share a unique Docker network: `tp-{runId}-net`
5. **The project name** is `tp-{runId}`, ensuring full isolation between parallel runs

### Dependency Resolution

`dependsOn` entries generate Docker Compose `depends_on` conditions:
- If the dependency has a healthcheck: `condition: service_healthy` (waits until healthy)
- If no healthcheck: `condition: service_started` (starts after container launches)

### HTTP Healthcheck Fallback Chain

Different base images have different HTTP tools available, so the platform generates a fallback:

```bash
wget --spider -q http://localhost:PORT/PATH     # Alpine images
|| curl -sf http://localhost:PORT/PATH           # Full Debian/Ubuntu
|| node -e "fetch(...).then(...)"                # Node.js images
```

---

## Log Streaming

Logs are streamed in real-time using **Server-Sent Events (SSE)**.

### How it works

1. The orchestrator emits timestamped log lines at every stage
2. During `docker compose up`, stdout/stderr from Docker is also streamed line-by-line
3. Log lines are stored in memory (per run) and broadcast to connected SSE clients
4. The frontend opens an `EventSource` connection to `GET /runs/{id}/logs`
5. On connect, the full log history is sent immediately, then new lines stream in real-time
6. When the run reaches a terminal state, the server sends a `status` event and closes the connection

### Example log output

```
[2024-01-15T10:00:00.000Z] Creating workspace...
[2024-01-15T10:00:01.000Z] Cloning 2 repositories...
[2024-01-15T10:00:05.000Z] All repositories cloned successfully.
[2024-01-15T10:00:06.000Z] Generating Docker Compose configuration...
[2024-01-15T10:00:06.100Z] Starting Docker Compose stack...
[2024-01-15T10:00:06.200Z] [docker] Image redis:7-alpine Pulling
[2024-01-15T10:00:08.000Z] [docker] Container tp-run_123-redis-1 Started
[2024-01-15T10:00:10.000Z] Docker Compose stack started.
[2024-01-15T10:00:10.500Z] Waiting for services to become healthy...
[2024-01-15T10:00:18.000Z] All services are healthy.
[2024-01-15T10:00:18.100Z] Test runner starting...
[2024-01-15T10:00:20.000Z] Test runner finished with exit code 0
[2024-01-15T10:00:20.100Z] Run PASSED.
```

---

## Artifact Collection

After the test runner finishes, the platform collects artifacts.

### Container Logs

If `artifacts.logs: true` (default), logs from every container are saved using `docker logs --timestamps <containerId>` and stored as `{serviceName}.log`.

### Screenshots, Videos, Coverage

Attempts to `docker cp` from standard locations inside the test runner container:

| Type | Paths tried |
|------|------------|
| Screenshots | `/app/test-results/screenshots`, `/app/screenshots` |
| Videos | `/app/test-results/videos`, `/app/videos` |
| Coverage | `/app/coverage` |

Failures are non-fatal -- missing paths are silently skipped.

### Custom Paths

```yaml
artifacts:
  paths:
    - /app/test-results/report.html
    - /app/junit.xml
```

### Serving

- `GET /runs/{id}/artifacts` -- list all collected artifacts
- `GET /runs/{id}/artifacts/{path}` -- download with correct MIME type

---

## API Reference

### Scenarios

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/scenarios` | List all scenarios |
| `GET` | `/scenarios/:id` | Get full scenario config |

### Runs

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/runs` | Create and start a run |
| `GET` | `/runs` | List all runs (newest first) |
| `GET` | `/runs/:id` | Get run details |
| `POST` | `/runs/:id/cancel` | Cancel + tear down containers |
| `POST` | `/runs/:id/cleanup` | Manually destroy preserved environment |
| `GET` | `/runs/:id/logs` | SSE stream of live logs |
| `GET` | `/runs/:id/logs/files` | Get collected log files |
| `GET` | `/runs/:id/artifacts` | List artifacts |
| `GET` | `/runs/:id/artifacts/:name` | Download artifact |

### System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Server health + Docker status |
| `GET` | `/docker/status` | Docker daemon availability |

### Creating a Run

```bash
curl -X POST http://localhost:4000/runs \
  -H "Content-Type: application/json" \
  -d '{
    "scenarioId": "taskboard-e2e",
    "overrides": {
      "refs": { "backend": "feature/auth" },
      "images": { "frontend": "myorg/frontend:canary" },
      "preserveOnFailure": true
    }
  }'
```

Overrides let you customize a run without editing the YAML:

| Override | Description |
|----------|-------------|
| `refs` | Override git branch/tag per repo |
| `images` | Override Docker image per service or infra |
| `env` | Override env vars per service |
| `preserveOnFailure` | Override cleanup behavior |

---

## Frontend Architecture

### Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Scenarios List | Browse and search available scenarios |
| `/scenarios/:id` | Scenario Detail | View config, repos, services, infra, test runner |
| `/scenarios/:id/run` | Run Configuration | Set overrides, launch run |
| `/runs/:id` | Run Live | Real-time logs, service health, artifacts |
| `/history` | Run History | All past runs with status and duration |

### Data Fetching

- **Scenario list/detail:** Fetched once, cached (`staleTime: Infinity`)
- **Run detail:** Polled every 2 seconds while active. Stops on terminal status.
- **Log streaming:** SSE via `EventSource`, not polling. Logs appear instantly.
- **Artifacts:** Fetched on demand.
- **Docker status:** Polled every 30 seconds (sidebar indicator).

---

## Database & Persistence

### Hybrid Storage

1. **In-memory Map** for active runs -- fast reads/writes during orchestration
2. **SQLite** for persistence -- survives server restarts

Active runs are kept in memory for speed. When a run reaches a terminal state, it's removed from memory and only lives in SQLite. `listRuns()` merges both sources.

Database file: `storage/runs.db` (auto-created, WAL mode).

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Bun | 1.3.11 |
| API Framework | Hono | 4.8.3 |
| Validation | Zod | 3.25.76 |
| Database | SQLite (bun:sqlite) | built-in |
| Frontend | React | 19.2.4 |
| Routing | TanStack Router | 1.71.14 |
| Server State | TanStack Query | 5.64.1 |
| Build | Vite | 7.2.4 |
| Styling | Tailwind CSS v4 | 4.1.18 |
| Components | shadcn/ui + Radix UI | latest |
| Icons | HugeIcons | 1.1.6 |
| Monorepo | Turborepo | 2.8.17 |
| Language | TypeScript | 5.9.3 |

---

## Commands

```bash
# Install
bun install

# Development (API + Web)
bun run dev

# Build all
bun run build

# Typecheck
bun run typecheck

# Lint / Format
bun run lint
bun run format

# Single workspace
bunx turbo dev --filter=web
bunx turbo dev --filter=api

# Add a UI component
pnpm dlx shadcn@latest add <component> -c apps/web
```
