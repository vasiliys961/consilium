/**
 * Универсальный интерфейс провайдера транскрипции речи.
 * В текущем режиме используется Polza STT:
 * - primary: aiesa/transcribe
 * - fallback: openai/whisper-large-v3
 */

export interface TranscriptionResult {
  costUsd?:number;
  text: string;
  duration: number; // Длительность аудио в секундах
}

export interface SpeechProvider {
  readonly name: string;
  transcribe(audioData: ArrayBuffer, mimeType?: string): Promise<TranscriptionResult>;
}

/**
 * Возвращает актуальный провайдер транскрипции.
 * Источник всегда Polza STT с внутренним fallback по модели.
 */
export function getSpeechProvider(): SpeechProvider {
  if(process.env.CONCILIUM_OPENROUTER_ONLY==='1'){const {ConciliumOpenRouterSpeech}=require('./concilium-openrouter-speech');return new ConciliumOpenRouterSpeech();}
  const { PolzaSpeechProvider } = require('./polza-speech');
  return new PolzaSpeechProvider();
}
