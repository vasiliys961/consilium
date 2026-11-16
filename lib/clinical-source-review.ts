import type {Analysis,ClinicalCase} from './casebook.ts';
import type {Citation} from './literature.ts';

export const GUIDELINE_HANDOFF_KEY='consilium-guideline-topic-v1';
export type ClinicalSourceEntry={
 citation:Citation;
 analysisId:string;
 question:string;
 matchedStatements:string[];
};
export type ClinicalSourceReview={
 current:ClinicalSourceEntry[];
 earlier:ClinicalSourceEntry[];
 currentCount:number;
 earlierCount:number;
};
function citationKey(card:Citation):string{
 return card.passageId||card.doi&&'doi:'+card.doi.toLowerCase()||card.pmid&&'pmid:'+card.pmid||
  card.url&&'url:'+card.url||card.shelf+':'+card.title.toLowerCase();
}
function matchesClaim(source:string|null,card:Citation):boolean{
 if(!source)return false;
 return source===card.passageId||source===card.url||Boolean(card.pmid&&source==='pmid:'+card.pmid);
}
function score(entry:ClinicalSourceEntry):number{
 const card=entry.citation;
 const category:Record<Citation['shelf'],number>={world:80,russia:78,local:65,europepmc:60,drug:40,genetics:40};
 return category[card.shelf]+(entry.matchedStatements.length?30:0)+(card.excerpt?8:card.abstract?4:0)
  +(card.url&&/^https:\/\//i.test(card.url)?3:0);
}
function entries(analysis:Analysis):ClinicalSourceEntry[]{
 return (analysis.result.citations??[]).map(citation=>({
  citation,analysisId:analysis.id,question:analysis.question||'Клинический разбор',
  matchedStatements:(analysis.result.draft.statements??[]).filter(statement=>
   !statement.held&&matchesClaim(statement.source,citation)
  ).map(statement=>statement.text)
 }));
}
function dedup(raw:ClinicalSourceEntry[]):ClinicalSourceEntry[]{
 const seen=new Set<string>();
 return raw.filter(entry=>{
  const key=citationKey(entry.citation);
  if(seen.has(key))return false;
  seen.add(key);return true;
 });
}

/** A summary may have zero newly retrieved citations while earlier stages had real source records.
 * Never label older references as evidence read during the summary itself.
 */
export function clinicalSourcesForStage(
 analyses:readonly Analysis[],stageIndex:number,limit=6
):ClinicalSourceReview{
 const current=analyses[stageIndex];
 if(!current)return {current:[],earlier:[],currentCount:0,earlierCount:0};
 const rawCurrent=dedup(entries(current)).sort((a,b)=>score(b)-score(a));
 // Previous-stage sources are shown only in an aggregate summary, not silently reused in each ordinary analysis.
 const rawEarlier=current.kind==='summary'
  ?dedup(analyses.slice(stageIndex+1).flatMap(entries)).filter(entry=>
    !rawCurrent.some(item=>citationKey(item.citation)===citationKey(entry.citation))
   ).sort((a,b)=>score(b)-score(a))
  :[];
 return {current:rawCurrent.slice(0,limit),earlier:rawEarlier.slice(0,limit),
  currentCount:rawCurrent.length,earlierCount:rawEarlier.length};
}
export type GuidelineTopicHandoff={version:1;topic:string;sourceTitles:string[];preparedAt:string};
/** This transfer stays in sessionStorage, never in an URL or a network request.
 * The physician must inspect and approve it in /guidelines before external searching.
 */
export function makeGuidelineTopicHandoff(
 value:ClinicalCase,analysis:Analysis,review:ClinicalSourceReview
):GuidelineTopicHandoff{
 const text=(analysis.result.draft.report?.problem||analysis.question||value.question||'').replace(/\s+/g,' ').trim().slice(0,350);
 const titles=[...review.current,...review.earlier].map(entry=>entry.citation.title.trim()).filter(Boolean).slice(0,6);
 return {version:1,topic:text,sourceTitles:[...new Set(titles)],preparedAt:new Date().toISOString()};
}
export function parseGuidelineTopicHandoff(raw:string|null):GuidelineTopicHandoff|null{
 if(!raw||raw.length>3000)return null;
 try{
  const value=JSON.parse(raw) as GuidelineTopicHandoff;
  if(value?.version!==1||typeof value.topic!=='string'||value.topic.length>350||typeof value.preparedAt!=='string'
    ||!Array.isArray(value.sourceTitles)||value.sourceTitles.length>6
    ||value.sourceTitles.some(x=>typeof x!=='string'||x.length>250))return null;
  return value;
 }catch{return null;}
}
