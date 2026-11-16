'use client';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {useEffect,useState} from 'react';
import {reviewBeforeSending} from '@/lib/privacy-client';
import {downloadDocx} from '@/lib/download-docx';
import {useWorkspaceLanguage} from '@/app/components/workspace-language';
import {LanguageSwitcher} from '@/app/components/language-switcher';
import {WORKSPACE_LANGUAGES,type WorkspaceLanguage} from '@/lib/workspace-i18n';
import {guidelineUi} from '@/lib/guideline-ui';
import {guidelineLocalePolicy} from '@/lib/guideline-locale-policy';
import type {GuidelineMode} from '@/lib/parent-guideline-search';

type SearchResult={text:string;model:string;estimatedUsd:number;inputTokens:number;outputTokens:number;searchMode:GuidelineMode;language:WorkspaceLanguage};
const specialtyChoices:readonly [string,string][]=[
 ['Кардиология','Cardiology'],['Пульмонология','Pulmonology'],['Неврология','Neurology'],
 ['Эндокринология','Endocrinology'],['Гастроэнтерология','Gastroenterology'],
 ['Нефрология','Nephrology'],['Ревматология','Rheumatology'],['Онкология','Oncology'],
 ['Инфекционные болезни','Infectious diseases'],['Педиатрия','Pediatrics'],
 ['Акушерство и гинекология','Obstetrics and gynecology'],
 ['Хирургия','Surgery'],['Анестезиология и реаниматология','Anesthesiology and critical care']
];
export default function ClinicalGuidelines(){
 const {language}=useWorkspaceLanguage();
 const t=(key:Parameters<typeof guidelineUi>[1])=>guidelineUi(language,key);
 const legacy=(ru:string,en:string)=>language==='ru'?ru:en;
 const [query,setQuery]=useState(''),[specialty,setSpecialty]=useState(''),[mode,setMode]=useState<GuidelineMode>('standard');
 const [answerLanguage,setAnswerLanguage]=useState<WorkspaceLanguage>(language),[matchInterface,setMatchInterface]=useState(true);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[result,setResult]=useState<SearchResult|null>(null),[editing,setEditing]=useState(false);
 useEffect(()=>{if(matchInterface)setAnswerLanguage(language);},[language,matchInterface]);
 const policy=guidelineLocalePolicy(answerLanguage);
 const isArabic=answerLanguage==='ar';
 async function search(){
  if(busy||query.trim().length<3)return;
  setBusy(true);setNotice('');setResult(null);setEditing(false);
  try{
   const reviewed=await reviewBeforeSending({
    text:query.trim(),task:'evidence',locale:answerLanguage,sourceLocale:language,
    retain:false,externalSearch:mode==='online'
   });
   const response=await fetch('/api/protocols/search',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({...reviewed,modelMode:mode,specialty})
   });
   if(!response.ok){
    const data=await response.json().catch(()=>({error:'unknown'}));
    const reason=String(data.error??'unknown');
    const errors:Record<string,string>={
     'openrouter_not_configured':legacy('В Preview не задан OPENROUTER_API_KEY.','OPENROUTER_API_KEY is not configured.'),
     'guideline_truncated':legacy('Ответ модели был обрезан. Можно повторить позднее или выбрать «Подробно».','The model response was truncated. Retry later or use in-depth mode.'),
     'guideline_provider_error':legacy('Провайдер модели не выполнил запрос. Это не означает, что рекомендации отсутствуют.','The model provider failed. This does not mean guidelines do not exist.'),
     'guideline_payment_required':legacy('Провайдер отклонил запрос по балансу. Проверь OpenRouter.','Provider rejected the request due to billing. Check OpenRouter balance.'),
     'guideline_invalid_response':legacy('Модель вернула пустой или неподходящий ответ.','Model returned empty or invalid content.'),
     'privacy_review_required':legacy('Необходимо подтвердить проверку обезличивания.','Privacy review is required.'),
    };
    throw Error(errors[reason]??legacy('Ошибка получения рекомендаций ('+reason+').','Guideline search failed ('+reason+').'));
   }
   const data=await response.json() as SearchResult;
   if(!data.text?.trim())throw Error(legacy('Модель вернула пустой ответ.','Empty model response.'));
   setResult({...data,language:answerLanguage});
  }catch(error){setNotice(error instanceof Error?error.message:legacy('Ошибка запроса.','Search error.'));}
  finally{setBusy(false);}
 }
 async function share(){
  if(!result)return;
  try{if(navigator.share)await navigator.share({title:query,text:result.text});
   else{await navigator.clipboard.writeText(result.text);setNotice(legacy('Скопировано для отправки.','Copied for sharing.'));}}
  catch{setNotice(legacy('Отправка отменена.','Sharing canceled.'));}
 }
 return <main className="module-page" style={{maxWidth:1080,margin:'auto',padding:28,lineHeight:1.6}}>
  <p><Link href="/workspace">← {t('back')}</Link></p>
  <LanguageSwitcher disabled={busy}/>
  <h1>📚 {t('title')}</h1>
  <p>{t('intro')}</p>
  <section style={{padding:20,background:'#fcfdfb',border:'1px solid #c4d1c7',borderRadius:10,margin:'18px 0'}}>
   <label>{t('specialty')}
    <select disabled={busy} value={specialty} onChange={e=>setSpecialty(e.target.value)}>
     <option value="">{t('any')}</option>
     {specialtyChoices.map(([ru,en])=><option key={ru} value={ru}>{language==='ru'?ru:en}</option>)}
    </select>
   </label>
   <label>{t('topic')}
    <textarea rows={3} maxLength={550} disabled={busy} value={query}
     onChange={e=>{setQuery(e.target.value);setResult(null);}}
     onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void search();}}}
     placeholder={language==='ru'?'Например: плеврит, пневмония':language==='en'?'e.g. pleuritis, pneumonia':'Pleuritis / pneumonia / pleuritis'}/>
   </label>
   <label>{t('output')}
    <select disabled={busy} value={answerLanguage} onChange={e=>{setAnswerLanguage(e.target.value as WorkspaceLanguage);setMatchInterface(false);}}>
     {WORKSPACE_LANGUAGES.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}
    </select>
   </label>
   <label style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
    <input type="checkbox" disabled={busy} checked={matchInterface}
     onChange={e=>{setMatchInterface(e.target.checked);if(e.target.checked)setAnswerLanguage(language);}}/>
    {t('same')}
   </label>
   <p><strong>{t('geo')}: </strong>{policy.regionLabel}</p>
   <p><small>{legacy('Основные международные рекомендации США и Европы + национальные источники выбранного языка. Язык не всегда определяет страну пациента.','International US/European guidance plus relevant national-language authorities. Language alone does not identify the patient’s jurisdiction.')} {policy.localAuthorities.join(' · ')}</small></p>
   <p><strong>{t('depth')}</strong></p>
   <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:9}}>
    {(['standard','detailed','online'] as const).map(value=><button type="button" key={value} disabled={busy} aria-pressed={mode===value}
     onClick={()=>setMode(value)} style={{border:'1px solid #8c9c90',background:mode===value?'#20543d':'#edf3ee',color:mode===value?'#fff':'#1c3b2d',borderRadius:6,padding:'9px 12px'}}>{t(value)}</button>)}
   </div>
   <p><small>{mode==='online'
    ?legacy('Sonar выполняет онлайн-поиск. Проверь, что приведённые ссылки действительно подтверждают рекомендации.','Sonar searches online. Verify that linked sources support the clinical advice.')
    :legacy('Стандарт — Gemini Flash; подробный разбор — Sonnet. В этих режимах актуальность документов не проверяется через интернет.','Standard uses Gemini Flash; detailed uses Sonnet. Neither mode independently verifies live documents.')}</small></p>
   <button disabled={busy||query.trim().length<3} onClick={()=>void search()}>{busy?t('searching'):t('search')}</button>
   <p><small>{legacy('Перед отправкой — проверка обезличивания. Запросы могут расходовать API-баланс.','Privacy review precedes external model requests, which may incur API charges.')}</small></p>
  </section>
  {notice&&<p role="status">{notice}</p>}
  {result&&<section style={{padding:22,background:'white',border:'1px solid #d2ded6',borderRadius:9}}>
   <h2>{t('result')}</h2>
   <p><small>{t('model')}: {result.model} · {t('cost')}: {'$'+result.estimatedUsd.toFixed(5)} · {result.inputTokens+result.outputTokens} tokens · {WORKSPACE_LANGUAGES.find(item=>item.code===result.language)?.name}</small></p>
   {editing?<label>{t('edit')}<textarea rows={24} value={result.text} dir={result.language==='ar'?'rtl':'auto'}
    onChange={e=>setResult(prev=>prev&&({...prev,text:e.target.value}))}/></label>:
    <article className="clinical-guideline-markdown" dir={result.language==='ar'?'rtl':'auto'}
     style={{whiteSpace:'normal',lineHeight:1.75}}><ReactMarkdown remarkPlugins={[remarkGfm]}>{result.text}</ReactMarkdown></article>}
   <div style={{display:'flex',flexWrap:'wrap',gap:10,marginTop:20}}>
    <button type="button" onClick={()=>setEditing(prev=>!prev)}>{editing?t('preview'):t('edit')}</button>
    <button type="button" onClick={()=>void downloadDocx(query,result.text,result.language).catch(()=>setNotice('DOCX failed'))}>DOCX</button>
    <button type="button" onClick={()=>window.print()}>{t('print')}</button>
    <button type="button" onClick={()=>void share()}>{t('share')}</button>
    <button type="button" onClick={()=>void navigator.clipboard.writeText(result.text).then(()=>setNotice(legacy('Скопировано','Copied'))).catch(()=>setNotice('Clipboard unavailable'))}>{t('copy')}</button>
   </div>
   <p><small>{t('disclaimer')}</small></p>
  </section>}
  {!busy&&!result&&<section>
   <h3>{t('examples')}</h3>
   <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
    {['Плеврит','Острый коронарный синдром','Декомпенсация сердечной недостаточности','Фибрилляция предсердий','Внебольничная пневмония'].map(item=><button type="button" key={item} onClick={()=>setQuery(item)}>{item}</button>)}
   </div>
  </section>}
 </main>;
}
