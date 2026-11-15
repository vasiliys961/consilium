import { withEuropeExcerpt } from "./europe-full-text.ts";
import type { Locale } from "./locale.ts";

export type Shelf = "world" | "russia" | "europepmc" | "local" | "drug" | "genetics";

export interface Citation {
  passageId?: string;
  pmcid?: string;
  doi?: string;
  licenseUrl?: string;
  paragraph?: number;
  excerpt?: string;
  abstract?: string;
  shelf: Shelf;
  title: string;
  url: string | null;
  retrieved: string;
  license: string | null;
  country: string | null;
  pmid: string | null;
  journal: string | null;
  year: string | null;
  pdf: string | null;
  edition: string | null;
  chapter: string | null;
  page: string | null;
}

export interface LocalShelfNote {
  url?: string;
  title?: string;
  edition?: string;
  chapter?: string;
  page?: string;
}

export interface TranslationUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export type SearchTopics = { english: string[]; localized: string[] };
const INDEX_LANGUAGES: Record<Locale, string> = {
  en: 'eng', ru: 'rus', es: 'spa', fr: 'fre', ar: 'ara', hi: 'hin',
  'pt-BR': 'por', id: 'ind', ms: 'may', tr: 'tur', 'zh-CN': 'chi',
};

const SHELF_RANK: Record<Shelf, number> = {
  genetics: -1,
  drug: -1,
  world: 0,
  russia: 1,
  europepmc: 2,
  local: 3,
};

const EUROPEPMC_SEARCH = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const RUSSIA_SEARCH = "https://apicr.minzdrav.gov.ru/api.ashx?op=GetJsonClinrecsFilterV2";
const WORLD_ORG =
  /world health organization|national institute for health and care excellence|\bnice\b|european society of cardiology|\besc\b|american heart association|\baha\b/i;

export function hasCyrillic(text: string): boolean {
  return /[а-яё]/i.test(text);
}

export function needsSearchTranslation(query: string, locale: Locale = "en"): boolean {
  if (hasCyrillic(query)) return true;
  if (/[^\p{Script=Latin}\p{N}\p{P}\p{Z}\p{S}]/u.test(query)) return true;
  return locale !== "en";
}

export function orderCitations(cards: Citation[]): Citation[] {
  return cards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => SHELF_RANK[a.card.shelf] - SHELF_RANK[b.card.shelf] || a.index - b.index)
    .map((entry) => entry.card);
}

function clip(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.slice(0, max);
}

function blank(title: string, shelf: Shelf, retrieved: string): Citation {
  return {
    shelf,
    title,
    url: null,
    retrieved,
    license: null,
    country: null,
    pmid: null,
    journal: null,
    year: null,
    pdf: null,
    edition: null,
    chapter: null,
    page: null,
  };
}

export function localCitations(notes: LocalShelfNote[] | undefined, retrieved: string): Citation[] {
  return (notes ?? []).flatMap((note) => {
    const title = clip(note?.title, 180);
    if (!title) return [];
    return [
      {
        ...blank(title, "local", retrieved),
        url: typeof note.url === 'string' && /^https:\/\//i.test(note.url) ? safeReferenceUrl(note.url) : null,
        edition: clip(note.edition, 40),
        chapter: clip(note.chapter, 80),
        page: clip(note.page, 20),
      },
    ];
  });
}

export function safeReferenceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href.slice(0, 2000) : null;
  } catch { return null; }
}

function cleanTitle(value: string): string {
  return value
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "\'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface EuropeRecord {
  abstractText?: unknown;
  pmcid?: unknown;
  doi?: unknown;
  pubTypeList?: { pubType?: unknown };
  pmid?: unknown;
  title?: unknown;
  journalTitle?: unknown;
  journalInfo?: { journal?: { title?: unknown } };
  pubYear?: unknown;
  isOpenAccess?: unknown;
  fullTextUrlList?: { fullTextUrl?: unknown };
}

