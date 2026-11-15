import assert from "node:assert/strict";
import test from "node:test";
import { conduct } from "./conductor.ts";
import { MODELS } from "./cost.ts";
import { translateForSearch } from "./gateway.ts";
import {
  europeCitations,
  findAcademicSources,
  gatherCitations,
  orderCitations,
  russiaCitations,
  type Citation,
} from "./literature.ts";

const retrieved = "2026-11-05";

test('a directly applicable guideline is recovered by title even without the guideline index tag', async () => {
  const guide={pmid:'37827694',title:'EULAR recommendations for the management of systemic lupus erythematosus: 2023 update.',abstractText:'Clinical recommendations with evidence for management.'};
  const selected=await findAcademicSources(['systemic lupus erythematosus'],async input=>{
    const query=new URL(String(input)).searchParams.get('query')??'';
    return Response.json({resultList:{result:query.startsWith('TITLE:')?[guide]:[
      {pmid:'999',title:'Bibliometric study of systemic lupus erythematosus',abstractText:'Citation counts only.'},
    ]}});
  });
  assert.deepEqual(selected.map(source=>source.pmid),['37827694']);
  assert.equal(selected[0].abstract,guide.abstractText);
});

test('case literature puts international guidance first and supplements it with local guidance', async () => {
  const calls: string[] = [];
  const result = await gatherCitations('Question about atrial fibrillation for synthetic patient 321', {
    locale: 'en', sourceLocale: 'ru', now: new Date(retrieved),
    planTopics: async () => ({ topics: { english: ['atrial fibrillation'], localized: ['фибрилляция предсердий'] }, usage: null }),
    fetch: async (input, init) => {
      const url = new URL(String(input));
      const query = url.searchParams.get('query') ?? '';
      const body = String(init?.body ?? '');
      calls.push(query + body);
      if (url.hostname === 'apicr.minzdrav.gov.ru') return Response.json({ Data: [
        { CodeVersion: '157_5', Name: 'Фибрилляция предсердий', PublishDateStr: '25.11.2024' },
      ] });
      return Response.json({ resultList: { result: query.includes('LANG:"eng"') ? [
        { pmid: '200', title: 'Guideline for management of atrial fibrillation', abstractText: 'Synthetic guidance.' },
      ] : [] } });
    },
  });
  assert.deepEqual(result.citations.map(item => item.shelf), ['europepmc', 'russia']);
  assert.equal(result.citations[1].abstract, undefined);
  assert.ok(calls.some(call => call.includes('LANG:"rus"') && call.includes('фибрилляция предсердий')));
  assert.ok(calls.some(call => call.includes('LANG:"eng"') && call.includes('atrial fibrillation')));
  assert.ok(calls.every(call => !call.includes('synthetic patient 321')));
});

test('case literature does not fall back to the raw clinical question when subject planning fails', async () => {
  let calls = 0;
  const result = await gatherCitations('Synthetic patient 321 has atrial fibrillation', {
    sourceLocale: 'en', now: new Date(retrieved),
    planTopics: async () => { throw new Error('planner unavailable'); },
    fetch: async () => { calls++; throw new Error('unexpected public request'); },
  });
  assert.deepEqual(result.citations, []);
  assert.equal(calls, 0);
});

