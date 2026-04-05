import { useParams, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { useScenarioDetail, useCreateRun } from "../hooks/useApi"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft02Icon,
  PlayIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Label } from "@workspace/ui/components/label"
import { Input } from "@workspace/ui/components/input"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import type { RunOverrides } from "@workspace/shared/types/run"

export function RunConfigurationPage() {
  const { id } = useParams({ from: "/scenarios/$id/run" })
  const navigate = useNavigate()
  const { data: scenario, isLoading, error } = useScenarioDetail(id)
  const createRun = useCreateRun()

  const [overrides, setOverrides] = useState<RunOverrides>({
    refs: {},
    env: {},
    preserveOnFailure: false,
  })

  if (error) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground"
          onClick={() => navigate({ to: `/scenarios/${id}` } as never)}
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} size={14} /> Back
        </Button>
        <Alert variant="destructive">
          <AlertDescription>Failed to load scenario</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  if (!scenario) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const result = await createRun.mutateAsync({
        scenarioId: id,
        overrides,
      })
      navigate({ to: `/runs/${result.id}` })
    } catch (err) {
      console.error("Failed to create run:", err)
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
          onClick={() => navigate({ to: `/scenarios/${id}` } as never)}
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} size={14} /> Back to{" "}
          {scenario.name}
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HugeiconsIcon icon={Settings01Icon} size={18} />
          </div>
          <div>
            <h1 className="font-heading text-xl font-bold tracking-tight">
              Configure Run
            </h1>
            <p className="text-xs text-muted-foreground">{scenario.name}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Repository Refs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Repository Branches
            </CardTitle>
            <CardDescription className="text-xs">
              Override the default branch or tag for each repository
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(scenario.config.repos).map(([repoName, repo]) => (
              <div key={repoName} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label className="font-mono text-xs font-semibold">
                    {repoName}
                  </Label>
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] text-muted-foreground"
                  >
                    default: {repo.ref}
                  </Badge>
                </div>
                <Input
                  placeholder={repo.ref}
                  value={overrides.refs?.[repoName] || ""}
                  onChange={(e) =>
                    setOverrides((prev) => ({
                      ...prev,
                      refs: { ...prev.refs, [repoName]: e.target.value },
                    }))
                  }
                  className="font-mono text-sm"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Infrastructure Images */}
        {scenario.config.infrastructure && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Infrastructure Images
              </CardTitle>
              <CardDescription className="text-xs">
                Override Docker image tags for databases and caches
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(scenario.config.infrastructure).map(
                ([infraName, infra]) => (
                  <div key={infraName} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Label className="font-mono text-xs font-semibold">
                        {infraName}
                      </Label>
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px] text-muted-foreground"
                      >
                        default: {infra.image}
                      </Badge>
                    </div>
                    <Input
                      placeholder={infra.image}
                      value={overrides.images?.[infraName] || ""}
                      onChange={(e) =>
                        setOverrides((prev) => ({
                          ...prev,
                          images: {
                            ...prev.images,
                            [infraName]: e.target.value,
                          },
                        }))
                      }
                      className="font-mono text-sm"
                    />
                  </div>
                )
              )}
            </CardContent>
          </Card>
        )}

        {/* Options */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Options</CardTitle>
          </CardHeader>
          <CardContent>
            <label className="flex cursor-pointer items-start gap-3 rounded-md p-2 transition-colors hover:bg-muted/50">
              <Checkbox
                id="preserve"
                checked={overrides.preserveOnFailure ?? false}
                onCheckedChange={(checked) =>
                  setOverrides((prev) => ({
                    ...prev,
                    preserveOnFailure: !!checked,
                  }))
                }
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium">
                  Preserve environment on failure
                </p>
                <p className="text-xs text-muted-foreground">
                  Keep containers running after failure for debugging
                </p>
              </div>
            </label>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            type="submit"
            size="lg"
            disabled={createRun.isPending}
            className="gap-2"
          >
            {createRun.isPending ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Launching...
              </>
            ) : (
              <>
                <HugeiconsIcon icon={PlayIcon} size={14} />
                Launch Run
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={() => navigate({ to: `/scenarios/${id}` } as never)}
          >
            Cancel
          </Button>
        </div>

        {createRun.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {createRun.error?.message || "Failed to create run."}
            </AlertDescription>
          </Alert>
        )}
      </form>
    </div>
  )
}