function textUrls(record: EuropeRecord): Array<{ availabilityCode?: string; documentStyle?: string; url?: string }> {
  const raw = record.fullTextUrlList?.fullTextUrl;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function openPdf(record: EuropeRecord): string | null {
  const urls = textUrls(record);
  const pdf = urls.find((item) => item?.availabilityCode === "OA" && item?.documentStyle === "pdf" && item.url);
  if (pdf?.url) return pdf.url;
  const anyOpen = urls.find((item) => item?.availabilityCode === "OA" && item.url);
  return anyOpen?.url ?? null;
}

export function europeCitations(payload: unknown, shelf: "world" | "europepmc", retrieved: string): Citation[] {
  const records = (payload as { resultList?: { result?: EuropeRecord[] } } | null)?.resultList?.result;
  if (!Array.isArray(records)) return [];
  return records.flatMap((record) => {
    const pmid = clip(record?.pmid, 16);
    const title = clip(typeof record?.title === "string" ? cleanTitle(record.title) : "", 300);
    if (!pmid || !title || !/^\d+$/.test(pmid)) return [];
    const journal = clip(
      record.journalInfo?.journal?.title ?? record.journalTitle,
      180,
    );
    if (shelf === "world" && (!WORLD_ORG.test(`${title} ${journal ?? ""}`) || !/guideline|scientific statement|consensus|recommendation/i.test(title))) return [];
    const types = record.pubTypeList?.pubType;
    if (Array.isArray(types) && types.some(type => typeof type === "string" && /retract/i.test(type))) return [];
    const pmcid = typeof record.pmcid === "string" && /^PMC\d+$/.test(record.pmcid) ? record.pmcid : undefined;
    const doi = clip(record.doi, 200) ?? undefined;
    const open = record.isOpenAccess === "Y";
    return [
      {
        ...blank(title, shelf, retrieved),
        abstract: typeof record.abstractText === "string" ? cleanTitle(record.abstractText).slice(0, 6000) || undefined : undefined,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        license: open ? "open access" : null,
        pmid,
        pmcid,
        doi,
        journal,
        year: clip(record.pubYear, 4),
        pdf: open ? openPdf(record) : null,
      },
    ];
  });
}

export function russiaCitations(payload: unknown, retrieved: string): Citation[] {
  const records = (payload as { Data?: Array<Record<string, unknown>> } | null)?.Data;
  if (!Array.isArray(records)) return [];
  return records.slice(0, 3).flatMap((record) => {
    const id = clip(record?.CodeVersion, 32);
    const title = clip(record?.Name, 300);
    if (!id || !title || !/^[\w.-]+$/.test(id)) return [];
    const dated = clip(record?.PublishDateStr, 32) ?? "";
    const year = dated.match(/\d{4}/)?.[0] ?? null;
    return [
      {
        ...blank(title, "russia", retrieved),
        url: `https://cr.minzdrav.gov.ru/recomend/${id}`,
        country: "RU",
        year,
        pdf: `https://apicr.minzdrav.gov.ru/api.ashx?id=${id}&op=GetClinrecPdf`,
      },
    ];
  });
}

const GENERIC_TERMS = new Set(`a an the and or of for in on to with by at from is this that what here show interpret interpretation clinical case physician question medical patient diagnostic diagnosis differential approach management treatment therapy evidence guideline guidelines recommendation recommendations review study scientific statement assessment evaluation findings result results current based practical routine health organization international society american european association medicine disease diseases если здесь что это этот врач пациент лечение вопрос анализ разбор данные результат рекомендации клинический случай`.split(/\s+/));
export function topicTerms(value: string,limit=12): string[] {
  return [...new Set((value.toLowerCase().match(/[\p{L}][\p{L}\p{N}-]*/gu) ?? []).filter(word => word.length >= 3 && !GENERIC_TERMS.has(word)))].slice(0, limit);
}

// Public search receives short, purpose-made subjects rather than clinical notes.
export function searchPhrases(value: unknown, english = false): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap(item => {
    if (typeof item !== 'string') return [];
    const phrase = item.replace(/\s+/g, ' ').trim();
    const shape = english ? /^[a-z][a-z0-9 -]{1,71}$/i : /^\p{L}[\p{L}\p{M}\p{N} -]{1,71}$/u;
    return shape.test(phrase) && (topicTerms(phrase).length || (!english && /\p{Script=Han}{2}/u.test(phrase))) ? [phrase] : [];
  }))].slice(0, 2);
}
export function relevantTitle(title: string, query: string): boolean {
  const terms = topicTerms(query);
  if (!terms.length) return false;
  const words = topicTerms(title);
  const matches = terms.filter(term => words.some(word => word === term || (term.length >= 6 && word.startsWith(term.slice(0, -2))))).length;
  return matches >= Math.min(2, terms.length);
}

function quoted(query: string): string {
  return `"${query.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim()}"`;
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) return null;
  return response.json();
}

