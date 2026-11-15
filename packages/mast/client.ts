import type { Locale } from "../../lib/locale.ts";
import { deadlineOf } from "../../lib/queue.ts";

export async function submitCase(
  origin: string,
  input: { text?: string; locale?: Locale; files?: unknown[]; deadlineMs?: number },
  fetchImpl: typeof fetch = fetch,
) {
  const deadlineMs = deadlineOf(input.deadlineMs);
  const response = await fetchImpl(new URL("/api/v1/cases", origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: input.text ?? "",
      files: input.files ?? [],
      locale: input.locale ?? "en",
      retain: false,
      deadlineMs,
    }),
  });
  return { status: response.status, body: await response.json() };
}
