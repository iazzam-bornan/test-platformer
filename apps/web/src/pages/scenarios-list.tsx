import { Link, useNavigate } from "@tanstack/react-router"
import { useScenarios, useScenarioDetail, useCreateRun } from "../hooks/useApi"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Separator } from "@workspace/ui/components/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Search01Icon,
  FileAddIcon,
  ArrowRight02Icon,
  PlayIcon,
} from "@hugeicons/core-free-icons"
import { useState, useMemo } from "react"
import type { RunOverrides } from "@workspace/shared/types/run"

export function ScenarioListPage() {
  const { data: scenarios, isLoading, error } = useScenarios()
  const [search, setSearch] = useState("")
  const [quickRunScenarioId, setQuickRunScenarioId] = useState<string | null>(
    null
  )

  const filtered = useMemo(() => {
    if (!scenarios) return []
    return scenarios.filter(
      (s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.description?.toLowerCase().includes(search.toLowerCase())
    )
  }, [scenarios, search])

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Scenarios
        </h1>
        <p className="text-sm text-muted-foreground">
          Choose a scenario to configure and launch a test run
        </p>
      </div>

      <div className="relative max-w-sm">
        <HugeiconsIcon
          icon={Search01Icon}
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Search scenarios..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load scenarios. Make sure the API server is running on
            port 4000.
          </AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="mt-2 h-4 w-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/30 px-6 py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <HugeiconsIcon icon={FileAddIcon} size={24} />
          </div>
          <p className="font-heading text-sm font-semibold">
            {scenarios?.length === 0 ? "No scenarios yet" : "No results found"}
          </p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            {scenarios?.length === 0
              ? "Add YAML scenario files to the scenarios/ directory to get started."
              : "Try a different search term."}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((scenario) => (
          <Card
            key={scenario.id}
            className="group hover:glow-primary-sm h-full transition-all duration-200 hover:border-primary/40"
          >
            <Link
              to={"/scenarios/$id" as any}
              params={{ id: scenario.id } as any}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="font-heading text-base leading-snug font-semibold">
                    {scenario.name}
                  </CardTitle>
                  <HugeiconsIcon
                    icon={ArrowRight02Icon}
                    size={16}
                    className="mt-0.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                  />
                </div>
                {scenario.description && (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {scenario.description}
                  </p>
                )}
              </CardHeader>
            </Link>
            <CardContent className="flex items-center justify-between pt-0">
              <div className="flex flex-wrap gap-1.5">
                {scenario.tags?.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="font-mono text-[10px]"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
              <Button
                size="sm"
                className="gap-1.5 text-xs"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setQuickRunScenarioId(scenario.id)
                }}
              >
                <HugeiconsIcon icon={PlayIcon} size={12} />
                Run
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {quickRunScenarioId && (
        <QuickRunModal
          scenarioId={quickRunScenarioId}
          onClose={() => setQuickRunScenarioId(null)}
        />
      )}
    </div>
  )
}

function QuickRunModal({
  scenarioId,
  onClose,
}: {
  scenarioId: string
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { data: scenario } = useScenarioDetail(scenarioId)
  const createRun = useCreateRun()
  const [parallelCount, setParallelCount] = useState(1)
  const [launching, setLaunching] = useState(false)
  const [overrides, setOverrides] = useState<RunOverrides>({
    refs: {},
    images: {},
    preserveOnFailure: false,
    preserveAlways: false,
  })

  const handleLaunch = async () => {
    setLaunching(true)
    try {
      const promises = Array.from({ length: parallelCount }, () =>
        createRun.mutateAsync({ scenarioId, overrides })
      )
      const results = await Promise.all(promises)

      if (parallelCount === 1) {
        navigate({ to: `/runs/${results[0].id}` })
      } else {
        navigate({ to: "/history" })
      }
      onClose()
    } catch {
      setLaunching(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {scenario?.name ?? scenarioId}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Parallel instances */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Parallel Instances</Label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 5, 10].map((n) => (
                <Button
                  key={n}
                  variant={parallelCount === n ? "default" : "outline"}
                  size="sm"
                  className="w-10 font-mono text-xs"
                  onClick={() => setParallelCount(n)}
                >
                  {n}
                </Button>
              ))}
              <Input
                type="number"
                min={1}
                max={50}
                value={parallelCount}
                onChange={(e) =>
                  setParallelCount(
                    Math.max(1, Math.min(50, Number(e.target.value) || 1))
                  )
                }
                className="w-16 font-mono text-xs"
              />
            </div>
          </div>

          <Separator />

          {/* Repo refs */}
          {scenario?.config.repos &&
            Object.keys(scenario.config.repos).length > 0 && (
              <div className="space-y-3">
                <Label className="text-xs font-semibold">
                  Branch Overrides
                </Label>
                {Object.entries(scenario.config.repos).map(
                  ([repoName, repo]) => (
                    <div key={repoName} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 truncate font-mono text-xs text-muted-foreground">
                        {repoName}
                      </span>
                      <Input
                        placeholder={repo.ref}
                        value={overrides.refs?.[repoName] || ""}
                        onChange={(e) =>
                          setOverrides((prev) => ({
                            ...prev,
                            refs: {
                              ...prev.refs,
                              [repoName]: e.target.value,
                            },
                          }))
                        }
                        className="font-mono text-xs"
                      />
                    </div>
                  )
                )}
              </div>
            )}

          {/* Image overrides */}
          {scenario?.config.infrastructure &&
            Object.keys(scenario.config.infrastructure).length > 0 && (
              <div className="space-y-3">
                <Label className="text-xs font-semibold">Image Overrides</Label>
                {Object.entries(scenario.config.infrastructure).map(
                  ([name, infra]) => (
                    <div key={name} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 truncate font-mono text-xs text-muted-foreground">
                        {name}
                      </span>
                      <Input
                        placeholder={infra.image}
                        value={overrides.images?.[name] || ""}
                        onChange={(e) =>
                          setOverrides((prev) => ({
                            ...prev,
                            images: {
                              ...prev.images,
                              [name]: e.target.value,
                            },
                          }))
                        }
                        className="font-mono text-xs"
                      />
                    </div>
                  )
                )}
              </div>
            )}

          <Separator />

          {/* Options */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold">Options</Label>
            <label className="flex cursor-pointer items-start gap-3 rounded-md p-2 transition-colors hover:bg-muted/50">
              <Checkbox
                checked={overrides.preserveOnFailure ?? false}
                onCheckedChange={(c) =>
                  setOverrides((prev) => ({
                    ...prev,
                    preserveOnFailure: !!c,
                    preserveAlways: !!c ? false : prev.preserveAlways,
                  }))
                }
                className="mt-0.5"
              />
              <div>
                <p className="text-xs font-medium">Preserve on failure</p>
                <p className="text-[10px] text-muted-foreground">
                  Keep containers running if tests fail
                </p>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-md p-2 transition-colors hover:bg-muted/50">
              <Checkbox
                checked={overrides.preserveAlways ?? false}
                onCheckedChange={(c) =>
                  setOverrides((prev) => ({
                    ...prev,
                    preserveAlways: !!c,
                    preserveOnFailure: !!c ? false : prev.preserveOnFailure,
                  }))
                }
                className="mt-0.5"
              />
              <div>
                <p className="text-xs font-medium">Preserve always</p>
                <p className="text-[10px] text-muted-foreground">
                  Keep containers running after finish, regardless of result
                </p>
              </div>
            </label>
          </div>

          {/* Launch */}
          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1 gap-2"
              disabled={launching}
              onClick={handleLaunch}
            >
              {launching ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Launching
                  {parallelCount > 1 ? ` ${parallelCount}` : ""}...
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={PlayIcon} size={14} />
                  Launch{parallelCount > 1 ? ` ${parallelCount} Runs` : ""}
                </>
              )}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={launching}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
