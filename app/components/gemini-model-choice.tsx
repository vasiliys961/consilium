'use client';
import{useEffect,useRef,useState}from'react';
import{usePathname}from'next/navigation';
import{useWorkspaceLanguage}from'./workspace-language';
import type{GeminiChoice,GeminiPolicy}from'@/lib/gemini-policy';

export function GeminiModelChoice(){
 const pathname=usePathname(),{t}=useWorkspaceLanguage();
 const [policy,setPolicy]=useState<GeminiPolicy|null>(null),[open,setOpen]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null);
 const hidden=pathname.startsWith('/phone/');
 useEffect(()=>{if(hidden)return;let active=true;
  const refresh=()=>{void fetch('/api/gemini-policy',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then((p:GeminiPolicy)=>{if(active){setPolicy(p);if(p.needsChoice)setOpen(true);}}).catch(()=>{});};
  refresh();const timer=setInterval(refresh,300000);const focus=()=>{if(document.visibilityState==='visible')refresh();};
  const requested=(event:Event)=>{const p=(event as CustomEvent<GeminiPolicy>).detail;setPolicy(p);setOpen(true);};
  window.addEventListener('focus',focus);window.addEventListener('concilium-gemini-choice-required',requested);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',focus);window.removeEventListener('concilium-gemini-choice-required',requested);};
 },[hidden]);
 useEffect(()=>{if(open&&!dialog.current?.open)dialog.current?.showModal();else if(!open&&dialog.current?.open)dialog.current.close();},[open]);
 async function choose(model:GeminiChoice){if(!policy)return;setSaving(true);setError(false);try{
  const r=await fetch('/api/gemini-policy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,revision:policy.revision})});
  const next=await r.json();if(!r.ok){if(next.policy)setPolicy(next.policy);throw Error();}setPolicy(next);setOpen(false);window.dispatchEvent(new CustomEvent('concilium-gemini-choice-saved',{detail:next}));
 }catch{setError(true);}finally{setSaving(false);}}
 if(hidden||!policy)return null;
 return <aside style={{maxWidth:1120,margin:'12px auto',padding:'0 24px',fontSize:16}}>
  <details aria-label={t('Модели Doctor Opus и их задачи')} style={{border:'1px solid #cbd8d0',borderRadius:10,background:'#f7fbf8',padding:'8px 12px'}}>
   <summary style={{cursor:'pointer',fontWeight:600}}>{t('ИИ-команда Doctor Opus')} · {t('Gemini')}: {policy.selected==='argon'?'Argon':'Flash'} · Opus · GPT-6.1 Sol <small style={{fontWeight:400,marginLeft:8}}>{t('Посмотреть роли моделей')}</small></summary>
   <p>{t('Это разные исполнители для разных клинических задач, а не выбор единственной модели для всего приложения. Модели вызываются только в соответствующих режимах.')}</p>
   <ul style={{paddingLeft:24,lineHeight:1.5}}>
    <li><strong>Gemini 4 Argon</strong> — {t('Основное чтение большинства медицинских изображений и гипотезы консилиума; Flash используется для предварительного просмотра объёмных исследований.')}</li>
    <li><strong>Claude Opus 5.5</strong> — {t('Критическая оценка, согласование мнений консилиума и дополнительное чтение изображений по маршруту или выбору врача.')}</li>
    <li><strong>GPT-6.1 Sol</strong> — {t('План диагностических исследований в консилиуме; также доступен в «Спросить специалиста» как отдельная модель ответа.')}</li>
    <li><strong>Claude Sonnet 5.5</strong> — {t('Проверка лечебной тактики и безопасности, быстрые ответы на простые вопросы специалисту.')}</li>
   </ul>
   <p><a href="/consult">{t('Спросить специалиста и выбрать Opus или GPT-6.1 Sol')}</a></p>
   <button type="button" onClick={()=>setOpen(true)}>{t('Настроить только Gemini')}: {policy.selected==='argon'?'Gemini 4 Argon':'Gemini 3.8 Flash'}</button>
  </details>
  <dialog ref={dialog} aria-labelledby="gemini-choice-title" onCancel={event=>{if(policy.needsChoice)event.preventDefault();else setOpen(false);}} style={{maxWidth:700,width:'min(700px, calc(100% - 32px))',border:'1px solid #bed3c5',borderRadius:18,padding:28,color:'#173b2e',background:'#f7fbf8',fontSize:18,lineHeight:1.6}}>
   <h2 id="gemini-choice-title">{t(policy.needsChoice?'Изменение стоимости Gemini':'Выбор модели Gemini')}</h2>
   {policy.needsChoice&&<p>{t(policy.checkAvailable?'После 1 декабря тариф Argon вырос. Выберите модель для следующих разборов.':'Не удалось проверить новый тариф Argon. Выберите модель перед следующим разбором.')}</p>}
   <p><strong>{t('Для сложных диагностических случаев рекомендуем оставить Argon.')}</strong> {t('Argon закреплена за медицинскими изображениями. Этот выбор относится к вспомогательным задачам; сравнительные тесты не доказывают общего клинического превосходства.')}</p>
   <p style={{fontSize:15}}>{t('Это небольшой сравнительный тест, а не установленная клиническая точность.')}{' '}<a href="/model-comparison" target="_blank" rel="noreferrer">{t('Посмотреть сравнение моделей')}</a></p>
   {policy.prices.filter(p=>p.provider==='openrouter').map(p=><p key={p.provider} style={{fontSize:15}}><strong>{p.provider==='polza'?'Polza':'OpenRouter'}</strong>: Argon {p.argon?`${p.argon.input.toFixed(2)} / ${p.argon.output.toFixed(2)} ${p.argon.currency}`:t('тариф недоступен')}; Flash {p.flash?`${p.flash.input.toFixed(2)} / ${p.flash.output.toFixed(2)} ${p.flash.currency}`:t('тариф недоступен')}. {t('За 1 млн токенов: вход / выход.')}</p>)}
   <p style={{fontSize:15}}>{t('Медицинские изображения читает Argon независимо от изменения тарифа. Flash используется для предварительного просмотра объёма КТ/МР. Opus подключается при существенном расхождении или по запросу врача.')}</p>
   {error&&<p role="alert">{t('Не удалось сохранить выбор. Проверьте тариф и повторите.')}</p>}
   <div style={{display:'flex',gap:12,flexWrap:'wrap'}}><button disabled={saving} onClick={()=>void choose('argon')}>{t('Оставить Argon · рекомендуем для сложных случаев')}</button><button disabled={saving} onClick={()=>void choose('flash')}>{t('Выбрать Flash 3.8 · дешевле')}</button>{!policy.needsChoice&&<button disabled={saving} onClick={()=>setOpen(false)}>{t('Закрыть')}</button>}</div>
  </dialog>
 </aside>;
}
