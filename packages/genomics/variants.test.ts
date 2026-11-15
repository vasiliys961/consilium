import test from 'node:test';import assert from 'node:assert/strict';
import {parseVcf} from './variants.ts';import {inspectGenomics} from './inspect.ts';import {enrichGenomicReview} from './review.ts';
const header='##fileformat=VCFv4.2\n##reference=hg19\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSAMPLE\n';
test('standard annotated VCF needs no doctor-opus passport and is read separately from ACMG classification',async()=>{
 const text=header+'17\t123\trs123\tA\tG\t80\tPASS\tGene_Symbol=GENE1;VEP.Consequence=missense_variant;AF=0.5;dbSNP.ClinicalSig=5\tDP:GT\t30:0/1';
 const finding=inspectGenomics({name:'test.vcf',text},'ru');assert.equal(finding?.status,'read');assert.equal(finding?.review?.build,'GRCh37');assert.equal(finding?.review?.variants[0].gene,'GENE1');assert.equal(finding?.review?.variants[0].genotype,'0/1');assert.equal(finding?.review?.variants[0].population,null);assert.equal(finding?.acmg,null);
 let calls=0;await enrichGenomicReview(finding!,'ru',async()=>{calls++;throw Error('no build conversion');});assert.equal(calls,0);
});
test('each alternative allele and genotype stays separate, reference genotypes are excluded',()=>{
 const parsed=parseVcf(header+'1\t10\t.\tA\tC,G\t.\tPASS\tGENE=GENE1\tGT:DP\t0/2:20\n1\t11\t.\tA\tC\t.\tPASS\t.\tGT\t0/0')!;
 assert.equal(parsed.records,2);assert.equal(parsed.referenceCalls,1);assert.equal(parsed.variants.length,1);assert.equal(parsed.variants[0].alt,'G');
});
test('a single rare-frequency supporting criterion cannot become likely pathogenic',async()=>{
 const finding=inspectGenomics({name:'test.vcf',text:header+'1\t10\t.\tA\tG\t.\tPASS\tGENE=GENE1;gnomAD_AF=0.000001\tGT\t0/1'})!;
 const reviewed=await enrichGenomicReview(finding,'en',fetch,false);assert.equal(reviewed.review?.variants[0].acmg?.classification,'uncertain_significance');assert.deepEqual(reviewed.review?.variants[0].criteria,['PM2']);
});

test('VCF extraction retains reference genotypes as observed data without assigning an alternate-allele ACMG classification',()=>{
 const parsed=parseVcf('##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSAMPLE\n1\t100\trs123\tC\tT\t80\tPASS\tGENE=GENE1;CLNSIG=Pathogenic\tGT\t0/0\n1\t200\trs456\tA\tG\t80\tPASS\tGENE=GENE2\tGT\t0/1','en');
 assert.equal(parsed?.calls?.length,2);assert.equal(parsed?.calls?.[0].bases,'C/C');assert.equal(parsed?.calls?.[0].reference,true);assert.equal(parsed?.calls?.[0].annotations?.CLNSIG,'Pathogenic');assert.equal(parsed?.variants.length,1);assert.equal(parsed?.referenceCalls,1);
});

test('gVCF reference intervals preserve END without inventing alternate variants',()=>{
 const result=parseVcf(header+'1\t100\t.\tA\t<NON_REF>\t.\tPASS\tEND=500;SIFT.TERM=tolerated\tGT\t0/0')!;assert.equal(result.calls?.[0].end,500);assert.equal(result.calls?.[0].annotations?.['SIFT.TERM'],'tolerated');assert.equal(result.variants.length,0);
});
