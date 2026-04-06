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
