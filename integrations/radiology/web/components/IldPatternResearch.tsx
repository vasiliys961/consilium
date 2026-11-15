"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useState } from "react";
import { ILD_FEATURES, interpretIldObservations, type IldFeature, type Distribution, type IldPatternSummary } from "../lib/ild-pattern-engine";
const labels: Record<IldFeature, string> = {
    ground_glass: "Матовое стекло", reticulation: "Ретикуляция", honeycombing: "Сотовое лёгкое",
    traction_bronchiectasis: "Тракционные бронхоэктазы", consolidation: "Консолидация",
    mosaic_attenuation: "Мозаичная плотность", centrilobular_nodules: "Центрилобулярные узелки",
    perilymphatic_nodules: "Перилимфатические узелки", subpleural_sparing: "Субплевральное сохранение"
};
const distributionOptions: Record<Distribution, string> = {
    unknown: "Не определено", basal_subpleural: "Базально-субплевральное",
    peribronchovascular: "Перибронховаскулярное", upper_mid: "Верхние/средние отделы",
    diffuse: "Диффузное", random: "Без чёткой закономерности"
};
export default function IldPatternResearch({ isChestCT }: {
    isChestCT: boolean;
}) {
    const __ui = useUiTranslator();
    const [features, setFeatures] = useState<IldFeature[]>([]);
    const [distribution, setDistribution] = useState<Distribution>("unknown");
    const [slices, setSlices] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [result, setResult] = useState<IldPatternSummary | null>(null);
    const [error, setError] = useState("");
    function reset() { setResult(null); setError(""); }
    return <section className="cs-geometry" aria-label={__ui("\u041C\u043E\u0440\u0444\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0430\u043D\u0430\u043B\u0438\u0437 \u0438\u043D\u0442\u0435\u0440\u0441\u0442\u0438\u0446\u0438\u0430\u043B\u044C\u043D\u044B\u0445 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439")}>
 <h3><LocalizedUi value={"ILD Pattern Engine \u00B7 \u0432\u0440\u0430\u0447\u0435\u0431\u043D\u0430\u044F \u043C\u043E\u0440\u0444\u043E\u043B\u043E\u0433\u0438\u044F HRCT"}/></h3>
 <p><LocalizedUi value={"\u041E\u0442\u043C\u0435\u0442\u044C\u0442\u0435"}/><strong><LocalizedUi value={"\u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u0438\u0437\u043D\u0430\u043A\u0438, \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0435 \u0432\u0440\u0430\u0447\u043E\u043C \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u0430\u0445"}/></strong><LocalizedUi value={". \u0414\u0430\u043D\u043D\u044B\u0435 \u0437\u0434\u0435\u0441\u044C \u043D\u0435 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u044F\u044E\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043F\u043E \u041A\u0422. \u0412\u043D\u0435\u0448\u043D\u0438\u043C AI-\u0441\u0435\u0440\u0432\u0438\u0441\u0430\u043C \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u044E\u0442\u0441\u044F."}/></p>
 <LocalizedUi value={!isChestCT && <p role="alert"><LocalizedUi value={"\u0412\u044B\u0431\u0440\u0430\u043D\u0430 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u0430\u044F \u041A\u0422 \u0433\u0440\u0443\u0434\u043D\u043E\u0439 \u043A\u043B\u0435\u0442\u043A\u0438: \u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u043E."}/></p>}/>
 <fieldset disabled={!isChestCT} style={{ border: 0, padding: 0, margin: 0 }}>
 <legend><LocalizedUi value={"\u0412\u0438\u0437\u0443\u0430\u043B\u044C\u043D\u043E \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0435 \u043F\u0440\u0438\u0437\u043D\u0430\u043A\u0438"}/></legend>
 <LocalizedUi value={ILD_FEATURES.map(k => <label key={k} style={{ display: "block", margin: "5px 0" }}>
 <input type="checkbox" checked={features.includes(k)} onChange={e => {
                setFeatures(old => e.target.checked ? [...old, k] : old.filter(x => x !== k));
                reset();
            }}/><LocalizedUi value={" "}/><LocalizedUi value={labels[k]}/></label>)}/>
 <label style={{ display: "block", marginTop: 8 }}><LocalizedUi value={"\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435"}/><select value={distribution} onChange={e => { setDistribution(e.target.value as Distribution); reset(); }} style={{ display: "block", width: "100%", maxWidth: 340, marginTop: 4 }}>
 <LocalizedUi value={Object.entries(distributionOptions).map(([k, name]) => <option key={k} value={k}><LocalizedUi value={name}/></option>)}/>
 </select></label>
 <label style={{ display: "block", marginTop: 8 }}><LocalizedUi value={"\u0421\u0441\u044B\u043B\u043A\u0438 \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0435 \u0441\u0440\u0435\u0437\u044B (\u043D\u043E\u043C\u0435\u0440\u0430, \u0447\u0435\u0440\u0435\u0437 \u0437\u0430\u043F\u044F\u0442\u0443\u044E)"}/><input value={slices} onChange={e => { setSlices(e.target.value); reset(); }} placeholder={__ui("\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, 27, 46, 83")} style={{ display: "block", width: "100%", maxWidth: 340 }} maxLength={512}/></label>
 <label style={{ display: "block", marginTop: 8 }}><input type="checkbox" checked={confirmed} onChange={e => { setConfirmed(e.target.checked); reset(); }}/><LocalizedUi value={"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E \u0440\u0443\u0447\u043D\u0443\u044E \u043E\u0446\u0435\u043D\u043A\u0443 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u041A\u0422-\u0441\u0440\u0435\u0437\u043E\u0432"}/></label>
 <button type="button" onClick={() => {
            try {
                const refs = slices.split(",").map(s => s.trim()).filter(Boolean);
                if (refs.some(s => !/^[0-9]{1,6}$/.test(s)))
                    throw Error("Номера срезов должны содержать только цифры.");
                setResult(interpretIldObservations({ features, distribution, axialSourceRefs: refs, readerConfirmed: confirmed }));
                setError("");
            }
            catch (e) {
                setResult(null);
                setError(e instanceof Error ? e.message : "Ошибка обработки.");
            }
        }}><LocalizedUi value={"\u0421\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043C\u043E\u0440\u0444\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0441\u044B"}/></button>
 </fieldset>
 <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
 <LocalizedUi value={result && <div role="status" style={{ marginTop: 10 }}>
 <LocalizedUi value={result.status === "insufficient_evidence" ?
                <p><LocalizedUi value={"\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0445 \u0434\u0430\u043D\u043D\u044B\u0445 \u0434\u043B\u044F \u0434\u0430\u0436\u0435 \u043E\u043F\u0438\u0441\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u0434\u0438\u0444\u0444\u0435\u0440\u0435\u043D\u0446\u0438\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0440\u044F\u0434\u0430."}/></p> :
                <><h4><LocalizedUi value={"\u041E\u043F\u0438\u0441\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043F\u0430\u0442\u0442\u0435\u0440\u043D\u044B \u2014 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0430\u044F \u0433\u0438\u043F\u043E\u0442\u0435\u0437\u0430"}/></h4>
 <LocalizedUi value={result.candidates.map(c => <div key={c.name}><strong><LocalizedUi value={c.name}/></strong>
 <p><LocalizedUi value={"\u041F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u044E\u0449\u0438\u0435 \u043E\u0442\u043C\u0435\u0447\u0435\u043D\u043D\u044B\u0435 \u043F\u0440\u0438\u0437\u043D\u0430\u043A\u0438:"}/><LocalizedUi value={c.support.map(k => labels[k]).join(", ")}/>.</p><p><LocalizedUi value={c.caveat}/></p></div>)}/></>}/>
 <p><strong><LocalizedUi value={"\u041E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u044F \u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0430\u044E\u0449\u0438\u0435 \u0434\u0430\u043D\u043D\u044B\u0435:"}/></strong> <LocalizedUi value={result.missing.join(" ")}/></p>
 <p><LocalizedUi value={"\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u043D\u0438\u044F \u0444\u0438\u0431\u0440\u043E\u0437\u0430, \u043D\u043E\u0437\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u0434\u0438\u0430\u0433\u043D\u043E\u0437\u0430, \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u0438 \u043C\u043E\u0434\u0435\u043B\u0438 \u0438\u043B\u0438 \u043E\u0446\u0435\u043D\u043A\u0438 \u0432\u0435\u0440\u043E\u044F\u0442\u043D\u043E\u0441\u0442\u0435\u0439 \u0437\u0434\u0435\u0441\u044C \u043D\u0435\u0442. \u0412\u0440\u0430\u0447 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442 \u0438\u0441\u0445\u043E\u0434\u043D\u0443\u044E HRCT."}/></p>
 </div>}/>
 </section>;
}
