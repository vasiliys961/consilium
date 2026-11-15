export const GEMINI_ARGON='google/gemini-4-argon';
export const GEMINI_FLASH='google/gemini-3.8-flash';
export const GEMINI_PRICE_REVIEW_AT='2026-12-01T00:00:00Z';
export const GEMINI_COOKIE='concilium-gemini-choice';
export type GeminiChoice='argon'|'flash';
export type GeminiRate={input:number;output:number;currency:'USD'|'RUB'};
export type GeminiPrice={provider:'polza'|'openrouter';argon:GeminiRate|null;hydrogen?:GeminiRate|null;flash:GeminiRate|null;baseline:GeminiRate};
export type GeminiPolicy={reviewAt:string;reviewActive:boolean;checkedAt:string;prices:GeminiPrice[];priceIncreased:boolean;checkAvailable:boolean;revision:string;needsChoice:boolean;selected:GeminiChoice};
export const GEMINI_BASELINES={
 openrouter:{input:2,output:10,currency:'USD'},
 // Pinned from the authenticated provider catalogue on 12 November 2026.
 polza:{input:121.5249,output:607.6245,currency:'RUB'},
} as const;
export function geminiModel(env:Record<string,string|undefined>={}){
 return env.GEMINI_MODEL===GEMINI_FLASH?GEMINI_FLASH:GEMINI_ARGON;
}
export function readGeminiChoice(cookie:string|null){
 const value=cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(GEMINI_COOKIE+'='))?.slice(GEMINI_COOKIE.length+1);
 if(!value)return null;
 const [model,revision]=value.split('.');
 return (model==='argon'||model==='flash')&&revision&&/^[a-f0-9]{16}$/.test(revision)?{model:model as GeminiChoice,revision}:null;
}
export function resolveGeminiPolicy(prices:GeminiPrice[],checkedAt:string,revision:string,cookie:string|null,now=Date.now()):GeminiPolicy{
 const reviewActive=now>=Date.parse(GEMINI_PRICE_REVIEW_AT);
 const priceIncreased=prices.some(x=>x.argon&&(x.argon.input>x.baseline.input*1.01||x.argon.output>x.baseline.output*1.01));
 const saved=readGeminiChoice(cookie);
 // Old policy cookies cannot silently downgrade the quality-first default.
 const selected:GeminiChoice=saved?.revision===revision?saved.model:'argon';
 const checkAvailable=prices.length>0&&prices.every(x=>Boolean(x.argon&&(selected==='flash'?x.flash:x.argon)));
 const needsChoice=false; // Catalogue outages do not block a pinned reader or silently downgrade it.
 return {reviewAt:GEMINI_PRICE_REVIEW_AT,reviewActive,checkedAt,prices,priceIncreased,checkAvailable,revision,needsChoice,selected};
}

// Consilium has its own budget policy, independent of the visual reader choice.
export const GEMINI_HYDROGEN='google/gemini-4-hydrogen';
export function consiliumHypothesisModel(policy: Pick<GeminiPolicy,'reviewActive'|'priceIncreased'>){
 return policy.reviewActive&&policy.priceIncreased?GEMINI_FLASH:GEMINI_ARGON;
}
