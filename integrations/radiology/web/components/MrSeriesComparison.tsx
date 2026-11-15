"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useMemo, useState } from 'react';
import type { DicomSeries } from '../lib/dicom-series';
import { matchMrSourcePlane, sameMrStudy } from '../lib/mr-series-comparison';
import { decodeDicomPreview } from '../lib/dicom-lite';
import { MAX_PRIVACY_PIXELS } from '../lib/vision-privacy';
export default function MrSeriesComparison({ series, allSeries, files, onOpenSlice }: {
    series: DicomSeries;
    allSeries: readonly DicomSeries[];
    files: ReadonlyMap<string, File>;
    onOpenSlice: (id: string) => void;
}) {
    const __ui = useUiTranslator();
    const candidates = useMemo(() => allSeries.filter(s => sameMrStudy(series, s)), [allSeries, series]);
    const [open, setOpen] = useState(false), [choice, setChoice] = useState(''), [index, setIndex] = useState(0);
    const [pictures, setPictures] = useState<string[]>([]), [notice, setNotice] = useState('');
    const companion = candidates.find(s => s.key === choice) ?? candidates[0];
    const match = useMemo(() => companion ? matchMrSourcePlane(series, index, companion) : null, [series, index, companion]);
    useEffect(() => {
        const c = new AbortController();
        setPictures([]);
        if (!open || !companion || match?.status !== 'matched')
            return () => c.abort();
        setNotice('Готовим два исходных среза локально…');
        void (async () => {
            const urls: string[] = [];
            for (const member of [series.members[index], companion.members[match.referenceIndex]]) {
                c.signal.throwIfAborted();
                const file = files.get(member.id);
                if (!file || file.size > 6 * 1024 * 1024)
                    throw Error('Исходный файл недоступен или превышает размер локальной копии.');
                try {
                    urls.push((await decodeDicomPreview(file, { maxPixels: MAX_PRIVACY_PIXELS })).url);
                }
                catch {
                    const { decodeCornerstoneVisionPreview } = await import('../lib/cornerstone-vision-preview');
                    urls.push(await decodeCornerstoneVisionPreview(file, MAX_PRIVACY_PIXELS, c.signal));
                }
            }
            c.signal.throwIfAborted();
            setPictures(urls);
            setNotice('Ближайшие параллельные срезы. Это не регистрация изображений; проверьте соответствие анатомии.');
        })().catch(e => {
            if (!c.signal.aborted)
                setNotice(e instanceof Error ? e.message : 'Не удалось подготовить сравнение.');
        });
        return () => c.abort();
    }, [open, series, companion, index, match, files]);
    if (series.modality !== 'MR')
        return null;
    return <section aria-label={__ui("\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0435 \u0441\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u041C\u0420-\u0441\u0435\u0440\u0438\u0439")}><h3><LocalizedUi value={"\u0421\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u041C\u0420-\u0441\u0435\u0440\u0438\u0439"}/></h3>
  <p><LocalizedUi value={"\u0414\u0440\u0443\u0433\u0438\u0445 \u0441\u0435\u0440\u0438\u0439 \u044D\u0442\u043E\u0433\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F:"}/><LocalizedUi value={candidates.length}/><LocalizedUi value={". \u0422\u0438\u043F\u044B T1, T2, FLAIR, DWI \u0438 ADC \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u044B. \u041E\u0434\u0438\u043D \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u0440\u044F\u0434 \u043D\u0435 \u0437\u0430\u043C\u0435\u043D\u044F\u0435\u0442 \u043F\u043E\u043B\u043D\u044B\u0439 \u041C\u0420-\u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B. \u0421\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u0441 \u043F\u0440\u0435\u0434\u044B\u0434\u0443\u0449\u0438\u043C \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435\u043C \u043D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E."}/></p>
  <LocalizedUi value={candidates.length > 0 && <>
   <button type="button" aria-expanded={open} onClick={() => setOpen(v => !v)}><LocalizedUi value={open ? 'Закрыть сравнение МР-серий' : 'Сравнить МР-серии рядом'}/></button>
   <LocalizedUi value={open && <>
    <label><LocalizedUi value={"\u0421\u0435\u0440\u0438\u044F \u0434\u043B\u044F \u0441\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u044F"}/><select value={companion?.key} onChange={e => setChoice(e.target.value)}><LocalizedUi value={candidates.map((s, i) => <option key={s.key} value={s.key}><LocalizedUi value={"\u041C\u0420-\u0441\u0435\u0440\u0438\u044F"}/><LocalizedUi value={i + 1}/> · <LocalizedUi value={s.members.length}/><LocalizedUi value={"\u0441\u0440\u0435\u0437\u043E\u0432"}/></option>)}/></select></label>
    <label><LocalizedUi value={"\u0421\u0440\u0435\u0437 \u043E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u0441\u0435\u0440\u0438\u0438"}/><input type="range" min={0} max={series.members.length - 1} value={index} onChange={e => setIndex(Number(e.target.value))}/><LocalizedUi value={index + 1}/></label>
    <LocalizedUi value={match?.status === 'unavailable' ? <p role="status"><LocalizedUi value={match.reason}/></p> : <>
     <p role="status"><LocalizedUi value={notice}/> <LocalizedUi value={match?.status === 'matched' && 'Расстояние между плоскостями: ' + match.distanceMm.toFixed(2) + ' мм.'}/></p>
     <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}><LocalizedUi value={pictures.map((url, i) => {
                        const s = i === 0 ? series : companion!, n = i === 0 ? index : match!.status === 'matched' ? match!.referenceIndex : 0, m = s.members[n].metadata;
                        return <figure key={i} style={{ margin: 0 }}><img src={url} width={320} height={320} style={{ objectFit: 'contain' }} alt={i === 0 ? 'Основная МР-серия' : 'Сопоставляемая МР-серия'}/>
       <figcaption><button type="button" onClick={() => onOpenSlice(s.members[n].id)}><LocalizedUi value={"\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B \u00B7 \u0441\u0440\u0435\u0437"}/><LocalizedUi value={n + 1}/></button><p>TR: <LocalizedUi value={m.repetitionTimeMs ?? 'не определено'}/><LocalizedUi value={"\u043C\u0441; TE:"}/><LocalizedUi value={m.echoTimeMs ?? 'не определено'}/><LocalizedUi value={"\u043C\u0441. \u0412\u0437\u0432\u0435\u0448\u0435\u043D\u043D\u043E\u0441\u0442\u044C \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0430."}/></p></figcaption></figure>;
                    })}/></div>
    </>}/>
    <p><LocalizedUi value={"\u0421\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E. \u042D\u0442\u0438 \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0441\u0435\u0440\u0438\u0438 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0432 \u0418\u0418 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u044E\u0442\u0441\u044F \u0438 \u043D\u0435 \u0432\u0445\u043E\u0434\u044F\u0442 \u0432 \u0441\u0447\u0451\u0442\u0447\u0438\u043A \u0435\u0433\u043E \u043E\u0445\u0432\u0430\u0442\u0430."}/></p>
   </>}/>
  </>}/>
 </section>;
}
