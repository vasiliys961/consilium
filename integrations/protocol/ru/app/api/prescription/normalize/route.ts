import {nativePrivacyGuard} from '@/lib/concilium-privacy';
import { NextRequest, NextResponse } from 'next/server'
import { MODELS, sendTextRequest } from '@/lib/openrouter'
import { runWithLlmProvider } from '@/lib/llm-provider'

type PrescriptionForm = 'Tab.' | 'Sol.' | 'Ung.' | 'Caps.' | 'Supp.' | 'Gtt.'
type SourceType = 'mnn' | 'brand' | 'unknown'

type MedicationInput = {
  drugDisplayName: string
  dosage: string
  form: PrescriptionForm
  signa: string
  sourceType: SourceType
  sourceLine: string
}

type MedicationOutput = {
  drugDisplayName: string
  dosage: string
  form: PrescriptionForm
  signa: string
  dispenseCount: number
}

const ALLOWED_FORMS: PrescriptionForm[] = ['Tab.', 'Sol.', 'Ung.', 'Caps.', 'Supp.', 'Gtt.']

function extractJsonObject(raw: string): any {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim() || raw
  const objectMatch = candidate.match(/\{[\s\S]*\}/)
  const payload = objectMatch ? objectMatch[0] : candidate
  return JSON.parse(payload)
}

function defaultDispenseCount(form: PrescriptionForm): number {
  if (form === 'Ung.' || form === 'Gtt.') return 1
  if (form === 'Sol.') return 10
  return 20
}

function readDispenseCount(value: unknown, form: PrescriptionForm): number {
  const parsed = Number(String(value ?? '').replace(/[^\d]/g, ''))
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 120) return Math.round(parsed)
  return defaultDispenseCount(form)
}

function sanitizeMedication(item: any, fallback?: Partial<MedicationInput>): MedicationOutput | null {
  const form: PrescriptionForm = ALLOWED_FORMS.includes(item?.form)
    ? item.form
    : (ALLOWED_FORMS.includes(fallback?.form as PrescriptionForm) ? fallback?.form as PrescriptionForm : 'Tab.')
  const drugDisplayName =
    typeof item?.drugDisplayName === 'string' && item.drugDisplayName.trim()
      ? item.drugDisplayName.trim()
      : (fallback?.drugDisplayName || '')
  const dosage =
    typeof item?.dosage === 'string' && item.dosage.trim()
      ? item.dosage.trim()
      : (fallback?.dosage || '____')
  let signa =
    typeof item?.signa === 'string' && item.signa.trim()
      ? item.signa.trim()
      : (fallback?.signa || 'S.: По схеме врача.')

  const sanitizeDosageByForm = (rawDosage: string, targetForm: PrescriptionForm) => {
    const normalized = (rawDosage || '').replace(/\s+/g, ' ').trim()
    const low = normalized.toLowerCase()

    if (targetForm !== 'Sol.') {
      return normalized || '____'
    }

    const mgPerMl = low.match(/(\d+(?:[.,]\d+)?)\s*mg\s*\/\s*ml/i)
    const percent = low.match(/(\d+(?:[.,]\d+)?)\s*%/i)
    const ml = low.match(/(\d+(?:[.,]\d+)?)\s*ml\b/i)
    const mgOnly = low.match(/(\d+(?:[.,]\d+)?)\s*mg\b/i)

    if (mgPerMl) {
      const conc = `${mgPerMl[1].replace('.', ',')} mg/ml`
      const vol = ml ? `${ml[1].replace('.', ',')} ml` : '____ ml'
      return `${conc} — ${vol}`
    }
    if (percent) {
      const conc = `${percent[1].replace('.', ',')}%`
      const vol = ml ? `${ml[1].replace('.', ',')} ml` : '____ ml'
      return `${conc} — ${vol}`
    }
    if (mgOnly && ml) {
      return `${mgOnly[1].replace('.', ',')} mg/ml — ${ml[1].replace('.', ',')} ml`
    }

    // Для растворов не допускаем формат "в граммах" в итоговом Rp.
    return ml ? `____% — ${ml[1].replace('.', ',')} ml` : '____% — ____ ml'
  }

  if (!signa.toLowerCase().startsWith('s.:')) {
    signa = `S.: ${signa}`
  }

  if (!drugDisplayName || /[а-яё]/i.test(drugDisplayName)) return null

  return {
    drugDisplayName,
    dosage: sanitizeDosageByForm(dosage, form),
    form,
    signa,
    dispenseCount: readDispenseCount(item?.dispenseCount, form)
  }
}

