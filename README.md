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


## License

MIT
