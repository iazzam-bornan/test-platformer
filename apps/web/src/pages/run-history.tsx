import { Link } from "@tanstack/react-router"
import { useRuns } from "../hooks/useApi"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { HugeiconsIcon } from "@hugeicons/react"
import { Clock01Icon, PlayIcon, ArrowRight02Icon } from "@hugeicons/core-free-icons"
import type { RunStatus } from "@workspace/shared/types/run"

const statusDisplay: Record<
  RunStatus,
  { color: string; dot: string; label: string }
> = {
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

export function RunHistoryPage() {
  const { data: runs, isLoading, error } = useRuns()

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          History
        </h1>
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load run history. Check that the API is running.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          History
        </h1>
        <p className="text-sm text-muted-foreground">
          All test runs from this session
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !runs || runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/30 px-6 py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <HugeiconsIcon icon={Clock01Icon} size={24} />
          </div>
          <p className="font-heading text-sm font-semibold">No runs yet</p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            Launch a scenario to see your test runs here.
          </p>
          <Link to="/">
            <Button className="mt-4 gap-2" size="sm">
              <HugeiconsIcon icon={PlayIcon} size={12} />
              Go to Scenarios
            </Button>
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider">
                  Scenario
                </TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider">
                  Status
                </TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider">
                  Started
                </TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wider">
                  Duration
                </TableHead>
                <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider">
                  &nbsp;
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => {
                const st = statusDisplay[run.status as RunStatus] ?? statusDisplay.pending
                const start = new Date(run.startedAt)
                const end = run.finishedAt ? new Date(run.finishedAt) : null
                const durationMs = end
                  ? end.getTime() - start.getTime()
                  : null
                const duration = durationMs
                  ? durationMs >= 60000
                    ? `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`
                    : `${Math.floor(durationMs / 1000)}s`
                  : "\u2014"

                return (
                  <TableRow key={run.id}>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">
                          {run.scenarioName}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {run.id}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={`flex items-center gap-2 text-xs font-medium ${st.color}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                        {st.label}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {start.toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {duration}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        to={"/runs/$id" as any}
                        params={{ id: run.id } as any}
                      >
                        <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                          View
                          <HugeiconsIcon icon={ArrowRight02Icon} size={12} />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
