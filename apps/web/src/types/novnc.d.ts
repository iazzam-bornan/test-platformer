// Type stubs for @novnc/novnc — the package ships ESM JS without .d.ts files.
// We only use the RFB class, so this minimal declaration is enough.

declare module "@novnc/novnc/lib/rfb" {
  export interface RFBOptions {
    shared?: boolean
    credentials?: { username?: string; password?: string; target?: string }
    repeaterID?: string
    wsProtocols?: string[]
  }

  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, urlOrChannel: string, options?: RFBOptions)
    viewOnly: boolean
    scaleViewport: boolean
    resizeSession: boolean
    showDotCursor: boolean
    background: string
    qualityLevel: number
    compressionLevel: number
    disconnect(): void
    sendCredentials(creds: { password?: string; username?: string; target?: string }): void
    sendKey(keysym: number, code: string, down?: boolean): void
    sendCtrlAltDel(): void
    focus(): void
    blur(): void
    machineShutdown(): void
    machineReboot(): void
    machineReset(): void
    clipboardPasteFrom(text: string): void
  }
}
