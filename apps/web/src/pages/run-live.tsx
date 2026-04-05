import { useParams, useNavigate } from "@tanstack/react-router"
import { CodeBlock } from "../components/code-block"
import {
  useRunDetail,
  useCancelRun,
  useRunLogs,
  useRunArtifacts,
  useCleanupRun,
  useServiceLogs,
  useTestResults,
  getArtifactUrl,
} from "../hooks/useApi"
import type { TestResult } from "../hooks/useApi"
import { useEffect, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import type { RunStatus } from "@workspace/shared/types/run"

const statusConfig: Record<
  RunStatus,
  { color: string; bg: string; label: string }
> = {
  pending: {
    color: "text-muted-foreground",
    bg: "bg-muted-foreground",
    label: "Pending",
  },
  cloning: { color: "text-sky-400", bg: "bg-sky-400", label: "Cloning Repos" },
  building: { color: "text-sky-400", bg: "bg-sky-400", label: "Building" },
  booting: { color: "text-sky-400", bg: "bg-sky-400", label: "Booting" },
  waiting_healthy: {
    color: "text-amber-400",
    bg: "bg-amber-400",
    label: "Health Check",
  },
  testing: { color: "text-amber-400", bg: "bg-amber-400", label: "Testing" },
  passed: { color: "text-emerald-400", bg: "bg-emerald-400", label: "Passed" },
  failed: { color: "text-red-400", bg: "bg-red-400", label: "Failed" },
  cancelled: {
    color: "text-orange-400",
    bg: "bg-orange-400",
    label: "Cancelled",
  },
  error: { color: "text-red-500", bg: "bg-red-500", label: "Error" },
  cleaning_up: {
    color: "text-muted-foreground",
    bg: "bg-muted-foreground",
    label: "Cleaning Up",
  },
}

function StatusBadge({ status }: { status: RunStatus }) {
  const cfg = statusConfig[status]
  const isActive = [
    "cloning",
    "building",
    "booting",
    "waiting_healthy",
    "testing",
    "cleaning_up",
  ].includes(status)

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${cfg.color}`}
    >
      <span className="relative flex h-2 w-2">
        {isActive && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${cfg.bg}`}
          />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${cfg.bg}`}
        />
      </span>
      {cfg.label}
    </div>
  )
}

function LogViewer({ logs, empty }: { logs: string[]; empty: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [logs])

  return (
    <div
      ref={ref}
      className="max-h-[500px] overflow-auto rounded-lg border bg-card p-4 font-mono text-xs leading-6"
    >
      {logs.length === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        logs.map((line, i) => (
          <div
            key={i}
            className="whitespace-pre-wrap text-foreground/80 hover:text-foreground"
          >
            {line}
          </div>
        ))
      )}
    </div>
  )
}

function ServiceLogViewer({
  runId,
  service,
  isRunning,
}: {
  runId: string
  service: string
  isRunning: boolean
}) {
  const { logs, connected } = useServiceLogs(runId, service, isRunning)

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-xs font-semibold">{service}</span>
        {connected && (
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        )}
      </div>
      <LogViewer logs={logs} empty={`Waiting for ${service} logs...`} />
    </div>
  )
}

function ResultsView({
  results,
  summary,
}: {
  results: TestResult[]
  summary: TestResult | null
}) {
  const total = summary?.totalChecks ?? results.length
  const passed = summary?.passed ?? results.filter((r) => r.ok).length
  const failed = summary?.failed ?? results.filter((r) => !r.ok).length

  // Group by URL
  const urlGroups = new Map<string, TestResult[]>()
  for (const r of results) {
    if (!r.url) continue
    const group = urlGroups.get(r.url) ?? []
    group.push(r)
    urlGroups.set(r.url, group)
  }

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {results.length} / {total || "?"} checks
          </span>
          <span className="font-mono">
            <span className="text-emerald-400">{passed} passed</span>
            {failed > 0 && (
              <span className="ml-2 text-red-400">{failed} failed</span>
            )}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all duration-300"
            style={{ width: total ? `${(passed / total) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {/* Per-URL breakdown */}
      {[...urlGroups.entries()].map(([url, checks]) => {
        const urlPassed = checks.filter((c) => c.ok).length
        const urlFailed = checks.filter((c) => !c.ok).length
        const avgDuration = Math.round(
          checks.reduce((s, c) => s + (c.duration ?? 0), 0) / checks.length
        )

        return (
          <div key={url} className="rounded-lg border">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <span className="truncate font-mono text-xs font-semibold">
                {url}
              </span>
              <div className="ml-4 flex shrink-0 items-center gap-3 text-[10px]">
                <span className="text-muted-foreground">
                  avg {avgDuration}ms
                </span>
                <span className="text-emerald-400">{urlPassed}</span>
                {urlFailed > 0 && (
                  <span className="text-red-400">{urlFailed}</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1 px-4 py-3">
              {checks.map((check, i) => (
                <div
                  key={i}
                  title={`#${check.iteration} — ${check.status} — ${check.duration}ms${check.error ? ` — ${check.error}` : ""}`}
                  className={`flex h-6 w-6 items-center justify-center rounded font-mono text-[9px] font-bold transition-all ${
                    check.ok
                      ? "bg-emerald-400/15 text-emerald-400"
                      : "bg-red-400/15 text-red-400"
                  }`}
                >
                  {check.iteration}
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {results.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Waiting for test results...
        </p>
      )}

      {/* Summary */}
      {summary && (
        <div
          className={`rounded-lg border p-4 text-center ${
            summary.passRate === 100
              ? "border-emerald-400/30 bg-emerald-400/5"
              : "border-red-400/30 bg-red-400/5"
          }`}
        >
          <p className="font-mono text-2xl font-bold tabular-nums">
            {summary.passRate}%
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.passed}/{summary.totalChecks} checks passed
          </p>
        </div>
      )}
    </div>
  )
}

export function RunLivePage() {
  const { id } = useParams({ from: "/runs/$id" })
  const navigate = useNavigate()
  const { data: run, isLoading, error } = useRunDetail(id)
  const cancelRun = useCancelRun()
  const cleanupRun = useCleanupRun()
  const [selectedService, setSelectedService] = useState<string | null>(null)

  const isRunning =
    run?.status === "pending" ||
    run?.status === "cloning" ||
    run?.status === "building" ||
    run?.status === "booting" ||
    run?.status === "waiting_healthy" ||
    run?.status === "testing" ||
    run?.status === "cleaning_up"

  const { logs, connected } = useRunLogs(id, !!run && isRunning)
  const { data: artifacts } = useRunArtifacts(id)
  const {
    results,
    logs: testRunnerLogs,
    summary,
  } = useTestResults(id, !!run && isRunning)

  if (error) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => navigate({ to: "/" })}
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} size={14} /> Back
        </Button>
        <Alert variant="destructive">
          <AlertDescription>Failed to load run</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!run) return null

  const isTerminal = ["passed", "failed", "cancelled", "error"].includes(
    run.status
  )
  const isPreserved =
    isTerminal &&
    run.preserveOnFailure &&
    (run.status === "failed" || run.status === "error")

  const startTime = new Date(run.startedAt)
  const endTime = run.finishedAt ? new Date(run.finishedAt) : null
  const durationMs = endTime
    ? endTime.getTime() - startTime.getTime()
    : Date.now() - startTime.getTime()
  const durationSec = Math.floor(durationMs / 1000)
  const durationStr =
    durationSec >= 60
      ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
      : `${durationSec}s`

  const serviceNames = run.services.map((s: (typeof run.services)[0]) => s.name)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
          onClick={() => navigate({ to: "/history" })}
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} size={14} /> Back to history
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="font-heading text-2xl font-bold tracking-tight">
                {run.scenarioName}
              </h1>
              <StatusBadge status={run.status as RunStatus} />
            </div>
            <p className="font-mono text-xs text-muted-foreground">{run.id}</p>
          </div>
          <div className="flex gap-2">
            {isPreserved && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => cleanupRun.mutate(run.id)}
                disabled={cleanupRun.isPending}
              >
                Destroy Env
              </Button>
            )}
            {isRunning && run.status !== "cleaning_up" && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => cancelRun.mutate(run.id)}
                disabled={cancelRun.isPending}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3">
          <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            Started
          </p>
          <p className="mt-1 font-mono text-sm">{startTime.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            Duration
          </p>
          <p className="mt-1 font-mono text-sm tabular-nums">{durationStr}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            Exit Code
          </p>
          <p className="mt-1 font-mono text-sm">{run.exitCode ?? "\u2014"}</p>
        </div>
      </div>

      {isPreserved && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-500">
          Environment preserved for debugging. Click &quot;Destroy Env&quot;
          when done.
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="results" className="w-full">
        <TabsList>
          <TabsTrigger value="results">
            Results
            {results.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 px-1.5 text-[10px]">
                {results.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="orchestrator" className="gap-1.5">
            Orchestrator
            {connected && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            )}
          </TabsTrigger>
          <TabsTrigger value="services">
            Service Logs
            {serviceNames.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 px-1.5 text-[10px]">
                {serviceNames.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="health">Services</TabsTrigger>
          <TabsTrigger value="artifacts">
            Artifacts
            {artifacts && artifacts.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 px-1.5 text-[10px]">
                {artifacts.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
        </TabsList>

        {/* Results tab */}
        <TabsContent value="results" className="mt-4">
          <ResultsView results={results} summary={summary} />
          {testRunnerLogs.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                Test Runner Output
              </p>
              <LogViewer logs={testRunnerLogs} empty="" />
            </div>
          )}
        </TabsContent>

        {/* Orchestrator logs tab */}
        <TabsContent value="orchestrator" className="mt-4">
          <LogViewer
            logs={logs}
            empty={isRunning ? "Waiting for logs..." : "No logs available."}
          />
        </TabsContent>

        {/* Per-service Docker logs tab */}
        <TabsContent value="services" className="mt-4">
          {serviceNames.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No services started yet.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {serviceNames.map((name: string) => (
                  <Button
                    key={name}
                    variant={selectedService === name ? "default" : "outline"}
                    size="sm"
                    className="font-mono text-xs"
                    onClick={() =>
                      setSelectedService(name === selectedService ? null : name)
                    }
                  >
                    {name}
                  </Button>
                ))}
              </div>
              {selectedService ? (
                <ServiceLogViewer
                  runId={id}
                  service={selectedService}
                  isRunning={isRunning}
                />
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Select a service above to view its Docker logs.
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Health tab */}
        <TabsContent value="health" className="mt-4">
          {run.services.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No services started yet.
            </div>
          ) : (
            <div className="space-y-2">
              {run.services.map((service: (typeof run.services)[0]) => (
                <div
                  key={service.name}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          service.healthStatus === "healthy"
                            ? "bg-emerald-400"
                            : service.healthStatus === "unhealthy"
                              ? "bg-red-400"
                              : "bg-muted-foreground"
                        }`}
                      />
                      <span className="font-mono text-sm font-semibold">
                        {service.name}
                      </span>
                    </div>
                    <p className="pl-4 font-mono text-[10px] text-muted-foreground">
                      {service.image}
                      {service.containerId &&
                        ` \u00B7 ${service.containerId.slice(0, 12)}`}
                    </p>
                    {Object.keys(service.mappedPorts).length > 0 && (
                      <p className="pl-4 font-mono text-[10px] text-muted-foreground">
                        {Object.entries(service.mappedPorts)
                          .map(([p, m]) => `${p}\u2192${m}`)
                          .join("  ")}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={
                      service.healthStatus === "healthy"
                        ? "default"
                        : service.healthStatus === "unhealthy"
                          ? "destructive"
                          : "secondary"
                    }
                    className="text-[10px]"
                  >
                    {service.healthStatus}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Artifacts tab */}
        <TabsContent value="artifacts" className="mt-4">
          {!artifacts || artifacts.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {isTerminal
                ? "No artifacts collected."
                : "Artifacts will appear after the run completes."}
            </div>
          ) : (
            <div className="space-y-2">
              {artifacts.map((artifact) => (
                <div
                  key={artifact.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="space-y-0.5">
                    <p className="font-mono text-xs font-semibold">
                      {artifact.name}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {artifact.type}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {artifact.path}
                      </span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={getArtifactUrl(id, artifact.path)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Config tab */}
        <TabsContent value="config" className="mt-4 space-y-4">
          {run.overrides && Object.keys(run.overrides).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Overrides</CardTitle>
              </CardHeader>
              <CardContent>
                <CodeBlock
                  code={JSON.stringify(run.overrides, null, 2)}
                  lang="json"
                  maxHeight="200px"
                />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Scenario Config</CardTitle>
              <CardDescription className="text-xs">
                Full configuration used for this run
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock
                code={JSON.stringify(run.config, null, 2)}
                lang="json"
                maxHeight="400px"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {run.error && (
        <Alert variant="destructive">
          <AlertDescription>{run.error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
