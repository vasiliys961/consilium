import type { Locale } from "../../lib/locale.ts";
import { equipmentOf } from "./registry.ts";
import { writeVisitNote, type VisitNote } from "../protocol/note.ts";

export interface AttachmentResult {
  name: string | null;
  status: "read" | "not_assessed";
  reason: string | null;
  visit: VisitNote | null;
}

export function attachEquipment(input: {
  name?: string | null;
  caseId: string;
  locale: Locale;
  specialty?: string;
  draft: string;
  speech?: string | null;
}): AttachmentResult {
  const known = equipmentOf(input.name);
  if (!known) {
    return { name: input.name ?? null, status: "not_assessed", reason: "not registered", visit: null };
  }
  if (known.name === "protocol") {
    return {
      name: known.name,
      status: "read",
      reason: null,
      visit: writeVisitNote({
        caseId: input.caseId,
        locale: input.locale,
        specialty: input.specialty,
        draft: input.draft,
        speech: input.speech,
      }),
    };
  }
  return { name: known.name, status: "not_assessed", reason: "not built", visit: null };
}
