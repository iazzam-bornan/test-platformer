import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, useEffect, useRef, useCallback } from "react"
import type {
  ScenarioListItem,
  ScenarioDetail,
  Artifact,
} from "@workspace/shared/types/api"
import type { Run, CreateRunRequest } from "@workspace/shared/types/run"

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000"

export function useScenarios() {
  return useQuery({
    queryKey: ["scenarios"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/scenarios`)
      const data = await res.json()
      return data.data as ScenarioListItem[]
    },
  })
}

export function useScenarioDetail(id: string) {
  return useQuery({
    queryKey: ["scenario", id],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/scenarios/${id}`)
      if (!res.ok) throw new Error("Failed to load scenario")
      const data = await res.json()
      return data.data as ScenarioDetail
    },
    enabled: !!id,
  })
}

export function useRuns() {
  return useQuery({
    queryKey: ["runs"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/runs`)
      const data = await res.json()
      return data.data as Run[]
    },
    refetchInterval: (query) => {
      const runs = query.state.data as Run[] | undefined
      if (!runs) return 3000
      const terminal = ["passed", "failed", "cancelled", "error"]
      const hasActive = runs.some((r) => !terminal.includes(r.status))
      return hasActive ? 3000 : false
    },
  })
}

export function useRunDetail(id: string) {
  return useQuery({
    queryKey: ["run", id],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/runs/${id}`)
      if (!res.ok) throw new Error("Failed to load run")
      const data = await res.json()
      return data.data as Run
    },
    enabled: !!id,
    refetchInterval: (query) => {
      const run = query.state.data as Run | undefined
      if (!run) return 2000
      const terminal = ["passed", "failed", "cancelled", "error"]
      return terminal.includes(run.status) ? false : 2000
    },
  })
}

export function useCreateRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (req: CreateRunRequest) => {
      const res = await fetch(`${API_URL}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to create run")
      }
      const data = await res.json()
      return data.data as Run
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] })
    },
  })
}

export function useCancelRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (runId: string) => {
      const res = await fetch(`${API_URL}/runs/${runId}/cancel`, {
        method: "POST",
      })
      if (!res.ok) throw new Error("Failed to cancel run")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] })
    },
  })
}

export function useCleanupRun() {
  return useMutation({
    mutationFn: async (runId: string) => {
      const res = await fetch(`${API_URL}/runs/${runId}/cleanup`, {
        method: "POST",
      })
      if (!res.ok) throw new Error("Failed to cleanup run")
      return res.json()
    },
  })
}

export function useRunLogs(runId: string) {
  const [logs, setLogs] = useState<string[]>([])
  const [connected, setConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!runId) return

    setLogs([])
    const es = new EventSource(`${API_URL}/runs/${runId}/logs`)
    eventSourceRef.current = es

    es.addEventListener("log", (event) => {
      setLogs((prev) => [...prev, event.data])
    })

    es.addEventListener("status", () => {
      es.close()
      setConnected(false)
    })

    es.onopen = () => setConnected(true)
    es.onerror = () => {
      setConnected(false)
      es.close()
    }

    return () => {
      es.close()
    }
  }, [runId])

  return { logs, connected }
}

export interface BrowserStreamInfo {
  host: string
  port: number
  path: string
  interactive: boolean
}

/**
 * Get the current pause state of a run by checking the flag file inside
 * the test-runner container. The source of truth is the file, not local
 * UI state — this means refreshing the page shows the right state, and
 * if the run finishes the file is gone so we report not-paused.
 */
export function usePauseStatus(runId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["pause-status", runId],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/runs/${runId}/browser-stream/pause`)
      if (!res.ok) return { paused: false }
      const data = await res.json()
      return data.data as { paused: boolean }
    },
    enabled: !!runId && enabled,
    refetchInterval: 3000,
  })
}

/**
 * Pause the cucumber test runner at the next step boundary.
 * Only meaningful for runs with cucumber.streamBrowser=true.
 */
export function usePauseRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (runId: string) => {
      const res = await fetch(`${API_URL}/runs/${runId}/browser-stream/pause`, {
        method: "POST",
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to pause")
      }
      return res.json()
    },
    onSuccess: (_, runId) => {
      queryClient.invalidateQueries({ queryKey: ["pause-status", runId] })
    },
  })
}

/**
 * Resume a paused cucumber test runner.
 */
export function useResumeRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (runId: string) => {
      const res = await fetch(`${API_URL}/runs/${runId}/browser-stream/resume`, {
        method: "POST",
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to resume")
      }
      return res.json()
    },
    onSuccess: (_, runId) => {
      queryClient.invalidateQueries({ queryKey: ["pause-status", runId] })
    },
  })
}

/**
 * Fetch the live browser stream WebSocket address for a run. Polls until the
 * test-runner container's websockify is responsive, then stops. Only
 * meaningful for runs with cucumber.streamBrowser=true.
 */
export function useBrowserStream(runId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["browser-stream", runId],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/runs/${runId}/browser-stream`)
      if (res.status === 503) {
        // VNC server not ready yet — return null so we keep polling
        return null
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Stream not available yet")
      }
      const data = await res.json()
      return data.data as BrowserStreamInfo
    },
    enabled: !!runId && enabled,
    refetchInterval: (query) => {
      // Stop polling once we have a non-null stream info
      if (query.state.data) return false
      return 2000
    },
    retry: false,
  })
}

export function useRunArtifacts(runId: string) {
  return useQuery({
    queryKey: ["artifacts", runId],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/runs/${runId}/artifacts`)
      if (!res.ok) return []
      const data = await res.json()
      return data.data as Artifact[]
    },
    enabled: !!runId,
  })
}

