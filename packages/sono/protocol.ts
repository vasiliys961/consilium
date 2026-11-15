/** Organ scan order. This is the order of views, not a visit note and not a measurement. */

export const SONO_QUALITY_THRESHOLD = 0.75;

interface SonoView {
  id: string;
  en: string;
  ru: string;
}

interface SonoProtocol {
  id: string;
  en: string;
  ru: string;
  views: SonoView[];
  requiresScale: boolean;
}

const PROTOCOLS: SonoProtocol[] = [
  {
    id: "bladder",
    en: "Bladder",
    ru: "Мочевой пузырь",
    requiresScale: true,
    views: [
      { id: "transverse", en: "Transverse", ru: "Поперечный срез" },
      { id: "longitudinal", en: "Longitudinal", ru: "Продольный срез" },
    ],
  },
  {
    id: "efast",
    en: "eFAST",
    ru: "eFAST",
    requiresScale: false,
    views: [
      { id: "RUQ", en: "Right upper quadrant", ru: "Правое подреберье" },
      { id: "LUQ", en: "Left upper quadrant", ru: "Левое подреберье" },
      { id: "pelvis", en: "Pelvis", ru: "Таз" },
      { id: "subxiphoid", en: "Subxiphoid", ru: "Подмечевидная точка" },
    ],
  },
  {
    id: "lung",
    en: "Lung",
    ru: "Лёгкие",
    requiresScale: false,
    views: [
      { id: "right-upper", en: "Right upper zone", ru: "Правая верхняя зона" },
      { id: "right-lower", en: "Right lower zone", ru: "Правая нижняя зона" },
      { id: "left-upper", en: "Left upper zone", ru: "Левая верхняя зона" },
      { id: "left-lower", en: "Left lower zone", ru: "Левая нижняя зона" },
    ],
  },
  {
    id: "thyroid",
    en: "Thyroid",
    ru: "Щитовидная железа",
    requiresScale: true,
    views: [
      { id: "right-lobe", en: "Right lobe", ru: "Правая доля" },
      { id: "left-lobe", en: "Left lobe", ru: "Левая доля" },
    ],
  },
  {
    id: "ivc",
    en: "Inferior vena cava",
    ru: "Нижняя полая вена",
    requiresScale: true,
    views: [{ id: "longitudinal-ivc", en: "Longitudinal IVC", ru: "Продольный срез НПВ" }],
  },
  {
    id: "cardiac-ef",
    en: "Left ventricular ejection fraction",
    ru: "Фракция выброса левого желудочка",
    requiresScale: true,
    views: [
      { id: "end-diastole", en: "End diastole", ru: "Конец диастолы" },
      { id: "end-systole", en: "End systole", ru: "Конец систолы" },
    ],
  },
  {
    id: "abdomen",
    en: "Abdomen",
    ru: "Брюшная полость",
    requiresScale: true,
    views: [
      { id: "liver", en: "Liver", ru: "Печень" },
      { id: "gallbladder", en: "Gallbladder", ru: "Желчный пузырь" },
      { id: "bile-ducts", en: "Bile ducts", ru: "Желчные протоки" },
      { id: "pancreas", en: "Pancreas", ru: "Поджелудочная железа" },
      { id: "spleen", en: "Spleen", ru: "Селезёнка" },
      { id: "right-kidney", en: "Right kidney", ru: "Правая почка" },
      { id: "left-kidney", en: "Left kidney", ru: "Левая почка" },
    ],
  },
];

export interface SonoOrder {
  id: string;
  title: string;
  missing: string[];
  completeness: number;
  threshold: number;
  scale: "absent";
  reason: string;
}

function protocolFor(name: string) {
  const base = name.toLowerCase();
  if (base.includes("bladder") || base.includes("мочев")) return PROTOCOLS[0];
  if (base.includes("efast")) return PROTOCOLS[1];
  if (base.includes("lung") || base.includes("легк") || base.includes("лёгк")) return PROTOCOLS[2];
  if (base.includes("thyroid") || base.includes("щитов")) return PROTOCOLS[3];
  if (base.includes("ivc") || base.includes("полой")) return PROTOCOLS[4];
  if (base.includes("cardiac") || base.includes("ejection") || base.includes("выброс")) return PROTOCOLS[5];
  return PROTOCOLS[6];
}

export function isUltrasoundName(name: string) {
  const base = name.toLowerCase().split(/[/\\]/).pop() ?? "";
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")) : "";
  if ([".pdf", ".doc", ".docx", ".txt"].includes(ext)) return false;
  return [".mp4", ".mov", ".avi"].includes(ext) || /ultrasound|sono|efast|echocard/.test(base);
}

export function openProtocol(name: string, locale: "en" | "ru" = "en"): SonoOrder {
  const protocol = protocolFor(name);
  const label = (view: SonoView) => (locale === "ru" ? view.ru : view.en);
  return {
    id: protocol.id,
    title: locale === "ru" ? protocol.ru : protocol.en,
    missing: protocol.views.map(label),
    completeness: 0,
    threshold: SONO_QUALITY_THRESHOLD,
    scale: "absent",
    reason: protocol.requiresScale
      ? locale === "ru"
        ? "Порядок съёмки записан. Шкалы нет, поэтому размер не считается."
        : "The scan order is listed. No scale was supplied, so no measurement was made."
      : locale === "ru"
        ? "Порядок съёмки записан. Кадры не оценены, поэтому находка не ставится."
        : "The scan order is listed. Frames were not scored, so no finding was made.",
  };
}
