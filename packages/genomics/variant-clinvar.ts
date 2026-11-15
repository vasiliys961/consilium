import type {VariantReview,VcfReview} from './variants.ts';
export interface VariantClinvar {status:'matched'|'unmatched'|'unavailable';id?:string;title?:string;significance?:string;reviewStatus?:string;evaluated?:string;conditions?:string[];url?:string;gene?:string}
function hgvsIdentity(value:string){return value.replace(/\([A-Za-z0-9_-]+\)(?=:)/g,'').split(/\s/)[0];}
/** Require the same actual allele, rather than accepting a shared rsID/gene. */
export function matchesClinvarAllele(item:Record<string,any>,variant:VariantReview,build:VcfReview['build']):boolean {
 for(const row of item.variation_set??[]){
  if(variant.hgvs&&/^(?:NM|NR|NC|NG)_\d+\.\d+:/i.test(variant.hgvs)&&[item.title,row.variation_name,...(row.aliases??[])].some(value=>typeof value==='string'&&hgvsIdentity(value)===hgvsIdentity(variant.hgvs!)))return true;
  const [sequence,position,ref,alt]=String(row.canonical_spdi??'').split(':');
  const chromosome=sequence?.match(/^NC_0*(\d+)\.\d+$/)?.[1];
  const chr=variant.chrom.replace(/^chr/i,'').replace(/^X$/i,'23').replace(/^Y$/i,'24').replace(/^(?:M|MT)$/i,'12920');
  const located=(row.variation_loc??[]).some((location:Record<string,unknown>)=>location.assembly_name===build&&String(location.start)===String(variant.position)&&String(location.chr).toUpperCase()===variant.chrom.replace(/^chr/i,'').toUpperCase());
  if(build==='GRCh38'&&located&&chromosome&&Number(chromosome)===Number(chr)&&Number(position)+1===variant.position&&ref?.toUpperCase()===variant.ref.toUpperCase()&&alt?.toUpperCase()===variant.alt.toUpperCase())return true;
 }
 return false;
}
function queryFor(variant:VariantReview,build:VcfReview['build']){
 const hgvs=variant.hgvs&&/^(?:NM|NR|NC|NG)_\d+\.\d+:[^\s"[\]]+$/.test(variant.hgvs)?variant.hgvs:null;
 if(hgvs)return `"${hgvs}"`;
 // The returned canonical SPDI is checked on GRCh38; do not mix hg19 positions
 // with that allele or spend a query we cannot verify without liftover/HGVS.
 if(build!=='GRCh38')return null;
 if(variant.rsid&&/^rs\d+$/.test(variant.rsid))return `${variant.rsid}[variant name]`;
 if(!/^(?:chr)?(?:[1-9]|1\d|2[0-2]|X|Y|M|MT)$/i.test(variant.chrom))return null;
 return `${variant.chrom.replace(/^chr/i,'')}[chr] AND ${variant.position}[chrpos38]`;
}

export async function lookupVariantClinvar(variants:readonly VariantReview[],build:VcfReview['build'],fetchImpl:typeof fetch=fetch):Promise<Map<string,VariantClinvar>>{
 const selected=variants.slice(0,8).map(variant=>({variant,query:queryFor(variant,build)})).filter(row=>row.query);
 const results=new Map<string,VariantClinvar>();if(!selected.length)return results;
 const request=async(endpoint:string,params:Record<string,string>)=>{const query=new URLSearchParams({db:'clinvar',retmode:'json',...params});if(process.env.NCBI_API_KEY)query.set('api_key',process.env.NCBI_API_KEY);const response=await fetchImpl(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/${endpoint}?${query}`,{signal:AbortSignal.timeout(9000)});if(!response.ok)throw Error('ClinVar unavailable');return response.json();};
 try{
  const search=await request('esearch.fcgi',{term:selected.map(row=>`(${row.query})`).join(' OR '),retmax:'40'});
  const ids=search?.esearchresult?.idlist;if(!Array.isArray(ids))throw Error('ClinVar search');
  const summary=ids.length?await request('esummary.fcgi',{id:ids.join(',')}):{result:{}};
  for(const {variant} of selected){
   const id=ids.find(id=>matchesClinvarAllele(summary.result?.[id]??{},variant,build));
   if(!id){results.set(variant.id,{status:'unmatched'});continue;}
   const item=summary.result[id],assessment=item.germline_classification??item.clinical_significance??{};
   results.set(variant.id,{status:'matched',id,title:String(item.title??variant.id),significance:String(assessment.description??''),reviewStatus:String(assessment.review_status??''),evaluated:String(assessment.last_evaluated??''),conditions:(assessment.trait_set??[]).map((trait:{trait_name?:string})=>trait.trait_name).filter((name:unknown)=>typeof name==='string'),url:`https://www.ncbi.nlm.nih.gov/clinvar/variation/${id}/`,gene:item.genes?.[0]?.symbol});
  }
 }catch{for(const {variant} of selected)results.set(variant.id,{status:'unavailable'});}
 return results;
}
