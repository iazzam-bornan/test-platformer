import { Link } from "@tanstack/react-router"
import { useRuns, useCancelRun, useTestResults, useQueueStatus } from "../hooks/useApi"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlayIcon, ArrowRight02Icon } from "@hugeicons/core-free-icons"
import type { Run, RunStatus } from "@workspace/shared/types/run"

const statusConfig: Record<
  RunStatus,
  { color: string; dot: string; label: string }
> = {
  queued: { color: "text-violet-400", dot: "bg-violet-400", label: "Queued" },
  pending: { color: "text-muted-foreground", dot: "bg-muted-foreground", label: "Pending" },
  cloning: { color: "text-sky-400", dot: "bg-sky-400", label: "Cloning" },
  building: { color: "text-sky-400", dot: "bg-sky-400", label: "Building" },
  booting: { color: "text-sky-400", dot: "bg-sky-400", label: "Booting" },
  waiting_healthy: { color: "text-amber-400", dot: "bg-amber-400", label: "Health" },
  testing: { color: "text-amber-400", dot: "bg-amber-400", label: "Testing" },
  passed: { color: "text-emerald-400", dot: "bg-emerald-400", label: "Passed" },
  failed: { color: "text-red-400", dot: "bg-red-400", label: "Failed" },
  cancelled: { color: "text-orange-400", dot: "bg-orange-400", label: "Cancelled" },
  error: { color: "text-red-500", dot: "bg-red-500", label: "Error" },
  cleaning_up: { color: "text-muted-foreground", dot: "bg-muted-foreground", label: "Cleanup" },
}

const RUNNING_STATUSES = [
  "pending", "cloning", "building", "booting", "waiting_healthy", "testing", "cleaning_up",
]

const ACTIVE_STATUSES = [
  "queued", ...RUNNING_STATUSES,
]

