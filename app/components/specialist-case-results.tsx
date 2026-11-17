'use client';
import type {ClinicalCase} from '@/lib/casebook';
import {SPECIALIST_PROFILES} from '@/lib/specialist-profiles';
import {copilotText} from '@/lib/copilot-i18n';
import {useWorkspaceLanguage} from './workspace-language';

/** Read-only view of previously executed specialist requests. No inference occurs here. */
export function SpecialistCaseResults({value}:{value:ClinicalCase}){
 const {language}=useWorkspaceLanguage();
 const ru=language==='ru';
 const reports=value.specialistReports??[];
 if(!reports.length)return null;
 return <section aria-label={ru?'Сохранённые ответы специалистов':'Saved specialist responses'}
  style={{margin:'12px 0',padding:14,border:'1px solid #b8cdbb',borderRadius:10}}>
  <h2 style={{margin:'0 0 8px'}}>{ru?'Ответы ИИ-специалистов':'AI specialist responses'} · {reports.length}</h2>
  <p style={{fontSize:13,margin:'0 0 8px'}}>
   {ru?'Результаты выполненных консультаций, сохранённые в этом случае. Это неподписанные ответы ИИ: врач проверяет их и отдельно утверждает свои решения.'
      :'Completed consultations saved in this case. These are unsigned AI replies; a physician must review them and separately approve clinical decisions.'}
  </p>
  {reports.map(report=><details key={report.id} style={{padding:'8px 0',borderTop:'1px solid #d8e3d8'}} data-testid="specialist-case-report">
   <summary><strong>{copilotText(language,SPECIALIST_PROFILES.find(x=>x.id===report.specialty)?.label??report.specialty)}</strong>
    {' · '}<time dateTime={report.at}>{new Date(report.at).toLocaleString(language)}</time></summary>
   <p><strong>{ru?'Вопрос':'Question'}:</strong> {report.question}</p>
   <p style={{whiteSpace:'pre-wrap'}}>{report.answer}</p>
   {report.sources.length>0&&<details><summary>{ru?'Источники для проверки':'Sources for review'} · {report.sources.length}</summary>
    <ul>{report.sources.map((source,index)=><li key={index}>
     {source.url?<a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>:source.title}
     {source.year?' · '+source.year:''}
    </li>)}</ul>
   </details>}
   <details><summary>{ru?'Происхождение результата':'Result provenance'}</summary>
    <p>{ru?'Выполненный модуль':'Executed module'}: specialist-chat</p>
    <p>{ru?'Модель':'Model'}: {report.model}</p>
    <p>{ru?'SHA-256 проверенного текста запроса':'Approved request text SHA-256'}: <code>{report.inputSha256}</code></p>
    <p>{ru?'Стоимость':'Cost'}: {report.costUsd===null?(ru?'не установлена':'unknown'):'$'+report.costUsd.toFixed(5)}
     {!report.costComplete?' · '+(ru?'неполные данные':'incomplete usage'):''}</p>
    <details><summary>{ru?'Проверенный текст запроса':'Approved request text'}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{report.inputText}</pre></details>
    <p>{ru?'Хеш относится только к тексту запроса, а не к исходным PDF или изображениям.':'The hash refers to the approved request text, not original PDFs or images.'}</p>
   </details>
  </details>)}
 </section>;
}
