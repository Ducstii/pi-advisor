import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
const jiti = createJiti(import.meta.url, { fsCache: false, moduleCache: false, alias: {
  "@earendil-works/pi-coding-agent": fileURLToPath(new URL("./pi-stub.mjs", import.meta.url)),
  "@earendil-works/pi-tui": fileURLToPath(new URL("./tui-stub.mjs", import.meta.url)),
  typebox: new URL("../node_modules/typebox/build/index.mjs", import.meta.url).pathname } });
const tools = [];
await jiti.import("../index.ts").then(m => m.default({ registerTool: t => tools.push(t), registerCommand: () => {} }));
const tool = tools[0];
let fail = 0;
const ok = (c, l) => { console.log(`${c ? "PASS" : "FAIL"}  ${l}`); if (!c) fail++; };
const throws = async (fn, re, l) => { try { await fn(); ok(false, l + " (no throw)"); } catch (e) { ok(re.test(e.message), `${l} → ${e.message.slice(0, 60)}`); } };

// rec 8: confidence question rejected with teaching error
await throws(() => tool.execute("t", { context: "x".repeat(300), questions: [{ id: "c", type: "noul", instructions: "How confident are you in this" }] }), /do not ask Jev for its own confidence/, "confidence question rejected");
// control: normal question passes validation (key exists → stubbed fetch below answers it)

// rec 3 + 6: thin-context warning + margin display — test via formatting path with stubbed fetch
const origFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({ answers: { q1: { type: "choice", choice: "a", probabilities: { a: 0.4, b: 0.35, c: 0.25 }, confidence: 0.8 }, q2: { type: "noul", noul: 0.9 } }, usage: { input_tokens: 10, output_tokens: 1 } }), { status: 200 });
const r = await tool.execute("t", { context: "short", questions: [
  { id: "q1", type: "choice", instructions: "pick", options: { a: "1", b: "2", c: "3" } },
  { id: "q2", type: "noul", instructions: "yes/no" } ] });
globalThis.fetch = origFetch;
const text = r.content[0].text;
ok(text.includes("⚠ context is thin"), "thin-context warning present");
ok(/q1 → a \(confidence 0\.80\) · next: b 0\.35 · c 0\.25 · margin 0\.05/.test(text), "margin + third option shown → " + text.split("\n")[1]);
ok(/margin 0\.05/.test(text) && !/NEAR-TIE/.test(text.split("\n")[1]), "0.05 margin no longer trips NEAR-TIE (margin <= delta only)");
// near-tie still fires on low confidence
globalThis.fetch = async () => new Response(JSON.stringify({ answers: { q1: { type: "choice", choice: "a", probabilities: { a: 0.6, b: 0.4 }, confidence: 0.6 } }, usage: {} }), { status: 200 });
const r2 = await tool.execute("t", { context: "x", questions: [{ id: "q1", type: "choice", instructions: "pick", options: { a: "1", b: "2" } }] });
globalThis.fetch = origFetch;
ok(/NEAR-TIE/.test(r2.content[0].text), "confidence exactly 0.60 flags NEAR-TIE");
process.exit(fail ? 1 : 0);
