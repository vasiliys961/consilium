import { type Locale } from "../../lib/locale.ts";
import { text } from "../../lib/messages.ts";

export type VisitSpecialty = "general" | "cardiology" | "dermatology";

export interface VisitNote {
  equipment: "protocol";
  caseId: string;
  specialty: VisitSpecialty;
  text: string;
  document: string;
  diagnosed: false;
}

export function visitSpecialty(name: string | undefined): VisitSpecialty {
  if (name === "cardiology" || name === "dermatology") return name;
  return "general";
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function writeVisitNote(input: {
  caseId: string;
  locale: Locale;
  specialty?: string;
  draft: string;
  speech?: string | null;
}): VisitNote {
  const specialty = visitSpecialty(input.specialty);
  const copy = text(input.locale);
  const title =
    specialty === "cardiology" ? copy.specialtyCardiology : specialty === "dermatology" ? copy.specialtyDermatology : copy.specialtyGeneral;
  const speech = input.speech?.trim() || copy.unassessed;
  const draft = input.draft.trim();
  const note = `${copy.visitTitle}\n${copy.visitCase}: ${input.caseId}\n${copy.visitSpecialty}: ${title}\n\n${copy.visitSpeech}\n${speech}\n\n${copy.visitUnsigned}\n${draft}`;
  const document = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"></head><body><pre>${escapeHtml(note)}</pre></body></html>`;
  return {
    equipment: "protocol",
    caseId: input.caseId,
    specialty,
    text: note,
    document,
    diagnosed: false,
  };
}
