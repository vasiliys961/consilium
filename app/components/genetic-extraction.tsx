'use client';
import {useMemo} from 'react';
import {parseVcf} from '@/packages/genomics/variants';
import {GenomicReviewView} from './genomic-review';
import {useWorkspaceLanguage} from './workspace-language';
export function GeneticExtraction({file}:{file:{name:string;text?:string}}){
 const {t,language}=useWorkspaceLanguage();const review=useMemo(()=>file.text?parseVcf(file.text,language==='ru'?'ru':'en'):null,[file.name,file.text,language]);
 if(!review)return null;
 return <details open style={{padding:18,border:'1px solid #c8dbc8',borderRadius:8,marginBlock:16}}><summary>{t('Данные VCF извлечены локально · без вызова модели')}</summary><GenomicReviewView finding={{review}}/></details>;
}