export function getArtifactUrl(runId: string, artifactPath: string) {
  return `${API_URL}/runs/${runId}/artifacts/${artifactPath}`
}

// ---------------------------------------------------------------------------
// UI-only settings (persisted in localStorage). These are frontend
// preferences that don't need to roundtrip through the API.
// ---------------------------------------------------------------------------

const UI_SETTINGS_KEY = "testplatform:ui-settings"

export interface UISettings {
  /**
   * When true, the Live Browser viewer forwards mouse/keyboard input to
   * the streamed browser (on runs where `cucumber.streamInteractive` is also
   * true in the scenario config). Defaults to false — pure view.
   */
  browserStreamInteractive: boolean
}

const defaultUISettings: UISettings = {
  browserStreamInteractive: false,
}

export function getUISettings(): UISettings {
  if (typeof window === "undefined") return defaultUISettings
  try {
    const raw = window.localStorage.getItem(UI_SETTINGS_KEY)
    if (!raw) return defaultUISettings
    return { ...defaultUISettings, ...JSON.parse(raw) }
  } catch {
    return defaultUISettings
  }
}

export function setUISettings(patch: Partial<UISettings>): UISettings {
  const current = getUISettings()
  const next = { ...current, ...patch }
  try {
    window.localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify(next))
    window.dispatchEvent(new Event("testplatform:ui-settings-changed"))
  } catch {
    // ignore
  }
  return next
}

export function useUISettings(): UISettings {
  const [settings, setSettings] = useState<UISettings>(() => getUISettings())
  useEffect(() => {
    const handler = () => setSettings(getUISettings())
    window.addEventListener("testplatform:ui-settings-changed", handler)
    window.addEventListener("storage", handler)
    return () => {
      window.removeEventListener("testplatform:ui-settings-changed", handler)
      window.removeEventListener("storage", handler)
    }
  }, [])
  return settings
}

export function useDockerStatus() {
  return useQuery({
    queryKey: ["docker-status"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/docker/status`)
      const data = await res.json()
      return data as { available: boolean }
    },
    refetchInterval: 30000,
  })
}

export interface QueueStatus {
  active: number
  queued: number
  max: number
}

export function useQueueStatus() {
  return useQuery({
    queryKey: ["queue-status"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/runs/queue`)
      if (!res.ok) throw new Error("Failed to load queue status")
      const data = await res.json()
      return data.data as QueueStatus
    },
    refetchInterval: 3000,
  })
}

export function useSetMaxConcurrentRuns() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (max: number) => {
      const res = await fetch(`${API_URL}/runs/queue/max`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to update max concurrent runs")
      }
      const data = await res.json()
      return data.data as QueueStatus
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue-status"] })
      queryClient.invalidateQueries({ queryKey: ["runs"] })
    },
  })
}

export interface TestResult {
  url?: string
  iteration?: number
  status?: number | string
  ok?: boolean
  duration?: number
  timestamp?: string
  error?: string
  body?: string
  // summary or plan
  type?: "summary" | "plan"
  totalChecks?: number
  passed?: number
  failed?: number
  passRate?: number
  // jmeter fields
  label?: string
  responseCode?: string
  responseMessage?: string
  threadName?: string
  bytes?: number
  sentBytes?: number
  connectTime?: number
  latency?: number
  // jmeter summary fields
  errorRate?: number
  avgDuration?: number
  minDuration?: number
  maxDuration?: number
  p90Duration?: number
  p95Duration?: number
  throughput?: number
  // cucumber fields
  feature?: string
  scenario?: string
  tags?: string[]
  steps?: CucumberStepResult[]
  attachments?: CucumberAttachment[]
  skipped?: number
}

export interface CucumberStepResult {
  keyword: string
  text: string
  status: string
  duration: number
  error?: string
}

export interface CucumberAttachment {
  mimeType: string
  data: string
}

export function useServiceLogs(runId: string, service: string) {
  const [logs, setLogs] = useState<string[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!runId || !service) return

    setLogs([])
    const es = new EventSource(
      `${API_URL}/runs/${runId}/logs/service/${service}`
    )

    es.addEventListener("log", (event) => {
      setLogs((prev) => [...prev, event.data])
    })

    es.addEventListener("status", () => {
      es.close()
      setConnected(false)
    })

    es.addEventListener("error", () => {
      es.close()
      setConnected(false)
    })

    es.onopen = () => setConnected(true)
    es.onerror = () => {
      setConnected(false)
      es.close()
    }

    return () => {
      es.close()
    }
  }, [runId, service])

  return { logs, connected }
}

export function useTestResults(runId: string) {
  const [results, setResults] = useState<TestResult[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [summary, setSummary] = useState<TestResult | null>(null)
  const [plannedTotal, setPlannedTotal] = useState<number | undefined>()
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!runId) return

    setResults([])
    setLogs([])
    setSummary(null)
    setPlannedTotal(undefined)

    const es = new EventSource(`${API_URL}/runs/${runId}/results`)

    es.addEventListener("result", (event) => {
      try {
        const result: TestResult = JSON.parse(event.data)
        if (result.type === "summary") {
          setSummary(result)
        } else if (result.type === "plan") {
          if (typeof result.totalChecks === "number") {
            setPlannedTotal(result.totalChecks)
          }
        } else {
          setResults((prev) => [...prev, result])
        }
      } catch {}
    })

    es.addEventListener("log", (event) => {
      setLogs((prev) => [...prev, event.data])
    })

    es.addEventListener("status", () => {
      es.close()
      setConnected(false)
    })

    es.onopen = () => setConnected(true)
    es.onerror = () => {
      setConnected(false)
      es.close()
    }

    return () => {
      es.close()
    }
  }, [runId])

  return { results, logs, summary, plannedTotal, connected }
}
