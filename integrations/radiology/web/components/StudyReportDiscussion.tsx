"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useRef, useState } from 'react';
import { argonUsageEstimate } from '../lib/study-cost-estimate';
export default function StudyReportDiscussion({ report, coverage }: {
    report: string;
    coverage: string;
}) {
    const __ui = useUiTranslator();
    const [english, setEnglish] = useState(''), [context, setContext] = useState(''), [question, setQuestion] = useState('');
    const [reviewed, setReviewed] = useState(false), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
    const [history, setHistory] = useState<Array<{
        role: 'user' | 'assistant';
        content: string;
    }>>([]);
    const active = useRef<AbortController | null>(null), version = useRef(report);
    useEffect(() => { active.current?.abort(); version.current = report; setEnglish(''); setHistory([]); setReviewed(false); setNotice(''); setBusy(false); return () => active.current?.abort(); }, [report]);
    async function send(mode: 'translate' | 'discuss') {
        if (busy || !reviewed)
            return;
        const c = new AbortController();
        active.current = c;
        const source = report;
        setBusy(true);
        setNotice('Argon выполняет ' + (mode === 'translate' ? 'перевод…' : 'разбор вопроса…'));
        try {
            const response = await fetch('/api/ai/complete-volume-opus', { method: 'POST', credentials: 'same-origin', signal: c.signal, headers: { 'Content-Type': 'application/json', 'X-Opus-Reviewed-Volume': '1' }, body: JSON.stringify({ mode, report, coverage, clinicalContext: context, question: mode === 'translate' ? '' : question, history: mode === 'translate' ? [] : history.slice(-8), acknowledgeReviewedText: true }) });
            if (!response.ok)
                throw Error(response.status === 429 ? 'Обработчик занят или достигнут лимит обсуждения/перевода (8 за 20 минут). Повторите позже.' : 'Ответ не получен (' + response.status + '). Автоматического платного повтора нет.');
            const d = await response.json();
            if (typeof d.text !== 'string' || !d.physicianReviewRequired)
                throw Error('Неподтверждённый ответ.');
            if (version.current !== source || c.signal.aborted)
                return;
            if (mode === 'translate')
                setEnglish(d.text);
            else {
                setHistory(h => [...h, { role: 'user', content: question }, { role: 'assistant', content: d.text }]);
                setQuestion('');
            }
            setNotice('Готово. Примерная стоимость: $' + argonUsageEstimate(d.receipt).toFixed(3) + '.');
        }
        catch (e) {
            if (!c.signal.aborted)
                setNotice(e instanceof Error ? e.message : 'Ответ не получен.');
        }
        finally {
            if (active.current === c)
                setBusy(false);
        }
    }
    function saveEnglish() { const u = URL.createObjectURL(new Blob([english], { type: 'text/plain;charset=utf-8' })); const a = document.createElement('a'); a.href = u; a.download = 'provisional-report-en.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
    return <section aria-label={__ui("\u041F\u0435\u0440\u0435\u0432\u043E\u0434 \u0438 \u043E\u0431\u0441\u0443\u0436\u0434\u0435\u043D\u0438\u0435 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F")}><h3><LocalizedUi value={"\u0410\u043D\u0433\u043B\u0438\u0439\u0441\u043A\u0438\u0439 \u043F\u0435\u0440\u0435\u0432\u043E\u0434 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F"}/></h3>
  <p><LocalizedUi value={"\u041D\u0430 \u043F\u0435\u0440\u0435\u0432\u043E\u0434 \u0443\u0445\u043E\u0434\u0438\u0442 \u0432\u0441\u0451 \u043F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0446\u0435\u043B\u0438\u043A\u043E\u043C: \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435, \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0438 \u0440\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0430\u0446\u0438\u0438. \u041E\u0440\u0438\u0435\u043D\u0442\u0438\u0440: \u043E\u043A\u043E\u043B\u043E $0.05\u20130.15. \u0421\u043D\u0438\u043C\u043A\u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u044E\u0442\u0441\u044F. \u041F\u043E\u0441\u043B\u0435 \u043F\u0440\u0430\u0432\u043A\u0438 \u0440\u0443\u0441\u0441\u043A\u043E\u0433\u043E \u0442\u0435\u043A\u0441\u0442\u0430 \u043F\u0435\u0440\u0435\u0432\u043E\u0434 \u0441\u0431\u0440\u0430\u0441\u044B\u0432\u0430\u0435\u0442\u0441\u044F."}/></p>
  <label><input type="checkbox" disabled={busy} checked={reviewed} onChange={e => setReviewed(e.target.checked)}/><LocalizedUi value={"\u0412 \u0442\u0435\u043A\u0441\u0442\u0435 \u043D\u0435\u0442 \u0438\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u043E\u0440\u043E\u0432 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0430. \u0420\u0430\u0437\u0440\u0435\u0448\u0430\u044E \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0432\u0441\u0451 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043D\u0430 \u043F\u0435\u0440\u0435\u0432\u043E\u0434."}/></label>
  <button type="button" disabled={busy || !reviewed || !report.trim()} onClick={() => void send('translate')}><LocalizedUi value={"\u041F\u0435\u0440\u0435\u0432\u0435\u0441\u0442\u0438 \u0432\u0441\u0451 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043D\u0430 \u0430\u043D\u0433\u043B\u0438\u0439\u0441\u043A\u0438\u0439"}/></button>
  <LocalizedUi value={english && <><label>English report · physician review required<textarea rows={16} style={{ width: '100%' }} value={english} onChange={e => setEnglish(e.target.value)}/></label><button type="button" onClick={saveEnglish}><LocalizedUi value={"\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0430\u043D\u0433\u043B\u0438\u0439\u0441\u043A\u043E\u0435 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 TXT"}/></button></>}/>
  <h3><LocalizedUi value={"\u0412\u043E\u043F\u0440\u043E\u0441\u044B \u043F\u043E \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044E"}/></h3>
  <label><LocalizedUi value={"\u041A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0431\u0435\u0437 \u0438\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u043A\u0430\u0446\u0438\u0438 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0430"}/><textarea disabled={busy} maxLength={4000} value={context} onChange={e => { setContext(e.target.value); setReviewed(false); }} placeholder={__ui("\u0416\u0430\u043B\u043E\u0431\u044B, \u0434\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C, \u0437\u043D\u0430\u0447\u0438\u043C\u044B\u0439 \u0430\u043D\u0430\u043C\u043D\u0435\u0437, \u043B\u0430\u0431\u043E\u0440\u0430\u0442\u043E\u0440\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435. \u0411\u0435\u0437 \u0424\u0418\u041E, \u0434\u0430\u0442 \u0440\u043E\u0436\u0434\u0435\u043D\u0438\u044F \u0438 \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u043E\u0432.")}/></label>
  <LocalizedUi value={history.map((m, i) => <p key={i} style={{ whiteSpace: 'pre-wrap' }}><strong><LocalizedUi value={m.role === 'user' ? 'Вопрос врача: ' : 'Ответ Opus: '}/></strong><LocalizedUi value={m.content}/></p>)}/>
  <label><LocalizedUi value={"\u0412\u043E\u043F\u0440\u043E\u0441 \u043F\u043E \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0443"}/><textarea disabled={busy} maxLength={2000} value={question} onChange={e => setQuestion(e.target.value)} placeholder={__ui("\u041A\u0430\u043A\u0438\u0435 \u043F\u0440\u0438\u0437\u043D\u0430\u043A\u0438 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u044E\u0442 \u044D\u0442\u043E\u0442 \u0432\u044B\u0432\u043E\u0434? \u0427\u0442\u043E \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u0441 \u0443\u0447\u0451\u0442\u043E\u043C \u0430\u043D\u0430\u043C\u043D\u0435\u0437\u0430?")}/></label>
  <button type="button" disabled={busy || !reviewed || !question.trim()} onClick={() => void send('discuss')}><LocalizedUi value={"\u041E\u0431\u0441\u0443\u0434\u0438\u0442\u044C \u0441 Opus"}/></button>
  <LocalizedUi value={busy && <button type="button" onClick={() => { active.current?.abort(); setBusy(false); setNotice('Остановлено. Уже начатый запрос мог быть оплачен.'); }}><LocalizedUi value={"\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043E\u0436\u0438\u0434\u0430\u043D\u0438\u0435"}/></button>}/>
  <LocalizedUi value={notice && <p role="status"><LocalizedUi value={notice}/></p>}/>
 </section>;
}
