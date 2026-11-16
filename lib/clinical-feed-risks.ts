import type {ClinicalReport} from './clinical-report.ts';

/**
 * Physician-facing, short synopsis of severe LOCAL medication findings.
 * Every warning is scoped to exactly one proposed treatment option; separate
 * options are never treated as co-prescribed. No inference of compatibility.
 */
export type ClinicalFeedRisk={
 option:string;
 severity:'contraindicated'|'major';
 risk:string;
};
export function medicationRisksForFeed(report:ClinicalReport|undefined,limit=4):{
 risks:ClinicalFeedRisk[];remaining:number;
}{
 if(!report||limit<=0)return {risks:[],remaining:0};
 const seen=new Set<string>();
 const all:ClinicalFeedRisk[]=[];
 report.management.forEach((option,index)=>{
  const findings=[
   ...(option.localOrganAlerts??[]).map(a=>({severity:a.severity,risk:a.risk})),
   ...(option.localInteractions??[]).map(a=>({severity:a.severity,risk:a.risk})),
  ];
  for(const finding of findings){
   if(finding.severity!=='major'&&finding.severity!=='contraindicated')continue;
   const message=finding.risk.trim();if(!message)continue;
   const key=index+':'+message.toLowerCase();
   if(seen.has(key))continue;
   seen.add(key);
   all.push({option:option.option||'Вариант '+(index+1),severity:finding.severity,risk:message});
  }
 });
 all.sort((x,y)=>Number(y.severity==='contraindicated')-Number(x.severity==='contraindicated'));
 return {risks:all.slice(0,limit),remaining:Math.max(0,all.length-limit)};
}
