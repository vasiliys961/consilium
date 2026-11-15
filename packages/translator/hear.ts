import { MODELS } from "../../lib/cost.ts";
import { complete } from "../../lib/gateway.ts";
import { hearWindow, wavDurationSeconds } from "./wav.ts";

const HEAR_PROMPT =
  "Transcribe the spoken words in their own language. Keep every number, unit, and drug name. Do not translate. Do not add a diagnosis. Output only the transcript.";

export interface HeardPhrase {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export function speechSource(typed: string, heard: string | null): string {
  const text = typed.replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 4000);
  return (heard ?? "").replace(/\s+/g, " ").trim().slice(0, 4000);
}

/** A short wav becomes a transcript. The translation stays on the text path. */
export async function hearClip(
  env: Record<string, string | undefined>,
  audio: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HeardPhrase | null> {
  if (hearWindow(wavDurationSeconds(audio)) !== "short") return null;
  const data = audio.replace(/^data:audio\/wav;base64,/, "").replace(/\s/g, "");
  const turn = await complete(
    env,
    {
      model: MODELS.pro,
      maxTokens: 800,
      messages: [
        { role: "system", content: HEAR_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Transcript:" },
            { type: "input_audio", input_audio: { data, format: "wav" } },
          ],
        },
      ],
    },
    fetchImpl,
  ).catch(() => null);
  const text = turn?.text.replace(/\s+/g, " ").trim().slice(0, 4000) ?? "";
  if (!turn || !text) return null;
  return { text, model: turn.model, inputTokens: turn.inputTokens, outputTokens: turn.outputTokens, durationMs: turn.durationMs };
}
