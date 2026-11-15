export const MAX_DEADLINE_MS = 300_000;
export const CASE_QUEUE_LIMIT = 2;

export function deadlineOf(value: unknown): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : MAX_DEADLINE_MS;
  if (parsed <= 0) return MAX_DEADLINE_MS;
  return Math.min(parsed, MAX_DEADLINE_MS);
}

export function createQueue(limit = CASE_QUEUE_LIMIT) {
  let active = 0;
  return {
    tryEnter(): (() => void) | null {
      if (active >= limit) return null;
      active += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        active -= 1;
      };
    },
  };
}

export const caseQueue = createQueue();
