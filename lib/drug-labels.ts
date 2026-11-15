import type { Citation } from './literature.ts';

export const MAX_DRUG_LABELS = 4;
export const DRUG_SECTIONS = [
  ['indications_and_usage', 'Indications and usage'],
  ['dosage_and_administration', 'Dosage and administration'],
  ['dosage_forms_and_strengths', 'Dosage forms and strengths'],
  ['contraindications', 'Contraindications'],
  ['boxed_warning', 'Boxed warning'],
  ['warnings_and_cautions', 'Warnings and precautions'],
  ['drug_interactions', 'Drug interactions listed in this label'],
  ['use_in_specific_populations', 'Use in specific populations'],
  ['pregnancy', 'Pregnancy'],
  ['nursing_mothers', 'Nursing mothers'],
  ['labor_and_delivery', 'Labor and delivery'],
] as const;

export type DrugLabelSelection = { setId: string; title: string };
export type DrugLabel = DrugLabelSelection & {
  route: string[];
  ndc: string[];
  manufacturer: string;
  version: string;
  date: string;
  url: string;
  sections: { title: string; text: string; truncated: boolean }[];
};
export type DrugLabelReview = {
  labels: DrugLabel[];
  unavailable: DrugLabelSelection[];
  externalDisabled: boolean;
};

const FDA_LABEL_URL = 'https://api.fda.gov/drug/label.json';
const SET_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const NDC = /^\d{4,5}-\d{3,4}$/;
const ALIASES: Readonly<Record<string,string>> = {
  апиксабан:'apixaban', эликвис:'eliquis', варфарин:'warfarin',
  метформин:'metformin', метформін:'metformin', сиофор:'metformin', глюкофаж:'metformin',
  бисопролол:'bisoprolol', бісопролол:'bisoprolol', конкор:'bisoprolol', bisoprolol:'bisoprolol',
  метопролол:'metoprolol', омепразол:'omeprazole',
  ибупрофен:'ibuprofen', амлодипин:'amlodipine', аторвастатин:'atorvastatin',
  амоксициллин:'amoxicillin', ривароксабан:'rivaroxaban', ксарелто:'xarelto',
  клопидогрел:'clopidogrel', клопидогрель:'clopidogrel', клопідогрел:'clopidogrel', клопідогрель:'clopidogrel', моксифлоксацин:'moxifloxacin', авелокс:'avelox', дигоксин:'digoxin', парацетамол:'acetaminophen',
};

export function normalizeDrugQuery(value: string): string | null {
  const trimmed = value.trim().toLowerCase().replace(/\s+/g, ' ');
  const query = ALIASES[trimmed] ?? trimmed;
  if (NDC.test(query)) return query;
  return /^[a-z][a-z0-9 -]{1,59}$/.test(query) && query.split(' ').length <= 6 ? query : null;
}

export function validDrugSelections(value: unknown): value is DrugLabelSelection[] {
  return Array.isArray(value) && value.length <= MAX_DRUG_LABELS && value.every(item =>
    item && typeof item === 'object' && typeof item.setId === 'string' && SET_ID.test(item.setId)
      && typeof item.title === 'string' && item.title.length > 0 && item.title.length <= 220 && !/[\r\n]/.test(item.title));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim())) : [];
}

