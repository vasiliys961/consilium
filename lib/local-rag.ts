import type { CaseFile } from './conductor.ts';
import { topicTerms, type Citation } from './literature.ts';
export interface RetrievedPassage {id:string;title:string;locator:string;text:string;score:number}
function words(text:string):string[]{return topicTerms(text,10000).map(word=>word.length>6?word.slice(0,-2):word);}
export function retrievePassages(query:string,files:readonly CaseFile[],limit=6):RetrievedPassage[]{
 const selected=files.filter(file=>file.librarySource&&file.text?.trim()).slice(0,limit).map(file=>({id:`library:${file.librarySource!.documentId}:${file.librarySource!.chunkId}`,title:file.librarySource!.title,locator:`страница PDF ${file.librarySource!.page}`,text:file.text!.slice(0,6500),score:1}));
 const terms=words(query);if(!terms.length)return selected;
 const chunks:RetrievedPassage[]=[];
 for(const file of files){if(file.librarySource)continue;const text=file.text?.trim();if(!text)continue;
  const sections=text.split(/\f/);
  sections.forEach((section,page)=>{
   for(let offset=0;offset<section.length;offset+=1000){const fragment=section.slice(offset,offset+1300);const tokens=words(fragment);const matched=terms.filter(term=>tokens.some(token=>token===term));
    if(!matched.length)continue;
    const score=matched.length/Math.sqrt(Math.max(tokens.length,1));
    chunks.push({id:`rag:${file.sha256?.slice(0,12)||encodeURIComponent(file.name)}:${page+1}:${offset}`,title:file.name,locator:sections.length>1?`страница ${page+1}, символ ${offset+1}`:`текстовый фрагмент ${Math.floor(offset/1000)+1}, символ ${offset+1}`,text:fragment,score});
   }
  });
 }
 return [...selected,...chunks.sort((a,b)=>b.score-a.score).slice(0,Math.max(0,limit-selected.length))];
}
export function passageCitations(passages:readonly RetrievedPassage[],retrieved:string):Citation[]{
 return passages.map(p=>({shelf:'local',title:p.title,url:null,retrieved,license:null,country:null,pmid:null,journal:null,year:null,pdf:null,edition:null,chapter:p.locator,page:null,passageId:p.id,excerpt:p.text}));
}
