"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useState } from "react";
import type { DicomSeries } from "../lib/dicom-series";
import { interpretThoracicMasses, THORACIC_MASS_KINDS, type ThoracicMassKind, type ThoracicCompartment, type ThoracicFindingInput, type ThoracicMassWorklist } from "../lib/thoracic-mass-worklist";
const compartments: Record<ThoracicMassKind, readonly ThoracicCompartment[]> = {
    pulmonary_nodule: ["lung"], pulmonary_mass: ["lung"],
    mediastinal_mass: ["anterior_mediastinum", "middle_mediastinum", "posterior_mediastinum"],
    mediastinal_lymph_node: ["anterior_mediastinum", "middle_mediastinum", "posterior_mediastinum"],
    hilar_lymph_node: ["hilum"], pleural_mass: ["pleura"], chest_wall_mass: ["chest_wall"],
};
const anatomy: Record<ThoracicCompartment, string> = {
    lung: "Лёгкое", anterior_mediastinum: "Переднее средостение",
    middle_mediastinum: "Среднее средостение",
    posterior_mediastinum: "Заднее средостение", hilum: "Корень лёгкого",
    pleura: "Плевра", chest_wall: "Грудная стенка",
};
const locations = { right: "Справа", left: "Слева", midline: "По средней линии", unknown: "Не определена" } as const;
const densities = {
    soft_tissue: "Мягкотканная", ground_glass: "Матового стекла", mixed: "Смешанная",
    fat: "Жировая", calcified: "Кальцинаты", unknown: "Не определена",
} as const;
export default function ThoracicMassResearch({ series }: {
    series: DicomSeries | null;
}) {
    const __ui = useUiTranslator();
    const [kind, setKind] = useState<ThoracicMassKind>("mediastinal_lymph_node");
    const [compartment, setCompartment] = useState<ThoracicCompartment>("middle_mediastinum");
    const [side, setSide] = useState<ThoracicFindingInput["side"]>("unknown");
    const [slice, setSlice] = useState("");
    const [longest, setLongest] = useState("");
    const [shortAxis, setShortAxis] = useState("");
    const [contrast, setContrast] = useState<ThoracicFindingInput["contrast"]>("unknown");
    const [attenuation, setAttenuation] = useState<ThoracicFindingInput["attenuation"]>("unknown");
    const [confirmed, setConfirmed] = useState(false);
    const [observations, setObservations] = useState<ThoracicFindingInput[]>([]);
    const [error, setError] = useState("");
    const [report, setReport] = useState<ThoracicMassWorklist | null>(null);
    const eligible = !!series && series.modality === "CT" && series.members.length > 0 &&
        series.members.every(m => m.metadata.modality === "CT" && m.metadata.bodyRegion === "CHEST");
    function reset() { setReport(null); setError(""); }
    function add() {
        if (!eligible || !series)
            return;
        try {
            const ordinal = Number(slice), source = series.members[ordinal - 1];
            if (!slice || !source || !Number.isSafeInteger(ordinal))
                throw Error("Укажите реальный срез этой КТ.");
            const value: ThoracicFindingInput = {
                kind, compartment, side, sliceOrdinal: ordinal, localSourceMemberId: source.id,
                origin: "physician_annotation", readerConfirmed: confirmed as true, contrast, attenuation,
                longestAxialMm: longest.trim() ? Number(longest) : null,
                shortAxisMm: shortAxis.trim() ? Number(shortAxis) : null,
            };
            interpretThoracicMasses(series, [value]);
            setObservations(current => [...current, value].slice(0, 40));
            reset();
            setConfirmed(false);
            setSlice("");
            setLongest("");
            setShortAxis("");
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Недопустимая локальная находка.");
        }
    }
    function review() {
        if (!eligible || !series)
            return;
        try {
            setReport(interpretThoracicMasses(series, observations));
            setError("");
        }
        catch {
            setReport(null);
            setError("Срезы или исходная серия изменились; откройте исходные изображения повторно.");
        }
    }
    return <section className="cs-geometry" aria-label={__ui("\u0412\u043D\u0443\u0442\u0440\u0438\u0433\u0440\u0443\u0434\u043D\u044B\u0435 \u043E\u0431\u0440\u0430\u0437\u043E\u0432\u0430\u043D\u0438\u044F \u2014 \u0438\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u041A\u0422")}>
   <h3><LocalizedUi value={"\u041A\u0422 \u0433\u0440\u0443\u0434\u043D\u043E\u0439 \u043A\u043B\u0435\u0442\u043A\u0438 \u00B7 \u043E\u0431\u0440\u0430\u0437\u043E\u0432\u0430\u043D\u0438\u044F \u0438 \u043B\u0438\u043C\u0444\u043E\u0443\u0437\u043B\u044B"}/></h3>
   <p><LocalizedUi value={"\u041E\u0442\u0434\u0435\u043B\u044C\u043D\u0430\u044F \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044F \u043B\u0451\u0433\u043E\u0447\u043D\u044B\u0445 \u0443\u0437\u043B\u043E\u0432 \u0438 \u043C\u0430\u0441\u0441, \u043E\u0431\u0440\u0430\u0437\u043E\u0432\u0430\u043D\u0438\u0439 \u0441\u0440\u0435\u0434\u043E\u0441\u0442\u0435\u043D\u0438\u044F, \u043B\u0438\u043C\u0444\u043E\u0443\u0437\u043B\u043E\u0432 \u043A\u043E\u0440\u043D\u0435\u0439, \u043F\u043B\u0435\u0432\u0440\u0430\u043B\u044C\u043D\u044B\u0445 \u0438 \u043F\u0440\u0438\u0441\u0442\u0435\u043D\u043E\u0447\u043D\u044B\u0445 \u043E\u0447\u0430\u0433\u043E\u0432. \u042D\u0442\u043E"}/><strong><LocalizedUi value={"\u0432\u0440\u0430\u0447\u0435\u0431\u043D\u044B\u0439 \u043E\u0431\u0437\u043E\u0440 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 DICOM"}/></strong><LocalizedUi value={", \u043D\u0435 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u043E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u0438\u0435 \u043E\u043F\u0443\u0445\u043E\u043B\u0438."}/></p>
   <LocalizedUi value={!eligible && <p role="status"><LocalizedUi value={"\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043E\u0434\u043D\u043E\u0440\u043E\u0434\u043D\u0443\u044E \u0441\u0435\u0440\u0438\u044E \u041A\u0422 \u0433\u0440\u0443\u0434\u043D\u043E\u0439 \u043A\u043B\u0435\u0442\u043A\u0438 \u0434\u043B\u044F \u043F\u0440\u0438\u0432\u044F\u0437\u043A\u0438 \u043A \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0438\u043C \u0441\u0440\u0435\u0437\u0430\u043C."}/></p>}/>
   <fieldset disabled={!eligible} style={{ border: 0, padding: 0, margin: 0 }}>
     <label><LocalizedUi value={"\u0422\u0438\u043F \u043D\u0430\u0445\u043E\u0434\u043A\u0438"}/><select value={kind} onChange={e => {
            const k = e.target.value as ThoracicMassKind;
            setKind(k);
            setCompartment(compartments[k][0]);
            reset();
        }}><LocalizedUi value={(Object.keys(THORACIC_MASS_KINDS) as ThoracicMassKind[]).map(k => <option key={k} value={k}><LocalizedUi value={THORACIC_MASS_KINDS[k]}/></option>)}/></select>
     </label>
     <label><LocalizedUi value={"\u041B\u043E\u043A\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F"}/><select value={compartment} onChange={e => { setCompartment(e.target.value as ThoracicCompartment); reset(); }}>
         <LocalizedUi value={compartments[kind].map(k => <option key={k} value={k}><LocalizedUi value={anatomy[k]}/></option>)}/>
       </select>
     </label>
     <label><LocalizedUi value={"\u0421\u0442\u043E\u0440\u043E\u043D\u0430"}/><select value={side} onChange={e => { setSide(e.target.value as typeof side); reset(); }}>
         <LocalizedUi value={(Object.keys(locations) as ThoracicFindingInput["side"][]).map(k => <option key={k} value={k}><LocalizedUi value={locations[k]}/></option>)}/>
       </select>
     </label>
     <label><LocalizedUi value={"\u0421\u0440\u0435\u0437 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u041A\u0422 (1\u2013"}/><LocalizedUi value={series?.members.length ?? 0}/>)
       <input type="number" min="1" max={series?.members.length ?? 1} value={slice} onChange={e => { setSlice(e.target.value); reset(); }}/>
     </label>
     <label><LocalizedUi value={"\u041D\u0430\u0438\u0431\u043E\u043B\u044C\u0448\u0438\u0439 \u0430\u043A\u0441\u0438\u0430\u043B\u044C\u043D\u044B\u0439 \u0440\u0430\u0437\u043C\u0435\u0440, \u043C\u043C"}/><input type="number" min="0.1" max="500" step="0.1" value={longest} onChange={e => { setLongest(e.target.value); reset(); }}/>
     </label>
     <label><LocalizedUi value={"\u041A\u043E\u0440\u043E\u0442\u043A\u0430\u044F \u043E\u0441\u044C, \u043C\u043C \u2014 \u0432\u0430\u0436\u043D\u0430 \u0434\u043B\u044F \u043B\u0438\u043C\u0444\u043E\u0443\u0437\u043B\u043E\u0432"}/><input type="number" min="0.1" max="500" step="0.1" value={shortAxis} onChange={e => { setShortAxis(e.target.value); reset(); }}/>
     </label>
     <label><LocalizedUi value={"\u041A\u043E\u043D\u0442\u0440\u0430\u0441\u0442"}/><select value={contrast} onChange={e => { setContrast(e.target.value as typeof contrast); reset(); }}>
         <option value="unknown"><LocalizedUi value={"\u041D\u0435 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0451\u043D"}/></option>
         <option value="noncontrast"><LocalizedUi value={"\u0411\u0435\u0437 \u043A\u043E\u043D\u0442\u0440\u0430\u0441\u0442\u0430"}/></option>
         <option value="contrast"><LocalizedUi value={"\u041A\u043E\u043D\u0442\u0440\u0430\u0441\u0442\u043D\u0430\u044F \u041A\u0422"}/></option>
       </select>
     </label>
     <label><LocalizedUi value={"\u0412\u0438\u0434\u0438\u043C\u0430\u044F \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0430"}/><select value={attenuation} onChange={e => { setAttenuation(e.target.value as typeof attenuation); reset(); }}>
         <LocalizedUi value={(Object.keys(densities) as ThoracicFindingInput["attenuation"][]).map(k => <option key={k} value={k}><LocalizedUi value={densities[k]}/></option>)}/>
       </select>
     </label>
     <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/><LocalizedUi value={"\u042F \u043B\u0438\u0447\u043D\u043E \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u043B \u044D\u0442\u043E\u0442 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0439 DICOM-\u0441\u0440\u0435\u0437; \u0432\u0432\u0435\u0434\u0451\u043D\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F \u2014 \u0440\u0443\u0447\u043D\u044B\u0435."}/></label>
     <button type="button" disabled={!confirmed || observations.length >= 40} onClick={add}><LocalizedUi value={"\u0417\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u043D\u0430\u0445\u043E\u0434\u043A\u0443 \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u041A\u0422"}/></button>
   </fieldset>
   <LocalizedUi value={observations.length > 0 && <div>
     <p><LocalizedUi value={"\u041F\u0440\u0438\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0445 \u043D\u0430\u0431\u043B\u044E\u0434\u0435\u043D\u0438\u0439:"}/><LocalizedUi value={observations.length}/></p>
     <ul><LocalizedUi value={observations.map((o, i) => <li key={i}>
       <LocalizedUi value={THORACIC_MASS_KINDS[o.kind]}/><LocalizedUi value={"\u00B7 \u0441\u0440\u0435\u0437"}/><LocalizedUi value={o.sliceOrdinal}/>,
       <LocalizedUi value={" "}/><LocalizedUi value={o.longestAxialMm ?? "?"}/><LocalizedUi value={"\u043C\u043C"}/><button type="button" onClick={() => {
                    setObservations(old => old.filter((_, j) => j !== i));
                    reset();
                }}><LocalizedUi value={"\u0423\u0434\u0430\u043B\u0438\u0442\u044C"}/></button>
     </li>)}/></ul>
     <button type="button" onClick={review}><LocalizedUi value={"\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u043E\u0431\u0437\u043E\u0440 \u043E\u0431\u0440\u0430\u0437\u043E\u0432\u0430\u043D\u0438\u0439"}/></button>
   </div>}/>
   <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
   <LocalizedUi value={report && <div role="status">
     <h4><LocalizedUi value={"\u0412\u0440\u0430\u0447\u0435\u0431\u043D\u044B\u0435 \u043D\u0430\u0431\u043B\u044E\u0434\u0435\u043D\u0438\u044F \u00B7"}/><LocalizedUi value={report.findings.length}/></h4>
     <LocalizedUi value={report.findings.map((f, i) => <article key={i}>
       <strong><LocalizedUi value={THORACIC_MASS_KINDS[f.kind]}/></strong> · <LocalizedUi value={anatomy[f.compartment]}/> · <LocalizedUi value={locations[f.side]}/>
       <p><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u0441\u0440\u0435\u0437"}/><LocalizedUi value={f.sourceSliceOrdinal}/>.
         <LocalizedUi value={" "}/><LocalizedUi value={"\u0414\u043B\u0438\u043D\u043D\u0430\u044F \u043E\u0441\u044C"}/><LocalizedUi value={f.longestAxialMm ?? "не измерена"}/><LocalizedUi value={"\u043C\u043C; \u043A\u043E\u0440\u043E\u0442\u043A\u0430\u044F \u043E\u0441\u044C"}/><LocalizedUi value={f.shortAxisMm ?? "не измерена"}/><LocalizedUi value={"\u043C\u043C."}/></p>
       <small><LocalizedUi value={f.caveats.join(" ")}/></small>
     </article>)}/>
     <p><strong><LocalizedUi value={"\u042D\u0442\u043E \u043D\u0435 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435:"}/></strong><LocalizedUi value={"\u043C\u0435\u0442\u0430\u0441\u0442\u0430\u0437\u044B, \u0440\u0430\u043A \u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u0438\u043D\u044B\u0445 \u043E\u0431\u0440\u0430\u0437\u043E\u0432\u0430\u043D\u0438\u0439 \u043D\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u044B. \u041D\u0435\u0442 \u043E\u0431\u0443\u0447\u0435\u043D\u043D\u043E\u0439 \u043C\u043E\u0434\u0435\u043B\u0438, 3D-\u043C\u0430\u0441\u043A\u0438 \u0438 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0433\u043E \u044D\u0442\u0430\u043B\u043E\u043D\u0430. \u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0435 UID \u0438 \u0438\u043C\u0435\u043D\u0430 \u0444\u0430\u0439\u043B\u043E\u0432 \u043D\u0435 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u044B \u0432 \u043E\u0431\u0437\u043E\u0440."}/></p>
   </div>}/>
 </section>;
}
