export const LOCALES = [
  { code: "en", label: "EN", name: "English", dir: "ltr" },
  { code: "ru", label: "RU", name: "Russian", dir: "ltr" },
  { code: "es", label: "ES", name: "Spanish", dir: "ltr" },
  { code: "fr", label: "FR", name: "French", dir: "ltr" },
  { code: "ar", label: "AR", name: "Arabic", dir: "rtl" },
  { code: "hi", label: "HI", name: "Hindi", dir: "ltr" },
  { code: "pt-BR", label: "PT", name: "Portuguese", dir: "ltr" },
  { code: "id", label: "ID", name: "Indonesian", dir: "ltr" },
  { code: "ms", label: "MS", name: "Malay", dir: "ltr" },
  { code: "tr", label: "TR", name: "Turkish", dir: "ltr" },
  { code: "zh-CN", label: "ZH", name: "Chinese", dir: "ltr" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

const BY_CODE = new Map(LOCALES.map((item) => [item.code, item]));

export function parseLocale(value: unknown): Locale {
  return typeof value === "string" && BY_CODE.has(value as Locale) ? (value as Locale) : "en";
}

export function languageName(locale: Locale): string {
  return BY_CODE.get(locale)?.name ?? "English";
}

export function direction(locale: Locale): "ltr" | "rtl" {
  return BY_CODE.get(locale)?.dir ?? "ltr";
}

export function moduleLocale(locale: Locale): "en" | "ru" {
  return locale === "ru" ? "ru" : "en";
}