export async function gatherCitations(
  rawQuery: string,
  deps: {
    fetch: typeof fetch;
    now: Date;
    locale?: Locale;
    clinical?: boolean;
    translate?: (query: string) => Promise<{ english: string; usage: TranslationUsage | null }>;
    sourceLocale?: Locale;
    planTopics?: (query: string) => Promise<{ topics: SearchTopics; usage: TranslationUsage | null }>;
  },
): Promise<{ citations: Citation[]; usage: TranslationUsage | null }> {
  const query = deps.sourceLocale ? rawQuery.trim().slice(0, 1202) : rawQuery.replace(/\s+/g, " ").trim().slice(0, 240);
  if (!query || (!deps.sourceLocale && !topicTerms(query).length)) return { citations: [], usage: null };
  const retrieved = deps.now.toISOString().slice(0, 10);

  if (deps.sourceLocale) {
    const planned = await deps.planTopics?.(query).catch(() => null);
    if (!planned) return { citations: [], usage: null };
    return {
      citations: await findAcademicSources(planned.topics.english, deps.fetch, {
        locale: deps.sourceLocale, topics: planned.topics.localized, retrieved,
      }),
      usage: planned.usage,
    };
  }

  let english = query;
  let usage: TranslationUsage | null = null;
  if (needsSearchTranslation(query, deps.locale ?? "en") && deps.translate) {
    try {
      const translated = await deps.translate(query);
      if (translated.english && !hasCyrillic(translated.english)) {
        english = translated.english.replace(/\s+/g, " ").trim().slice(0, 240);
        usage = translated.usage;
      }
    } catch {
      english = query;
    }
  }

  const searchEnglish = !hasCyrillic(english) && topicTerms(english).length > 0;
  const worldQuery = `PUB_TYPE:"Practice Guideline" AND ${quoted(english)} AND ("World Health Organization" OR "National Institute for Health and Care Excellence" OR "European Society of Cardiology" OR "American Heart Association") AND SRC:MED`;
  const paperQuery = `${quoted(english)} AND SRC:MED AND LANG:"eng" NOT PUB_TYPE:"Practice Guideline"`;

  const [worldPayload, paperPayload, russiaPayload, clinicalGuidance] = await Promise.all([
    searchEnglish && !deps.clinical ? searchEurope(worldQuery, deps.fetch) : Promise.resolve(null),
    searchEnglish && !deps.clinical ? searchEurope(paperQuery, deps.fetch) : Promise.resolve(null),
    searchRussia(query, deps.fetch),
    searchEnglish && deps.clinical ? findAcademicSources([english], deps.fetch) : Promise.resolve([]),
  ]);

  const world = europeCitations(worldPayload, "world", retrieved).filter(card => relevantTitle(card.title, english)).slice(0, 3);
  const seen = new Set(world.map((card) => card.pmid));
  const papers = europeCitations(paperPayload, "europepmc", retrieved)
    .filter((card) => card.pmid && !seen.has(card.pmid) && relevantTitle(card.title, english))
    .slice(0, 3);

  const terms = topicTerms(english);
  const articles = await Promise.all([...world, ...papers].map(card => withEuropeExcerpt(card, terms, deps.fetch)));
  return {
    citations: orderCitations([...articles, ...clinicalGuidance, ...russiaCitations(russiaPayload, retrieved).filter(card => relevantTitle(card.title, query))]),
    usage,
  };
}

async function searchEurope(query: string, fetchImpl: typeof fetch, pageSize = 5): Promise<unknown> {
  const url = new URL(EUROPEPMC_SEARCH);
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("resultType", "core");
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    return await readJson(response);
  } catch {
    return null;
  }
}

async function searchRussia(query: string, fetchImpl: typeof fetch): Promise<unknown> {
  if (!hasCyrillic(query)) return null;
  try {
    const response = await fetchImpl(RUSSIA_SEARCH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filters: [
          {
            fieldName: "name",
            filterType: 2,
            filterValueType: 1,
            value1: query.slice(0, 80),
            value2: "",
            values: [],
          },
        ],
        sortOption: { fieldName: "publishdate", sortType: 2 },
        pageSize: 3,
        currentPage: 1,
        useANDoperator: true,
        columns: [],
      }),
      signal: AbortSignal.timeout(8000),
    });
    return await readJson(response);
  } catch {
    return null;
  }
}

const NON_GUIDANCE_TITLE = /\b(?:bibliometric|commentary|correspondence|reply|letter to|protocol for|implementation study|survey)\b/i;
const GUIDELINE_TITLE = /\b(?:guidelines?|recommendations|consensus)\b/i;
const MANAGEMENT_TITLE = /\b(?:management|treatment|diagnosis|prevention|screening)\b/i;

function guidanceRank(card: Citation, topic: string) {
  const title = card.title.toLowerCase();
  const subject = topic.toLowerCase();
  const coreTitle = title.split(':')[0].replace(/[.\]]+$/, '').trim();
  const direct = GUIDELINE_TITLE.test(title) && MANAGEMENT_TITLE.test(title) && coreTitle.endsWith(subject);
  const hasDecisionDetail = /\b\d+(?:[.,]\d+)?\s*(?:mg\b|mmol\b|µg\b|mcg\b)/i.test(card.abstract ?? '');
  return (direct ? 4 : 0) + (card.abstract ? 2 : 0) + (hasDecisionDetail ? 2 : 0) + (card.pmcid && card.license ? 1 : 0);
}

