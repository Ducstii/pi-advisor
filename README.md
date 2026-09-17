# pi-jev-advisor

[pi coding-agent](https://github.com/badlogic/pi-mono) extension that delegates
agent decisions to [Jev](https://typesafe.ai), TypeSafe AI's "System One"
decision model. Instead of assuming based off context, the model can use the result
of Jev instead

## Install

```
pi install npm:pi-jev-advisor
```

## Setup

Run `/jev-connect` inside pi and paste an API key from
[console.typesafe.ai](https://console.typesafe.ai).

## The `jev_advise` tool

One call carries a batch of questions — batching is ~10× cheaper and faster
than separate calls. Three question types:

| Type | Ask | Get |
| ------ | ----- | ----- |
| `choice` | options with descriptions | winner + full probability distribution + confidence |
| `score` | ordered scale levels, lowest first | weighted score (can land between levels) + legend + confidence |
| `noul` | a yes/no question | yes-probability 0–1 |

```jsonc
// what the agent sends — context shape: decision, hard constraints,
// verbatim load-bearing code/diffs, cost of a wrong choice
{
  "context": "The diff and constraints under decision",
  "questions": [
    { "id": "approach", "type": "choice", "instructions": "Which retry strategy",
      "options": { "exponential": "Backoff ×2 each retry", "fixed": "Constant 1s" } },
    { "id": "complexity", "type": "score", "instructions": "How complex is this change",
      "scale": ["trivial", "moderate", "hairball"] },
    { "id": "needs_user", "type": "noul", "instructions": "Should the user decide this" }
  ]
}
```

Results render one line per question, including the winner margin. When the
top two options are within 0.05 probability or confidence is at or below 0.6,
the answer is flagged `NEAR-TIE — consider asking the user`, and the agent is
steered to surface the tie instead of picking. Thresholds are policy, not
truth — tune them with `JEV_NEAR_TIE_DELTA` and `JEV_NEAR_TIE_CONFIDENCE`.

Anti-verbosity is part of the contract: the guidance tells the agent not to
call for facts readable from the repo, naming trivia, or re-decisions without
new evidence; to fold quality-check questions into the same batch as the
decision rather than paying for a separate verify pass; to stress-test
important verdicts with one adversarial re-ask (counter-context, reversed
option order); and — when a risk is flagged — to re-ask with candidate failure
paths enumerated as named `options`, so Jev's distribution pinpoints *which*
mechanism instead of sending the agent scrolling through the code. Questions asking Jev for its own confidence are rejected with
a teaching error — read the reported distribution instead. Thin context
(< 200 chars) on a multi-question batch gets a warning line in the result.

## License

MIT
