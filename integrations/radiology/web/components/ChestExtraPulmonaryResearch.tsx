"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useState } from "react";
import { CHEST_FINDINGS, interpretChestObservations, type ChestRegion, type ChestFinding, type ChestReport, type ChestObservation } from "../lib/chest-extra-pulmonary";
const regions: Record<ChestRegion, string> = {
    mediastinum: "Средостение и лимфоузлы", heart: "Сердце и перикард",
    great_vessels: "Крупные сосуды", pleura: "Плевра", bones: "Рёбра, грудина, кости",
    spine: "Грудной отдел позвоночника"
};
const names: Record<ChestFinding, string> = {
    mediastinal_lymph_nodes: "Медиастинальные лимфоузлы", hilar_lymph_nodes: "Лимфоузлы корней",
    mediastinal_mass: "Образование средостения", pneumomediastinum: "Пневмомедиастинум",
    cardiomegaly: "Увеличение размеров сердца", pericardial_effusion: "Выпот в перикарде",
    coronary_calcification: "Кальцификация коронарных артерий",
    pericardial_calcification: "Кальциноз перикарда", aortic_dilatation: "Дилатация аорты",
    aortic_calcification: "Кальциноз аорты", pulmonary_artery_enlargement: "Расширение лёгочной артерии",
    pleural_effusion: "Плевральный выпот", pleural_thickening: "Утолщение плевры", pneumothorax: "Пневмоторакс",
    rib_fracture: "Перелом ребра", bone_lesion: "Очаговое изменение кости",
    sternal_lesion: "Изменение грудины", vertebral_compression: "Компрессионная деформация позвонка",
    vertebral_lesion: "Очаговое изменение позвонка", degenerative_changes: "Дегенеративные изменения"
};
export default function ChestExtraPulmonaryResearch({ isChestCT }: {
    isChestCT: boolean;
}) {
    const __ui = useUiTranslator();
    const [region, setRegion] = useState<ChestRegion>("mediastinum");
    const [finding, setFinding] = useState<ChestFinding>(CHEST_FINDINGS.mediastinum[0]);
    const [slice, setSlice] = useState("");
    const [size, setSize] = useState("");
    const [contrast, setContrast] = useState<ChestObservation["contrast"]>("unknown");
    const [observations, setObservations] = useState<ChestObservation[]>([]);
    const [report, setReport] = useState<ChestReport | null>(null);
    const [error, setError] = useState("");
    function reset() { setReport(null); setError(""); }
    return <section className="cs-geometry" aria-label={__ui("\u0412\u043D\u0435\u043B\u0451\u0433\u043E\u0447\u043D\u044B\u0435 \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u044B \u0433\u0440\u0443\u0434\u043D\u043E\u0439 \u043A\u043B\u0435\u0442\u043A\u0438")}>
 <h3><LocalizedUi value={"\u041A\u0422 \u0433\u0440\u0443\u0434\u043D\u043E\u0439 \u043A\u043B\u0435\u0442\u043A\u0438 \u00B7 \u0441\u0440\u0435\u0434\u043E\u0441\u0442\u0435\u043D\u0438\u0435, \u0441\u0435\u0440\u0434\u0446\u0435, \u0441\u043E\u0441\u0443\u0434\u044B \u0438 \u0441\u043A\u0435\u043B\u0435\u0442"}/></h3>
 <p><LocalizedUi value={"\u0412\u0440\u0430\u0447\u0435\u0431\u043D\u0430\u044F \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044F \u043D\u0430\u0445\u043E\u0434\u043E\u043A \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u0430\u0445. \u041F\u043E\u043A\u0430 \u044D\u0442\u043E \u043D\u0435 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0434\u0435\u0442\u0435\u043A\u0446\u0438\u044F."}/></p>
 <LocalizedUi value={!isChestCT && <p role="alert"><LocalizedUi value={"\u0414\u043B\u044F \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u0438\u044F \u043D\u0430\u0445\u043E\u0434\u043E\u043A \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u0443\u044E \u041A\u0422 \u0433\u0440\u0443\u0434\u043D\u043E\u0439 \u043A\u043B\u0435\u0442\u043A\u0438."}/></p>}/>
 <fieldset disabled={!isChestCT} style={{ border: 0, padding: 0, margin: 0 }}>
 <label><LocalizedUi value={"\u0410\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043E\u0431\u043B\u0430\u0441\u0442\u044C"}/><select value={region} onChange={e => {
            const next = e.target.value as ChestRegion;
            setRegion(next);
            setFinding(CHEST_FINDINGS[next][0]);
            reset();
        }}><LocalizedUi value={(Object.keys(regions) as ChestRegion[]).map(r => <option key={r} value={r}><LocalizedUi value={regions[r]}/></option>)}/></select></label>
 <label style={{ display: "block", marginTop: 6 }}><LocalizedUi value={"\u041C\u043E\u0440\u0444\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043D\u0430\u0445\u043E\u0434\u043A\u0430"}/><select value={finding} onChange={e => { setFinding(e.target.value as ChestFinding); reset(); }}>
 <LocalizedUi value={CHEST_FINDINGS[region].map(f => <option value={f} key={f}><LocalizedUi value={names[f]}/></option>)}/></select></label>
 <label style={{ display: "block", marginTop: 6 }}><LocalizedUi value={"\u041D\u043E\u043C\u0435\u0440 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E \u0441\u0440\u0435\u0437\u0430"}/><input type="number" min="1" max="100000" value={slice} onChange={e => { setSlice(e.target.value); reset(); }} style={{ width: 100 }}/></label>
 <label style={{ display: "block", marginTop: 6 }}><LocalizedUi value={"\u0420\u0430\u0437\u043C\u0435\u0440, \u043C\u043C (\u0435\u0441\u043B\u0438 \u0438\u0437\u043C\u0435\u0440\u0435\u043D)"}/><input type="number" min="0.1" max="500" step="0.1" value={size} onChange={e => { setSize(e.target.value); reset(); }} style={{ width: 100 }}/></label>
 <label style={{ display: "block", marginTop: 6 }}><LocalizedUi value={"\u0422\u0438\u043F \u041A\u0422"}/><select value={contrast} onChange={e => { setContrast(e.target.value as ChestObservation["contrast"]); reset(); }}>
 <option value="unknown"><LocalizedUi value={"\u041D\u0435 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0451\u043D"}/></option><option value="noncontrast"><LocalizedUi value={"\u0411\u0435\u0437 \u043A\u043E\u043D\u0442\u0440\u0430\u0441\u0442\u0430"}/></option><option value="contrast"><LocalizedUi value={"\u0421 \u0432\u043D\u0443\u0442\u0440\u0438\u0432\u0435\u043D\u043D\u044B\u043C \u043A\u043E\u043D\u0442\u0440\u0430\u0441\u0442\u043E\u043C"}/></option>
 </select></label>
 <button type="button" onClick={() => {
            try {
                const number = Number(slice);
                if (!slice || !Number.isSafeInteger(number) || number < 1)
                    throw Error("Укажите номер исходного среза.");
                const measurement = size ? Number(size) : undefined;
                const observation: ChestObservation = { region, finding, slice: number, readerConfirmed: true, contrast, measurementMm: measurement };
                interpretChestObservations([observation]);
                setObservations(prev => [...prev, observation]);
                reset();
            }
            catch (e) {
                setError(e instanceof Error ? e.message : "Ошибка регистрации находки.");
            }
        }}><LocalizedUi value={"\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u0443\u044E \u043D\u0430\u0445\u043E\u0434\u043A\u0443"}/></button>
 </fieldset>
 <LocalizedUi value={observations.length > 0 && <><p><LocalizedUi value={"\u0417\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u043D\u0430\u0431\u043B\u044E\u0434\u0435\u043D\u0438\u0439:"}/><LocalizedUi value={observations.length}/></p>
 <ul><LocalizedUi value={observations.map((o, i) => <li key={i}><LocalizedUi value={regions[o.region]}/> · <LocalizedUi value={names[o.finding]}/><LocalizedUi value={"\u00B7 \u0441\u0440\u0435\u0437"}/><LocalizedUi value={o.slice}/>
 <button type="button" onClick={() => { setObservations(prev => prev.filter((_, j) => j !== i)); reset(); }}><LocalizedUi value={"\u0423\u0434\u0430\u043B\u0438\u0442\u044C"}/></button></li>)}/></ul>
 <button type="button" onClick={() => {
                try {
                    setReport(interpretChestObservations(observations));
                    setError("");
                }
                catch (e) {
                    setError(String(e));
                }
            }}><LocalizedUi value={"\u0421\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u043E\u0431\u0437\u043E\u0440"}/></button></>}/>
 <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
 <LocalizedUi value={report && <div role="status"><h4><LocalizedUi value={"\u0421\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u043E\u0431\u0437\u043E\u0440"}/></h4>
 <LocalizedUi value={report.evidence.map((x, i) => <div key={i}><strong><LocalizedUi value={regions[x.region]}/>: <LocalizedUi value={names[x.finding]}/></strong>
 <p><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u0441\u0440\u0435\u0437"}/><LocalizedUi value={x.slice}/><LocalizedUi value={x.measurementMm ? "; размер " + x.measurementMm + " мм" : ""}/></p>
 <LocalizedUi value={x.limitations.map((note, j) => <p key={j}><LocalizedUi value={note}/></p>)}/></div>)}/>
 <p><strong><LocalizedUi value={"\u041E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u044F:"}/></strong> <LocalizedUi value={report.missing.join(" ")}/><LocalizedUi value={"\u0418\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430 \u0432\u0440\u0430\u0447\u043E\u043C \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0439. \u042D\u0442\u043E \u043D\u0435 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0438 \u0432\u0430\u043B\u0438\u0434\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u0434\u0438\u0430\u0433\u043D\u043E\u0437."}/></p></div>}/>
 </section>;
}
