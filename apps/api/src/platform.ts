import { TestPlatform, SqliteStorage } from "@testplatform/core"
import path from "path"

const STORAGE_PATH = path.resolve(import.meta.dirname, "../../../storage/runs.db")

const MAX_CONCURRENT_RUNS = Number(process.env.MAX_CONCURRENT_RUNS) || 0

export const platform = new TestPlatform({
  storage: new SqliteStorage(STORAGE_PATH),
  maxConcurrentRuns: MAX_CONCURRENT_RUNS,
})
