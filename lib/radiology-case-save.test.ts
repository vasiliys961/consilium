import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {createRadiologyCase,persistCase,persistRadiologyMaterials,caseContext,readCases} from './casebook.ts';
import {readVaultCaseById} from './local-vault.ts';
import {prepareRadiologyCaseSave} from './radiology-case-save.ts';
import {restoreMaterial} from './material-routing.ts';

const memory=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>memory.set(key,value)}});
const scan=new File(['synthetic source A'],'scan.dcm',{type:'application/dicom'});
const added=new File(['different synthetic source B'],'scan.dcm',{type:'application/dicom'});
async function clean(id:string){const value=await readVaultCaseById(id);if(value)await persistCase(value,true);}

test('image-first case is created with original bytes and report together and accepts later materials',async()=>{
 const prepared=await prepareRadiologyCaseSave({text:'Synthetic report: uncertain sign, one image only.',currentFiles:[scan],reportSource:{files:[scan],confirmed:[]},caseFiles:[]});
 const value=await createRadiologyCase(prepared.materials,prepared.report);
 try{
  const reopened=(await readVaultCaseById(value.id))!;
  assert.equal(reopened.files.length,1);assert.equal(reopened.moduleReports?.length,1);
  assert.deepEqual(reopened.moduleReports?.[0].fileKeys,[reopened.files[0].sha256]);
  assert.equal(await (await restoreMaterial(reopened.files[0]))?.text(),'synthetic source A');
  const next=await prepareRadiologyCaseSave({text:'',currentFiles:[added],reportSource:{files:[],confirmed:[]},caseFiles:reopened.files});
  await persistRadiologyMaterials(value.id,next.materials);
  const updated=(await readVaultCaseById(value.id))!;
  assert.equal(updated.files.length,2);assert.deepEqual(updated.moduleReports,reopened.moduleReports);
  assert.match(caseContext(updated),/uncertain sign/);
 }finally{await clean(value.id);}
});

test('newly uploaded image with the same filename never becomes the source of an older report',async()=>{
 const sourceFiles=[scan],currentFiles=[added];
 const pending=prepareRadiologyCaseSave({text:'Synthetic report of A',currentFiles,reportSource:{files:sourceFiles,confirmed:[]},caseFiles:[]});
 sourceFiles[0]=added;currentFiles.push(scan);
 const prepared=await pending;
 assert.equal(prepared.materials.length,2);
 const original=prepared.materials.find(file=>atob(file.binary??'')==='synthetic source A')!;
 const other=prepared.materials.find(file=>file.sha256!==original.sha256)!;
 assert.deepEqual(prepared.report?.fileKeys,[original.sha256]);assert.ok(!prepared.report?.fileKeys.includes(other.sha256!));
 const value=await createRadiologyCase(prepared.materials,prepared.report);
 try{assert.deepEqual((await readVaultCaseById(value.id))?.moduleReports?.[0].fileKeys,[original.sha256]);}
 finally{await clean(value.id);}
});

test('reopened description keeps its saved source keys when the case has additional studies',async()=>{
 const original=await prepareRadiologyCaseSave({text:'Synthetic original',currentFiles:[scan],reportSource:{files:[scan],confirmed:[]},caseFiles:[]});
 const prepared=await prepareRadiologyCaseSave({text:'Synthetic edited report',currentFiles:[added],reportSource:{files:[],confirmed:original.report!.fileKeys},caseFiles:original.materials});
 assert.deepEqual(prepared.report?.fileKeys,original.report!.fileKeys);
 assert.deepEqual(prepared.report?.sources,['scan.dcm']);
});

test('invalid report or source refuses case creation without leaving an empty case',async()=>{
 const before=(await readCases(true)).length;
 await assert.rejects(()=>createRadiologyCase([],undefined));
 await assert.rejects(()=>createRadiologyCase([{name:'bad.dcm',sha256:'invalid',processingModule:'radiology'}]));
 await assert.rejects(()=>createRadiologyCase([],{text:'Synthetic',fileKeys:['invalid'],sources:[]}));
 assert.equal((await readCases(true)).length,before);
});

test('an incomplete saved source set never silently becomes a partly verified report',async()=>{
 const prepared=await prepareRadiologyCaseSave({text:'Synthetic source set',currentFiles:[],reportSource:{files:[],confirmed:['a'.repeat(64),'invalid']},caseFiles:[]});
 assert.deepEqual(prepared.report?.fileKeys,[]);
});
