import { Database } from "bun:sqlite"
import path from "path"
import type { Run, RunStatus, ServiceRunInfo } from "@workspace/shared/types/run"
import type { Scenario } from "@workspace/shared/schemas/scenario"

const DB_PATH = path.resolve(import.meta.dirname, "../../../../storage/runs.db")

let db: Database

export function getDb(): Database {
  if (!db) {
    const fs = require("fs")
    const dir = path.dirname(DB_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    db = new Database(DB_PATH)
    db.exec("PRAGMA journal_mode=WAL;")
    migrate()
  }
  return db
}

function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      scenario_id TEXT NOT NULL,
      scenario_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at TEXT NOT NULL,
      finished_at TEXT,
      config TEXT NOT NULL,
      overrides TEXT,
      services TEXT NOT NULL DEFAULT '[]',
      exit_code INTEGER,
      preserve_on_failure INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
    CREATE INDEX IF NOT EXISTS idx_runs_scenario ON runs(scenario_id);
    CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at);
  `)
}

export function insertRun(run: Run): void {
  const stmt = getDb().prepare(`
    INSERT INTO runs (id, scenario_id, scenario_name, status, started_at, config, overrides, services, preserve_on_failure)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    run.id,
    run.scenarioId,
    run.scenarioName,
    run.status,
    run.startedAt,
    JSON.stringify(run.config),
    run.overrides ? JSON.stringify(run.overrides) : null,
    JSON.stringify(run.services),
    run.preserveOnFailure ? 1 : 0
  )
}

export function updateRunStatus(id: string, status: RunStatus): void {
  const terminal = ["passed", "failed", "cancelled", "error"]
  if (terminal.includes(status)) {
    getDb()
      .prepare("UPDATE runs SET status = ?, finished_at = ? WHERE id = ?")
      .run(status, new Date().toISOString(), id)
  } else {
    getDb()
      .prepare("UPDATE runs SET status = ? WHERE id = ?")
      .run(status, id)
  }
}

export function updateRunServices(id: string, services: ServiceRunInfo[]): void {
  getDb()
    .prepare("UPDATE runs SET services = ? WHERE id = ?")
    .run(JSON.stringify(services), id)
}

export function updateRunExitCode(id: string, exitCode: number): void {
  getDb()
    .prepare("UPDATE runs SET exit_code = ? WHERE id = ?")
    .run(exitCode, id)
}

export function updateRunError(id: string, error: string): void {
  getDb()
    .prepare("UPDATE runs SET error = ? WHERE id = ?")
    .run(error, id)
}

export function getRunById(id: string): Run | undefined {
  const row = getDb().prepare("SELECT * FROM runs WHERE id = ?").get(id) as
    | DbRow
    | undefined
  if (!row) return undefined
  return rowToRun(row)
}

export function listAllRuns(): Run[] {
  const rows = getDb()
    .prepare("SELECT * FROM runs ORDER BY started_at DESC")
    .all() as DbRow[]
  return rows.map(rowToRun)
}

interface DbRow {
  id: string
  scenario_id: string
  scenario_name: string
  status: string
  started_at: string
  finished_at: string | null
  config: string
  overrides: string | null
  services: string
  exit_code: number | null
  preserve_on_failure: number
  error: string | null
}

function rowToRun(row: DbRow): Run {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    scenarioName: row.scenario_name,
    status: row.status as RunStatus,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    config: JSON.parse(row.config) as Scenario,
    overrides: row.overrides ? JSON.parse(row.overrides) : undefined,
    services: JSON.parse(row.services) as ServiceRunInfo[],
    exitCode: row.exit_code ?? undefined,
    preserveOnFailure: row.preserve_on_failure === 1,
    error: row.error ?? undefined,
  }
}
