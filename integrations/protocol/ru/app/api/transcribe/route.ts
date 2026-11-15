import {nativeAudioGuard} from '@/lib/concilium-privacy';
import { NextRequest, NextResponse } from 'next/server';
import { getSpeechProvider } from '@/lib/speech-provider';
import { AUDIO_TRANSCRIPTION_PRICE_PER_MINUTE } from '@/lib/cost-calculator';
import { maybeApplyRoleDiarization } from '@/lib/stt-role-diarization';
import { runWithLlmProvider } from '@/lib/llm-provider';

/**
 * API endpoint для транскрипции аудио.
 * Используется Polza STT с модельным fallback:
 * primary: aiesa/transcribe -> fallback: openai/whisper-large-v3.
 */
export async function POST(request: NextRequest) {
  const privacyError=await nativeAudioGuard(request);if(privacyError)return privacyError;
  const formData = await request.formData();
  return runWithLlmProvider(formData.get('provider'), () => transcribeAudio(formData));
}

async function transcribeAudio(formData: FormData) {
  try {
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No audio file provided' },
        { status: 400 }
      );
    }

    console.log('📁 Получен файл:', {
      name: file.name,
      type: file.type,
      size: file.size,
      sizeInMB: (file.size / 1024 / 1024).toFixed(2)
    })

    // Проверка размера файла (максимум 500MB)
    if (file.size > 500 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'File is too large (maximum 500MB)' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    let mimeType = file.type || 'audio/webm';
    
    // Если MIME тип не определен или octet-stream, пытаемся определить по расширению
    if (!mimeType || mimeType === 'application/octet-stream' || mimeType === '') {
      const extension = file.name.split('.').pop()?.toLowerCase()
      if (extension === 'webm') {
        mimeType = 'audio/webm'
      } else if (extension === 'mp4' || extension === 'm4a') {
        mimeType = 'audio/mp4'
      } else if (extension === 'ogg') {
        mimeType = 'audio/ogg'
      } else if (extension === 'wav') {
        mimeType = 'audio/wav'
      } else if (extension === 'mp3') {
        mimeType = 'audio/mpeg'
      } else {
        mimeType = 'audio/webm'
      }
      console.log(`🔧 MIME тип не определен, использую: ${mimeType} (по расширению: ${extension})`)
    }

    // Получаем провайдер Polza STT (Aiesa primary + Whisper fallback)
    const provider = getSpeechProvider();
    console.log(`🚀 Транскрипция через ${provider.name} с MIME:`, mimeType)

    const { text, duration, costUsd } = await provider.transcribe(arrayBuffer, mimeType);
    const diarizedText = await maybeApplyRoleDiarization(text);

    // Расчет стоимости
    const durationMinutes = duration / 60;
    const cost = typeof costUsd==='number'?costUsd*100:process.env.CONCILIUM_OPENROUTER_ONLY==='1'?0:Math.max(0.1, durationMinutes * AUDIO_TRANSCRIPTION_PRICE_PER_MINUTE);

    console.log(`✅ Транскрипция завершена (${provider.name})`, { duration, cost })

    return NextResponse.json({
      success: true,
      transcript: diarizedText,
      duration: duration,
      cost: cost,
      provider: provider.name
    });
  } catch (error: any) {
    console.error('Error transcribing audio:', error);
    const cause = error?.cause?.code || error?.cause?.message || ''
    const connectFailed = /CONNECT_TIMEOUT|fetch failed|ETIMEDOUT|ECONNRESET/i.test(`${error?.message || ''} ${cause}`)
    return NextResponse.json(
      {
        success: false,
        error: connectFailed
          ? 'Нет соединения с сервисом расшифровки. Повторите запись через несколько секунд.'
          : (error?.message || 'Не удалось расшифровать запись'),
      },
      { status: 500 }
    );
  }
}