function card(shelf: Citation["shelf"], title: string): Citation {
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

test("citations stay in shelf order: world, Russia, Europe PMC, local shelf", () => {
  const ordered = orderCitations([
    card("local", "Harrison"),
    card("europepmc", "Paper"),
    card("russia", "Фибрилляция"),
    card("world", "ESC guideline"),
  ]);
  assert.deepEqual(
    ordered.map((item) => item.shelf),
    ["world", "russia", "europepmc", "local"],
  );
});

test("a world card keeps the organisation and an ordinary paper stays on Europe PMC", () => {
  const payload = {
    resultList: {
      result: [
        {
          pmid: "42263157",
          title: "2026 AHA guideline of the American Heart Association.",
          journalInfo: { journal: { title: "Circulation" } },
          pubYear: "2026",
          isOpenAccess: "N",
        },
        {
          pmid: "100",
          title: "An observational cohort.",
          journalTitle: "Lancet",
          pubYear: "2024",
          isOpenAccess: "Y",
          fullTextUrlList: {
            fullTextUrl: [{ availabilityCode: "OA", documentStyle: "pdf", url: "https://example.test/paper.pdf" }],
          },
        },
      ],
    },
  };

  assert.equal(europeCitations(payload, "world", retrieved).length, 1);
  assert.equal(europeCitations(payload, "world", retrieved)[0]?.pmid, "42263157");
  const paper = europeCitations(payload, "europepmc", retrieved)[1];
  assert.equal(paper?.license, "open access");
  assert.equal(paper?.pdf, "https://example.test/paper.pdf");
});

test("a Russian guideline is marked with the country and points at the ministry", () => {
  const [card] = russiaCitations(
    { Data: [{ CodeVersion: "157_5", Name: "Фибрилляция предсердий", PublishDateStr: "25.11.2024" }] },
    retrieved,
  );
  assert.equal(card?.country, "RU");
  assert.equal(card?.shelf, "russia");
  assert.equal(card?.year, "2024");
  assert.equal(card?.url, "https://cr.minzdrav.gov.ru/recomend/157_5");
  assert.match(card?.pdf ?? "", /op=GetClinrecPdf/);
});

test("the local shelf keeps the place in the book and drops the page text", () => {
  const result = conduct({
    shelf: [{ title: "Harrison", edition: "21", chapter: "Heart failure", page: "88", content: "secret paragraph" } as never],
  });
  const citation = result.citations[0];
  assert.equal(citation?.shelf, "local");
  assert.equal(citation?.edition, "21");
  assert.equal(citation?.page, "88");
  assert.equal(JSON.stringify(result).includes("secret paragraph"), false);
});

test("a Russian question is translated before Europe PMC and Russia is searched apart", async () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = decodeURIComponent(String(input).replace(/\+/g, " "));
    const body = typeof init?.body === "string" ? init.body : "";
    calls.push(`${url} ${body}`);
    if (url.includes("PUB_TYPE") && !url.includes("NOT PUB_TYPE")) {
      return Response.json({
        resultList: {
          result: [
            {
              pmid: "200",
              title: "ESC guideline of the European Society of Cardiology on atrial fibrillation.",
              pubYear: "2024",
              isOpenAccess: "N",
            },
          ],
        },
      });
    }
    if (url.includes("europepmc")) {
      return Response.json({
        resultList: {
          result: [{ pmid: "300", title: "Cohort of atrial fibrillation.", journalTitle: "BMJ", pubYear: "2023", isOpenAccess: "N" }],
        },
      });
    }
    return Response.json({
      Data: [{ CodeVersion: "157_5", Name: "Фибрилляция предсердий", PublishDateStr: "25.11.2024" }],
    });
  };

  const gathered = await gatherCitations("фибрилляция предсердий", {
    fetch: fetchImpl,
    now: new Date("2026-11-05T00:00:00Z"),
    translate: async () => ({ english: "atrial fibrillation", usage: { model: MODELS.flash, inputTokens: 10, outputTokens: 4, durationMs: 12 } }),
  });

  assert.deepEqual(
    gathered.citations.map((item) => item.shelf),
    ["world", "russia", "europepmc"],
  );
  assert.equal(calls.some((call) => call.includes("фибрилляция") && call.includes("europepmc")), false);
  assert.equal(calls.some((call) => call.includes("atrial fibrillation")), true);
  assert.equal(calls.some((call) => call.includes("apicr") && call.includes("фибрилляция")), true);
  assert.equal(gathered.usage?.outputTokens, 4);
});

test("a cut-off reasoning trace is not used as the search phrase", async () => {
  const translated = await translateForSearch({ OPENROUTER_API_KEY: "secret-polza-key"  }, "фибрилляция предсердий", async () =>
    Response.json({
      choices: [{ finish_reason: "length", message: { content: "", reasoning: "atrial fibrillation" } }],
      usage: { prompt_tokens: 20, completion_tokens: 60 },
    }),
  );
  assert.equal(translated.english, "фибрилляция предсердий");
  assert.equal(translated.usage, null);
});

test("translation does not echo the gateway key", async () => {
  const secret = "secret-polza-key";
  const translated = await translateForSearch({ OPENROUTER_API_KEY: secret  }, "одышка", async () => {
    throw new Error("down");
  });
  assert.equal(translated.english, "одышка");
  assert.equal(translated.usage, null);
  assert.equal(JSON.stringify(translated).includes(secret), false);
});

