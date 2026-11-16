/**
 * The speaker label assigned by an audio STT provider is local to its chunk.
 * Never allow "Speaker 0" from two different recorder files to appear to
 * identify the same person across a long consultation.
 */
export function scopeAmbientSpeakers(transcript: string, chunkIndex: number): string {
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) throw Error('Invalid audio chunk index');
  const chunk = chunkIndex + 1;
  return transcript.replace(/^\s*Speaker\s+([^:\n]{1,24}):/gim, (_whole, id: string) =>
    `Chunk ${chunk} / Speaker ${id.trim()}:`);
}
