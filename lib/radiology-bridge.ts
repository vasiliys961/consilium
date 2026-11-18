import {RADIOLOGY_REPORT_LANGUAGES,type RadiologyReportLanguage} from '../integrations/radiology/web/lib/report-language.ts';
export function radiologyDescriptionLanguage(text:string,fallback:RadiologyReportLanguage):RadiologyReportLanguage{
 const value=text.toLocaleUpperCase();
 for(const [language,group] of Object.entries(RADIOLOGY_REPORT_LANGUAGES))if(group.headings.filter(heading=>value.includes(heading.toLocaleUpperCase()+':')).length>=3)return language as RadiologyReportLanguage;
 return fallback;
}
export function radiologyReportMessage(input:unknown,session:string):string|null{
 if(!input||typeof input!=='object')return null;const value=input as Record<string,unknown>;return value.type==='concilium.report'&&value.session===session&&typeof value.text==='string'&&value.text.trim().length>0&&value.text.length<=100000?value.text.trim():null;
}
