/**
 * Generates a Node.js test script for HTTP checks.
 * stdout = human-readable logs
 * stderr = structured JSON results prefixed with @@RESULT@@
 */
export function generateTestScript(
  urls: string[],
  iterations: number,
  delayMs: number
): string {
  return `
const urls = ${JSON.stringify(urls)};
const iterations = ${iterations};
const delayMs = ${delayMs};

function emitResult(result) {
  process.stderr.write("@@RESULT@@" + JSON.stringify(result) + "\\n");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function checkUrl(url, iteration) {
  const start = Date.now();
  try {
    const res = await fetch(url);
    const duration = Date.now() - start;
    const body = await res.text().catch(() => "");
    return {
      url,
      iteration,
      status: res.status,
      ok: res.ok,
      duration,
      timestamp: new Date().toISOString(),
      body: body.slice(0, 200),
    };
  } catch (err) {
    const duration = Date.now() - start;
    return {
      url,
      iteration,
      status: 0,
      ok: false,
      duration,
      timestamp: new Date().toISOString(),
      error: err.message,
    };
  }
}

async function run() {
  let totalChecks = 0;
  let passed = 0;
  let failed = 0;

  console.log("Running " + urls.length + " checks x " + iterations + " iterations");
  console.log("URLs: " + urls.join(", "));
  console.log("---");

  for (let i = 1; i <= iterations; i++) {
    for (const url of urls) {
      const result = await checkUrl(url, i);
      totalChecks++;

      if (result.ok) {
        passed++;
        console.log("[pass] " + i + "/" + iterations + " " + url + " — " + result.status + " (" + result.duration + "ms)");
      } else {
        failed++;
        console.log("[FAIL] " + i + "/" + iterations + " " + url + " — " + (result.error || result.status) + " (" + result.duration + "ms)");
      }

      emitResult(result);
    }

    if (i < iterations) {
      await sleep(delayMs);
    }
  }

  console.log("---");
  console.log("Done: " + passed + "/" + totalChecks + " passed, " + failed + " failed");

  emitResult({
    type: "summary",
    totalChecks,
    passed,
    failed,
    passRate: Math.round((passed / totalChecks) * 100),
    timestamp: new Date().toISOString(),
  });

  process.exit(failed > 0 ? 1 : 0);
}

run();
`.trim()
}
