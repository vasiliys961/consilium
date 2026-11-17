import {nativePrivacyGuard} from '@/lib/concilium-privacy';
import { NextRequest, NextResponse } from 'next/server'
import { MODELS, sendTextRequest } from '@/lib/openrouter'
import { runWithLlmProvider } from '@/lib/llm-provider'

const DEFAULT_DRAFT_MODEL = process.env.PROTOCOL_DIALOGUE_DRAFT_MODEL?.trim() || 'anthropic/claude-haiku-5.5' // C14: extraction only, not the final note writer
const FALLBACK_DRAFT_MODEL = MODELS.GEMINI_3_FLASH

function buildDialogueDraftPrompt(params: { transcript: string; specialistName?: string }): string {
  const { transcript, specialistName } = params
  // These T-identifiers use the same line enumeration as protocolDocumentMessage.
  const numberedTranscript = transcript.replace(/\r\n?/g,'\n').split('\n').filter(Boolean).map((line,index)=>`[T${index+1}] ${line}`).join('\n')
  return `Ты медицинский ассистент по первичному структурированию данных приёма.
Задача: из транскрипта беседы "врач-пациент" собрать черновик для дальнейшего заполнения протокола.
Специальность врача: ${specialistName || 'терапевт'}.

ВАЖНО:
- Это только черновик из жалоб/анамнеза, без финального диагноза и без назначения окончательной терапии.
- Если данных нет — явно пиши "НЕТ ДАННЫХ", чтобы врач быстро дополнил.
- Не придумывай факты. Используй только то, что есть в беседе.
- Сохраняй отрицания, названия препаратов, дозировки, единицы и длительности точно. Врачебный вопрос не означает, что пациент подтвердил симптом.
- "Speaker 0/1" и "Говорящий 0/1" — акустические метки, НЕ подтверждённые роли врача и пациента. При сомнении пиши "роль не подтверждена".
- Каждый извлечённый клинический факт сопровождай [T1], [T2] и т.д. — номером исходной строки. Не выдумывай ссылки и не добавляй факты без источника.
- Противоречия, неразборчивые лекарства, отрицания и дозы перечисли отдельно для перепроверки врачом.
- Пиши на русском, без markdown, без списков с "*", только обычный текст.

Верни текст строго по структуре:
Жалобы:
...

Анамнез заболевания:
...

Анамнез жизни:
...

Лекарства/аллергии из беседы:
...

Объективные данные (что уже есть в беседе):
...

Что врачу нужно дозаполнить объективно:
1. ...
2. ...

Требует проверки врачом (с исходными цитатами [Tn]):
...

Исходные строки беседы (Tn; роли не подтверждены):
${numberedTranscript}`
}

export async function POST(request: NextRequest) {
  const privacyError=await nativePrivacyGuard(request);if(privacyError)return privacyError;
  const body = await request.json()
  return runWithLlmProvider(body?.provider, async () => {
  try {
    const transcriptRaw = String(body?.transcript || '')
    const specialistName = String(body?.specialistName || '')
    const transcript = transcriptRaw.trim()

    if (!transcript) {
      return NextResponse.json({ success: false, error: 'Транскрипт пуст' }, { status: 400 })
    }

    const prompt = buildDialogueDraftPrompt({ transcript, specialistName })
    let modelUsed = DEFAULT_DRAFT_MODEL
    let draft = ''

    try {
      draft = await sendTextRequest(prompt, [], modelUsed)
    } catch (primaryError) {
      modelUsed = FALLBACK_DRAFT_MODEL
      draft = await sendTextRequest(prompt, [], modelUsed)
    }

    draft = String(draft || '').trim()
    if (!draft) {
      return NextResponse.json({ success: false, error: 'Не удалось сформировать черновик' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      draft,
      modelUsed,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Ошибка формирования черновика' },
      { status: 500 }
    )
  }
  })
}

