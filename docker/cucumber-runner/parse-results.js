#!/usr/bin/env node
/**
 * Parses cucumber JSON output and emits @@RESULT@@ lines to stderr.
 * Format matches the TestResult protocol used by @testplatform/core.
 *
 * Usage: node parse-results.js /path/to/cucumber.json
 */

const fs = require("fs")

const resultsPath = process.argv[2] || "/results/cucumber.json"

if (!fs.existsSync(resultsPath)) {
  console.error(`ERROR: Results file not found at ${resultsPath}`)
  process.exit(1)
}

let data
try {
  data = JSON.parse(fs.readFileSync(resultsPath, "utf-8"))
} catch (err) {
  console.error(`ERROR: Failed to parse results JSON: ${err.message}`)
  process.exit(1)
}

if (!Array.isArray(data)) {
  console.error("ERROR: Expected cucumber JSON to be an array of features")
  process.exit(1)
}

function emit(result) {
  process.stderr.write("@@RESULT@@" + JSON.stringify(result) + "\n")
}

const nsToMs = (ns) => Math.round((ns || 0) / 1_000_000)

let totalScenarios = 0
let totalPassed = 0
let totalFailed = 0
let totalSkipped = 0
let totalDuration = 0
const allStepDurations = []

for (const feature of data) {
  const featureName = feature.name || feature.uri || "unnamed feature"

  for (const scenario of feature.elements || []) {
    // Skip background "elements" (they're rolled into scenarios)
    if (scenario.type === "background") continue

    totalScenarios++

    const steps = (scenario.steps || []).map((s) => {
      const durMs = nsToMs(s.result?.duration)
      allStepDurations.push(durMs)
      return {
        keyword: (s.keyword || "").trim(),
        text: s.name || "",
        status: s.result?.status || "unknown",
        duration: durMs,
        error: s.result?.error_message,
      }
    })

    // Determine scenario status: failed if any step failed, skipped if any skipped, else passed
    let status = "passed"
    if (steps.some((s) => s.status === "failed")) status = "failed"
    else if (steps.some((s) => s.status === "pending" || s.status === "undefined"))
      status = "failed"
    else if (steps.some((s) => s.status === "skipped")) status = "skipped"

    const duration = steps.reduce((sum, s) => sum + s.duration, 0)
    totalDuration += duration

    if (status === "passed") totalPassed++
    else if (status === "failed") totalFailed++
    else if (status === "skipped") totalSkipped++

    const tags = (scenario.tags || []).map((t) => t.name)

    const attachments = []
    for (const step of scenario.steps || []) {
      for (const att of step.embeddings || []) {
        attachments.push({
          mimeType: att.mime_type,
          data: att.data, // base64
        })
      }
    }

    const result = {
      feature: featureName,
      scenario: scenario.name || "unnamed scenario",
      status,
      ok: status === "passed",
      duration,
      tags,
      steps,
      timestamp: new Date().toISOString(),
    }

    if (attachments.length > 0) {
      result.attachments = attachments
    }

    emit(result)
  }
}

// Emit summary
const passRate =
  totalScenarios > 0 ? Math.round((totalPassed / totalScenarios) * 100) : 0

// Calculate percentile-like stats from all step durations
allStepDurations.sort((a, b) => a - b)
const avg =
  allStepDurations.length > 0
    ? Math.round(
        allStepDurations.reduce((s, d) => s + d, 0) / allStepDurations.length
      )
    : 0
const min = allStepDurations[0] || 0
const max = allStepDurations[allStepDurations.length - 1] || 0
const p90 = allStepDurations[Math.floor(allStepDurations.length * 0.9)] || 0
const p95 = allStepDurations[Math.floor(allStepDurations.length * 0.95)] || 0

emit({
  type: "summary",
  totalChecks: totalScenarios,
  passed: totalPassed,
  failed: totalFailed,
  skipped: totalSkipped,
  passRate,
  avgDuration: avg,
  minDuration: min,
  maxDuration: max,
  p90Duration: p90,
  p95Duration: p95,
  timestamp: new Date().toISOString(),
})

console.log(`Parsed ${totalScenarios} scenarios: ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped`)
