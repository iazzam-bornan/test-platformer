type LogListener = (line: string) => void

class LogEmitter {
  private listeners = new Map<string, Set<LogListener>>()
  private history = new Map<string, string[]>()

  emit(runId: string, line: string): void {
    // Store in history
    if (!this.history.has(runId)) {
      this.history.set(runId, [])
    }
    this.history.get(runId)!.push(line)

    // Notify listeners
    const listeners = this.listeners.get(runId)
    if (listeners) {
      for (const listener of listeners) {
        listener(line)
      }
    }
  }

  subscribe(runId: string, listener: LogListener): () => void {
    if (!this.listeners.has(runId)) {
      this.listeners.set(runId, new Set())
    }
    this.listeners.get(runId)!.add(listener)

    return () => {
      const listeners = this.listeners.get(runId)
      if (listeners) {
        listeners.delete(listener)
        if (listeners.size === 0) {
          this.listeners.delete(runId)
        }
      }
    }
  }

  getHistory(runId: string): string[] {
    return this.history.get(runId) ?? []
  }

  clearHistory(runId: string): void {
    this.history.delete(runId)
    this.listeners.delete(runId)
  }
}

export const logEmitter = new LogEmitter()
