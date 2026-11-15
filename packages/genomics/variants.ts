import type {VariantClinvar} from './variant-clinvar.ts';
import {combineAcmg,type AcmgCall} from './acmg.ts';
export interface VariantReview {
 id:string;chrom:string;position:number;ref:string;alt:string;rsid:string|null;gene:string|null;consequence:string|null;hgvs:string|null;
 genotype:string|null;depth:number|null;filter:string;quality:number|null;population:{source:string;af:number}|null;
 clinvar?:VariantClinvar;
 reportedSignificance:string|null;criteria:string[];acmg:AcmgCall|null;priority:'high_impact'|'coding'|'other';warnings:string[];
}
export interface VcfCall {id:string;rsid:string|null;gene:string|null;genotype:string|null;bases:string|null;reference:boolean;filter:string;annotations?:Record<string,string>;end?:number}
export interface VcfReview {calls?:VcfCall[];build:'GRCh37'|'GRCh38'|'unknown';records:number;samples:number;variants:VariantReview[];invalidRows:number;referenceCalls:number;truncated:boolean;warnings:string[]}
const decode=(value:string)=>{try{return decodeURIComponent(value);}catch{return value;}};
function infoMap(value:string){return Object.fromEntries(value.split(';').filter(Boolean).map(item=>{const at=item.indexOf('=');return at<0?[item,'true']:[item.slice(0,at),decode(item.slice(at+1))];}));}
function first(info:Record<string,string>,keys:string[]){for(const key of keys)if(info[key]&&info[key]!=='.')return info[key];return null;}
export function parseVcf(text:string,locale:'ru'|'en'='en',limit=2000):VcfReview|null {
 const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/);const header=lines.find(line=>line.startsWith('#CHROM\t'));
 if(!header)return null;
 const metadata=lines.filter(line=>/^##(?:reference|assembly|contig)=/i.test(line)).join('\n');
 const build=/GRCh38|hg38/i.test(metadata)?'GRCh38':/GRCh37|hg19/i.test(metadata)?'GRCh37':'unknown';
 const result:VcfReview={calls:[],build,records:0,samples:Math.max(0,header.split('\t').length-9),variants:[],invalidRows:0,referenceCalls:0,truncated:false,warnings:[]};
 const csqHeader=lines.find(line=>line.startsWith('##INFO=<ID=CSQ,'));const csqFormat=csqHeader?.match(/Format:\s*([^"\n>]+)/)?.[1]?.split('|')??[];
 for(const line of lines){if(!line||line.startsWith('#'))continue;result.records++;const fields=line.split('\t');const [chrom,pos,id,ref,alts,qual,filter,rawInfo,format,sample]=fields;
 if(fields.length<8||!Number.isSafeInteger(Number(pos))||Number(pos)<1||!ref||!alts){result.invalidRows++;continue;}
 const info=infoMap(rawInfo);const observed=Object.fromEntries((format??'').split(':').map((key,i)=>[key,(sample??'').split(':')[i]]));
 const genotype=observed.GT&&observed.GT!=='.'?observed.GT:null;
 const alternatives=alts.split(',');const alleles=genotype?.split(/[\/|]/);
 const reference=Boolean(alleles?.every(a=>a==='0'));
 const geneInRow=first(info,['GENE','Gene_Symbol','SNPEFF.Gene_name','SYMBOL','Gene.refGene'])||info.GENEINFO?.split(':')[0]||info.ANN?.split(',')[0]?.split('|')[3]||(()=>{const index=csqFormat.indexOf('SYMBOL');return index>=0?info.CSQ?.split(',')[0]?.split('|')[index]:null;})()||null;
 if((result.calls?.length??0)<limit)result.calls?.push({id:`${chrom}-${pos}-${ref}`,rsid:/^rs\d+$/i.test(id)?id:null,gene:geneInRow,genotype,bases:alleles&&!alleles.includes('.')?alleles.map(a=>Number(a)===0?ref:alternatives[Number(a)-1]??'?').join(genotype?.includes('|')?'|':'/'):null,reference,filter,annotations:info,...(Number.isSafeInteger(Number(info.END))&&Number(info.END)>=Number(pos)?{end:Number(info.END)}:{})});
 if(reference){result.referenceCalls++;continue;}
 const altList=alts.split(',');
 for(let index=0;index<altList.length;index++){const alt=altList[index];if(alt==='.'||alt==='<NON_REF>'||alt==='*')continue;
 if(genotype&&!genotype.split(/[\/|]/).some(allele=>Number(allele)===index+1))continue;
 if(result.variants.length>=limit){result.truncated=true;continue;}
 const warnings:string[]=[];
 const ann=info.ANN?.split(',').map(value=>value.split('|')).find(value=>value[0]===alt);
 const csq=info.CSQ?.split(',').map(value=>value.split('|')).find(value=>value[0]===alt);
 const field=(name:string)=>{const i=csqFormat.indexOf(name);return i>=0?csq?.[i]:undefined;};
 const gene=first(info,['GENE','Gene_Symbol','SNPEFF.Gene_name','SYMBOL','Gene.refGene'])||info.GENEINFO?.split(':')[0]||ann?.[3]||field('SYMBOL')||null;
 const consequence=first(info,['VEP.Consequence','Consequence','SNPEFF.Effect'])||ann?.[1]||field('Consequence')||null;
 const hgvs=first(info,['HGVSc','HGVS_C','VEP.HGVSc'])||ann?.[9]||field('HGVSc')||null;
 let population:VariantReview['population']=null;
 for(const key of ['gnomAD_AF','gnomADg_AF','gnomADe_AF','gnomAD_exome_AF','gnomAD_genome_AF']){if(!info[key]||info[key]==='.')continue;const values=info[key].split(',');const af=Number(values[index]??values[0]);if(Number.isFinite(af)&&af>=0&&af<=1){population={source:`VCF INFO ${key}`,af};break;}}
 const rawCodes=first(info,['ACMG','ACMG_CRITERIA']);let criteria:string[]=[];let acmg:AcmgCall|null=null;
 if(rawCodes){try{acmg=combineAcmg(rawCodes.split(/[,|&]/),locale);criteria=acmg.criteria;}catch{warnings.push(locale==='ru'?'Критерии в INFO не прошли проверку; класс не присвоен.':'INFO criteria failed validation; no class assigned.');}}
 // Generic INFO/AF and sample/VF are not population frequencies and never trigger BA1/PM2.
 const reportedSignificance=first(info,['CLNSIG','ClinVar_CLNSIG'])|| (info['dbSNP.ClinicalSig']?`dbSNP ClinicalSig: ${info['dbSNP.ClinicalSig']} (embedded annotation)` : null);
 if(filter!=='PASS'&&filter!=='.')warnings.push(locale==='ru'?`Фильтр качества не пройден: ${filter}`:`Quality filter did not pass: ${filter}`);
 if(!genotype||genotype.split(/[\/|]/).includes('.'))warnings.push(locale==='ru'?'Генотип отсутствует или неполный; носительство не подтверждено.':'Genotype missing or partial; carriage is not confirmed.');
 const priority=/frameshift|stop_gained|splice_acceptor|splice_donor/i.test(consequence??'')?'high_impact':/missense|coding|inframe/i.test(consequence??'')?'coding':'other';
 result.variants.push({id:`${chrom.replace(/^chr/i,'')}-${pos}-${ref}-${alt}`,chrom,position:Number(pos),ref,alt,rsid:/^rs\d+$/i.test(id)?id:null,gene,consequence,hgvs,genotype,depth:observed.DP&&observed.DP!=='.'?Number(observed.DP):null,quality:qual!=='.'?Number(qual):null,filter,population,reportedSignificance,criteria,acmg,priority,warnings});
 }
 }
 if(result.records-result.invalidRows>(result.calls?.length??0))result.warnings.push(`Genotype extraction table retains the first ${limit} valid records; later genotypes remain outside this table.`);
 if(result.invalidRows)result.warnings.push(`${result.invalidRows} invalid rows`);
 if(result.truncated)result.warnings.push(`Only the first ${limit} called alleles were retained; additional alleles were not reviewed.`);
 if(result.samples>1)result.warnings.push('Multiple samples: genotype review uses the first sample; select and review other samples separately.');
 if(build!=='GRCh38')result.warnings.push(locale==='ru'?'Координаты не отправляются в gnomAD GRCh38 без подтверждённой сборки или конверсии.':'Coordinates are not queried against GRCh38 without confirmed build or liftover.');
 return result;
}
