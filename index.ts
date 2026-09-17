/**
 * pi-advisor — pi extension delegating agent decisions to the Jev System One
 * API (TypeSafe). Exposes the `jev_advise` tool (batched typed questions →
 * probabilistic answers) and the `/jev-connect` command for key setup.
 */

import { chmod, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";

const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-latest";
const JEV_KEY_FILE = join(homedir(), ".pi", "agent", "jev.json");
const JEV_INPUT_USD_PER_MTOK = 0.042;
const JEV_TIMEOUT_MS = 10_000;
const NEAR_TIE_DELTA = 0.05;
const NEAR_TIE_CONFIDENCE = 0.6;

interface JevQuestionInput {
	id: string;
	type: "choice" | "score" | "noul";
	instructions: string;
	options?: Record<string, string>;
	scale?: string[];
}

interface JevAnswer {
	type?: string;
	choice?: string;
	score?: number;
	noul?: number;
	probabilities?: Record<string, number>;
	legend?: Record<string, string> | string[];
	confidence?: number;
}

interface JevResponse {
	answers: Record<string, JevAnswer>;
	usage?: { input_tokens?: number; output_tokens?: number };
}

/** Flat `{type:"string",enum:[...]}` schema; `Type.Union([Type.Literal()])` produces
 *  anyOf that Google models reject. Local copy of pi-ai's StringEnum to avoid a
 *  peer dependency for one helper (pi-ask-user precedent). */
function StringEnum<T extends readonly string[]>(
	values: T,
	description?: string,
) {
	return Type.Unsafe<T[number]>({
		type: "string",
		enum: [...values],
		...(description ? { description } : {}),
	});
}

/** Key precedence: env JEV_API_KEY wins, ~/.pi/agent/jev.json otherwise. */
async function resolveKey(): Promise<string> {
	const env = process.env.JEV_API_KEY;
	if (env) return env;
	try {
		const raw = JSON.parse(await readFile(JEV_KEY_FILE, "utf8")) as {
			apiKey?: string;
		};
		if (raw.apiKey) return raw.apiKey;
	} catch {
		// unreadable or absent file → missing key below
	}
	throw new Error("No Jev key — run /jev-connect (console.typesafe.ai)");
}

/** POST one batched question map to the Jev System One API with an explicit key
 *  (so /jev-connect can validate a freshly entered key before saving). */
async function jevRequest(
	key: string,
	state: string,
	questions: Record<string, object>,
	signal?: AbortSignal,
): Promise<JevResponse> {
	let response: Response;
	try {
		response = await fetch(JEV_ENDPOINT, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${key}`,
			},
			body: JSON.stringify({ state, model: JEV_MODEL, questions }),
			signal: AbortSignal.any([
				AbortSignal.timeout(JEV_TIMEOUT_MS),
				...(signal ? [signal] : []),
			]),
		});
	} catch (cause) {
		// Esc-cancel aborts the caller signal; the 10s timeout throws TimeoutError instead.
		if (signal?.aborted) throw new Error("Jev call cancelled");
		throw new Error(
			`Jev unavailable, try again later (${cause instanceof Error ? cause.message : String(cause)})`,
		);
	}
	if (response.ok) return (await response.json()) as JevResponse;
	const { status } = response;
	if (status === 429 || status >= 500) {
		throw new Error(`Jev unavailable, try again later (HTTP ${status})`);
	}
	if (status === 401 || status === 403) {
		throw new Error("Jev key rejected — run /jev-connect");
	}
	if (status === 422) {
		let apiMessage = await response.text().catch(() => "");
		try {
			const parsed = JSON.parse(apiMessage) as {
				error?: { message?: string };
				message?: string;
			};
			apiMessage = parsed.error?.message ?? parsed.message ?? apiMessage;
		} catch {
			// non-JSON body is the best available message
		}
		throw new Error(
			`Jev rejected the request: ${apiMessage || response.statusText}`,
		);
	}
	throw new Error(`Jev rejected the request: ${status} ${response.statusText}`);
}

/** callJev resolves the configured key and sends the request. */
async function callJev(
	state: string,
	questions: Record<string, object>,
	signal?: AbortSignal,
): Promise<JevResponse> {
	return jevRequest(await resolveKey(), state, questions, signal);
}

/** Convert the tool's questions array into Jev's id-keyed request map: choice
 *  options → criteria map, score scale → criteria array, noul takes neither. */
export function toQuestionMap(
	questions: JevQuestionInput[],
): Record<string, object> {
	return Object.fromEntries(
		questions.map(({ id, options, scale, ...rest }) => [
			id,
			options
				? { ...rest, criteria: options }
				: scale
					? { ...rest, criteria: scale }
					: rest,
		]),
	);
}

const fmt = (n: number, digits = 2) => n.toFixed(digits);

function formatChoice(id: string, answer: JevAnswer): string {
	const probs = Object.entries(answer.probabilities ?? {}).sort(
		(a, b) => b[1] - a[1],
	);
	const top = probs[0];
	const second = probs[1];
	const confidence = answer.confidence ?? 0;
	if (
		top &&
		second &&
		(top[1] - second[1] <= NEAR_TIE_DELTA || confidence < NEAR_TIE_CONFIDENCE)
	) {
		return `${id} → ${top[0]} (${fmt(top[1])}) ≈ ${second[0]} (${fmt(second[1])}) · NEAR-TIE — consider asking the user`;
	}
	if (top) {
		return `${id} → ${top[0]} (confidence ${fmt(confidence)}) · next: ${second ? `${second[0]} ${fmt(second[1])}` : "n/a"}`;
	}
	// Contract-permitted: choice answer without probabilities — winner field only.
	if (answer.choice) return `${id} → ${answer.choice} (confidence ${fmt(confidence)})`;
	return `${id} → no answer`;
}

function formatScore(id: string, answer: JevAnswer): string {
	const score = typeof answer.score === "number" ? answer.score : NaN;
	// Jev returns legend as an object keyed by level index (e.g. {"0": "Calm"});
	// tolerate an array too.
	const legend = Array.isArray(answer.legend)
		? answer.legend
		: Object.entries(answer.legend ?? {})
				.sort(([a], [b]) => Number(a) - Number(b))
				.map(([, label]) => label);
	const index = Number.isFinite(score)
		? Math.max(0, Math.min(legend.length - 1, Math.round(score)))
		: -1;
	const label = legend[index] === undefined ? "" : ` "${legend[index]}"`;
	return `${id} → ${fmt(score, 1)}${label} (confidence ${fmt(answer.confidence ?? 0)})`;
}

function formatNoul(id: string, answer: JevAnswer): string {
	const p =
		typeof answer.noul === "number"
			? answer.noul
			: (answer.probabilities?.yes ?? 0);
	return `${id} → ${p >= 0.5 ? "yes" : "no"} ${fmt(p)}`;
}

/** One compact line per Jev answer, per the settled result format. */
export function formatAnswer(id: string, answer: JevAnswer): string {
	if (answer.type === "score") return formatScore(id, answer);
	if (answer.type === "noul") return formatNoul(id, answer);
	return formatChoice(id, answer);
}

/** pi Usage shape (full, not Jev's raw tokens — wrong shape fails silently as
 *  NaN in the footer). Input at $0.042/MTok; Jev output is free. */
function toUsage(usage: JevResponse["usage"]) {
	const input = usage?.input_tokens ?? 0;
	const output = usage?.output_tokens ?? 0;
	const costInput = (input / 1_000_000) * JEV_INPUT_USD_PER_MTOK;
	return {
		input,
		output,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: input + output,
		cost: {
			input: costInput,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			total: costInput,
		},
	};
}

function validateQuestions(questions: JevQuestionInput[]): void {
	for (const q of questions) {
		if (q.type === "choice") {
			const entries = Object.keys(q.options ?? {}).length;
			if (entries < 1 || entries > 255) {
				throw new Error(
					`Question "${q.id}": choice type requires options with 1–255 entries`,
				);
			}
		} else if (q.type === "score" && (q.scale?.length ?? 0) < 2) {
			throw new Error(
				`Question "${q.id}": score type requires a scale of at least 2 levels`,
			);
		}
	}
}

const questionSchema = Type.Object({
	id: Type.String({
		description: "Unique id for this question; answers are keyed by it",
	}),
	type: StringEnum(
		["choice", "score", "noul"] as const,
		"choice = pick one option (requires options); score = rate on an ordered scale (requires scale); noul = yes/no probability",
	),
	instructions: Type.String({
		description:
			"One specific, well-scoped question; decompose complex decisions into atomic questions",
	}),
	options: Type.Optional(
		Type.Record(Type.String(), Type.String(), {
			description: "choice only: option name → short description (1–255 entries)",
		}),
	),
	scale: Type.Optional(
		Type.Array(Type.String(), {
			description:
				"score only: ordered level descriptions, lowest first (2+ entries)",
		}),
	),
});

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "jev_advise",
		label: "Jev Advisor",
		description:
			"Delegate a decision to the Jev System One API. Send a batch of typed questions with concrete context and get typed probabilistic answers: choice (winner + distribution + confidence), score (rating against an ordered scale of levels), noul (yes/no probability). One line per answer; near-tied or low-confidence results are flagged NEAR-TIE and should go to the user instead.",
		promptSnippet:
			"Consult Jev for decisions: development choices, framing questions for the user, and code-quality self-checks.",
		promptGuidelines: [
			"When making a development decision — approach, library, algorithm, data shape, strategy — call jev_advise with the concrete facts as `context` instead of deciding from assumptions; decompose the decision into atomic questions and batch them in one call.",
			"Before asking the user anything, call jev_advise to choose and frame the question (options = candidate questions); the user's answer, not jev_advise, is the decision.",
			"After writing or refactoring non-trivial code, call jev_advise with the diff/code as `context` and a score-type question against explicit quality levels to check whether the code is as good as it can be; revise on low scores instead of defending.",
			"When jev_advise reports a NEAR-TIE or low confidence, treat the decision as user-facing: present the tied options to the user.",
		],
		parameters: Type.Object({
			context: Type.String({
				description:
					"Full concrete facts the questions are about — code, diffs, constraints, prior results; becomes Jev's working state",
			}),
			questions: Type.Array(questionSchema, {
				description:
					"Batch of atomic questions, all answered in one call (~10x cheaper than separate calls)",
			}),
		}),
		async execute(_toolCallId, params, signal) {
			validateQuestions(params.questions);
			const response = await callJev(
				params.context,
				toQuestionMap(params.questions),
				signal,
			);
			const text = params.questions
				.map((q) => {
					const answer = response.answers[q.id];
					return answer ? formatAnswer(q.id, answer) : `${q.id} → no answer`;
				})
				.join("\n");
			return {
				content: [{ type: "text" as const, text }],
				details: { answers: response.answers, usage: response.usage },
				usage: toUsage(response.usage),
			};
		},
		renderCall(args, theme) {
			const count = Array.isArray(args?.questions) ? args.questions.length : 0;
			return new Text(
				theme.fg("toolTitle", theme.bold("jev_advise ")) +
					theme.fg("muted", `${count} question${count === 1 ? "" : "s"}`),
				0,
				0,
			);
		},
		renderResult(result, _options, theme, context) {
			const first = result.content[0];
			const line = first?.type === "text" ? (first.text.split("\n")[0] ?? "") : "";
			return new Text(
				context.isError ? theme.fg("error", line) : theme.fg("success", line),
				0,
				0,
			);
		},
	});

	pi.registerCommand("jev-connect", {
		description: "Validate and save the Jev API key (console.typesafe.ai)",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify(
					`No UI available — set the JEV_API_KEY env var or write {"apiKey": "..."} to ${JEV_KEY_FILE}`,
					"warning",
				);
				return;
			}
			let key: string | undefined;
			try {
				key = await ctx.ui.input(
					"Jev API key (get one at console.typesafe.ai):",
				);
			} catch (cause) {
				ctx.ui.notify(
					`Key prompt failed: ${cause instanceof Error ? cause.message : String(cause)}`,
					"error",
				);
				return;
			}
			if (key === undefined) {
				ctx.ui.notify("Cancelled", "info");
				return;
			}
			try {
				// Live validation with the entered key (env/file key must not shadow it).
				await jevRequest(key.trim(), "", {
					connect_check: {
						type: "noul",
						instructions: "Connectivity check. Answer yes.",
					},
				});
			} catch (cause) {
				ctx.ui.notify(
					cause instanceof Error ? cause.message : String(cause),
					"error",
				);
				return;
			}
			try {
				// mode 0o600 closes the create-time window (umask default would be 644).
				await writeFile(
					JEV_KEY_FILE,
					`${JSON.stringify({ apiKey: key.trim() })}\n`,
					{ mode: 0o600 },
				);
				await chmod(JEV_KEY_FILE, 0o600);
			} catch (cause) {
				ctx.ui.notify(
					`Failed to save Jev key — not saved (${cause instanceof Error ? cause.message : String(cause)})`,
					"error",
				);
				return;
			}
			ctx.ui.notify(
				`Jev key valid — saved to ${JEV_KEY_FILE} (mode 600)\nendpoint: ${JEV_ENDPOINT}\nmodel: ${JEV_MODEL}`,
				"info",
			);
		},
	});
}