test("irrelevant search hits are rejected even when a provider returns a plausible guideline", async () => {
 const result=await gatherCitations("atrial fibrillation",{now:new Date(),fetch:async()=>Response.json({resultList:{result:[
 {pmid:"1",title:"A diagnostic approach to lymphomas according to the World Health Organization"},
 {pmid:"2",title:"American Heart Association scientific statement on blood culture negative endocarditis"},
 {pmid:"3",title:"Differential diagnosis of plant diseases"},
 {pmid:"4",title:"Management of atrial fibrillation"},
 ]}})});
 assert.deepEqual(result.citations.map(c=>c.pmid),["4"]);
});
test("a generic what-is-here question does not query a literature service", async()=>{
 let calls=0;const result=await gatherCitations("what is here",{now:new Date(),fetch:async()=>{calls++;throw Error("unexpected");}});
 assert.equal(calls,0);assert.deepEqual(result.citations,[]);
});

test("Europe PMC supplies a citable body excerpt and falls back to abstracts or metadata", async () => {
  const { sourceKeys } = await import("./draft.ts");
  const paragraph = "The trial evaluated atrial fibrillation recurrence after treatment. The study reported outcomes at twelve months.";
  const searchRecords = [
    { pmid: "101", pmcid: "PMC101", isOpenAccess: "Y", doi: "10.1000/example" },
    { pmid: "102", pmcid: "PMC102", isOpenAccess: "Y", abstractText: "Available abstract." },
    { pmid: "103", pmcid: "PMC103", isOpenAccess: "N" },
    { pmid: "104", pmcid: "PMC104", isOpenAccess: "Y", pubTypeList: { pubType: ["Retracted Publication"] } },
  ];
  const fetched: string[] = [];
  const result = await gatherCitations("atrial fibrillation", {
    now: new Date(),
    fetch: async input => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/search")) return Response.json({
        resultList: { result: searchRecords.map(record => ({ ...record, title: "Outcomes in atrial fibrillation" })) },
      });
      const pmcid = url.pathname.split("/").at(-2)!;
      fetched.push(pmcid);
      if (pmcid === "PMC102") return new Response("<article><body>", { status: 200 });
      return new Response(`<article xmlns:xlink="http://www.w3.org/1999/xlink">
        <front><article-meta><article-id pub-id-type="pmid">101</article-id>
        <permissions><license xlink:href="https://creativecommons.org/licenses/by/4.0/"/></permissions>
        </article-meta></front>
        <body><sec><title>Results</title><p>A general introductory paragraph.</p><p>${paragraph}</p></sec></body>
        <back><p>Atrial fibrillation material outside the article body.</p></back>
      </article>`);
    },
  });
  assert.deepEqual(fetched.sort(), ["PMC101", "PMC102"]);
  const [fullText, abstractOnly, metadataOnly] = result.citations;
  assert.equal(fullText.excerpt, paragraph);
  assert.equal(fullText.chapter, "Results");
  assert.equal(fullText.passageId, "pmc:PMC101:2");
  assert.equal(fullText.doi, "10.1000/example");
  assert.equal(abstractOnly.excerpt, undefined);
  assert.equal(abstractOnly.abstract, "Available abstract.");
  assert.equal(metadataOnly.excerpt, undefined);
  const keys = sourceKeys(result.citations);
  assert.ok(keys.has("pmc:PMC101:2"));
  assert.ok(keys.has("pmid:102"));
  assert.ok(!keys.has("pmid:101"));
  assert.ok(!keys.has("pmid:103"));
});

test("an open-access listing alone cannot authorize quoting full text", async () => {
  const { withEuropeExcerpt } = await import("./europe-full-text.ts");
  const original = { ...card("europepmc", "Atrial fibrillation"), pmid: "101", pmcid: "PMC101", license: "open access" };
  const article = (pmid: string, license: string) => `<article xmlns:xlink="http://www.w3.org/1999/xlink">
    <front><article-meta><article-id pub-id-type="pmid">${pmid}</article-id>
    <permissions><license xlink:href="${license}"/></permissions></article-meta></front>
    <body><p>Atrial fibrillation was the primary outcome in a controlled study with twelve months of follow-up.</p></body>
  </article>`;
  for (const xml of [
    article("101", "https://creativecommons.org/licenses/by-nc/4.0/"),
    article("999", "https://creativecommons.org/licenses/by/4.0/"),
  ]) {
    const result = await withEuropeExcerpt(original, ["atrial", "fibrillation"], async () => new Response(xml));
    assert.equal(result.excerpt, undefined);
  }
});
