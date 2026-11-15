import { unpackZip } from "../intake/zip.ts";

const PARAGRAPH_LIMIT = 16;
const PARAGRAPH_CHARS = 280;

function decode(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function paragraphsFromDocumentXml(xml: string) {
  const cleaned = xml
    .replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/g, "")
    .replace(/<mc:Fallback\b[^>]*>[\s\S]*?<\/mc:Fallback>/g, "");
  const tokens = cleaned.matchAll(/<w:p[\s>]|<\/w:p>|<w:t\b[^>]*>[\s\S]*?<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>|<w:cr\b[^>]*\/>/g);
  let depth = 0;
  let current = "";
  const paragraphs: string[] = [];
  const push = () => {
    const line = current.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    current = "";
    if (line) paragraphs.push(line);
  };
  for (const match of tokens) {
    const token = match[0];
    if (token.startsWith("<w:p")) {
      if (depth === 0) current = "";
      depth += 1;
    } else if (token.startsWith("</w:p")) {
      depth = Math.max(0, depth - 1);
      if (depth === 0) push();
    } else if (depth > 0 && token.startsWith("<w:t")) {
      current += decode(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/.exec(token)?.[1] ?? "");
    } else if (depth > 0) current += " ";
  }
  return paragraphs;
}

export async function textFromDocx(bytes: Uint8Array): Promise<string | null> {
  const members = await unpackZip(bytes, "full");
  const body = members.find((member) => member.name.toLowerCase() === "word/document.xml" && member.data);
  if (!body?.data) return null;
  const paragraphs = paragraphsFromDocumentXml(new TextDecoder().decode(body.data));
  let cut = paragraphs.length > PARAGRAPH_LIMIT;
  const clipped = paragraphs.slice(0, PARAGRAPH_LIMIT).map((paragraph) => {
    if (paragraph.length <= PARAGRAPH_CHARS) return paragraph;
    cut = true;
    return paragraph.slice(0, PARAGRAPH_CHARS).trim();
  });
  const aside = members.some((member) => /\/(?:header|footer)\d*\.xml$/i.test(`/${member.name}`));
  const head = [aside ? "# doctor-opus-docx-aside=1" : "", cut ? "# doctor-opus-docx-cut=1" : ""].filter(Boolean);
  const text = clipped.join("\n\n");
  if (!text && !head.length) return null;
  return head.length ? `${head.join("\n")}\n${text}` : text;
}
