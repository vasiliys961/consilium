"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useRef, useState } from 'react';
import { autoPrepareVisionPrivacy, type AutomaticPrivacyPreparation } from '../lib/auto-privacy-preparation';
import { type VisionPrivacyPacket } from '../lib/vision-privacy';
import { reviewPreparedStudy } from '../lib/review-prepared-study';
import VisionPrivacyPreparation from './VisionPrivacyPreparation';
// Compressed copies only, ephemeral tab memory. No IndexedDB, disk or source DICOM copy.
const MAX_REVIEW_MEMORY = 96 * 1024 * 1024;
export default function StudyPrivacyReview({ count, modality, load, onReady, onOpenSlice, sourceIds, sourceNumbers, clinicalContext, canRelease = false, releaseNotice, windows }: {
    clinicalContext?: string;
    sourceNumbers?: number[][];
    canRelease?: boolean;
    releaseNotice?: string;
    count: number;
    modality: 'CT' | 'MR';
    load: (index: number, signal: AbortSignal) => Promise<string[]>;
    onReady: (packets: VisionPrivacyPacket[]) => Promise<void>;
    onOpenSlice: (id: string) => void;
    sourceIds: string[][];
    windows?: {
        primary: string;
        additional?: string;
        separateAfter?: number;
    };
}) {
    const __ui = useUiTranslator();
    const [expanded, setExpanded] = useState<number | null>(null);
    const [groups, setGroups] = useState<AutomaticPrivacyPreparation[]>([]), [index, setIndex] = useState(0);
    const [notice, setNotice] = useState(''), [preparing, setPreparing] = useState(true), [error, setError] = useState('');
    const [resolved, setResolved] = useState<Set<number>>(new Set()), [editing, setEditing] = useState(false);
    const [approved, setApproved] = useState(false), [sending, setSending] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const cancel = useRef<AbortController | null>(null), started = useRef(false);
    useEffect(() => {
        const c = new AbortController();
        cancel.current = c;
        started.current = false;
        setGroups([]);
        setResolved(new Set());
        setApproved(false);
        setPreparing(true);
        setError('');
        void (async () => {
            const prepared: AutomaticPrivacyPreparation[] = [];
            let bytes = 0;
            for (let i = 0; i < count; i++) {
                c.signal.throwIfAborted();
                setNotice('Локальная подготовка и поиск надписей: группа ' + (i + 1) + ' из ' + count + '. Ничего не отправляется.');
                const urls = await load(i, c.signal);
                const group = await autoPrepareVisionPrivacy(urls, modality, c.signal, () => { }, { autoRedact: false });
                c.signal.throwIfAborted();
                bytes += group.frames.reduce((n, f) => n + f.pngBase64.length * 2, 0);
                if (bytes > MAX_REVIEW_MEMORY)
                    throw Error('Копии превысили безопасный объём памяти предварительного просмотра. Уменьшите выбранную серию; отправка не началась.');
                prepared.push(group);
                setGroups(prepared.slice());
                setNotice('Готово групп: ' + prepared.length + ' из ' + count + '. Уже можно смотреть копии. Отправка начнётся только после всех групп и отдельного разрешения.');
            }
            c.signal.throwIfAborted();
            setNotice('Подготовка завершена. Просмотрите копии и разберите отмеченные кадры. Затем разрешите отправку всей серии один раз.');
        })().catch(e => {
            if (!c.signal.aborted)
                setError(e instanceof Error ? e.message : 'Подготовка не завершена.');
        })
            .finally(() => {
            if (!c.signal.aborted)
                setPreparing(false);
        });
        return () => { c.abort(); };
        // The owning analysis mounts a new review for each source selection.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt]);
    const suspects = groups.flatMap((g, i) => g.unresolved > 0 && !resolved.has(i) ? [i] : []);
    const group = groups[index];
    async function release() {
        if (!canRelease || !approved || preparing || error || started.current || groups.length !== count)
            return;
        started.current = true;
        setSending(true);
        try {
            // This is the physician's ONE explicit attestation of these exact copies,
            // not an inference from OCR absence or thumbnail loading.
            const reviewed = reviewPreparedStudy(groups, approved);
            setGroups(previous => previous.map((g, i) => ({ ...g, journal: reviewed[i].journal, frames: reviewed[i].packet.frames })));
            await onReady(reviewed.map(g => g.packet));
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Анализ не завершён.');
        }
        finally {
            setSending(false);
        }
    }
    return <section aria-label={__ui("\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0432\u0441\u0435\u0439 \u0441\u0435\u0440\u0438\u0438 \u043F\u0435\u0440\u0435\u0434 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u043E\u0439")}>
  <p role="status"><LocalizedUi value={notice}/></p><LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
  <LocalizedUi value={error && !preparing && !started.current && <button type="button" onClick={() => setAttempt(n => n + 1)}><LocalizedUi value={"\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0443\u044E \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0443"}/></button>}/>
  <LocalizedUi value={preparing && <button type="button" onClick={() => { cancel.current?.abort(); setPreparing(false); setError('Подготовка остановлена. Изображения не отправлялись.'); }}><LocalizedUi value={"\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0443"}/></button>}/>
  <LocalizedUi value={group && !sending && <>
   <p><LocalizedUi value={"\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u043D\u0430 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0435\u0433\u043E \u0432 \u043F\u043E\u043B\u043D\u043E\u043C \u0440\u0430\u0437\u043C\u0435\u0440\u0435. \u041C\u0438\u043D\u0438\u0430\u0442\u044E\u0440\u0430 \u0441 \u0434\u0432\u0443\u043C\u044F \u043E\u043A\u043D\u0430\u043C\u0438 \u043C\u043E\u0436\u0435\u0442 \u0432\u044B\u0433\u043B\u044F\u0434\u0435\u0442\u044C \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u0435\u043B\u043A\u043E\u0439. \u0416\u0451\u043B\u0442\u044B\u0435 \u0440\u0430\u043C\u043A\u0438 \u2014 \u043F\u0440\u0435\u0434\u043F\u043E\u043B\u0430\u0433\u0430\u0435\u043C\u044B\u0435 \u043D\u0430\u0434\u043F\u0438\u0441\u0438, \u043E\u043D\u0438 \u043D\u0435 \u043C\u0435\u043D\u044F\u044E\u0442 \u043A\u043E\u043D\u0442\u0440\u0430\u0441\u0442 \u0441\u043D\u0438\u043C\u043A\u0430."}/></p>
   <LocalizedUi value={windows && <p><LocalizedUi value={windows.separateAfter !== undefined && windows.additional ? (index < windows.separateAfter ? `Окно этой группы: ${windows.primary}. Те же срезы дальше идут отдельно в окне «${windows.additional}».` : `Окно этой группы: ${windows.additional}. Номера те же, это не новые срезы.`) : windows.additional ? `Слева: ${windows.primary}. Справа: ${windows.additional}. Это один и тот же срез.` : `Окно копии: ${windows.primary}.`}/></p>}/>
   <p><LocalizedUi value={"\u041D\u0430\u0431\u043E\u0440\u043E\u0432 \u0441 \u043E\u0442\u043C\u0435\u0442\u043A\u0430\u043C\u0438 OCR \u0434\u043B\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438:"}/><LocalizedUi value={suspects.length}/><LocalizedUi value={". OCR \u043C\u043E\u0436\u0435\u0442 \u043F\u0440\u043E\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0442\u0435\u043A\u0441\u0442 \u0438 \u043D\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442 \u0443\u0437\u043D\u0430\u0432\u0430\u0435\u043C\u043E\u0435 \u043B\u0438\u0446\u043E. \u0418\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043D\u0435 \u0437\u0430\u043A\u0440\u0430\u0448\u0438\u0432\u0430\u044E\u0442\u0441\u044F."}/></p>
   <label><LocalizedUi value={"\u041F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u0441\u0440\u0435\u0437\u043E\u0432"}/><input aria-label={__ui("\u0413\u0440\u0443\u043F\u043F\u0430 \u0441\u0440\u0435\u0437\u043E\u0432 \u0434\u043B\u044F \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430")} type="range" min={0} max={groups.length - 1} value={index} onChange={e => { setIndex(Number(e.target.value)); setExpanded(null); setEditing(false); setApproved(false); }}/> <LocalizedUi value={sourceNumbers?.[index]?.join(', ') ?? (index * 4 + 1) + '–' + (index * 4 + group.frames.length)}/></label>
   <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><LocalizedUi value={group.frames.map((f, i) => <figure key={f.frameId} style={{ margin: 0 }}>
    <button type="button" onClick={() => setExpanded(i)} aria-label={__ui("\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043A\u043E\u043F\u0438\u044E \u0432 \u043F\u043E\u043B\u043D\u043E\u043C \u0440\u0430\u0437\u043C\u0435\u0440\u0435")} style={{ display: 'block', padding: 0 }}><div style={{ position: 'relative', width: 256, height: 256 * f.height / f.width }}>
     <img src={'data:image/png;base64,' + f.pngBase64} width={256} height={256 * f.height / f.width} alt={'Копия среза ' + (sourceNumbers?.[index]?.[i] ?? index * 4 + i + 1)}/>
     <LocalizedUi value={group.ocr[f.frameId]?.sha256 === f.sha256 && group.ocr[f.frameId].regions.map((r, n) => <span key={n} aria-hidden="true" style={{ position: 'absolute', pointerEvents: 'none', border: '1px solid #f59e0b', left: 100 * r.rectangle.x / f.width + '%', top: 100 * r.rectangle.y / f.height + '%', width: 100 * r.rectangle.width / f.width + '%', height: 100 * r.rectangle.height / f.height + '%' }}/>)}/>
    </div></button>
    <figcaption><button type="button" onClick={() => onOpenSlice(sourceIds[index][i])}><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u0441\u0440\u0435\u0437"}/><LocalizedUi value={sourceNumbers?.[index]?.[i] ?? index * 4 + i + 1}/></button></figcaption>
   </figure>)}/></div>
   <LocalizedUi value={expanded !== null && group.frames[expanded] && <section aria-label={__ui("\u041A\u043E\u043F\u0438\u044F \u0434\u043B\u044F \u0418\u0418 \u0432 \u043F\u043E\u043B\u043D\u043E\u043C \u0440\u0430\u0437\u043C\u0435\u0440\u0435")}><button type="button" onClick={() => setExpanded(null)}><LocalizedUi value={"\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u043F\u043E\u043B\u043D\u044B\u0439 \u0440\u0430\u0437\u043C\u0435\u0440"}/></button><div style={{ overflow: 'auto', maxHeight: '75vh' }}><img style={{ maxWidth: 'none' }} src={'data:image/png;base64,' + group.frames[expanded].pngBase64} width={group.frames[expanded].width} height={group.frames[expanded].height} alt={__ui("\u0422\u043E\u0447\u043D\u0430\u044F \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u043D\u0430\u044F \u043A\u043E\u043F\u0438\u044F \u0434\u043B\u044F \u0418\u0418, \u0431\u0435\u0437 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u044F\u0440\u043A\u043E\u0441\u0442\u0438 \u043F\u0440\u0438 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0435")}/></div></section>}/>
   <LocalizedUi value={suspects.length > 0 && <button type="button" onClick={() => { setIndex(suspects[0]); setEditing(true); setApproved(false); }}><LocalizedUi value={"\u0420\u0430\u0437\u043E\u0431\u0440\u0430\u0442\u044C \u043A\u0430\u0434\u0440\u044B \u0441 \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u044B\u043C\u0438 \u043D\u0430\u0434\u043F\u0438\u0441\u044F\u043C\u0438"}/></button>}/>
   <button type="button" onClick={() => { setEditing(v => !v); setApproved(false); }}><LocalizedUi value={"\u0421\u043A\u0440\u044B\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435 \u0438\u043B\u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043D\u0430\u0434\u043F\u0438\u0441\u0438 \u043D\u0430 \u044D\u0442\u0438\u0445 \u043A\u0430\u0434\u0440\u0430\u0445"}/></button>
   <LocalizedUi value={editing && <VisionPrivacyPreparation key={index} previews={group.frames.map(f => 'data:image/png;base64,' + f.pngBase64)} modality={modality} originalLocalFileIds={sourceIds[index]} onOpenOriginalSlice={onOpenSlice} initialPreparation={group} reviewedBatchLabel="Сохранить проверку этих кадров" onReviewedBatch={async (packet, preparation) => {
                    if (!preparation)
                        throw Error('Не сохранена история проверки кадров.');
                    setGroups(previous => previous.map((g, i) => i === index ? { ...preparation, frames: packet.frames } : g));
                    setResolved(previous => new Set([...previous, index]));
                    setApproved(false);
                    setEditing(false);
                }}/>}/>
   <LocalizedUi value={preparing && <p role="status"><LocalizedUi value={"\u041A\u043D\u043E\u043F\u043A\u0430 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u043F\u043E\u043A\u0430 \u043D\u0435 \u043D\u0430\u0436\u0438\u043C\u0430\u0435\u0442\u0441\u044F: \u043E\u0441\u0442\u0430\u043B\u044C\u043D\u044B\u0435 \u0433\u0440\u0443\u043F\u043F\u044B \u0435\u0449\u0451 \u0433\u043E\u0442\u043E\u0432\u044F\u0442\u0441\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E. \u041E\u043D\u0430 \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u0432\u0441\u0435\u0445 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u043E\u0432 \u0438 \u043E\u0442\u043C\u0435\u0442\u043A\u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438."}/></p>}/>
   <LocalizedUi value={!preparing && clinicalContext && <p style={{ whiteSpace: 'pre-wrap' }}><LocalizedUi value={"\u041A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0434\u043B\u044F \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438:"}/><LocalizedUi value={clinicalContext}/></p>}/>
   <LocalizedUi value={!preparing && releaseNotice && <p><LocalizedUi value={releaseNotice}/></p>}/>
   <LocalizedUi value={!preparing && !canRelease && <p role="status"><LocalizedUi value={"\u041F\u0435\u0440\u0435\u0434\u0430\u0447\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430: \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u043E\u0435 \u0440\u0430\u0431\u043E\u0447\u0435\u0435 \u043C\u0435\u0441\u0442\u043E. \u041A\u043E\u043F\u0438\u0438 \u043E\u0441\u0442\u0430\u044E\u0442\u0441\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E."}/></p>}/>
   <LocalizedUi value={!preparing && groups.length === count && !error && <>
    <label><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)}/><LocalizedUi value={"\u042F \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u043B \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u043D\u044B\u0435 \u043A\u043E\u043F\u0438\u0438 \u0438 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0442\u0435\u043A\u0441\u0442, \u0432\u043A\u043B\u044E\u0447\u0430\u044F \u0432\u0441\u0435 \u043E\u0442\u043C\u0435\u0442\u043A\u0438 OCR: \u0438\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u0443\u044E\u0449\u0438\u0445 \u043D\u0430\u0434\u043F\u0438\u0441\u0435\u0439 \u0438 \u0443\u0437\u043D\u0430\u0432\u0430\u0435\u043C\u044B\u0445 \u043F\u0440\u0438\u0437\u043D\u0430\u043A\u043E\u0432 \u043D\u0435\u0442; \u043E\u0441\u0442\u0430\u0432\u0448\u0438\u0435\u0441\u044F \u043E\u0442\u043C\u0435\u0442\u043A\u0438 \u2014 \u043B\u043E\u0436\u043D\u044B\u0435 \u0441\u0440\u0430\u0431\u0430\u0442\u044B\u0432\u0430\u043D\u0438\u044F \u0438\u043B\u0438 \u043D\u0435\u0438\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u0443\u044E\u0449\u0438\u0439 \u0442\u0435\u043A\u0441\u0442. \u0418\u043C\u0435\u044E \u043F\u0440\u0430\u0432\u043E \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438 \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u043B \u0443\u0441\u043B\u043E\u0432\u0438\u044F \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0438 \u043C\u0435\u0434\u0438\u0446\u0438\u043D\u0441\u043A\u0438\u0445 \u0434\u0430\u043D\u043D\u044B\u0445. \u0420\u0430\u0437\u0440\u0435\u0448\u0430\u044E \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u044D\u0442\u0443 \u0441\u0435\u0440\u0438\u044E \u0434\u043B\u044F \u0430\u043D\u0430\u043B\u0438\u0437\u0430."}/></label>
    <button type="button" disabled={!canRelease || !approved} onClick={() => void release()}><LocalizedUi value={"\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0432\u0441\u044E \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u0443\u044E \u0441\u0435\u0440\u0438\u044E \u0432 \u0430\u043D\u0430\u043B\u0438\u0437"}/></button>
   </>}/>
  </>}/>
 </section>;
}
