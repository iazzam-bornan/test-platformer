import { useMemo } from "react"
import { useBrowserStream } from "../hooks/useApi"

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

/**
 * BrowserStreamViewer
 *
 * Embeds the noVNC standalone vnc.html that's served by websockify inside
 * the test runner container. Going through the iframe (rather than instantiating
 * `RFB` directly in our React tree) sidesteps the cross-origin WebSocket
 * handshake problem: the iframe content is loaded from the same origin as
 * the VNC server, so its WebSocket connection is same-origin.
 *
 * The trade-off: less programmatic control over the viewer. We pass options
 * via URL params, but we can't, e.g., trigger disconnect from outside.
 */
export function BrowserStreamViewer({ runId, enabled, localInteractive }: Props) {
  const { data: streamInfo, error: streamError, isLoading } = useBrowserStream(
    runId,
    enabled
  )

  // Build the noVNC URL. We let the iframe's content do the WebSocket
  // connection itself — that way the WS handshake is same-origin.
  // noVNC vnc.html supports these query params:
  //   host, port, path, autoconnect, view_only, resize, reconnect
  const iframeSrc = useMemo(() => {
    if (!streamInfo) return null
    const params = new URLSearchParams({
      host: streamInfo.host,
      port: String(streamInfo.port),
      path: streamInfo.path || "websockify",
      autoconnect: "1",
      reconnect: "1",
      // Both names — vnc.html uses `resize`, vnc_lite.html uses `scale_viewport`
      resize: "scale",
      scale_viewport: "true",
      // The UI settings toggle is the source of truth. The scenario YAML's
      // streamInteractive becomes the *default* for the toggle, but the
      // user's local choice always wins.
      view_only: localInteractive ? "0" : "1",
      show_dot: "1",
    })
    // Use vnc.html — it's the full UI but supports the `resize=scale` URL
    // param so the canvas fits the iframe. vnc_lite.html doesn't read any
    // scaling params, leaving you with scrollbars. We hide vnc.html's
    // control bar via CSS injected at runtime in run.sh.
    return `http://${streamInfo.host}:${streamInfo.port}/vnc.html?${params.toString()}`
  }, [streamInfo, localInteractive])

  if (!enabled) {
    return null
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${
              streamInfo
                ? "animate-pulse bg-emerald-400"
                : isLoading
                  ? "animate-pulse bg-amber-400"
                  : "bg-muted-foreground"
            }`}
          />
          <span className="font-mono text-muted-foreground">
            {!streamInfo && isLoading && "Waiting for test container..."}
            {!streamInfo && !isLoading && "Stream unavailable"}
            {streamInfo && "Live"}
          </span>
          {streamInfo && !localInteractive && (
            <span className="font-mono text-[10px] text-muted-foreground/70">
              · read-only (enable in Settings)
            </span>
          )}
          {streamInfo && localInteractive && (
            <span className="font-mono text-[10px] text-amber-400/70">
              · interactive (click inside the viewer to focus)
            </span>
          )}
        </div>
        {iframeSrc && (
          <a
            href={iframeSrc}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[10px] text-muted-foreground hover:text-foreground"
          >
            Open in new tab ↗
          </a>
        )}
      </div>

      {streamError && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
          {(streamError as Error)?.message || "Stream unavailable"}
        </div>
      )}

      {iframeSrc && (
        <div className="overflow-hidden rounded-lg border bg-black">
          <iframe
            key={iframeSrc}
            src={iframeSrc}
            title="Live browser stream"
            className="block h-[calc(100vh-220px)] min-h-[600px] w-full"
            allow="clipboard-read; clipboard-write; fullscreen"
            // No sandbox: noVNC needs full access to dispatch keyboard
            // events to its WebSocket, plus we trust the runner image
            // (we built it). With sandbox the iframe can't focus or
            // forward keystrokes.
          />
        </div>
      )}
    </div>
  )
}
