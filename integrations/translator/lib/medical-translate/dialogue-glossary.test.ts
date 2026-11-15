import { ENGLISH_MEDICAL_VARIANTS } from './english-reference'
import { MEDICAL_GLOSSARY, entryAppears } from './glossary'
import { assessMedicalFidelity } from './fidelity'
import { expect, it } from 'vitest'
import { MEDICAL_GLOSSARY_LANGUAGES, hasMedicalGlossary } from './coverage'
import { DIALOGUE_MEDICAL_GLOSSARY, medicalPairGlossary } from './dialogue-glossary'
import { dialogueRealtimeSession } from '../dialogue-realtime-session'

it('has nonempty terminology for every language carrying the coverage mark', () => {
  expect(MEDICAL_GLOSSARY_LANGUAGES).toHaveLength(11)
  expect(DIALOGUE_MEDICAL_GLOSSARY).toHaveLength(331)
  for (const row of DIALOGUE_MEDICAL_GLOSSARY) {
    expect(Object.keys(row.terms).sort()).toEqual([...MEDICAL_GLOSSARY_LANGUAGES].sort())
    for (const code of MEDICAL_GLOSSARY_LANGUAGES) expect(row.terms[code].trim().length).toBeGreaterThan(0)
  }
  expect(hasMedicalGlossary('de')).toBe(false)
})

it('provides only selected language terminology and keeps drug and dose rules', () => {
  const reference = medicalPairGlossary('ru', 'en')
  expect(reference).toContain('insulin: ru=инсулин <=> en=insulin')
  expect(reference).toContain('mcg: ru=микрограмм <=> en=microgram')
  expect(reference).not.toContain('ar=')
  expect(reference).not.toContain('zh=')
  expect(reference).toContain('Never replace one medicine with another')
  expect(reference).toContain('Do not add a diagnosis')
  expect(medicalPairGlossary('de', 'ja')).toBe('')
  expect(medicalPairGlossary('ru', 'de')).not.toContain('undefined')
})

it('attaches the glossary to actual voice sessions for every covered language', () => {
  for (const code of MEDICAL_GLOSSARY_LANGUAGES) {
    const other = code === 'en' ? 'ru' : 'en'
    const session = dialogueRealtimeSession(code, other)
    expect(session.instructions).toContain('# Basic medical terminology reference')
    expect(session.instructions).toContain(`${code}=`)
    expect(session.audio.input.turn_detection.create_response).toBe(true)
  }
})


it('preserves every legacy concept without duplicate IDs or expanding ambiguous abbreviations', () => {
  expect(new Set(DIALOGUE_MEDICAL_GLOSSARY.map(x => x.id)).size).toBe(DIALOGUE_MEDICAL_GLOSSARY.length)
  for (const id of ['ms', 'cp']) {
    const entry = DIALOGUE_MEDICAL_GLOSSARY.find(x => x.id === id)!
    for (const term of Object.values(entry.terms)) expect(term.toUpperCase()).toBe(id.toUpperCase())
  }
})


it('includes English variants only when English is selected', () => {
  const reference = medicalPairGlossary('ru', 'en')
  expect(reference).toContain('acetaminophen')
  expect(reference).toContain('oedema')
  expect(reference).toContain('HbA1c')
  expect(reference).toContain('# English medical interpretation')
  expect(medicalPairGlossary('ru', 'fr')).not.toContain('# English medical interpretation')
  expect(medicalPairGlossary('ru', 'fr')).not.toContain('(also:')
  const ids = new Set(DIALOGUE_MEDICAL_GLOSSARY.map(row => row.id))
  for (const id of Object.keys(ENGLISH_MEDICAL_VARIANTS)) expect(ids.has(id)).toBe(true)
})

it('recognizes English spelling and drug equivalents without equating different diagnoses', () => {
  expect(assessMedicalFidelity({ source: 'I take acetaminophen.', translation: 'Я принимаю парацетамол.' }).findings).toEqual([])
  expect(assessMedicalFidelity({ source: 'I take albuterol.', translation: 'Я принимаю сальбутамол.' }).findings).toEqual([])
  const edema = MEDICAL_GLOSSARY.terms.find(row => row.id === 'edema')!
  expect(entryAppears('oedema', edema.forms)).toBe(true)
  const arrhythmia = MEDICAL_GLOSSARY.terms.find(row => row.id === 'arrhythmia')!
  expect(entryAppears('atrial fibrillation', arrhythmia.forms)).toBe(false)
  const infarction = MEDICAL_GLOSSARY.terms.find(row => row.id === 'myocardial-infarction')!
  expect(entryAppears('cardiac arrest', infarction.forms)).toBe(false)
})
