import { Link } from "@tanstack/react-router"
import { useScenarios } from "../hooks/useApi"
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
import { HugeiconsIcon } from "@hugeicons/react"
import { Search01Icon, FileAddIcon, ArrowRight02Icon } from "@hugeicons/core-free-icons"
import { useState, useMemo } from "react"

export function ScenarioListPage() {
  const { data: scenarios, isLoading, error } = useScenarios()
  const [search, setSearch] = useState("")

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
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
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
            {scenarios?.length === 0
              ? "No scenarios yet"
              : "No results found"}
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
          <Link
            key={scenario.id}
            to={"/scenarios/$id" as any}
            params={{ id: scenario.id } as any}
            className="group"
          >
            <Card className="h-full transition-all duration-200 hover:border-primary/40 hover:glow-primary-sm">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="font-heading text-base font-semibold leading-snug">
                    {scenario.name}
                  </CardTitle>
                  <HugeiconsIcon
                    icon={ArrowRight02Icon}
                    size={16}
                    className="mt-0.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                  />
                </div>
                {scenario.description && (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                    {scenario.description}
                  </p>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                {scenario.tags && scenario.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {scenario.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-[10px] font-mono"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div className="h-5" />
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