function parseLabel(value: unknown): DrugLabel | null {
  const raw = record(value);
  const openfda = record(raw.openfda);
  const setId = typeof raw.set_id === 'string' ? raw.set_id.toLowerCase() : '';
  if (!SET_ID.test(setId)) return null;
  if (!strings(openfda.product_type).some(type => /^human (?:prescription|otc) drug$/i.test(type))) return null;
  const brand = strings(openfda.brand_name)[0]?.trim();
  const generic = strings(openfda.generic_name)[0]?.trim();
  const title = (brand && generic && brand.toLowerCase() !== generic.toLowerCase()
    ? `${brand} (${generic})` : brand ?? generic ?? '').replace(/\s+/g,' ').slice(0,220);
  if (!title) return null;
  const sections = DRUG_SECTIONS.flatMap(([key, title]) => {
    const text = strings(raw[key]).join('\n\n').trim();
    return text ? [{title, text:text.slice(0,14000), truncated:text.length > 14000}] : [];
  });
  if (!sections.length) return null;
  const date = typeof raw.effective_time === 'string' && /^\d{8}$/.test(raw.effective_time)
    ? raw.effective_time.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') : '';
  return {
    setId, title, date, sections,
    route: strings(openfda.route).slice(0,8),
    ndc: strings(openfda.product_ndc).filter(value => NDC.test(value)).slice(0,12),
    manufacturer: strings(openfda.manufacturer_name)[0]?.slice(0,160) ?? '',
    version: typeof raw.version === 'string' && /^\d{1,8}$/.test(raw.version) ? raw.version : '',
    url: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setId}`,
  };
}

async function fetchLabels(search: string, limit: number, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<unknown[]> {
  const url = new URL(FDA_LABEL_URL);
  url.searchParams.set('search', search);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('sort', 'effective_time:desc');
  const timeout = AbortSignal.timeout(7500);
  const response = await fetchImpl(url, { signal: signal ? AbortSignal.any([timeout, signal]) : timeout });
  if (response.status === 404) return [];
  if (!response.ok) throw Error('drug_labels_unavailable');
  const body = record(await response.json());
  if (!Array.isArray(body.results)) throw Error('drug_labels_unavailable');
  return body.results;
}

export async function searchDrugLabels(name: string, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<DrugLabel[]> {
  const query = normalizeDrugQuery(name);
  if (!query) throw Error('invalid_drug_query');
  const byNdc = NDC.test(query);
  const names = query === 'metoprolol' ? [query, 'metoprolol tartrate', 'metoprolol succinate'] : [query];
  const search = byNdc ? `openfda.product_ndc.exact:"${query}"`
    : `(${names.flatMap(name => ['brand_name', 'generic_name'].map(field => `openfda.${field}.exact:"${name.toUpperCase()}"`)).join(' OR ')})`;
  const results = await fetchLabels(search, 12, fetchImpl, signal);
  const labels = new Map<string,DrugLabel>();
  for (const value of results) {
    const meta = record(record(value).openfda);
    const candidates = byNdc ? strings(meta.product_ndc) : [...strings(meta.brand_name),...strings(meta.generic_name)];
    if (!candidates.some(candidate => names.includes(candidate.trim().toLowerCase()))) continue;
    const label = parseLabel(value);
    if (label && !labels.has(label.setId)) labels.set(label.setId, label);
  }
  return [...labels.values()].slice(0,6);
}

export async function reviewDrugLabels(
  selections: DrugLabelSelection[], externalEnabled: boolean, fetchImpl: typeof fetch = fetch, signal?: AbortSignal,
): Promise<DrugLabelReview> {
  if (!externalEnabled) return {labels:[],unavailable:selections,externalDisabled:true};
  const unique = [...new Map(selections.slice(0, MAX_DRUG_LABELS).map(item => [item.setId.toLowerCase(), item])).values()];
  const results = await Promise.all(unique.map(async item => {
    if (!SET_ID.test(item.setId)) return {item,label:null};
    try {
      const records = await fetchLabels(`set_id:"${item.setId}"`, 4, fetchImpl, signal);
      const label = records.map(parseLabel).find(label => label?.setId === item.setId.toLowerCase()) ?? null;
      return {item,label};
    } catch {
      return {item,label:null};
    }
  }));
  return {labels:results.flatMap(row => row.label ? [row.label] : []),unavailable:results.flatMap(row => row.label ? [] : [row.item]),externalDisabled:false};
}

export function drugLabelCitations(labels: DrugLabel[], retrieved: string): Citation[] {
  return labels.map(label => ({
    shelf:'drug', title:label.title, url:label.url, retrieved, country:'US',
    passageId:`spl:${label.setId}`, pmid:null, journal:null, year:label.date ? label.date.slice(0,4) : null,
    pdf:null, license:null, edition:label.version || null, chapter:label.date || null, page:null,
    excerpt:[
      `US product label. Route: ${label.route.join(', ') || 'not provided'}. Product NDC: ${label.ndc.join(', ') || 'not provided'}. Effective date: ${label.date || 'not provided'}.`,
      ...label.sections.map(section => {
        const limit = section.title === 'Dosage and administration' ? 3200 : 1600;
        return `${section.title}: ${section.text.slice(0,limit)}${section.truncated || section.text.length > limit ? ' [excerpt incomplete: consult the full section]' : ''}`;
      }),
    ].join('\n'),
  }));
}
