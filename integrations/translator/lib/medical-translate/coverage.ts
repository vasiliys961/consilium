// ◆ indicates a basic terminology reference sent to the dialogue model.
// It does not certify translation quality or completeness of fidelity checks.
export const MEDICAL_GLOSSARY_LANGUAGES = ['ru', 'en', 'es', 'fr', 'ar', 'hi', 'pt', 'id', 'ms', 'tr', 'zh'] as const
export function hasMedicalGlossary(code: string): boolean {
  return (MEDICAL_GLOSSARY_LANGUAGES as readonly string[]).includes(code)
}
