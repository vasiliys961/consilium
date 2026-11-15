// HTTP acceptance checks using synthetic text only. No patient data or credentials are printed.
const fs=require('fs');
(async()=>{
const origin='http://127.0.0.1:3107';
const response=await fetch(`${origin}/api/v1/cases`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'Según la nota adjunta, ¿qué datos sobre symptom timing, medicines y allergies se necesitan? Responde en español y cita la nota.',task:'evidence',locale:'es',externalSearch:false,referenceFiles:[{name:'synthetic-workflow.txt',text:'Synthetic engineering workflow note, not a medical guideline. A case review requires symptom timing, current medicines and allergies. Without these data the review is incomplete.'}]})});
const result=await response.json();fs.writeFileSync('docs/qa/library-language.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({test:'local-library-spanish-answer',http:response.status,status:result.clinicalDraft,locale:result.locale,retrieval:result.retrieval,summary:result.draft?.summary,sources:result.citations?.map(c=>({title:c.title,key:c.passageId}))}));
const session=await (await fetch(`${origin}/api/phone/session`,{method:'POST'})).json();
if(!session.phoneOrigin){console.log(JSON.stringify({test:'phone-relay',available:false,reason:session.connectionHint}));return;}
const upload=await fetch(`${session.phoneOrigin}/api/phone/upload`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:session.token,name:'synthetic-phone.txt',dataUrl:'data:text/plain;base64,'+Buffer.from('Synthetic phone transfer test. Not patient data.').toString('base64')})});
const events=await (await fetch(`${origin}/api/phone/events?token=${session.token}&since=0`)).json();
const blocked=await fetch(`${session.phoneOrigin}/api/v1/cases`,{method:'POST'});
const page=await fetch(`${session.phoneOrigin}/phone/send`);
console.log(JSON.stringify({test:'phone-relay',upload:upload.status,received:events.files?.some(f=>f.name==='synthetic-phone.txt'),clinicalApiBlocked:blocked.status===404,phonePage:page.status}));
})();
