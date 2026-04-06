#!/usr/bin/env node
/**
 * Tails a Cucumber NDJSON message file and emits @@RESULT@@ lines to stderr
 * as scenarios complete. Designed to run in parallel with cucumber-js.
 *
 * Protocol matches @testplatform/core's @@RESULT@@ convention:
 *   - One "plan" event when the run starts (totalChecks = scenario count)
 *   - One scenario result per testCaseFinished
 *   - One final summary event on testRunFinished
 *
 * Usage: node stream-results.js /path/to/cucumber.ndjson
 */
const fs = require("fs")

const messagePath = process.argv[2]
if (!messagePath) {
  console.error("Usage: stream-results.js <message-file>")
  process.exit(1)
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const featureNames = new Map()  // uri -> feature name
const gherkinSteps = new Map()  // gherkin step id -> { keyword, text }
const pickles = new Map()       // pickle id -> pickle
const testCases = new Map()     // testCase id -> testCase
const attempts = new Map()      // testCaseStarted id -> { testCaseId, stepResults: Map }

let totalScenarios = 0
let passed = 0
let failed = 0
let skipped = 0
const allStepDurations = []
let runFinished = false
let planEmitted = false

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emit(obj) {
  process.stderr.write("@@RESULT@@" + JSON.stringify(obj) + "\n")
}

function nsToMs(d) {
  if (!d) return 0
  return Math.round(
    Number(d.seconds || 0) * 1000 + Number(d.nanos || 0) / 1_000_000
  )
}

function indexGherkinDocument(doc) {
  if (!doc.feature) return
  if (doc.uri) featureNames.set(doc.uri, doc.feature.name)

  const walkChildren = (children) => {
    for (const child of children || []) {
      if (child.background) {
        for (const step of child.background.steps || []) {
          gherkinSteps.set(step.id, {
            keyword: (step.keyword || "").trim(),
            text: step.text,
          })
        }
      }
      if (child.scenario) {
        for (const step of child.scenario.steps || []) {
          gherkinSteps.set(step.id, {
            keyword: (step.keyword || "").trim(),
            text: step.text,
          })
        }
      }
      if (child.rule) walkChildren(child.rule.children)
    }
  }
  walkChildren(doc.feature.children)
}

function processMessage(msg) {
  if (msg.gherkinDocument) {
    indexGherkinDocument(msg.gherkinDocument)
  } else if (msg.pickle) {
    pickles.set(msg.pickle.id, msg.pickle)
  } else if (msg.testCase) {
    testCases.set(msg.testCase.id, msg.testCase)
  } else if (msg.testRunStarted) {
    if (!planEmitted) {
      emit({
        type: "plan",
        totalChecks: pickles.size,
        timestamp: new Date().toISOString(),
      })
      planEmitted = true
    }
  } else if (msg.testCaseStarted) {
    attempts.set(msg.testCaseStarted.id, {
      testCaseId: msg.testCaseStarted.testCaseId,
      stepResults: new Map(),
    })
  } else if (msg.testStepFinished) {
    const att = attempts.get(msg.testStepFinished.testCaseStartedId)
    if (!att) return
    att.stepResults.set(
      msg.testStepFinished.testStepId,
      msg.testStepFinished.testStepResult
    )
  } else if (msg.testCaseFinished) {
    if (msg.testCaseFinished.willBeRetried) {
      // Drop attempt; the next attempt will be tracked separately
      attempts.delete(msg.testCaseFinished.testCaseStartedId)
      return
    }

    const att = attempts.get(msg.testCaseFinished.testCaseStartedId)
    if (!att) return
    const tc = testCases.get(att.testCaseId)
    if (!tc) return
    const pickle = pickles.get(tc.pickleId)
    if (!pickle) return

    // Build steps in test-case order. testSteps include both pickle steps and
    // hooks; hooks have hookId set, pickle steps have pickleStepId set.
    const steps = []
    let seenPickleStep = false

    for (const ts of tc.testSteps || []) {
      const result = att.stepResults.get(ts.id)
      if (!result) continue
      const duration = nsToMs(result.duration)
      allStepDurations.push(duration)

      let keyword = ""
      let text = ""

      if (ts.pickleStepId) {
        const pickleStep = (pickle.steps || []).find(
          (ps) => ps.id === ts.pickleStepId
        )
        if (pickleStep) {
          text = pickleStep.text || ""
          const astId = (pickleStep.astNodeIds || [])[0]
          if (astId) {
            const gherkin = gherkinSteps.get(astId)
            if (gherkin) keyword = gherkin.keyword
          }
        }
        seenPickleStep = true
      } else if (ts.hookId) {
        keyword = seenPickleStep ? "After" : "Before"
      }

      steps.push({
        keyword,
        text,
        status: (result.status || "unknown").toLowerCase(),
        duration,
        error: result.message,
      })
    }

    // Determine overall scenario status
    let status = "passed"
    if (steps.some((s) => s.status === "failed")) {
      status = "failed"
    } else if (
      steps.some(
        (s) =>
          s.status === "pending" ||
          s.status === "undefined" ||
          s.status === "ambiguous"
      )
    ) {
      status = "failed"
    } else if (steps.some((s) => s.status === "skipped" && s.text)) {
      status = "skipped"
    }

    const duration = steps.reduce((sum, s) => sum + s.duration, 0)
    totalScenarios++
    if (status === "passed") passed++
    else if (status === "failed") failed++
    else if (status === "skipped") skipped++

    const tags = (pickle.tags || []).map((t) => t.name)
    const featureName = featureNames.get(pickle.uri) || pickle.uri

    emit({
      feature: featureName,
      scenario: pickle.name,
      status,
      ok: status === "passed",
      duration,
      tags,
      steps,
      timestamp: new Date().toISOString(),
    })
  } else if (msg.testRunFinished) {
    runFinished = true

    allStepDurations.sort((a, b) => a - b)
    const sum = allStepDurations.reduce((s, d) => s + d, 0)
    const avg = allStepDurations.length > 0 ? Math.round(sum / allStepDurations.length) : 0
    const min = allStepDurations[0] || 0
    const max = allStepDurations[allStepDurations.length - 1] || 0
    const p90 = allStepDurations[Math.floor(allStepDurations.length * 0.9)] || 0
    const p95 = allStepDurations[Math.floor(allStepDurations.length * 0.95)] || 0
    const passRate =
      totalScenarios > 0 ? Math.round((passed / totalScenarios) * 100) : 0

    emit({
      type: "summary",
      totalChecks: totalScenarios,
      passed,
      failed,
      skipped,
      passRate,
      avgDuration: avg,
      minDuration: min,
      maxDuration: max,
      p90Duration: p90,
      p95Duration: p95,
      timestamp: new Date().toISOString(),
    })

    // Brief delay to flush stderr buffer, then exit cleanly
    setTimeout(() => process.exit(0), 200)
  }
}

// ---------------------------------------------------------------------------
// Tail loop — polls the message file for new lines until testRunFinished
// ---------------------------------------------------------------------------

let position = 0
let buffer = ""

function tick() {
  if (!fs.existsSync(messagePath)) {
    setTimeout(tick, 200)
    return
  }

  let stats
  try {
    stats = fs.statSync(messagePath)
  } catch {
    setTimeout(tick, 200)
    return
  }

  if (stats.size > position) {
    const fd = fs.openSync(messagePath, "r")
    const len = stats.size - position
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, position)
    fs.closeSync(fd)
    position = stats.size

    buffer += buf.toString("utf-8")
    let nl
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (line) {
        try {
          processMessage(JSON.parse(line))
        } catch {
          // Malformed line — skip
        }
      }
    }
  }

  if (!runFinished) {
    setTimeout(tick, 100)
  }
}

process.on("SIGTERM", () => process.exit(0))
process.on("SIGINT", () => process.exit(0))

tick()
