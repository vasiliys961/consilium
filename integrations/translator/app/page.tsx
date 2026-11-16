'use client'

import { useEffect,useState } from 'react'
import { audioConsent } from '@/lib/audio-consent'
import { appUi } from '@/lib/i18n/app-ui'
import LiveAutoDialogue, {type CompletedDialogue} from '@/components/LiveAutoDialogue'
import {translatorParentOrigin,translatorCaseSession} from '@/lib/concilium-transfer'
import AccessGate from '@/components/AccessGate'
import RealtimeTranslatorPanel from '@/components/RealtimeTranslator'
import { INTERFACE_LANGUAGE_LABEL, LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from '@/lib/i18n/config'
import { translatorUi } from '@/lib/i18n/translator-ui'

export default function HomePage() {
  const [locale, setLocale] = useState<Locale>('ru')
  const [mode, setMode] = useState<'auto' | 'manual'>('auto')
  const [active, setActive] = useState(false)
  const [consented, setConsented] = useState(false)
  const copy = translatorUi[locale]
  const [caseSession,setCaseSession]=useState('')
  const [transferStatus,setTransferStatus]=useState('')
  useEffect(()=>{setCaseSession(translatorCaseSession(location.search))},[])
  useEffect(()=>{
   if(!caseSession)return
   const receive=(event:MessageEvent)=>{
    if(event.origin!==translatorParentOrigin()||event.source!==window.parent
      ||event.data?.session!==caseSession||event.data?.type!=='concilium.translator.saved')return
    setTransferStatus(event.data.ok
      ?(locale==='ru'?'Перевод сохранён в клиническом случае.':'Translation saved in clinical case.')
      :(typeof event.data.error==='string'?event.data.error:(locale==='ru'?'Перевод не сохранён.':'Translation not saved.')))
   }
   window.addEventListener('message',receive)
   return()=>window.removeEventListener('message',receive)
  },[caseSession,locale])
  function saveCompleted(value:CompletedDialogue){
   if(!caseSession||window.parent===window)return
   setTransferStatus(locale==='ru'?'Передаём выбранный перевод в клинический случай…':'Transferring selected translation to clinical case…')
   window.parent.postMessage({type:'concilium.translator.transcript',session:caseSession,...value},translatorParentOrigin())
  }

  return (
    <div className="min-h-screen">
      <header className="bg-primary-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <a
              href={process.env.NEXT_PUBLIC_CONCILIUM_PREVIEW==='1'?'http://127.0.0.1:3207/':'http://127.0.0.1:3107/'}
              className="inline-flex items-center gap-2 text-lg font-bold tracking-tight text-white hover:text-primary-100"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-base" aria-hidden>🩺</span>
              Doctor Opus
            </a>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-primary-200">{copy.title}</p>
          </div>
          <label className="text-xs font-semibold text-primary-100">
            {INTERFACE_LANGUAGE_LABEL[locale]}
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value as Locale)}
              className="mt-1 block rounded-lg border border-white/20 bg-white px-3 py-2 text-sm font-medium text-primary-900"
            >
              {SUPPORTED_LOCALES.map((code) => (
                <option key={code} value={code}>
                  {LOCALE_LABELS[code]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <a
          href="https://vrachirf.ru"
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 inline-flex items-center rounded-xl border border-primary-200 bg-white p-2.5 shadow-sm transition-shadow hover:shadow-md"
        >
          <img src="/vrachirf-logo.png" alt="Врачи РФ" className="h-8 w-auto" />
        </a>
        <AccessGate locale={locale}>
          <label className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-slate-900">
            <input type="checkbox" checked={consented} disabled={active} onChange={event => setConsented(event.target.checked)} className="mt-1 h-5 w-5" />
            <span>{audioConsent[locale]}</span>
          </label>
          <div className="mb-4 flex gap-2" role="group" aria-label={appUi[locale].common.translationMode}>
            <button disabled={active} aria-pressed={mode === 'auto'} onClick={() => setMode('auto')} className={`rounded-xl px-4 py-3 font-semibold disabled:opacity-50 ${mode === 'auto' ? 'bg-primary-700 text-white' : 'bg-white'}`}>{appUi[locale].common.autoMode}</button>
            <button disabled={active} aria-pressed={mode === 'manual'} onClick={() => setMode('manual')} className={`rounded-xl px-4 py-3 font-semibold disabled:opacity-50 ${mode === 'manual' ? 'bg-primary-700 text-white' : 'bg-white'}`}>{appUi[locale].common.manualMode}</button>
          </div>
          {consented && (mode === 'auto' ? <LiveAutoDialogue locale={locale} onActiveChange={setActive} onSaveTranscript={caseSession?saveCompleted:undefined} /> : <RealtimeTranslatorPanel locale={locale} />)}
          {caseSession&&<p role="status" className="mt-4 text-teal-900">{transferStatus|| (locale==='ru'?'В клинический случай можно передать только явно выбранные завершённые переводы. Запись не является подтверждённым анамнезом.':'Only explicitly selected completed translations can be saved. They are not verified patient history.')}</p>}
        </AccessGate>
      </main>
    </div>
  )
}
