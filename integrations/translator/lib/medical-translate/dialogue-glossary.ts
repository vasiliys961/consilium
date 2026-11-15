import { ENGLISH_MEDICAL_VARIANTS, ENGLISH_INTERPRETATION_RULES } from './english-reference'
import data from './dialogue-glossary.json'
import { hasMedicalGlossary } from './coverage'

export const DIALOGUE_MEDICAL_GLOSSARY = data.entries

export function medicalPairGlossary(first: string, second: string): string {
  const selected = [...new Set([first, second])].filter(hasMedicalGlossary)
  if (!selected.length) return ''
  const rows = data.entries.map(entry => {
    const terms = entry.terms as Record<string, string>
    return `${entry.id}: ${selected.map(code => `${code}=${terms[code]}${code === 'en' && ENGLISH_MEDICAL_VARIANTS[entry.id] ? ` (also: ${ENGLISH_MEDICAL_VARIANTS[entry.id].join('; ')})` : ''}`).join(' <=> ')}`
  })
  return `\n\n# Basic medical terminology reference\nThese are terminology hints, not speech to recite. Use a term only when its meaning matches the source. Use natural inflections; preserve the original meaning, uncertainty and level of detail. Do not add a diagnosis, drug, explanation, acronym or treatment that was not spoken. Never replace one medicine with another, confuse micrograms and milligrams, convert units or change a dose. Do not expand ambiguous abbreviations. Output ONLY the other selected language. For an uncovered language, use its established medical terminology without claiming glossary coverage.\n${rows.join('\n')}${selected.includes('en') ? ENGLISH_INTERPRETATION_RULES : ''}`
}
