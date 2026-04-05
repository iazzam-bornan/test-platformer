import { TestPlatform, SqliteStorage } from "@testplatform/core"
import path from "path"

const STORAGE_PATH = path.resolve(import.meta.dirname, "../../../storage/runs.db")

export const platform = new TestPlatform({
  storage: new SqliteStorage(STORAGE_PATH),
})
