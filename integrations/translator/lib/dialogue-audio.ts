export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytes = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(bytes)
  const text = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE')
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  text(36, 'data'); view.setUint32(40, samples.length * 2, true)
  samples.forEach((value, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, value)) * 0x7fff), true))
  return new Blob([bytes], { type: 'audio/wav' })
}
