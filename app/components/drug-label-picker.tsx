'use client';

import {useEffect,useRef,useState} from 'react';

import {MAX_DRUG_LABELS,normalizeDrugQuery,type DrugLabel,type DrugLabelReview,type DrugLabelSelection} from '@/lib/drug-labels';
import {medicationCopy} from '@/lib/medication-copy';
import {useWorkspaceLanguage} from './workspace-language';
import styles from './privacy.module.css';

function DrugLabelCard({label,children}:{label:DrugLabel;children?:React.ReactNode}) {
  const {language}=useWorkspaceLanguage();
  const copy=medicationCopy(language);
  const detail=[...label.route,label.manufacturer,label.date,label.version&&`SPL v${label.version}`,label.ndc.length&&`NDC ${label.ndc.join(', ')}`].filter(Boolean);
  return <article className={styles.file}>
    <strong>{label.title}</strong>
    {detail.length>0&&<p>{detail.join(' · ')}</p>}
    <p><a href={label.url} target="_blank" rel="noreferrer">DailyMed ↗</a></p>
    {children}
    {label.sections.map(section=><details key={section.title}>
      <summary>{section.title}</summary>
      <p lang="en" dir="ltr" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{section.text}</p>
      {section.truncated&&<p>{copy.partial}</p>}
    </details>)}
  </article>;
}

export function DrugLabelPicker({selected=[],onChange,disabled=false}:{selected?:DrugLabelSelection[];onChange?:(value:DrugLabelSelection[])=>void;disabled?:boolean}) {
  const {language,t}=useWorkspaceLanguage();
  const copy=medicationCopy(language);
  const [query,setQuery]=useState('');
  const [resolvedName,setResolvedName]=useState('');
  const [labels,setLabels]=useState<DrugLabel[]|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<'invalid'|'failed'|null>(null);
  const active=useRef<AbortController|null>(null);
  useEffect(()=>()=>active.current?.abort(),[]);

  async function search() {
    setError(null);
    setLabels(null);
    setResolvedName('');if(query.trim().length<2||query.trim().length>80){setError('invalid');return;}
    const request=new AbortController();
    active.current=request;
    setLoading(true);
    try {
      const response=await fetch('/api/drug-labels',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:query}),signal:request.signal,
      });
      if(!response.ok) {setError(response.status===400?'invalid':'failed');return;}
      const result=await response.json() as {labels:DrugLabel[];resolvedName?:string};
      setResolvedName(result.resolvedName??'');
      setLabels(result.labels);
    } catch {
      if(!request.signal.aborted)setError('failed');
    } finally {
      if(!request.signal.aborted)setLoading(false);
    }
  }

  return <section aria-label={copy.title}>
    <h3>{copy.title}</h3><p>{copy.market}</p><p>{t('Можно искать название на разных языках и на фармацевтической латыни. Перед выбором инструкции проверьте найденное действующее вещество и форму препарата.')}</p>
    <form onSubmit={event=>{event.preventDefault();if(!disabled&&!loading)void search();}}>
      <label>{copy.query}<input dir="auto" autoComplete="off" value={query} maxLength={80} disabled={disabled||loading} onChange={event=>{setQuery(event.target.value);setLabels(null);setError(null);}}/></label>
      <button disabled={disabled||loading||!query.trim()}>{loading?copy.searching:copy.search}</button>
    </form>
    {resolvedName&&<p>{t('Поиск выполнен по названию:')} <strong>{resolvedName}</strong></p>}
    {loading&&<p role="status">{copy.searching}</p>}
    {error&&<p role="alert">{copy[error]}</p>}
    {labels?.length===0&&<p role="status">{copy.empty}</p>}
    {selected.length>0&&<ul>{selected.map(item=><li key={item.setId}>{item.title}{onChange&&<button type="button" disabled={disabled} onClick={()=>onChange(selected.filter(existing=>existing.setId!==item.setId))}>{t('Удалить')}</button>}</li>)}</ul>}
    {onChange&&selected.length>=MAX_DRUG_LABELS&&<p>{copy.limit}</p>}
    {labels?.map(label=>{
      const added=selected.some(item=>item.setId===label.setId);
      return <DrugLabelCard key={label.setId} label={label}>{onChange&&<button type="button" disabled={added||disabled||selected.length>=MAX_DRUG_LABELS} onClick={()=>onChange([...selected,{setId:label.setId,title:label.title}])}>{added?copy.attached:copy.attach}</button>}</DrugLabelCard>;
    })}
  </section>;
}

export function MedicationReviewView({review}:{review:DrugLabelReview}) {
  const {language,t}=useWorkspaceLanguage();
  const copy=medicationCopy(language);
  return <section aria-label={copy.title}>
    <h3>{copy.title}</h3><p>{copy.market}</p><p>{t('Можно искать название на разных языках и на фармацевтической латыни. Перед выбором инструкции проверьте найденное действующее вещество и форму препарата.')}</p>
    {review.externalDisabled&&<p>{copy.disabled}</p>}
    {!review.externalDisabled&&review.unavailable.length>0&&<p role="status">{copy.unavailable}: {review.unavailable.map(item=>item.title).join(', ')}.</p>}
    {review.labels.map(label=><DrugLabelCard key={label.setId} label={label}/>)}
  </section>;
}
