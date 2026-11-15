import {readFile} from 'node:fs/promises';import {inspectGenomics} from '../packages/genomics/inspect.ts';import {enrichGenomicReview} from '../packages/genomics/review.ts';
const file=process.argv[2];const finding=inspectGenomics({name:'test.vcf',text:await readFile(file,'utf8')},'ru');if(!finding)throw Error('not VCF');
let networkCalls=0;const reviewed=await enrichGenomicReview(finding,'ru',async()=>{networkCalls++;throw Error('network forbidden in this local check');},false);
console.log(JSON.stringify({status:reviewed.status,records:reviewed.review?.records,alleles:reviewed.review?.variants.length,annotatedGenes:reviewed.review?.variants.filter(v=>v.gene).length,build:reviewed.review?.build,invalidRows:reviewed.review?.invalidRows,networkCalls}));