function RunCard({ run }: { run: Run }) {
  const cancelRun = useCancelRun()
  const { results, summary, plannedTotal: streamedPlannedTotal } = useTestResults(run.id)
  const cfg = statusConfig[run.status as RunStatus]
  const isActive = ACTIVE_STATUSES.includes(run.status)
  const isQueued = run.status === "queued"

  const startTime = new Date(run.startedAt)
  const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000)
  const elapsedStr =
    elapsed >= 60
      ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
      : `${elapsed}s`

  // Per-result pass/fail detection works for both cucumber (status === "passed")
  // and HTTP/JMeter (ok === true)
  const isResultPassed = (r: (typeof results)[number]) =>
    r.status === "passed" || (r.ok === true && r.status !== "failed")
  const isResultFailed = (r: (typeof results)[number]) =>
    r.status === "failed" || r.ok === false

  const total =
    summary?.totalChecks ?? streamedPlannedTotal ?? run.plannedTotal ?? 0
  const passed = summary?.passed ?? results.filter(isResultPassed).length
  const failed = summary?.failed ?? results.filter(isResultFailed).length
  const passedPct = total > 0 ? (passed / total) * 100 : 0
  const failedPct = total > 0 ? (failed / total) * 100 : 0

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2 shrink-0">
              {isActive && (
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${cfg.dot}`}
                />
              )}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${cfg.dot}`}
              />
            </span>
            <span className="truncate text-sm font-semibold">
              {run.scenarioName}
            </span>
            <Badge
              variant="outline"
              className={`shrink-0 text-[10px] ${cfg.color}`}
            >
              {cfg.label}
              {run.status === "queued" && run.queuePosition !== undefined && (
                <span className="ml-1 opacity-70">#{run.queuePosition}</span>
              )}
            </Badge>
          </div>
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
            {run.id}
          </p>
        </div>

        <div className="flex shrink-0 gap-1.5">
          <Link to={"/runs/$id" as any} params={{ id: run.id } as any}>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <HugeiconsIcon icon={ArrowRight02Icon} size={14} />
            </Button>
          </Link>
          {isActive && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={() => cancelRun.mutate(run.id)}
              disabled={cancelRun.isPending}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar (skip for queued runs — they haven't started) */}
      {!isQueued && (results.length > 0 || total > 0) && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">
              {results.length}/{total || "?"} checks
            </span>
            <span className="font-mono">
              <span className="text-emerald-400">{passed}</span>
              {failed > 0 && (
                <span className="text-red-400 ml-1">{failed}</span>
              )}
            </span>
          </div>
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-emerald-400 transition-all duration-300"
              style={{ width: `${passedPct}%` }}
            />
            <div
              className="h-full bg-red-400 transition-all duration-300"
              style={{ width: `${failedPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Started {startTime.toLocaleTimeString()}</span>
        <span className="font-mono tabular-nums">{elapsedStr}</span>
      </div>

      {/* Summary */}
      {summary && (
        <div
          className={`rounded-md px-3 py-1.5 text-center font-mono text-xs font-bold ${
            summary.passRate === 100
              ? "bg-emerald-400/10 text-emerald-400"
              : "bg-red-400/10 text-red-400"
          }`}
        >
          {summary.passRate}% passed
        </div>
      )}
    </div>
  )
}

function SectionHeader({
  title,
  count,
  hint,
}: {
  title: string
  count: number
  hint?: string
}) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="font-heading text-sm font-semibold text-muted-foreground">
        {title}{" "}
        <span className="ml-1 font-mono text-[10px] tabular-nums text-muted-foreground/70">
          ({count})
        </span>
      </h2>
      {hint && (
        <span className="font-mono text-[10px] text-muted-foreground/70">
          {hint}
        </span>
      )}
    </div>
  )
}

export function ActiveRunsPage() {
  const { data: runs, isLoading, error } = useRuns()
  const { data: queueStatus } = useQueueStatus()

  const queuedRuns = (runs ?? [])
    .filter((r) => r.status === "queued")
    .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0))
  const runningRuns = (runs ?? []).filter((r) =>
    RUNNING_STATUSES.includes(r.status)
  )
  const recentFinished = (runs ?? [])
    .filter((r) => !ACTIVE_STATUSES.includes(r.status))
    .slice(0, 6)

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Active Runs
        </h1>
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load runs. Check that the API is running.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const nothingActive = !isLoading && queuedRuns.length === 0 && runningRuns.length === 0

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Active Runs
        </h1>
        <p className="text-sm text-muted-foreground">
          Monitor all running tests in real-time
        </p>
      </div>

      {/* Slot summary */}
      {queueStatus && (
        <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            <span className="text-muted-foreground">Active</span>
            <span className="font-mono font-semibold">{queueStatus.active}</span>
          </div>
          <span className="text-muted-foreground/40">·</span>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-violet-400" />
            <span className="text-muted-foreground">Queued</span>
            <span className="font-mono font-semibold">{queueStatus.queued}</span>
          </div>
          <span className="text-muted-foreground/40">·</span>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Max</span>
            <span className="font-mono font-semibold">
              {queueStatus.max === 0 ? "∞" : queueStatus.max}
            </span>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : nothingActive ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/30 px-6 py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <HugeiconsIcon icon={PlayIcon} size={24} />
          </div>
          <p className="font-heading text-sm font-semibold">
            No active runs
          </p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            Launch a scenario to see live progress here.
          </p>
          <Link to="/">
            <Button className="mt-4 gap-2" size="sm">
              Go to Scenarios
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Running */}
          {runningRuns.length > 0 && (
            <div className="space-y-4">
              <SectionHeader title="Running" count={runningRuns.length} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {runningRuns.map((run) => (
                  <RunCard key={run.id} run={run} />
                ))}
              </div>
            </div>
          )}

          {/* Queued */}
          {queuedRuns.length > 0 && (
            <div className="space-y-4">
              <SectionHeader
                title="Queued"
                count={queuedRuns.length}
                hint="waiting for an available slot"
              />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {queuedRuns.map((run) => (
                  <RunCard key={run.id} run={run} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Recently finished */}
      {recentFinished.length > 0 && (
        <div className="space-y-4">
          <SectionHeader title="Recently Finished" count={recentFinished.length} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentFinished.map((run) => (
              <RunCard key={run.id} run={run} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
