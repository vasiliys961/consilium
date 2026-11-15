export const RADIOLOGY_LANGUAGES=['en','ru','es','fr','ar','hi','pt-BR','id','tr','zh-CN'] as const;
export type RadiologyLanguage=typeof RADIOLOGY_LANGUAGES[number];
export function radiologyLanguage(value:unknown):RadiologyLanguage{return RADIOLOGY_LANGUAGES.includes(value as RadiologyLanguage)?value as RadiologyLanguage:'ru';}
