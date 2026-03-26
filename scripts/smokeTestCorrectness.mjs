/**
 * Manual smoke tests for the correctness gate.
 * Run with the dev server running locally (default http://localhost:3000).
 *
 *   node scripts/smokeTestCorrectness.mjs
 */

const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

async function postAnalyze(code, language) {
  const res = await fetch(`${baseUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, language }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`/api/analyze failed (${res.status}): ${json.error ?? JSON.stringify(json)}`);
  return json;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  // JS/TS: syntax fail should cap score to 60 (or less)
  const tsBad = `function oops( { return 1 }`;
  const tsRes = await postAnalyze(tsBad, 'ts');
  assert(tsRes.correctness?.status === 'fail', 'Expected TS correctness=fail');
  assert(tsRes.score <= 60, `Expected TS score capped <=60, got ${tsRes.score}`);

  // Python: syntax fail should cap score and fail correctness
  const pyBad = `def add(a, b)\n    return a + b\n`;
  const pyRes = await postAnalyze(pyBad, 'py');
  assert(pyRes.correctness?.status === 'fail', 'Expected Python correctness=fail');
  assert(pyRes.score <= 60, `Expected Python score capped <=60, got ${pyRes.score}`);

  // Unsupported syntax check language in quick mode: correctness stays unknown
  const javaSnippet = `public class A { public static void main(String[] args) { } }`;
  const javaRes = await postAnalyze(javaSnippet, 'java');
  assert(javaRes.correctness?.status === 'unknown', 'Expected Java correctness=unknown');

  // C++ quick mode: correctness is currently unknown
  const cppSnippet = `#include <iostream>\nint main() { std::cout << "ok"; return 0; }`;
  const cppRes = await postAnalyze(cppSnippet, 'cpp');
  assert(cppRes.correctness?.status === 'unknown', 'Expected C++ correctness=unknown');

  console.log('Smoke tests passed.');
}

main().catch((e) => {
  console.error('Smoke tests failed:', e?.message ?? e);
  process.exit(1);
});