export async function POST(request: NextRequest) {
  const privacyError=await nativePrivacyGuard(request);if(privacyError)return privacyError;
  const body = await request.json()
  return runWithLlmProvider(body?.provider, async () => {
  try {
    const items = Array.isArray(body?.items) ? (body.items as MedicationInput[]) : []
    const protocol = String(body?.protocol || '').trim().slice(0, 14000)
    if (!items.length && !protocol) {
      return NextResponse.json({ success: true, items: [] })
    }

    const cappedItems = items.slice(0, 18)
    const model = process.env.PRESCRIPTION_NORMALIZER_MODEL?.trim() || MODELS.HAIKU

    const systemPrompt = `Ты врач, оформляющий рецепт по форме № 107-1/у (приказ Минздрава России от 24.11.2021 № 1094н).
Собери только лекарственные назначения из протокола. Немедикаментозное лечение не включай.

Правила строки рецепта:
1) drugDisplayName — МНН на латыни в родительном падеже единственного числа, как в фармакопее.
   Примеры: Amoxicillinum → Amoxicillini; Ibuprofenum → Ibuprofeni; Omeprazolum → Omeprazoli; Metforminum → Metformini.
   Торговое название заменяй на МНН. Кириллицу в названии не оставляй.
2) dosage — доза одной лекарственной формы для Rp.:
   таблетки и капсулы в граммах с запятой (500 мг = 0,5; 250 мг = 0,25; 100 мг = 0,1; 50 мг = 0,05; 10 мг = 0,01);
   растворы: концентрация и объём, например "0,9% — 200 ml" или "5 mg/ml — 2 ml";
   мази и капли: концентрация, если она есть, иначе масса или объём упаковки.
3) form — одно из Tab. | Sol. | Ung. | Caps. | Supp. | Gtt.
4) dispenseCount — целое число доз для D.t.d. N.: курс по кратности и длительности из текста; если длительности нет, обычная упаковка (таблетки/капсулы 20, раствор 10, мазь и капли 1). Не больше 120.
5) signa — по-русски, начинается с "S.:", путь введения, разовая доза и кратность. Не выдумывай экстремальные дозы.
6) Не добавляй препараты, которых нет в протоколе или во входных строках.

Ответ ТОЛЬКО JSON:
{
  "items": [
    { "drugDisplayName": "Amoxicillini", "dosage": "0,5", "form": "Tab.", "dispenseCount": 20, "signa": "S.: Внутрь по 1 таблетке 3 раза в день." }
  ]
}`

    const userPrompt = `Оформи рецептурные прописи.
Протокол:
${protocol || 'не передан'}

Уже распознанные строки, если есть:
${JSON.stringify(cappedItems, null, 2)}`

    const content = await sendTextRequest(userPrompt, [], model, undefined, systemPrompt)
    const parsed = extractJsonObject(content)
    const aiItems = Array.isArray(parsed?.items) ? parsed.items : []
    const normalized = aiItems
      .map((item: any, idx: number) => sanitizeMedication(item, cappedItems[idx]))
      .filter((item: MedicationOutput | null): item is MedicationOutput => Boolean(item?.drugDisplayName))
      .slice(0, 18)

    return NextResponse.json({ success: true, items: normalized })
  } catch (error: any) {
    console.error('❌ [PRESCRIPTION NORMALIZE]', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'normalize_failed' },
      { status: 500 }
    )
  }
  })
}
