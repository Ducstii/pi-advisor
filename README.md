# pi-jev-advisor

[pi coding-agent](https://github.com/badlogic/pi-mono) extension that delegates
agent decisions to [Jev](https://typesafe.ai), TypeSafe AI's "System One"
decision model — instead of deciding from vibes, the agent sends concrete
context plus a batch of typed questions and gets typed probabilistic answers
back in ~100–500ms.

## Install

```bash
pi install npm:pi-jev-advisor
```

## Setup

Run `/jev-connect` inside pi and paste an API key from
[console.typesafe.ai](https://console.typesafe.ai). The key is validated live
before saving to `~/.pi/agent/jev.json` (mode 600). The `JEV_API_KEY`
environment variable takes precedence.

## The `jev_advise` tool

One call carries a batch of questions — batching is ~10× cheaper and faster
than separate calls. Three question types:

| Type | Ask | Get |
| ------ | ----- | ----- |
| `choice` | options with descriptions | winner + full probability distribution + confidence |
| `score` | ordered scale levels, lowest first | weighted score (can land between levels) + legend + confidence |
| `noul` | a yes/no question | yes-probability 0–1 |

```jsonc
// what the agent sends — context shape: the decision, hard constraints,
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

Each answer renders as one line, including the winner margin. When the top two
options are within 0.05 probability or confidence is at or below 0.6, the
answer is flagged `NEAR-TIE — consider asking the user`, and the agent is
steered to surface the tie instead of picking. Thresholds are policy, not
truth — tune them with `JEV_NEAR_TIE_DELTA` and `JEV_NEAR_TIE_CONFIDENCE`.

## How the agent is steered

The extension registers prompt guidelines that make Jev a workflow requirement
with hard edges:

- **Call it for judgment calls** — approach, library, algorithm, strategy —
  with verbatim load-bearing code in `context`; not for facts readable from
  the repo, naming trivia, or re-decisions without new evidence.
- **Verify in the same batch** — quality-check questions ride along with the
  decision, so there's no separate verify pass to pay for.
- **Pinpoint, don't hunt** — when a risk is flagged, re-ask with candidate
  failure paths as named `options`; the distribution points at the specific
  mechanism.
- **Stress-test important verdicts** — one adversarial re-ask with
  counter-context and reversed option order; a verdict that survives both is
  informed, one that flips was anchored.
- **NEAR-TIE goes to the human.** Confidence questions are rejected outright
  with a teaching error (read the reported distribution instead), and thin
  context on a multi-question batch gets a warning in the result.

## Cost

Jev input is $0.042 per million tokens; output is free. A typical batched
decision costs a fraction of a cent. Token usage is reported into pi's usage
totals.

## License

MIT
