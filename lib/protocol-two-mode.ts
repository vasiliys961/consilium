import type {Analysis} from './casebook.ts';
import type {ProtocolDocument,ProtocolKind,ProtocolPresentation} from '../packages/protocol/document.ts';
import type {ProtocolGenerationMode} from '../packages/protocol/generate.ts';
import type {Locale} from './locale.ts';

/** Only the newest completed case analysis is eligible for inexpensive formatting. */
export function completedProtocolSourceId(analyses:readonly Analysis[]|undefined):string|undefined{
 const latest=analyses?.[0];
 return latest?.result.clinicalDraft==='generated'?latest.id:undefined;
}

/** A saved French draft must never appear in the English editor, or vice versa. */
export function savedStructuredProtocol(
 documents:readonly ProtocolDocument[]|undefined,
 kind:ProtocolKind,
 locale:Locale,
 mode:ProtocolGenerationMode,
 analysisId?:string,
 presentation:ProtocolPresentation='formal',
 sourceProtocolId?:string
):ProtocolDocument|undefined{
 return documents?.find(doc=>{
  if(doc.locale!==locale||doc.kind!==kind||doc.edition||(doc.presentation??'formal')!==presentation)return false;
  if(mode==='from-analysis')return Boolean(analysisId&&doc.sourceAnalysisId===analysisId&&doc.generationMode==='from-analysis');
  if(mode==='from-protocol')return Boolean(sourceProtocolId&&doc.sourceProtocolId===sourceProtocolId&&doc.generationMode==='from-protocol');
  return !doc.sourceAnalysisId&&!doc.sourceProtocolId&&doc.generationMode!=='from-analysis'&&doc.generationMode!=='from-protocol';
 });
}
