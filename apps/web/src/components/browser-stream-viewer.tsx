import { useEffect, useRef, useState } from "react"
import RFB from "@novnc/novnc/lib/rfb"
import { useBrowserStream } from "../hooks/useApi"

type StreamState = "waiting" | "connecting" | "connected" | "disconnected" | "error"

interface Props {
  runId: string
  enabled: boolean
  /**
   * When true (and the underlying stream allows it via server config), the
   * viewer forwards mouse/keyboard events to the VNC server. When false, the
   * viewer is read-only regardless of server config.
   */
  localInteractive: boolean
}

export function BrowserStreamViewer({ runId, enabled, localInteractive }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const rfbRef = useRef<any>(null)
  const [state, setState] = useState<StreamState>("waiting")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const { data: streamInfo, error: streamError } = useBrowserStream(runId, enabled)

  useEffect(() => {
    if (!enabled || !streamInfo || !canvasRef.current) return

    // noVNC's RFB is a WebSocket client. Point it at the API-reported host:port.
    // The websockify endpoint is served by the runner image on the same port.
    const url = `ws://${streamInfo.host}:${streamInfo.port}/websockify`

    setState("connecting")
    setErrorMsg(null)

    let rfb: any
    try {
      rfb = new RFB(canvasRef.current, url, {
        wsProtocols: ["binary"],
      })
      // Scale to fit the container
      rfb.scaleViewport = true
      rfb.resizeSession = false
      // Control whether input is forwarded. We respect BOTH the server-side
      // setting (streamInfo.interactive) AND the client-side toggle.
      const allowInput = streamInfo.interactive && localInteractive
      rfb.viewOnly = !allowInput

      rfb.addEventListener("connect", () => setState("connected"))
      rfb.addEventListener("disconnect", (e: any) => {
        setState("disconnected")
        if (e?.detail?.clean === false) {
          setErrorMsg(e.detail?.reason || "Connection lost")
        }
      })
      rfb.addEventListener("securityfailure", (e: any) => {
        setState("error")
        setErrorMsg(`Security failure: ${e.detail?.reason || "unknown"}`)
      })

      rfbRef.current = rfb
    } catch (err) {
      setState("error")
      setErrorMsg(err instanceof Error ? err.message : "Failed to connect")
    }

    return () => {
      if (rfb) {
        try {
          rfb.disconnect()
        } catch {
          // ignore
        }
      }
      rfbRef.current = null
    }
  }, [enabled, streamInfo, localInteractive])

  // Update viewOnly live if the toggle changes while connected
  useEffect(() => {
    if (rfbRef.current && streamInfo) {
      const allowInput = streamInfo.interactive && localInteractive
      rfbRef.current.viewOnly = !allowInput
    }
  }, [localInteractive, streamInfo])

  if (!enabled) {
    return null
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${
              state === "connected"
                ? "animate-pulse bg-emerald-400"
                : state === "connecting"
                  ? "animate-pulse bg-amber-400"
                  : state === "error"
                    ? "bg-red-400"
                    : "bg-muted-foreground"
            }`}
          />
          <span className="font-mono text-muted-foreground">
            {state === "waiting" && "Waiting for test container..."}
            {state === "connecting" && "Connecting..."}
            {state === "connected" && "Live"}
            {state === "disconnected" && "Disconnected"}
            {state === "error" && "Error"}
          </span>
          {streamInfo && !streamInfo.interactive && (
            <span className="font-mono text-[10px] text-muted-foreground/70">
              · read-only (disabled in scenario config)
            </span>
          )}
          {streamInfo && streamInfo.interactive && !localInteractive && (
            <span className="font-mono text-[10px] text-muted-foreground/70">
              · read-only (disabled in UI settings)
            </span>
          )}
        </div>
      </div>

      {(streamError || errorMsg) && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
          {errorMsg || (streamError as Error)?.message || "Stream unavailable"}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border bg-black">
        <div
          ref={canvasRef}
          className="h-[720px] w-full"
          style={{ touchAction: "none" }}
        />
      </div>
    </div>
  )
}