type SearchPreference = { locale: Locale; topics: string[]; retrieved?: string };

async function preferredGuidance(topics: string[], preference: SearchPreference, fetchImpl: typeof fetch, retrieved: string) {
  if (preference.locale === 'en') return [];
  const lang = INDEX_LANGUAGES[preference.locale];
  const found = await Promise.all(searchPhrases(preference.topics).map(async topic => {
    const [indexed, official] = await Promise.all([
      searchEurope(`LANG:"${lang}" AND TITLE_ABS:${quoted(topic)} AND (PUB_TYPE:"Practice Guideline" OR PUB_TYPE:"Guideline")`, fetchImpl, 8),
      preference.locale === 'ru' ? searchRussia(topic, fetchImpl) : null,
    ]);
    const matches = (card: Citation) => relevantTitle(card.title, topic) || card.title.toLowerCase().includes(topic.toLowerCase());
    return [
      ...russiaCitations(official, retrieved).filter(matches),
      ...europeCitations(indexed, 'europepmc', retrieved).filter(card => !NON_GUIDANCE_TITLE.test(card.title) &&
        (matches(card) || topics.some(english => relevantTitle(card.title, english)))),
    ].map(card => ({ card, topic }));
  }));
  return found.flat();
}

/** International guidance and indexed studies first; local guidance supplements them. */
export async function findAcademicSources(topics: string[], fetchImpl: typeof fetch, preferred?: SearchPreference): Promise<Citation[]> {
  const retrieved = preferred?.retrieved ?? new Date().toISOString().slice(0, 10);
  const languageFilter = preferred ? ' AND LANG:"eng"' : '';
  const englishTopics = preferred ? searchPhrases(topics, true) : topics;
  const localized = preferred ? preferredGuidance(englishTopics, preferred, fetchImpl, retrieved) : Promise.resolve([]);
  const results = await Promise.all(englishTopics.map(async topic => {
    const base = `TITLE_ABS:${quoted(topic)} AND SRC:MED${languageFilter}`;
    const managementTitles = ['management of', 'treatment of', 'diagnosis of', 'prevention of'].map(prefix=>`TITLE:${quoted(`${prefix} ${topic}`)}`).join(' OR ');
    const [indexedGuidance, titledGuidance, studies] = await Promise.all([
      searchEurope(`${base} AND (PUB_TYPE:"Practice Guideline" OR PUB_TYPE:"Guideline")`, fetchImpl, 12),
      searchEurope(`TITLE:${quoted(topic)} AND SRC:MED${languageFilter} AND (${managementTitles}) AND (TITLE:guideline OR TITLE:recommendations)`, fetchImpl, 20),
      searchEurope(`${base} AND (PUB_TYPE:"Systematic Review" OR PUB_TYPE:"Randomized Controlled Trial")`, fetchImpl, 8),
    ]);
    const relevant = (data: unknown) => europeCitations(data, 'europepmc', retrieved).filter(card =>
      !NON_GUIDANCE_TITLE.test(card.title) && relevantTitle(card.title, topic));
    const extraGuidance = relevant(titledGuidance).filter(card =>
      GUIDELINE_TITLE.test(card.title) && MANAGEMENT_TITLE.test(card.title) &&
      !/\b(?:informing|to inform|insights|dataset|based on|systematic literature review|perspective|interpretation of)\b/i.test(card.title));
    const ranked = [...relevant(indexedGuidance), ...extraGuidance].sort((a, b) => guidanceRank(b, topic) - guidanceRank(a, topic));
    const distinct = ranked.filter((card, index) => ranked.findIndex(candidate => candidate.title.toLowerCase() === card.title.toLowerCase()) === index);
    return { topic, guidelines: distinct.slice(0, 3), studies: relevant(studies).slice(0, 2) };
  }));
  const ordered = [...results.flatMap(result => result.guidelines.map(card => ({ card, topic: result.topic }))),
    ...results.flatMap(result => result.studies.map(card => ({ card, topic: result.topic }))),
    ...(await localized).filter((item, index, list) => list.findIndex(other => other.card.title.toLowerCase() === item.card.title.toLowerCase()) === index).slice(0, 2)];
  const seen = new Set<string>();
  const unique: typeof ordered = [];
  for (const item of ordered) {
    const { card } = item;
    const keys = [`title:${card.title.toLowerCase()}`, ...(card.pmid ? [`pmid:${card.pmid}`] : []), ...(card.doi ? [`doi:${card.doi.toLowerCase()}`] : [])];
    if (keys.some(key => seen.has(key))) continue;
    keys.forEach(key => seen.add(key));
    unique.push(item);
    if (unique.length >= 7) break;
  }
  return Promise.all(unique.map(({ card, topic }) => withEuropeExcerpt(card, topicTerms(topic), fetchImpl, true)));
}
