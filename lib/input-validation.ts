import {validImageProfile} from '../packages/medical-images/profiles.ts';
import type { ConductInput } from './conductor.ts';
import {validDrugSelections} from './drug-labels.ts';
import {parseLocale} from './locale.ts';
import {validCouncilSpecialty} from './adaptive-council.ts';
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const optionalString=(value:unknown)=>value===undefined||typeof value==='string';
function librarySource(value:unknown):boolean{if(value===undefined)return true;return record(value)&&['documentId','chunkId','title'].every(key=>typeof value[key]==='string'&&String(value[key]).length>0&&String(value[key]).length<=500)&&Number.isInteger(value.page)&&Number(value.page)>0&&Number(value.page)<=100000;}
function files(value:unknown):boolean{
 if(value===undefined)return true;if(!Array.isArray(value)||value.length>200)return false;
 return value.every(file=>record(file)&&(file.clientId===undefined||(typeof file.clientId==='string'&&/^[a-f0-9-]{36}$/i.test(file.clientId)))&&(file.imageProfile===undefined||validImageProfile(file.imageProfile))&&librarySource(file.librarySource)&&typeof file.name==='string'&&file.name.length>0&&file.name.length<500&&['text','image','binary','audio'].every(key=>optionalString(file[key]))
 &&(file.frames===undefined||(Array.isArray(file.frames)&&file.frames.length<=3&&file.frames.every(frame=>record(frame)&&typeof frame.time==='number'&&Number.isFinite(frame.time)&&typeof frame.image==='string')))
 &&(file.masks===undefined||(Array.isArray(file.masks)&&file.masks.every(box=>record(box)&&['x','y','width','height'].every(key=>typeof box[key]==='number'&&Number.isFinite(box[key])&&Number(box[key])>=0)))));
}
export function validCaseInput(value:unknown):value is ConductInput {
 if(!record(value)||!optionalString(value.text)||!optionalString(value.caseId)||!files(value.files)||!files(value.referenceFiles))return false;
 if(value.imageProfile!==undefined&&!validImageProfile(value.imageProfile))return false;
 if(value.sourceLocale!==undefined&&parseLocale(value.sourceLocale)!==value.sourceLocale)return false;
 if(value.drugLabels!==undefined&&!validDrugSelections(value.drugLabels))return false;
 if(value.councilSpecialty!==undefined&&!validCouncilSpecialty(value.councilSpecialty))return false;
 if(value.task!==undefined&&!['interpret','clinical','management','evidence'].includes(String(value.task)))return false;
 if(value.speech!==undefined&&(!record(value.speech)||!optionalString(value.speech.text)||!optionalString(value.speech.audio)))return false;
 if(record(value.speech)&&value.speech.target!==undefined&&parseLocale(value.speech.target)!==value.speech.target)return false;
 if(value.equipment!==undefined&&(!record(value.equipment)||!optionalString(value.equipment.name)||!optionalString(value.equipment.specialty)))return false;
 if(value.draft!==undefined&&(!record(value.draft)||!optionalString(value.draft.summary)))return false;
 return true;
}
