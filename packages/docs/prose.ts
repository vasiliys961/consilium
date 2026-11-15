import { settleAction, type DraftStatement } from "../../lib/draft.ts";

export interface ProseFinding {
  status: "read" | "refused" | "not_assessed";
  reason: string | null;
  paragraphs: string[];
}

const PARAGRAPH_LIMIT = 16;
const PARAGRAPH_CHARS = 280;

function say(locale: "en" | "ru", en: string, ru: string) {
  return locale === "ru" ? ru : en;
}

function decode(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extension(name: string) {
  const base = name.toLowerCase().split(/[/\\]/).pop() ?? "";
  return base.includes(".") ? base.slice(base.lastIndexOf(".")) : "";
}

function pdfSheet(name: string) {
  const base = name.toLowerCase().split(/[/\\]/).pop() ?? "";
  if (!base.endsWith(".pdf")) return false;
  return /(?:^|[^a-z0-9а-яё])(?:ecg|ekg|экг)(?![a-z0-9а-яё])/iu.test(base);
}

function takeFlags(text: string) {
  let source = text.replace(/^\uFEFF/, "");
  let aside = false;
  let cut = false;
  for (;;) {
    const asideMark = /^# doctor-opus-docx-aside=(\d+)\r?\n/.exec(source);
    const cutMark = /^# doctor-opus-docx-cut=(\d+)\r?\n/.exec(source);
    if (asideMark) {
      aside = asideMark[1] !== "0";
      source = source.slice(asideMark[0].length);
      continue;
    }
    if (cutMark) {
      cut = cutMark[1] !== "0";
      source = source.slice(cutMark[0].length);
      continue;
    }
    break;
  }
  return { source, aside, cut };
}

function linesOf(text: string) {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function xmlLines(xml: string) {
  const plain = xml
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return linesOf(decode(plain)).map((line) => line.replace(/[ \t]{2,}/g, " ").trim());
}

function clip(paragraphs: string[], alreadyCut: boolean) {
  let cut = alreadyCut || paragraphs.length > PARAGRAPH_LIMIT;
  const clipped = paragraphs.slice(0, PARAGRAPH_LIMIT).map((paragraph) => {
    const line = paragraph.replace(/\s+/g, " ").trim();
    if (line.length <= PARAGRAPH_CHARS) return line;
    cut = true;
    return line.slice(0, PARAGRAPH_CHARS).trim();
  });
  return { paragraphs: clipped.filter(Boolean), cut };
}

export function readProse(text: string, ext: string, locale: "en" | "ru" = "en"): ProseFinding {
  const flagged = ext === ".docx" ? takeFlags(text) : { source: text, aside: false, cut: false };
  const raw = ext === ".xml" ? xmlLines(flagged.source) : ext === ".docx"
    ? flagged.source.split(/\n\s*\n/).map((line) => line.trim()).filter(Boolean)
    : linesOf(flagged.source);
  const clipped = clip(raw, flagged.cut);
  if (!clipped.paragraphs.length) {
    return {
      status: "not_assessed",
      reason: say(locale, "The document body has no text.", "В теле документа нет текста."),
      paragraphs: [],
    };
  }
  const notes = [
    flagged.aside
      ? say(locale, "The document body was copied. Headers and footers were not copied.", "Скопировано тело документа. Колонтитулы не копировались.")
      : "",
    clipped.cut
      ? say(locale, "The first part of the document was copied.", "Скопирована первая часть документа.")
      : "",
  ].filter(Boolean);
  return { status: "read", reason: notes.join(" ") || null, paragraphs: clipped.paragraphs };
}

export function proseStatements(
  entries: ReadonlyArray<{ source: string; paragraphs: string[] }>,
): DraftStatement[] {
  return entries.flatMap((entry) =>
    entry.paragraphs.map((paragraph) =>
      settleAction({ text: paragraph, source: `file:${entry.source}`, memory: false }),
    ),
  );
}

export function proseRecord(
  entries: ReadonlyArray<{ source: string; paragraphs: string[] }>,
  locale: "en" | "ru",
) {
  const blocks = entries.filter((entry) => entry.paragraphs.length);
  if (!blocks.length) return null;
  const intro = say(
    locale,
    "Document text is copied from the file and stays beside the laboratory values, the network, and the rest of the case. Do not change a copied number. A copied sentence stays information.",
    "Текст документа скопирован из файла и остаётся рядом с лабораторией, сетью и остальными данными случая. Не меняй скопированное число. Скопированное предложение остаётся информацией.",
  );
  const lines = blocks.flatMap((entry) => entry.paragraphs.map((paragraph) => `${entry.source}: ${paragraph}`));
  return [intro, ...lines].join("\n");
}

function numbersIn(text: string) {
  return text.match(/\d+(?:[.,]\d+)?/g) ?? [];
}

function words(text: string) {
  return new Set((text.toLowerCase().replace(/ё/g, "е").match(/[\p{L}]{4,}/gu) ?? []));
}

export function scrubProseText(text: string, paragraphs: readonly string[]) {
  if (!paragraphs.length || !text.trim()) return text;
  const allowed = new Set(paragraphs.flatMap(numbersIn));
  const known = words(paragraphs.join(" "));
  const kept = text.split(/(?<=[.!?])\s+/).filter((part) => {
    const aboutDocument = [...words(part)].some((word) => known.has(word));
    if (!aboutDocument) return true;
    return numbersIn(part).every((token) => allowed.has(token));
  });
  return kept.join(" ").trim();
}

export function inspectProse(
  file: { name: string; text?: string },
  locale: "en" | "ru" = "en",
): ProseFinding | null {
  const ext = extension(file.name);
  if (ext === ".doc") {
    return {
      status: "refused",
      reason: say(locale, "Word 97 is not opened.", "Word 97 не открывается."),
      paragraphs: [],
    };
  }
  if (ext === ".pdf") {
    if (pdfSheet(file.name)) return null;
    const text = file.text ?? "";
    const closed = /^# doctor-opus-pdf-closed=(encrypt|font)\r?\n?/.exec(text);
    if (closed?.[1] === "encrypt") {
      return {
        status: "not_assessed",
        reason: say(locale, "This PDF is encrypted. The page stays in the window.", "Этот PDF зашифрован. Страница остаётся в окне."),
        paragraphs: [],
      };
    }
    if (closed?.[1] === "font") {
      return {
        status: "not_assessed",
        reason: say(locale, "The PDF font map is not opened. The page stays in the window.", "Шрифтовая карта PDF не открывается. Страница остаётся в окне."),
        paragraphs: [],
      };
    }
    if (!text.trim()) {
      return {
        status: "not_assessed",
        reason: say(locale, "PDF text was not found. The page stays in the window.", "Текст PDF не найден. Страница остаётся в окне."),
        paragraphs: [],
      };
    }
    return readProse(text, ".pdf", locale);
  }
  if (![".docx", ".txt", ".md", ".json", ".xml"].includes(ext)) return null;
  const text = file.text ?? "";
  if (!text.trim()) {
    return {
      status: "not_assessed",
      reason: ext === ".docx"
        ? say(locale, "The document body was not opened.", "Тело документа не открыто.")
        : say(locale, "The document was not sent.", "Документ не передан."),
      paragraphs: [],
    };
  }
  return readProse(text, ext, locale);
}
