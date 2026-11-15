"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useState } from "react";
import { calculateManualIchVolume, type IchDimensions, type ManualIchVolume } from "../lib/ich-volume";
import IchResearchResults from "./IchResearchResults";
import IanpanIchResearchResults from "./IanpanIchResearchResults";
/** Manual CT HEAD quantitative clinical tool; NOT an AI hemorrhage detector. */
export default function HeadHemorrhageVolumePanel({ seriesKeys }: {
    seriesKeys: readonly string[];
}) {
    const __ui = useUiTranslator();
    const [seriesKey, setSeriesKey] = useState(seriesKeys[0] ?? "");
    const [dimensions, setDimensions] = useState<Partial<IchDimensions>>({});
    const [result, setResult] = useState<ManualIchVolume | null>(null);
    const [error, setError] = useState("");
    function update(name: keyof IchDimensions, raw: string) {
        setDimensions(p => ({ ...p, [name]: raw === "" ? undefined : Number(raw) }));
        setResult(null);
        setError("");
    }
    function calculate() {
        setError("");
        try {
            const { aMm, bMm, cMm } = dimensions;
            if (aMm === undefined || bMm === undefined || cMm === undefined)
                throw Error("Сначала укажите три измеренных размера A, B, C в миллиметрах.");
            setResult(calculateManualIchVolume({ aMm, bMm, cMm }, seriesKey));
        }
        catch (e) {
            setResult(null);
            setError(e instanceof Error ? e.message : "Ошибка измерений.");
        }
    }
    function save() {
        if (!result)
            return;
        const data = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(data);
        const a = document.createElement("a");
        a.href = url;
        a.download = "opus-ct-head-manual-ich-abc2.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return <section aria-label={__ui("\u041A\u0422 \u0433\u043E\u043B\u043E\u0432\u043D\u043E\u0433\u043E \u043C\u043E\u0437\u0433\u0430 \u00B7 \u0440\u0443\u0447\u043D\u0430\u044F \u043E\u0446\u0435\u043D\u043A\u0430 \u043E\u0431\u044A\u0451\u043C\u0430 \u0433\u0435\u043C\u0430\u0442\u043E\u043C\u044B")} style={{ border: "1px solid #688f81", borderRadius: 10, padding: 14, marginTop: 18 }}>
    <h3><LocalizedUi value={"\u041A\u0422 \u0433\u043E\u043B\u043E\u0432\u043D\u043E\u0433\u043E \u043C\u043E\u0437\u0433\u0430 \u00B7 \u0432\u043D\u0443\u0442\u0440\u0438\u043C\u043E\u0437\u0433\u043E\u0432\u043E\u0435 \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u0435"}/></h3>
    <p><strong><LocalizedUi value={"\u0420\u0443\u0447\u043D\u0430\u044F \u043E\u0446\u0435\u043D\u043A\u0430 \u043E\u0431\u044A\u0451\u043C\u0430 \u043F\u043E ABC/2"}/></strong><LocalizedUi value={"\u2014 \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0439 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442 \u0432\u0440\u0430\u0447\u0430, \u043D\u0435 \u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440 \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u0439. \u041E\u0442\u043A\u0440\u044B\u0442\u044B\u0435 \u0441\u0435\u0440\u0438\u0438 \u041A\u0422 \u0433\u043E\u043B\u043E\u0432\u044B \u043D\u0435 \u043E\u0437\u043D\u0430\u0447\u0430\u044E\u0442, \u0447\u0442\u043E \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0430 \u043E\u0431\u043D\u0430\u0440\u0443\u0436\u0438\u043B\u0430 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u044E."}/></p>
    <label><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u0441\u0435\u0440\u0438\u044F \u041A\u0422 \u0433\u043E\u043B\u043E\u0432\u044B"}/><select value={seriesKey} onChange={e => { setSeriesKey(e.target.value); setResult(null); }}>
        <LocalizedUi value={seriesKeys.map((key, i) => <option key={key} value={key}><LocalizedUi value={"\u041A\u0422 \u0433\u043E\u043B\u043E\u0432\u044B \u00B7 \u0441\u0435\u0440\u0438\u044F"}/><LocalizedUi value={i + 1}/></option>)}/>
      </select>
    </label>
    <p><LocalizedUi value={"\u0414\u043B\u044F \u043E\u0434\u0438\u043D\u043E\u0447\u043D\u043E\u0433\u043E \u043F\u0440\u0438\u0431\u043B\u0438\u0437\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u044D\u043B\u043B\u0438\u043F\u0441\u043E\u0438\u0434\u043D\u043E\u0433\u043E \u0432\u043D\u0443\u0442\u0440\u0438\u043C\u043E\u0437\u0433\u043E\u0432\u043E\u0433\u043E \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u044F: A \u2014 \u043D\u0430\u0438\u0431\u043E\u043B\u044C\u0448\u0438\u0439 \u0434\u0438\u0430\u043C\u0435\u0442\u0440 \u0432 \u0430\u043A\u0441\u0438\u0430\u043B\u044C\u043D\u043E\u0439 \u043F\u043B\u043E\u0441\u043A\u043E\u0441\u0442\u0438, B \u2014 \u043F\u0435\u0440\u043F\u0435\u043D\u0434\u0438\u043A\u0443\u043B\u044F\u0440\u043D\u044B\u0439 \u0435\u043C\u0443 \u0434\u0438\u0430\u043C\u0435\u0442\u0440 \u043D\u0430 \u0442\u043E\u043C \u0436\u0435 \u0441\u0440\u0435\u0437\u0435, C \u2014 \u043A\u0440\u0430\u043D\u0438\u043E\u043A\u0430\u0443\u0434\u0430\u043B\u044C\u043D\u0430\u044F \u043F\u0440\u043E\u0442\u044F\u0436\u0451\u043D\u043D\u043E\u0441\u0442\u044C \u043E\u0447\u0430\u0433\u0430. \u0412\u0441\u0435 \u0440\u0430\u0437\u043C\u0435\u0440\u044B \u0432\u0432\u043E\u0434\u044F\u0442\u0441\u044F \u0432\u0440\u0430\u0447\u043E\u043C \u043F\u043E \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u043C\u0443 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044E."}/></p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      <LocalizedUi value={([["aMm", "A · мм"], ["bMm", "B · мм"], ["cMm", "C · мм"]] as const).map(([key, label]) => <label key={key} style={{ minWidth: 115 }}><LocalizedUi value={label}/>
          <input style={{ display: "block", width: 110 }} type="number" min="0.1" max="300" step="0.1" inputMode="decimal" value={dimensions[key] ?? ""} onChange={e => update(key, e.target.value)}/>
        </label>)}/>
    </div>
    <button type="button" onClick={calculate}><LocalizedUi value={"\u0420\u0430\u0441\u0441\u0447\u0438\u0442\u0430\u0442\u044C \u043F\u0440\u0438\u0431\u043B\u0438\u0437\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u043E\u0431\u044A\u0451\u043C"}/></button>
    <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
    <LocalizedUi value={result && <>
      <p role="status"><strong><LocalizedUi value={"\u041E\u0431\u044A\u0451\u043C ABC/2 \u2248"}/><LocalizedUi value={result.approximateVolumeMl.toFixed(1)}/><LocalizedUi value={"\u043C\u043B"}/></strong><LocalizedUi value={". \u0420\u0430\u0441\u0441\u0447\u0438\u0442\u0430\u043D \u0438\u0437 \u0432\u0432\u0435\u0434\u0451\u043D\u043D\u044B\u0445 \u0440\u0430\u0437\u043C\u0435\u0440\u043E\u0432, \u043D\u0435 \u0438\u0437 \u043F\u0438\u043A\u0441\u0435\u043B\u0435\u0439 \u0438 \u043D\u0435 \u043D\u0435\u0439\u0440\u043E\u0441\u0435\u0442\u044C\u044E."}/></p>
      <LocalizedUi value={result.approximateVolumeMl > 200 && <p role="alert"><LocalizedUi value={"\u0411\u043E\u043B\u044C\u0448\u043E\u0439 \u0440\u0430\u0441\u0447\u0451\u0442\u043D\u044B\u0439 \u043E\u0431\u044A\u0451\u043C: \u043F\u0435\u0440\u0435\u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0440\u0430\u0437\u043C\u0435\u0440\u044B, \u0444\u043E\u0440\u043C\u0443 \u043E\u0447\u0430\u0433\u0430 \u0438 \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u043C\u043E\u0441\u0442\u044C ABC/2."}/></p>}/>
      <button type="button" onClick={save}><LocalizedUi value={"\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u043F\u0430\u0441\u043F\u043E\u0440\u0442 \u0440\u0443\u0447\u043D\u043E\u0433\u043E \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F JSON"}/></button>
    </>}/>
    <p role="note"><LocalizedUi value={"\u041C\u0435\u0442\u043E\u0434 \u043D\u0435 \u043F\u0440\u0435\u0434\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D \u0434\u043B\u044F \u0441\u0443\u0431\u0430\u0440\u0430\u0445\u043D\u043E\u0438\u0434\u0430\u043B\u044C\u043D\u043E\u0433\u043E, \u0441\u0443\u0431\u0434\u0443\u0440\u0430\u043B\u044C\u043D\u043E\u0433\u043E, \u044D\u043F\u0438\u0434\u0443\u0440\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0438\u043B\u0438 \u0438\u0437\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u043E\u0433\u043E \u0432\u043D\u0443\u0442\u0440\u0438\u0436\u0435\u043B\u0443\u0434\u043E\u0447\u043A\u043E\u0432\u043E\u0433\u043E \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u044F, \u0430 \u0442\u0430\u043A\u0436\u0435 \u043D\u0435 \u0437\u0430\u043C\u0435\u043D\u044F\u0435\u0442 \u043E\u0431\u044A\u0451\u043C\u043D\u0443\u044E \u0441\u0435\u0433\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u044E \u043F\u0440\u0438 \u0441\u043B\u043E\u0436\u043D\u043E\u0439 \u0444\u043E\u0440\u043C\u0435 \u043E\u0447\u0430\u0433\u0430. \u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u043C \u0434\u0438\u0430\u0433\u043D\u043E\u0437\u043E\u043C \u0438 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0432 \u043E\u0431\u043B\u0430\u043A\u043E."}/></p>
    <IchResearchResults />
    <IanpanIchResearchResults />
  </section>;
}
