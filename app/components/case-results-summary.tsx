'use client';
import Link from 'next/link';
import type {ClinicalCase} from '@/lib/casebook';
import {radiologyEvidenceText} from '@/lib/module-evidence';
import {radiologySourceStatus,protocolEditorHref,earlierProtocolVersions} from '@/lib/c11-module-overview';
import {protocolText,PROTOCOL_KINDS} from '@/packages/protocol/document';
import {useWorkspaceLanguage} from './workspace-language';
import {guidelineUi} from '@/lib/guideline-ui';

/** C11: records remain readable after a module closes; no analysis or network call here. */
export function CaseResultsSummary({record}:{record:ClinicalCase}){
 const {t,language}=useWorkspaceLanguage();
 const protocols=record.protocols??[],reports=record.moduleReports??[];
 const guidance=record.guidelineReports??[],g=(key:Parameters<typeof guidelineUi>[1])=>guidelineUi(language,key);
 const vcf=record.files.filter(file=>/\.vcf(?:\.gz)?$/i.test(file.name));
 if(!protocols.length&&!reports.length&&!vcf.length&&!guidance.length)return null;
 return <section aria-label={t('Сохранённые результаты модулей')} style={{margin:'16px 0',padding:'12px 16px',border:'1px solid #c5d6ca',borderRadius:10}}>
  <h2 style={{marginTop:0}}>{t('Сохранённые результаты модулей')}</h2>
  <p>{t('Документы и описания доступны после повторного открытия случая. Исходные материалы и неподтверждённые выводы не заменяют решение врача.')}</p>
  {protocols.map(document=>{
   const revisions=earlierProtocolVersions(record,document);
   return <details key={document.id+document.locale} style={{marginBottom:10}}>
    <summary>{t('Протокол')} · {t(PROTOCOL_KINDS.find(([kind])=>kind===document.kind)?.[1]??'Протокол')} · {document.locale.toUpperCase()} · {document.created.slice(0,10)}</summary>
    <p><Link href={protocolEditorHref(record.id,document)}>{t('Открыть сохранённый протокол в редакторе')}</Link></p>
    <p style={{whiteSpace:'pre-wrap',maxHeight:300,overflow:'auto'}}>{protocolText(document)}</p>
    {document.ambientSource?.segments.length ? <details><summary>{t('Исходная расшифровка приёма')} · {document.ambientSource.segments.length} {t('фрагментов')}</summary>
      <p>{t('Роли говорящих и временные метки не подтверждены. Сверьте каждую значимую жалобу, отрицание, лекарство и дозировку с исходной беседой. Этот текст не является подтверждённым объективным осмотром.')}</p>
      <div style={{maxHeight:280,overflow:'auto',whiteSpace:'pre-wrap'}}>
        {document.ambientSource.segments.map(segment=><p key={segment.id}><strong>[{segment.id}]</strong> {segment.text}</p>)}
      </div>
    </details>:null}
    {revisions.length>0&&<details><summary>{t('Предыдущие редакции')} · {revisions.length}</summary>
      {revisions.map((item,index)=><details key={item.savedAt+index}><summary>{item.savedAt}</summary><p style={{whiteSpace:'pre-wrap'}}>{protocolText(item.document)}</p></details>)}
    </details>}
   </details>;
  })}
  {reports.map(report=>{
   const source=radiologySourceStatus(record,report);
   return <details key={report.id} style={{marginBottom:10}}>
    <summary>{t('Opus Radiology')} · {report.sources.join(', ')||t('Источник не указан')}</summary>
    <p>{t(source==='linked'?'Исходные материалы связаны по SHA-256.':source==='stale'?'Исходные материалы изменились или отсутствуют в этом случае.':'Связь с исходными материалами не подтверждена.')}</p>
    <p style={{whiteSpace:'pre-wrap'}}>{radiologyEvidenceText(report)}</p>
    <Link href={`/radiology?case=${encodeURIComponent(record.id)}`}>{t('Открыть Radiology для этого случая')}</Link>
   </details>;
  })}
  {vcf.length>0&&<p>{t('Генетические исходные файлы')}: {vcf.length}. <Link href={`/genetics?case=${encodeURIComponent(record.id)}`}>{t('Продолжить генетический разбор')}</Link>. {t('Сохранённые генетические заключения доступны в истории анализов.')}</p>}
  {guidance.map(item=>{const active=(record.library??[]).some(file=>file.sha256===item.referenceSha256);return <details key={item.id} style={{marginBottom:10}}>
   <summary>{g('savedTitle')} · {item.result.topic} · {item.result.language.toUpperCase()} · {item.savedAt.slice(0,10)}{active?' · '+g('activeReference'):''}</summary>
   <p>{g(active?'referenceHint':'historyOnly')}</p>
   <p><Link href={`/guidelines?case=${encodeURIComponent(record.id)}&report=${encodeURIComponent(item.id)}`}>{g('openSaved')}</Link></p>
   <p style={{whiteSpace:'pre-wrap',maxHeight:300,overflow:'auto'}}>{item.result.text}</p>
   {item.result.text!==item.result.originalText&&<details><summary>{g('original')}</summary><p style={{whiteSpace:'pre-wrap',maxHeight:250,overflow:'auto'}}>{item.result.originalText}</p></details>}
  </details>;})}
 </section>;
}
