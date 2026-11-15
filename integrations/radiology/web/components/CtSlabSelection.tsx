"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useState } from "react";
import type { DicomSeries } from "../lib/dicom-series";
import { maxCtSlabFrames, selectCtSlab } from "../lib/ct-slab";
export default function CtSlabSelection({ series, fileSizes, selected, disabled, onSelect }: {
    series: DicomSeries;
    fileSizes: number[];
    selected: DicomSeries | null;
    disabled: boolean;
    onSelect: (series: DicomSeries | null) => void;
}) {
    const __ui = useUiTranslator();
    const maximum = maxCtSlabFrames(series);
    const [start, setStart] = useState("1"), [end, setEnd] = useState(String(maximum));
    const [error, setError] = useState("");
    useEffect(() => { setStart("1"); setEnd(String(maximum)); setError(""); }, [series, maximum]);
    if (!maximum)
        return null;
    const apply = () => {
        try {
            const slab = selectCtSlab(series, fileSizes, Number(start) - 1, Number(end) - 1);
            setError("");
            onSelect(slab);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось выбрать фрагмент.");
        }
    };
    return <section className="ora-ct-slab" aria-label={__ui("\u0424\u0440\u0430\u0433\u043C\u0435\u043D\u0442 \u041A\u0422 \u0434\u043B\u044F MPR \u0438 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0433\u043E AI")}>
    <strong><LocalizedUi value={"\u0424\u0440\u0430\u0433\u043C\u0435\u043D\u0442 \u041A\u0422 \u00B7 \u043C\u0435\u043D\u044C\u0448\u0435 \u043F\u0430\u043C\u044F\u0442\u0438"}/></strong>
    <p><LocalizedUi value={"\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 3\u2013"}/><LocalizedUi value={maximum}/><LocalizedUi value={"\u043F\u043E\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u043E\u0432. \u041F\u043E\u043B\u043D\u0430\u044F \u0441\u0435\u0440\u0438\u044F \u043E\u0441\u0442\u0430\u0451\u0442\u0441\u044F \u0432 2D; MPR \u0438 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 AI \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044E\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u044D\u0442\u043E\u0442 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D."}/></p>
    <label><LocalizedUi value={"\u041F\u0435\u0440\u0432\u044B\u0439 \u0441\u0440\u0435\u0437"}/><input aria-label={__ui("\u041F\u0435\u0440\u0432\u044B\u0439 \u0441\u0440\u0435\u0437 \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442\u0430 \u041A\u0422")} type="number" min={1} max={series.members.length} value={start} disabled={disabled} onChange={e => setStart(e.target.value)}/></label>
    <label><LocalizedUi value={"\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0439 \u0441\u0440\u0435\u0437"}/><input aria-label={__ui("\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0439 \u0441\u0440\u0435\u0437 \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442\u0430 \u041A\u0422")} type="number" min={1} max={series.members.length} value={end} disabled={disabled} onChange={e => setEnd(e.target.value)}/></label>
    <button type="button" disabled={disabled} onClick={apply}><LocalizedUi value={"\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442 \u0432 MPR"}/></button>
    <LocalizedUi value={selected && <><p role="status"><LocalizedUi value={selected.label}/><LocalizedUi value={". \u0427\u0430\u0441\u0442\u0438\u0447\u043D\u043E\u0435 \u043F\u043E\u043A\u0440\u044B\u0442\u0438\u0435: \u0432\u043D\u0435 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u0430 AI \u043D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u043B."}/></p>
      <button type="button" onClick={() => onSelect(null)}><LocalizedUi value={"\u0412\u0435\u0440\u043D\u0443\u0442\u044C \u043F\u043E\u043B\u043D\u0443\u044E \u0441\u0435\u0440\u0438\u044E \u0432 2D"}/></button></>}/>
    <LocalizedUi value={disabled && <p><LocalizedUi value={"\u041F\u0435\u0440\u0435\u0434 \u0441\u043C\u0435\u043D\u043E\u0439 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u0430 \u0432\u0435\u0440\u043D\u0438\u0442\u0435\u0441\u044C \u0432 2D. \u0422\u0435\u043A\u0443\u0449\u0430\u044F \u043C\u0430\u0441\u043A\u0430 \u0438 \u043D\u0435\u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D\u043D\u043E\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u0435 \u0431\u0443\u0434\u0443\u0442 \u0441\u0431\u0440\u043E\u0448\u0435\u043D\u044B."}/></p>}/>
    <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
  </section>;
}
