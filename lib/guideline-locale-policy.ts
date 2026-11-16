import type {WorkspaceLanguage} from './workspace-i18n.ts';

export type GuidelineLocalePolicy={
 language:WorkspaceLanguage;
 regionLabel:string;
 localAuthorities:string[];
 internationalAuthorities:string[];
 note:string;
};
const INTERNATIONAL=[
 'US: NIH, CDC, AHA/ACC, ATS, IDSA, specialty societies where relevant',
 'Europe: ESC, ERS, EASL, EULAR, ESMO, EAU and other relevant specialty societies',
 'UK: NICE, SIGN and applicable professional guidance',
 'WHO clinical guidance where appropriate',
];
const NATIONAL:Record<WorkspaceLanguage,{region:string;authorities:string[];note?:string}>={
 ru:{region:'Российская Федерация',authorities:['Минздрав России — рубрикатор клинических рекомендаций (cr.minzdrav.gov.ru)', 'Профильные российские профессиональные медицинские ассоциации'],note:'Для российского вопроса приоритет национальным клиническим рекомендациям; при расхождениях с международными требованиями обозначать различия и проверять редакции.'},
 en:{region:'США и Великобритания',authorities:['US AHA/ACC, NIH, CDC, ATS, IDSA','UK NICE, SIGN'],note:'English is not a country; include international/US/UK guidance unless the user names another jurisdiction.'},
 es:{region:'Испания (пример испаноязычной юрисдикции)',authorities:['Ministerio de Sanidad (España)','SEPAR и соответствующие испанские профессиональные общества'],note:'Spanish is used in many countries; if the user specifies Mexico, Argentina or another country, prioritize its national health guidance instead of assuming Spain.'},
 fr:{region:'Франция (пример франкоязычной юрисдикции)',authorities:['Haute Autorité de Santé (HAS), France','Французские профильные медицинские общества, в том числе SPLF при пульмонологических вопросах'],note:'French is used in multiple countries; adapt to an explicitly supplied country rather than assuming France.'},
 ar:{region:'Арабоязычные страны (уточнить государство)',authorities:['WHO Eastern Mediterranean Regional Office (EMRO)','Уполномоченное министерство здравоохранения и профильные клинические общества конкретной указанной арабоязычной страны'],note:'Arabic is not a single national jurisdiction. Never invent a unified Arab national guideline; ask which country when local regulation matters.'},
 hi:{region:'Индия',authorities:['Ministry of Health and Family Welfare (MoHFW), India','Indian Council of Medical Research (ICMR)','Relevant Indian clinical specialty societies']},
 'pt-BR':{region:'Бразилия',authorities:['Ministério da Saúde / CONITEC, Brasil','Associação Médica Brasileira and Brazilian specialty societies'],note:'Portuguese (Brazil) suggests Brazil; switch to Portugal if explicitly requested.'},
 id:{region:'Индонезия',authorities:['Kementerian Kesehatan Republik Indonesia (Kemenkes)','Pedoman Nasional Pelayanan Kedokteran (PNPK) and appropriate Indonesian specialty societies']},
 tr:{region:'Турция',authorities:['T.C. Sağlık Bakanlığı','Relevant Turkish specialty societies, including Türk Toraks Derneği when relevant']},
 'zh-CN':{region:'Китай (материковый)',authorities:['National Health Commission of the People’s Republic of China','Relevant Chinese clinical specialty societies and national guidance']},
};
export function guidelineLocalePolicy(locale:WorkspaceLanguage):GuidelineLocalePolicy{
 const item=NATIONAL[locale];
 return {language:locale,regionLabel:item.region,localAuthorities:item.authorities,
  internationalAuthorities:INTERNATIONAL,
  note:item.note??'Include local national guidance when available and clinically applicable; it is not automatically verified merely because it is listed here.'};
}
export function guidelineEvidenceInstruction(locale:WorkspaceLanguage):string{
 const policy=guidelineLocalePolicy(locale);
 return [
  'Evidence-source geographic policy. Target answer language: '+locale+'. Typical local jurisdiction: '+policy.regionLabel+'.',
  'Assess important international guidance from the United States and Europe FIRST or alongside local guidance, depending on the clinical subject. Relevant international authorities: '+policy.internationalAuthorities.join('; ')+'.',
  'Also search for or mention applicable local-language national clinical recommendations from: '+policy.localAuthorities.join('; ')+'.',
  policy.note,
  'The language selected for the answer is not proof of the patient’s location; use a country the user explicitly names in the clinical query instead.',
  'Give publication date, latest status, direct official URL, and specific recommendations ONLY when actually verified from retrieved evidence. Do not fabricate links or present a source mentioned from model memory as verified.',
  'If the selected model has no live browsing, explicitly state that national and international documents are candidates to check, not documents read in real time.',
 ].join('\n');
}
