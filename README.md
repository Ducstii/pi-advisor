# pi-jev-advisor

[pi coding-agent](https://github.com/badlogic/pi-mono) extension that delegates
agent decisions to [Jev](https://typesafe.ai), TypeSafe AI's "System One"
decision model — instead of deciding from vibes, the agent sends concrete
context plus a batch of typed questions and gets typed probabilistic answers
back in ~100–500ms.

## Install

```
pi install npm:pi-jev-advisor
```

## Setup

Run `/jev-connect` inside pi and paste an API key from
[console.typesafe.ai](https://console.typesafe.ai) (early access). The key is
validated live before saving to `~/.pi/agent/jev.json` (mode 600). The
`JEV_API_KEY` environment variable takes precedence.

## The `jev_advise` tool

One call carries a batch of questions — batching is ~10× cheaper and faster
than separate calls. Three question types:

| Type | Ask | Get |
| ------ | ----- | ----- |
| `choice` | options with descriptions | winner + full probability distribution + confidence |
| `score` | ordered scale levels, lowest first | weighted score (can land between levels) + legend + confidence |
| `noul` | a yes/no question | yes-probability 0–1 |

```jsonc
// what the agent sends
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

Results render one line per question. When the top two options are within
0.05 probability or confidence drops below 0.6, the answer is flagged
`NEAR-TIE — consider asking the user`, and the agent is steered to surface the
tie instead of picking.

## Steering

The extension registers prompt guidelines that make consulting Jev a workflow
requirement: development decisions (approach, library, algorithm, strategy),
framing questions for the user (Jev picks the question; the user makes the
decision), and post-write code-quality self-checks against explicit levels.

## Cost

Jev input is $0.042 per million tokens; output is free. A typical batched
decision costs a fraction of a cent. Token usage is reported into pi's usage
totals.

## License

MIT
