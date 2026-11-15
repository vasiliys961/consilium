import { downsample, HEAR_MAX_SECONDS, hearWindow, wavBase64, wavDurationSeconds } from '../packages/translator/wav.ts';

export async function recordConsultQuestion(signal: AbortSignal, receive: (clip: string | null) => void) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  let context: AudioContext | undefined;
  try {
    signal.throwIfAborted();
    context = new AudioContext();
    const audio = context;
    const source = audio.createMediaStreamSource(stream);
    const processor = audio.createScriptProcessor(4096, 1, 1);
    const silent = audio.createGain();
    silent.gain.value = 0;
    const chunks: Float32Array[] = [];
    const limit = audio.sampleRate * HEAR_MAX_SECONDS;
    let samples = 0;
    let stopped = false;
    const finish = () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      processor.disconnect();
      source.disconnect();
      silent.disconnect();
      stream.getTracks().forEach(track => track.stop());
      void audio.close().catch(() => {});
      if (signal.aborted) return;
      const merged = new Float32Array(samples);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      const rate = Math.min(audio.sampleRate, 16000);
      const clip = wavBase64(downsample(merged, audio.sampleRate, rate), rate);
      receive(hearWindow(wavDurationSeconds(clip)) === 'short' ? clip : null);
    };
    processor.onaudioprocess = event => {
      const chunk = event.inputBuffer.getChannelData(0).slice(0, limit - samples);
      chunks.push(chunk);
      samples += chunk.length;
      if (samples >= limit) finish();
    };
    source.connect(processor);
    processor.connect(silent);
    silent.connect(audio.destination);
    const timer = setTimeout(finish, HEAR_MAX_SECONDS * 1000);
    signal.addEventListener('abort', finish, { once: true });
    void audio.resume().catch(finish);
    return finish;
  } catch (error) {
    stream.getTracks().forEach(track => track.stop());
    if (context) void context.close().catch(() => {});
    throw error;
  }
}
