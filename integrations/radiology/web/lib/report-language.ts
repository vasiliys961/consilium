export const RADIOLOGY_REPORT_LANGUAGES={
 ru:{name:'Russian',headings:['ИССЛЕДОВАНИЕ','МЕТОДИКА','ОПИСАНИЕ','ЗАКЛЮЧЕНИЕ','РЕКОМЕНДАЦИИ']},
 en:{name:'English',headings:['STUDY','TECHNIQUE','FINDINGS','IMPRESSION','RECOMMENDATIONS']},
 es:{name:'Spanish',headings:['ESTUDIO','TÉCNICA','HALLAZGOS','CONCLUSIÓN','RECOMENDACIONES']},
 fr:{name:'French',headings:['EXAMEN','TECHNIQUE','DESCRIPTION','CONCLUSION','RECOMMANDATIONS']},
 ar:{name:'Arabic',headings:['الدراسة','التقنية','النتائج','الخلاصة','التوصيات']},
 hi:{name:'Hindi',headings:['अध्ययन','तकनीक','विवरण','निष्कर्ष','सिफारिशें']},
 'pt-BR':{name:'Portuguese',headings:['EXAME','TÉCNICA','ACHADOS','CONCLUSÃO','RECOMENDAÇÕES']},
 id:{name:'Indonesian',headings:['PEMERIKSAAN','TEKNIK','TEMUAN','KESIMPULAN','REKOMENDASI']},
 tr:{name:'Turkish',headings:['İNCELEME','TEKNİK','BULGULAR','SONUÇ','ÖNERİLER']},
 'zh-CN':{name:'Chinese',headings:['检查','技术','所见','结论','建议']},
} as const;
export type RadiologyReportLanguage=keyof typeof RADIOLOGY_REPORT_LANGUAGES;
export function radiologyReportLanguage(value:unknown):RadiologyReportLanguage{return typeof value==='string'&&Object.hasOwn(RADIOLOGY_REPORT_LANGUAGES,value)?value as RadiologyReportLanguage:'ru';}
export function radiologyOutputInstruction(locale:RadiologyReportLanguage){const value=RADIOLOGY_REPORT_LANGUAGES[locale];return `OUTPUT LANGUAGE OVERRIDE: write all human-readable clinical fields strictly in ${value.name}. The Russian wording and example organ headings earlier in the instructions illustrate clinical structure, not the requested output language. Keep JSON keys, image IDs, task IDs and schema enums unchanged. For the final radiology report use exactly these five headings in order: ${value.headings.map(heading=>heading+':').join(' / ')}. Preserve all clinical evidence and coverage limitations.`;}
export function withRadiologyLanguage<T>(call:(request:import('./ai-gateway.ts').AiGatewayRequest,signal?:AbortSignal)=>Promise<T>,locale:RadiologyReportLanguage){
 return (request:import('./ai-gateway.ts').AiGatewayRequest,signal?:AbortSignal)=>{
  const rule=radiologyOutputInstruction(locale);
  const messages=request.messages[0]?.role==='system'&&typeof request.messages[0].content==='string'
   ?[{...request.messages[0],content:request.messages[0].content+'\n'+rule},...request.messages.slice(1)]
   :[{role:'system' as const,content:rule},...request.messages];
  return call({...request,messages},signal);
 };
}
