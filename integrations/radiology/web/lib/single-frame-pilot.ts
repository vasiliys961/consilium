/** An explicit one-frame paid smoke test must not silently expand to a study. */
export function singleFramePilotAllowed(
  selectedIndices: readonly number[],
  batches: readonly {indices: readonly number[]}[],
): boolean {
  return selectedIndices.length === 1 && batches.length === 1 &&
    batches[0].indices.length === 1 &&
    batches[0].indices[0] === selectedIndices[0];
}
