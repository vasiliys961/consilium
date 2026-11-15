import {lookupVariantClinvar} from './variant-clinvar.ts';
import {clinicalGenomicContext} from './clinical-context.ts';
import type {GenomicsFinding} from './inspect.ts';
import {combineAcmg} from './acmg.ts';
import {lookupFrequency} from './frequency.ts';
import {lookupClinvar} from './clinvar.ts';
export async function enrichGenomicReview(finding:GenomicsFinding,locale:'ru'|'en',fetchImpl:typeof fetch=fetch,external=true):Promise<GenomicsFinding>{
 if(!finding.review)return finding;
 const rank=(variant:typeof finding.review.variants[number])=>(variant.filter!=='PASS'&&variant.filter!=='.'?20:0)+(/pathogenic|патоген/i.test(variant.reportedSignificance??'')&&!/conflict|uncertain|неопредел/i.test(variant.reportedSignificance??'')?0:variant.priority==='high_impact'?1:variant.priority==='coding'?2:3);
 const ranked=[...finding.review.variants].sort((a,b)=>rank(a)-rank(b));
 const clinvar=external?await lookupVariantClinvar(ranked,finding.review.build,fetchImpl):new Map();
 for(const variant of ranked){const note=clinvar.get(variant.id);if(note){variant.clinvar=note;if(!variant.gene&&note.status==='matched'&&note.gene)variant.gene=note.gene;}}
 let remaining=3;
 for(const variant of ranked){
  if(variant.filter!=='PASS'&&variant.filter!=='.')continue;
  let criterion:string|null=null;
  if(variant.population){const af=variant.population.af;criterion=af>0.05?'BA1':af<0.0001?'PM2':null;}
  if(!variant.population&&external&&finding.review.build==='GRCh38'&&remaining>0&&/^[ACGT]+$/i.test(variant.ref)&&/^[ACGT]+$/i.test(variant.alt)){
   remaining--;const result=await lookupFrequency(variant.id,fetchImpl);
   if(result.status==='found'&&result.af!==null){variant.population={source:'gnomAD v4 GRCh38',af:result.af};criterion=result.criterion;}
   // An absent record alone does not prove adequate coverage; don't add PM2 from a missed query.
  }
  if(criterion&&!variant.criteria.includes(criterion))variant.criteria.push(criterion);
  if(variant.criteria.length)variant.acmg=combineAcmg(variant.criteria,locale);
 }
 const review={...finding.review,variants:ranked};
 return {...finding,review,acmg:review.variants.length===1?review.variants[0].acmg:null};
}
export function genomicRecord(finding:GenomicsFinding,source:string):string{
 const review=finding.review;if(!review)return '';
 const infoById=new Map((review.calls??[]).map(call=>[call.id,call.annotations??{}]));
 const rows=review.variants.map(v=>`${v.id} | gene=${v.gene??'not annotated'} | genotype=${v.genotype??'unknown'} | consequence=${v.consequence??'not annotated'} | ${v.hgvs??''} | filter=${v.filter} | ${v.population?`${v.population.source} AF=${v.population.af}`:'No verified gnomAD frequency'} | module ACMG=${v.acmg?.label??'not assigned'} | criteria=${v.criteria.join(',')||'none'} | ClinVar exact-allele lookup=${v.clinvar?JSON.stringify(v.clinvar):'not queried'} | reported annotation=${v.reportedSignificance??'none'} | embedded annotations=${Object.entries(infoById.get(`${v.chrom}-${v.position}-${v.ref}`)??{}).filter(([key])=>/^(VEP\.|SNPEFF\.|SIFT\.|PolyPhen\.|dbSNP\.ClinicalSig|dbSNP\.DiseaseVariant|CLN|ACMG|gnomAD|Gene_Symbol|GENE)/.test(key)).map(([key,value])=>`${key}=${value}`).join(';')} | limits=${v.warnings.join(';')}`);
 const calls=(review.calls??[]).map(c=>`${c.gene??'?'};${c.rsid??c.id};${c.genotype??'?'};${c.bases??'?'}${c.reference?';reference-call':''}${c.end?`;blockEnd=${c.end}`:''}`);
 const selected:string[]=[];let budget=80000;
 const all=[...rows,'Observed genotypes including reference calls (gene;identifier;GT;bases):',...calls];
 for(const row of all){if(row.length>budget)break;selected.push(row);budget-=row.length+1;}
 return [`Genomic file ${source}: ${review.records} records; ${review.variants.length} retained alternate alleles; ${review.referenceCalls} reference genotypes; build=${review.build}.`, 'These are called variants/annotations, not independently confirmed diagnoses. High-impact consequence does not automatically imply pathogenicity. Embedded dbSNP/ClinVar descriptions are reported annotations, not our ACMG classification. A reference block with END is a gVCF interval, not a separate SNP at every position. Reference genotypes are observed bases, not proof of gene-wide normality; missing positions are not reference. A missing criterion does not mean the file was unreadable.',...review.warnings,clinicalGenomicContext(review),...selected,selected.length<all.length?`Genomic context: ${selected.length} of ${all.length} rows fit the 80000 character budget; other rows were not supplied to this model pass. Verify the extraction tables.`:''].filter(Boolean).join('\n');
}
