import type {ClinicalCase} from './casebook.ts';
import type {RadiologyModuleReport} from './module-evidence.ts';
import type {ProtocolDocument} from '../packages/protocol/document.ts';

const SHA256=/^[0-9a-f]{64}$/i;

export function radiologySourceStatus(value:ClinicalCase,report:RadiologyModuleReport):'linked'|'unverified'|'stale'{
 if(!report.fileKeys.length || report.fileKeys.some(key=>!SHA256.test(key)))return 'unverified';
 const keys=new Set(value.files.map(file=>file.sha256?.toLowerCase()).filter(Boolean));
 return report.fileKeys.every(key=>keys.has(key.toLowerCase()))?'linked':'stale';
}

export function protocolEditorHref(caseId:string,document:Pick<ProtocolDocument,'id'|'locale'|'edition'>):string{
 const query=new URLSearchParams({case:caseId,locale:document.edition==='ru'?'ru':document.locale,document:document.id});
 return (document.edition?'/protocol/case?':'/protocol/structured?')+query.toString();
}

/** A missing or wrong-language ID never falls back to a different saved note. */
export function requestedProtocol(documents:readonly ProtocolDocument[]|undefined,id:string,locale:string,edition?:ProtocolDocument['edition']):ProtocolDocument|undefined{
 return documents?.find(doc=>doc.id===id&&doc.locale===locale&&doc.edition===edition);
}

export function earlierProtocolVersions(value:ClinicalCase,document:ProtocolDocument){
 return (value.protocolRevisions??[]).filter(item=>item.document.id===document.id
  &&item.document.edition===document.edition&&item.document.locale===document.locale);
}
