import type {Analysis,ClinicalCase} from './casebook.ts';
import {citationPassages,type Citation} from './literature.ts';

export const GUIDELINE_HANDOFF_KEY='consilium-guideline-topic-v1';
export type ClinicalSourceEntry={
 citation:Citation;
 analysisId:string;
 question:string;
 matchedStatements:string[];
 passages:Array<{citation:Citation;matchedStatements:string[]}>;
};
export type ClinicalSourceReview={
 current:ClinicalSourceEntry[];
 earlier:ClinicalSourceEntry[];
 currentCount:number;
 earlierCount:number;
};
function citationKey(card:Citation):string{
 // A publication may contribute several separate passages; display it once,
 // and keep the linked clinical statement from the most relevant record.
 const normalizedTitle=card.title.replace(/\s+/g,' ').trim().toLocaleLowerCase();
 if(normalizedTitle)return 'publication:'+normalizedTitle+':'+(card.year??'');
 return card.doi&&'doi:'+card.doi.toLowerCase()||card.pmid&&'pmid:'+card.pmid||
  card.url&&'url:'+card.url||card.passageId||card.shelf;
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
 return (analysis.result.citations??[]).flatMap(citationPassages).map(citation=>{
  const matchedStatements=(analysis.result.draft.statements??[]).filter(statement=>
   !statement.held&&matchesClaim(statement.source,citation)
  ).map(statement=>statement.text);
  return {citation,analysisId:analysis.id,question:analysis.question||'Клинический разбор',
   matchedStatements,passages:[{citation,matchedStatements}]};
 });
}
function dedup(raw:ClinicalSourceEntry[]):ClinicalSourceEntry[]{
 // One publication card, but retain distinct excerpts and their OWN linked claims.
 // Otherwise a deduplicated paper can silently lose the passage actually cited.
 const grouped=new Map<string,ClinicalSourceEntry>();
 for(const entry of raw){
  const key=citationKey(entry.citation),existing=grouped.get(key);
  if(!existing){grouped.set(key,{...entry,passages:entry.passages.slice()});continue;}
  existing.matchedStatements=[...new Set([...existing.matchedStatements,...entry.matchedStatements])];
  for(const passage of entry.passages){
   if(!existing.passages.some(item=>
    item.citation.passageId&&item.citation.passageId===passage.citation.passageId||
    item.citation.excerpt&&item.citation.excerpt===passage.citation.excerpt||
    !item.citation.excerpt&&!passage.citation.excerpt&&item.citation.url===passage.citation.url)){
    existing.passages.push(passage);
   }
  }
  if(score(entry)>score({...existing,matchedStatements:[]}))existing.citation=entry.citation;
 }
 return [...grouped.values()];
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
 const shownCurrent=rawCurrent.slice(0,limit);
 const shownEarlier=rawEarlier.slice(0,Math.max(0,limit-shownCurrent.length));
 return {current:shownCurrent,earlier:shownEarlier,
  currentCount:rawCurrent.length,earlierCount:rawEarlier.length};
}
export type GuidelineTopicHandoff={version:1;caseId?:string;topic:string;sources:Array<{title:string;url:string|null}>;preparedAt:string};
/** This transfer stays in sessionStorage, never in an URL or a network request.
 * The physician must inspect and approve it in /guidelines before external searching.
 */
export function makeGuidelineTopicHandoff(
 value:ClinicalCase,analysis:Analysis,review:ClinicalSourceReview
):GuidelineTopicHandoff{
 const text=(analysis.result.draft.report?.problem||analysis.question||value.question||'').replace(/\s+/g,' ').trim().slice(0,350);
 const seen=new Set<string>();
 const sources=[...review.current,...review.earlier].flatMap(entry=>{
  const title=entry.citation.title.trim().slice(0,250),url=entry.citation.url;
  if(!title||seen.has(title.toLowerCase()))return [];
  seen.add(title.toLowerCase());
  return [{title,url:url&&/^https:\/\//i.test(url)&&url.length<900?url:null}];
 }).slice(0,6);
 return {version:1,caseId:value.id,topic:text,sources,preparedAt:new Date().toISOString()};
}
export function parseGuidelineTopicHandoff(raw:string|null):GuidelineTopicHandoff|null{
 if(!raw||raw.length>3000)return null;
 try{
  const value=JSON.parse(raw) as GuidelineTopicHandoff;
  if(value?.version!==1||(value.caseId!==undefined&&(typeof value.caseId!=='string'||value.caseId.length>150))||typeof value.topic!=='string'||value.topic.length>350||typeof value.preparedAt!=='string'
    ||!Array.isArray(value.sources)||value.sources.length>6
    ||value.sources.some(x=>!x||typeof x.title!=='string'||x.title.length>250
     ||!(x.url===null||typeof x.url==='string'&&x.url.length<900&&/^https:\/\//i.test(x.url))))return null;
  return value;
 }catch{return null;}
}
