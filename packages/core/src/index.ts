// Main API
export { TestPlatform } from "./platform"
export { Run } from "./run"

// Storage implementations
export { MemoryStorage } from "./storage/memory"
export { SqliteStorage } from "./storage/sqlite"

// Types
export type {
  // Config types (what users pass in)
  RunConfig,
  ServiceConfig,
  PortMapping,
  Healthcheck,
  HttpCheckTest,
  CustomContainerTest,
  TestConfig,
  CleanupConfig,

  // Runtime types (what the platform emits)
  RunState,
  RunStatus,
  ServiceState,
  ServiceHealth,
  TestResult,

  // Events
  PlatformEvents,

  // Interfaces
  Storage,
  PlatformOptions,
} from "./types"
