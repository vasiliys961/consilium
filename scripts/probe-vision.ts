/** Synthetic-only live integration probe; never use patient images here. */
import {readFile,writeFile} from 'node:fs/promises';
import {comprehendFrames,accountFrame} from '../packages/vision/comprehend.ts';
process.loadEnvFile('.env.local');
const calls:unknown[]=[];
const image=`data:image/png;base64,${(await readFile('docs/qa/ecg2.png')).toString('base64')}`;
const fetchImpl:typeof fetch=async(input,init)=>{
 const response=await fetch(input,init);const body=await response.clone().json().catch(()=>null);calls.push({status:response.status,response:body});return response;
};
const result=await comprehendFrames(process.env,{locale:'ru',note:'что здесь',frames:[{name:'ecg2.png',image,modality:'ecg'}]},fetchImpl);
await writeFile('docs/qa/vision-probe.json',JSON.stringify({result,calls},null,2));
for(const call of calls as Array<{status:number;response:any}>)console.log(JSON.stringify({status:call.status,error:call.response?.error,finish:call.response?.choices?.[0]?.finish_reason,content:call.response?.choices?.[0]?.message?.content?.slice(0,500)}));
console.log(JSON.stringify({accounts:result.accounts.length,failures:result.failures}));
