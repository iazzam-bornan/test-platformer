import { useParams, Link, useNavigate } from "@tanstack/react-router"
import { useScenarioDetail } from "../hooks/useApi"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft02Icon, PlayIcon } from "@hugeicons/core-free-icons"
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import YAML from "yaml"

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent?: boolean
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${accent ? "border-primary/30 bg-primary/5" : ""}`}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold tabular-nums">
        {value}
      </p>
    </div>
  )
}

export function ScenarioDetailPage() {
  const { id } = useParams({ from: "/scenarios/$id" })
  const navigate = useNavigate()
  const { data: scenario, isLoading, error } = useScenarioDetail(id)

  if (error) {
    return (
      <div className="space-y-4">
        <Link to="/">
          <Button variant="ghost" size="sm">
            <HugeiconsIcon icon={ArrowLeft02Icon} size={14} /> Back
          </Button>
        </Link>
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load scenario: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-2/3" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!scenario) return null

  const repoCount = Object.keys(scenario.config.repos).length
  const serviceCount = Object.keys(scenario.config.services).length
  const infraCount = scenario.config.infrastructure
    ? Object.keys(scenario.config.infrastructure).length
    : 0
  const yamlContent = YAML.stringify(scenario.config, {
    indent: 2,
    lineWidth: 80,
  })

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link to="/">
          <Button
            variant="ghost"
            size="sm"
            className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} size={14} /> Back to scenarios
          </Button>
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="font-heading text-2xl font-bold tracking-tight">
              {scenario.name}
            </h1>
            {scenario.description && (
              <p className="max-w-xl text-sm text-muted-foreground">
                {scenario.description}
              </p>
            )}
            {scenario.tags && scenario.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {scenario.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="font-mono text-[10px]"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <Button
            size="lg"
            className="shrink-0 gap-2"
            onClick={() =>
              navigate({
                to: "/scenarios/$id/run",
                params: { id },
              } as never)
            }
          >
            <HugeiconsIcon icon={PlayIcon} size={14} />
            Launch Run
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Repositories" value={repoCount} />
        <StatCard label="Services" value={serviceCount} accent />
        <StatCard label="Infrastructure" value={infraCount} />
        <StatCard
          label="Test"
          value={
            scenario.config.tests.runner.command?.[0] ??
            `${scenario.config.tests.runner.httpChecks?.length ?? 0} checks`
          }
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="yaml">YAML Config</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Repos */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">
                  Repositories
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(scenario.config.repos).map(([name, repo]) => (
                  <div
                    key={name}
                    className="flex items-start justify-between gap-2 rounded-md bg-muted/50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs font-semibold">
                        {name}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {repo.url}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="shrink-0 font-mono text-[10px]"
                    >
                      {repo.ref}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Services */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">
                  Services
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(scenario.config.services).map(([name, svc]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-primary/60" />
                      <span className="font-mono text-xs font-semibold">
                        {name}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      {svc.healthcheck && (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/30 text-[10px] text-emerald-500"
                        >
                          healthcheck
                        </Badge>
                      )}
                      {svc.ports && svc.ports.length > 0 && (
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px]"
                        >
                          :{svc.ports[0].containerPort}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Infrastructure */}
            {scenario.config.infrastructure && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">
                    Infrastructure
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(scenario.config.infrastructure).map(
                    ([name, infra]) => (
                      <div
                        key={name}
                        className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-amber-400/60" />
                          <span className="font-mono text-xs font-semibold">
                            {name}
                          </span>
                        </div>
                        <span className="truncate pl-4 font-mono text-[10px] text-muted-foreground">
                          {infra.image}
                        </span>
                      </div>
                    )
                  )}
                </CardContent>
              </Card>
            )}

            {/* Test Runner */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">
                  Test Runner
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {scenario.config.tests.runner.command && (
                  <div className="rounded-md bg-muted/50 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">Command</p>
                    <p className="mt-0.5 font-mono text-xs">
                      {scenario.config.tests.runner.command.join(" ")}
                    </p>
                  </div>
                )}
                {scenario.config.tests.runner.httpChecks && (
                  <div className="rounded-md bg-muted/50 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">
                      HTTP Checks
                    </p>
                    <div className="mt-1 space-y-1">
                      {scenario.config.tests.runner.httpChecks.map((url) => (
                        <p key={url} className="font-mono text-xs">
                          {url}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {scenario.config.tests.runner.image && (
                  <div className="rounded-md bg-muted/50 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">Image</p>
                    <p className="mt-0.5 truncate font-mono text-xs">
                      {scenario.config.tests.runner.image}
                    </p>
                  </div>
                )}
                {scenario.config.tests.runner.dependsOn && (
                  <div className="rounded-md bg-muted/50 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">
                      Depends on
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {scenario.config.tests.runner.dependsOn.map((dep) => (
                        <Badge
                          key={dep}
                          variant="secondary"
                          className="font-mono text-[10px]"
                        >
                          {dep}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="yaml" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <pre className="max-h-[600px] overflow-auto rounded-lg p-5 font-mono text-xs leading-relaxed text-foreground/80">
                <code>{yamlContent}</code>
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
