export interface Equipment {
  name: string;
  input: string;
}

export const EQUIPMENT: Record<string, Equipment> = {
  protocol: {
    name: "protocol",
    input: "caseId, draft, speech, specialty, locale",
  },
  next: {
    name: "next",
    input: "caseId",
  },
};

export function equipmentOf(name: string | null | undefined): Equipment | null {
  if (!name) return null;
  return EQUIPMENT[name] ?? null;
}
