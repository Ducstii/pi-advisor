# pi-jev-advisor

A [pi coding-agent](https://github.com/badlogic/pi-mono) extension that sends
agent decisions to [Jev](https://typesafe.ai), a decision model from TypeSafe
AI. The agent sends context and a batch of questions, and gets probabilities
back in 100-500ms.

## Install

```bash
pi install npm:pi-jev-advisor
```

Run `/jev-connect` and paste an API key from
[console.typesafe.ai](https://console.typesafe.ai). The key is saved to
`~/.pi/agent/jev.json` (mode 600). The `JEV_API_KEY` environment variable
overrides it.

## The `jev_advise` tool

One call carries a batch of questions, which is about 10x cheaper than
separate calls. Three question types:

| Type | Ask | Get |
| ------ | ----- | ----- |
| `choice` | options with descriptions | winner, probability distribution, confidence |
| `score` | ordered scale levels, lowest first | weighted score, legend, confidence |
| `noul` | a yes/no question | yes-probability between 0 and 1 |

```jsonc
{
  "context": "The decision, hard constraints, relevant code, cost of a wrong choice",
  "questions": [
    { "id": "approach", "type": "choice", "instructions": "Which retry strategy",
      "options": { "exponential": "Backoff x2 each retry", "fixed": "Constant 1s" } },
    { "id": "complexity", "type": "score", "instructions": "How complex is this change",
      "scale": ["trivial", "moderate", "hairball"] },
    { "id": "needs_user", "type": "noul", "instructions": "Should the user decide this" }
  ]
}
```

If the top two options are within 0.05 probability, or confidence is 0.6 or
lower, the answer is flagged `NEAR-TIE` and the agent should ask the user
instead of picking. Tune the thresholds with `JEV_NEAR_TIE_DELTA` and
`JEV_NEAR_TIE_CONFIDENCE`.

## How the agent is steered

The extension registers prompt guidelines telling the agent to:

- Call `jev_advise` for judgment calls (which approach, library, algorithm, or
  strategy) with relevant code in the context, and not for facts it can read
  from the repo.
- Add a quality-check question to the same batch as the decision.
- When a risk is flagged, re-ask with candidate failure paths as options so
  the distribution points at the specific one.
- Stress-test important verdicts by re-asking with counter-context and
  reversed option order.
- Bring NEAR-TIE answers to the user.

## Cost

Input costs $0.042 per million tokens, output is free. A batched decision
costs a fraction of a cent. Usage is reported into pi's totals.

## License

MIT
