const fs=require('fs');
(async()=>{
 const root='http://127.0.0.1:3107';
 const document=await fetch(root+'/api/export/docx',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Проверка бланка',text:'Синтетическая проверка DOCX без данных пациента.',locale:'ru'})});
 const bytes=Buffer.from(await document.arrayBuffer());console.log(JSON.stringify({docxHttp:document.status,mime:document.headers.get('content-type'),disposition:document.headers.get('content-disposition'),zipSignature:bytes.subarray(0,2).toString()}));
 const response=await fetch(root+'/api/v1/cases',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({task:'interpret',locale:'ru',externalSearch:false,text:'Это синтетическая техническая проверка VCF. Перечисли полученные аннотации, не ставь диагноз.',files:[{name:'synthetic.vcf',text:'##fileformat=VCFv4.2\n##reference=hg19\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tSAMPLE\n1\t123\t.\tA\tG\t80\tPASS\tGENE=TESTGENE;VEP.Consequence=missense_variant\tGT:DP\t0/1:30'}]})});
 const data=await response.json();fs.writeFileSync('docs/qa/vcf-release-check.json',JSON.stringify(data,null,2));console.log(JSON.stringify({vcfHttp:response.status,fileStatus:data.ledger?.[0]?.status,variantRows:data.ledger?.[0]?.genetics?.review?.variants.length,clinicalDraft:data.clinicalDraft,estimatedUsd:data.cost?.totalUsd}));
})();
