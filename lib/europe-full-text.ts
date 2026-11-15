import { SaxesParser } from "saxes";
import type { Citation } from "./literature.ts";

const MAX_XML_BYTES = 2_000_000;
const MAX_EXCERPT = 1400;
const REUSABLE_LICENSE = /^https?:\/\/creativecommons\.org\/(?:licenses\/by\/(?:[1-4]\.0)|publicdomain\/zero\/1\.0)\/?$/i;

async function readXml(response: Response): Promise<string> {
  if (!response.ok || !response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let xml = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return xml + decoder.decode();
      bytes += value.byteLength;
      if (bytes > MAX_XML_BYTES) return "";
      xml += decoder.decode(value, { stream: true });
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
}

export async function withEuropeExcerpt(card: Citation, terms: string[], fetchImpl: typeof fetch, clinical = false): Promise<Citation> {
  const { pmcid } = card;
  if (!terms.length || !pmcid || !/^PMC\d+$/.test(pmcid) || card.license !== "open access") return card;
  try {
    const response = await fetchImpl(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/fullTextXML`,
      { signal: AbortSignal.timeout(4000), redirect: "error" },
    );
    const xml = await readXml(response);
    if (!xml) return card;
    const passage = selectPassage(xml, card, terms, clinical);
    return passage ? { ...card, ...passage, passageId: `pmc:${pmcid}:${passage.paragraph}` } : card;
  } catch {
    return card;
  }
}

function selectPassage(xml: string, card: Citation, queryTerms: string[], clinical: boolean) {
  const parser = new SaxesParser();
  const stack: string[] = [];
  const sections: string[] = [];
  let article = false;
  let licenseUrl = "";
  let pmid = "";
  let paragraph = 0;
  let capture: { depth: number; text: string; kind: "pmid" | "title" | "paragraph" } | undefined;
  let best: { excerpt: string; chapter: string; paragraph: number; score: number } | undefined;

  parser.on("opentag", ({ name, attributes }) => {
    if (stack.length >= 80) throw new Error("Article XML nesting limit exceeded");
    stack.push(name);
    if (stack.length === 1) article = name === "article" && !/retract|correction/i.test(attributes["article-type"] ?? "");
    const path = stack.join("/");
    if (path === "article/front/article-meta/permissions/license") {
      const href = attributes["xlink:href"] ?? attributes.href ?? "";
      if (REUSABLE_LICENSE.test(href)) licenseUrl = href;
    }
    if (path === "article/front/article-meta/article-id" && attributes["pub-id-type"] === "pmid") {
      capture = { depth: stack.length, text: "", kind: "pmid" };
    }
    if (!path.startsWith("article/body/") || stack.slice(2, -1).some(tag => tag !== "sec")) return;
    if (name === "sec") sections.push("");
    if (name === "title" || name === "p") {
      capture = { depth: stack.length, text: "", kind: name === "title" ? "title" : "paragraph" };
    }
  });
  const addText = (text: string) => {
    if (capture) capture.text += text;
  };
  parser.on("text", addText);
  parser.on("cdata", addText);
  parser.on("closetag", ({ name }) => {
    if (capture?.depth === stack.length) {
      const value = capture.text.replace(/\s+/g, " ").trim();
      if (capture.kind === "pmid") pmid = value;
      if (capture.kind === "title" && sections.length) sections[sections.length - 1] = value.slice(0, 160);
      if (capture.kind === "paragraph") {
        paragraph++;
        const excerpt = value.length > MAX_EXCERPT ? value.slice(0, MAX_EXCERPT - 1).replace(/\s+\S*$/, "") + "…" : value;
        const terms = new Set(excerpt.toLowerCase().match(/[\p{L}][\p{L}\p{N}-]*/gu));
        const matches = queryTerms.filter(term => terms.has(term)).length;
        const clinicalContent = clinical && /recommend|treat|manag|therap|dos|monitor|contraindicat|safety/i.test(sections.join(' ') + ' ' + excerpt);
        const score = matches + (clinicalContent ? 1 : 0);
        if (excerpt.length >= 80 && matches >= Math.min(2, queryTerms.length) && score > (best?.score ?? 0)) {
          best = { excerpt, chapter: sections.filter(Boolean).join(" / ") || "Body", paragraph, score };
        }
      }
      capture = undefined;
    }
    if (name === "sec" && stack[1] === "body" && stack.slice(2).every(tag => tag === "sec")) sections.pop();
    stack.pop();
  });
  parser.write(xml).close();

  if (!article || !licenseUrl || pmid !== card.pmid || !best) return null;
  return { excerpt: best.excerpt, chapter: best.chapter, paragraph: best.paragraph, licenseUrl };
}
