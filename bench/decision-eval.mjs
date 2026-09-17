/**
 * Decision-quality eval for pi-jev-advisor / Jev.
 * Cases have labeled ground truth; we measure accuracy (top choice correct),
 * Brier score (probabilistic honesty), and reliability bins.
 * Usage: node decision-eval.mjs
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const HERE = (f) => fileURLToPath(new URL(f, import.meta.url));
const require = createRequire(import.meta.url);
const { createJiti } = require("jiti");
const TYPEBOX_ENTRY = require.resolve("typebox");
const jiti = createJiti(import.meta.url, {
  fsCache: false,
  moduleCache: false,
  alias: {
    "@earendil-works/pi-coding-agent":
      HERE("./pi-stub.mjs"),
    "@earendil-works/pi-tui": HERE("./tui-stub.mjs"),
    typebox: TYPEBOX_ENTRY,
  },
});
const tools = [];
await jiti
  .import("../index.ts")
  .then((m) =>
    m.default({
      registerTool: (t) => tools.push(t),
      registerCommand: () => {},
    }),
  );
const tool = tools[0];

// --- labeled cases: (context, question, correct option) ---------------------
const cases = [
  {
    cat: "triage",
    context:
      "Log line: 'ERROR: ECONNREFUSED 10.0.0.5:5432 after 30 retries, connection pool exhausted'. Service had a routine deploy 5 minutes ago; DB host unchanged for months.",
    q: {
      id: "c",
      type: "choice",
      instructions: "Most likely root cause category",
      options: {
        deploy_regression: "The deploy broke connection handling",
        db_outage: "The database is down",
        network: "Network partition between services",
        capacity: "Traffic spike overwhelmed the pool",
      },
    },
    truth: "db_outage",
  },
  {
    cat: "triage",
    context:
      "User report: 'app crashes when I open settings after updating to 2.3.1, worked fine on 2.3.0'. Three identical reports within an hour of the 2.3.1 release.",
    q: {
      id: "c",
      type: "choice",
      instructions: "Most likely root cause category",
      options: {
        regression: "Bug introduced in 2.3.1",
        user_error: "Users misconfiguring settings",
        environment: "OS-level incompatibility",
        coincidence: "Unrelated pre-existing bug",
      },
    },
    truth: "regression",
  },
  {
    cat: "triage",
    context:
      "Support email: 'hi, I was charged twice this month, can someone check? not urgent but would appreciate it'. Account shows two identical invoices 3 days apart.",
    q: {
      id: "c",
      type: "choice",
      instructions: "Which team handles this and how fast",
      options: {
        billing_urgent: "Billing, same-day",
        billing_normal: "Billing, normal queue",
        tech_urgent: "Tech support, same-day",
        refund_bot: "Automated refund flow",
      },
    },
    truth: "billing_normal",
  },
  {
    cat: "noul",
    context:
      "Commit message: 'fix: handle null userId in session middleware'. Diff adds a null check and an early return. Tests unchanged. No other files touched.",
    q: {
      id: "safe",
      type: "noul",
      instructions: "Is this change safe to auto-merge without human review",
    },
    truth: 0,
  },
  {
    cat: "noul",
    context:
      "Dependency update PR: 'chore: bump lodash from 4.17.15 to 4.17.21'. Release notes for 4.17.21 include a fix for a prototype pollution CVE. No API changes listed.",
    q: {
      id: "safe",
      type: "noul",
      instructions: "Is this change safe to auto-merge without human review",
    },
    truth: 1,
  },
  {
    cat: "noul",
    context:
      "Task: 'rewrite the auth module from sessions to JWT, ~3000 lines across 15 files, no tests currently cover auth'. Solo developer, deadline in 3 days.",
    q: {
      id: "do_now",
      type: "noul",
      instructions:
        "Should this refactor be started now rather than scheduled properly",
    },
    truth: 0,
  },
  {
    cat: "factual",
    context:
      "Choosing a default font stack for a cross-platform desktop app (Windows/macOS/Linux) that must render without any bundled fonts.",
    q: {
      id: "pick",
      type: "choice",
      instructions: "Most appropriate font stack",
      options: {
        system_ui: "font-family: system-ui",
        arial: "font-family: Arial",
        roboto: "font-family: Roboto",
        custom: "Bundle a custom font",
      },
    },
    truth: "system_ui",
  },
  {
    cat: "factual",
    context:
      "A REST API returns 401 for an expired-but-refreshable token. Clients should retry once with the refresh endpoint, then surface login.",
    q: {
      id: "code",
      type: "choice",
      instructions:
        "Correct HTTP status the API should return for the expired token",
      options: {
        401: "Unauthorized, triggers refresh flow",
        403: "Forbidden",
        419: "Authentication timeout (non-standard)",
        500: "Server error",
      },
    },
    truth: "401",
  },
  {
    cat: "factual",
    context:
      "Git: a developer committed a secrets file in commit abc123 (HEAD~2) and pushed. Nothing else depends on the file; the secret can be rotated.",
    q: {
      id: "first",
      type: "choice",
      instructions: "First action to take",
      options: {
        rotate: "Rotate the secret immediately",
        rebase: "Rewrite history to remove the file",
        revert: "git revert the commit",
        ignore: "Nothing, private repo",
      },
    },
    truth: "rotate",
  },
  {
    cat: "score",
    context:
      "Bug report: 'sometimes the export button produces a truncated file for large datasets, maybe 1 in 20 exports. No workaround. Data is recoverable by re-exporting.'",
    q: {
      id: "sev",
      type: "score",
      instructions: "Severity on this scale",
      scale: [
        "trivial cosmetic",
        "minor with workaround",
        "major no workaround rare",
        "critical data loss",
      ],
    },
    truth: 2,
  },
  {
    cat: "score",
    context:
      "Feature request: 'add dark mode'. 40 upvotes, 3 comments. Codebase has CSS variables for all colors already. Estimated effort: 2 days.",
    q: {
      id: "sev",
      type: "score",
      instructions: "Priority on this scale",
      scale: ["never do this", "backlog someday", "next quarter", "do now"],
    },
    truth: 2,
  },
  {
    cat: "score",
    context:
      "PR review: the diff is 40 lines, adds an input validation guard to a public API endpoint, includes tests, author is a first-time contributor.",
    q: {
      id: "quality",
      type: "score",
      instructions: "Code quality on this scale",
      scale: [
        "needs major rework",
        "needs changes",
        "good with nits",
        "exemplary",
      ],
    },
    truth: 3,
  },
];

let n = 0;
const results = [];
for (const c of cases) {
  const r = await tool.execute("e", { context: c.context, questions: [c.q] });
  const line = r.content[0].text;
  const answer = r.details.answers[c.q.id];
  if (c.q.type === "choice") {
    const p = answer.probabilities?.[c.truth] ?? 0;
    const top = Object.entries(answer.probabilities ?? {}).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0];
    results.push({ cat: c.cat, type: "choice", correct: top === c.truth, p });
    console.log(
      `${top === c.truth ? "✓" : "✗"} [${c.cat}] ${line}  (P[truth]=${p.toFixed(2)})`,
    );
  } else if (c.q.type === "noul") {
    const p = answer.noul ?? 0;
    results.push({ cat: c.cat, type: "noul", p, truth: c.truth });
    console.log(
      `${(p >= 0.5) === !!c.truth ? "✓" : "✗"} [${c.cat}] ${line}  (truth=${c.truth})`,
    );
  } else {
    const rounded = Math.round(answer.score ?? -1);
    const err = Math.abs((answer.score ?? 0) - c.truth);
    results.push({
      cat: c.cat,
      type: "score",
      err,
      exact: rounded === c.truth,
    });
    console.log(
      `${err <= 0.5 ? "✓" : "✗"} [${c.cat}] ${line}  (truth=${c.truth}, err=${err.toFixed(2)})`,
    );
  }
  if (++n % 4 === 0) await new Promise((r) => setTimeout(r, 500)); // be polite to rate limits
}

// --- metrics -----------------------------------------------------------------
const choices = results.filter((r) => r.type === "choice");
const nouls = results.filter((r) => r.type === "noul");
const scores = results.filter((r) => r.type === "score");
const acc = choices.filter((r) => r.correct).length / choices.length;
const brier = choices.reduce((s, r) => s + (1 - r.p) ** 2, 0) / choices.length;
const nAcc =
  nouls.filter((r) => r.p >= 0.5 === !!r.truth).length / nouls.length;
const nBrier =
  nouls.reduce((s, r) => s + (r.p - r.truth) ** 2, 0) / nouls.length;
const sExact = scores.filter((r) => r.exact).length / scores.length;
const sMae = scores.reduce((s, r) => s + r.err, 0) / scores.length;
console.log(
  `\nchoice:  accuracy ${acc.toFixed(2)} (${choices.filter((r) => r.correct).length}/${choices.length})   Brier ${brier.toFixed(3)} (0=perfect, 1=worst)`,
);
console.log(
  `noul:    accuracy ${nAcc.toFixed(2)} (${nouls.filter((r) => r.p >= 0.5 === !!r.truth).length}/${nouls.length})   Brier ${nBrier.toFixed(3)}`,
);
console.log(
  `score:   exact-level ${sExact.toFixed(2)}   MAE ${sMae.toFixed(2)} levels`,
);
