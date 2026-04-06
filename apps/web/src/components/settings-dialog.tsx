import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { HugeiconsIcon } from "@hugeicons/react"
import { Settings01Icon } from "@hugeicons/core-free-icons"
import { useQueueStatus, useSetMaxConcurrentRuns } from "../hooks/useApi"

export function SettingsDialog() {
  const [open, setOpen] = useState(false)
  const { data: queue } = useQueueStatus()
  const setMax = useSetMaxConcurrentRuns()
  const [maxValue, setMaxValue] = useState<string>("")
  const [error, setError] = useState<string | null>(null)

  // Sync the input with the server value whenever the dialog opens
  useEffect(() => {
    if (open && queue) {
      setMaxValue(String(queue.max))
      setError(null)
    }
  }, [open, queue])

  const handleSave = async () => {
    setError(null)
    const parsed = Number(maxValue)
    if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
      setError("Must be a non-negative integer (0 = unlimited)")
      return
    }
    try {
      await setMax.mutateAsync(parsed)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          aria-label="Settings"
        >
          <HugeiconsIcon icon={Settings01Icon} size={14} />
          <span>Settings</span>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Platform Settings</DialogTitle>
          <DialogDescription>
            Runtime configuration. Changes apply immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="max-concurrent" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Max concurrent runs
            </Label>
            <Input
              id="max-concurrent"
              type="number"
              min={0}
              step={1}
              value={maxValue}
              onChange={(e) => setMaxValue(e.target.value)}
              className="font-mono"
              placeholder="0"
            />
            <p className="text-[10px] text-muted-foreground">
              Maximum number of test runs that can hold a docker stack at once.
              Set to <span className="font-mono">0</span> for unlimited. Additional
              runs are queued (FIFO) until a slot frees up.
            </p>
            {queue && (
              <p className="font-mono text-[10px] text-muted-foreground">
                Currently: {queue.active} active, {queue.queued} queued
              </p>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={setMax.isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={setMax.isPending}
          >
            {setMax.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
