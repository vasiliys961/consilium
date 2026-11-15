"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useMemo, useState } from "react";
import DualPublicDetectorReview from "./DualPublicDetectorReview";
type Status = "real_case_measured" | "real_trial_running" | "real_checkpoint_candidate" | "license_blocked" | "weights_unverified";
type Entry = {
    id: string;
    modality: string;
    anatomy: string;
    pathology: string;
    status: Status;
    weights: string;
    source: string;
    reference: string;
    restriction: string;
    priority: number;
    next: string;
};
type Catalog = {
    schema: "opus-clinically-prioritized-detector-coverage/v1";
    asOf: string;
    entries: Entry[];
};
const statuses: Record<Status, string> = {
    real_case_measured: "Инференс на публичном исследовании",
    real_trial_running: "Исследовательский запуск, результат не подтверждён",
    real_checkpoint_candidate: "Веса-кандидаты, результат ещё не получен",
    license_blocked: "Ограничено лицензией",
    weights_unverified: "Веса/инференс пока не проверены"
};
const regionLabels: Record<string, string> = {
    brain: "Головной мозг", thorax: "Грудная клетка", abdomen: "Брюшная полость",
    pelvis: "Таз", spine: "Позвоночник", hip: "Тазобедренные суставы", knee: "Коленные суставы",
    heart: "Сердце", vascular: "Сосуды", breast: "Молочная железа",
    retina: "Сетчатка", histology: "Патоморфология"
};
const isStatus = (s: unknown): s is Status => typeof s === "string" && Object.prototype.hasOwnProperty.call(statuses, s);
function isEntry(item: unknown): item is Entry {
    if (!item || typeof item !== "object")
        return false;
    const x = item as Partial<Entry>;
    return typeof x.id === "string" && x.id.length > 0 && typeof x.anatomy === "string" &&
        typeof x.modality === "string" && typeof x.pathology === "string" &&
        typeof x.source === "string" && x.source.startsWith("https://") &&
        typeof x.reference === "string" && typeof x.restriction === "string" &&
        typeof x.weights === "string" && typeof x.next === "string" && isStatus(x.status);
}
export function validateCoverage(v: unknown): Catalog {
    if (!v || typeof v !== "object")
        throw Error("Неверный формат каталога.");
    const x = v as Partial<Catalog>;
    if (x.schema !== "opus-clinically-prioritized-detector-coverage/v1" ||
        typeof x.asOf !== "string" || !Array.isArray(x.entries) ||
        x.entries.length < 1 || x.entries.length > 200 || !x.entries.every(isEntry))
        throw Error("Каталог исследовательских задач не прошёл проверку.");
    const ids = new Set(x.entries.map(e => e.id));
    if (ids.size !== x.entries.length)
        throw Error("Повторяющиеся идентификаторы патологий.");
    return x as Catalog;
}
export default function PathologyCoverageResearch() {
    const __ui = useUiTranslator();
    const [catalog, setCatalog] = useState<Catalog | null>(null);
    const [error, setError] = useState("");
    const [region, setRegion] = useState("all");
    const [state, setState] = useState<Status | "all">("all");
    useEffect(() => {
        let live = true;
        async function load() {
            try {
                const response = await fetch("/examples/clinical-pathology-coverage.json", { cache: "no-store" });
                if (!response.ok)
                    throw Error("Локальный каталог покрытия недоступен.");
                const raw = await response.text();
                if (raw.length > 300 * 1024)
                    throw Error("Каталог превышает установленный размер.");
                const validated = validateCoverage(JSON.parse(raw));
                if (live)
                    setCatalog(validated);
            }
            catch (e) {
                if (live)
                    setError(e instanceof Error ? e.message : "Ошибка загрузки каталога.");
            }
        }
        void load();
        return () => { live = false; };
    }, []);
    const regions = useMemo(() => [...new Set(catalog?.entries.map(x => x.anatomy) ?? [])].sort(), [catalog]);
    const visible = useMemo(() => (catalog?.entries ?? []).filter(x => (region === "all" || region === x.anatomy) && (state === "all" || state === x.status)), [catalog, region, state]);
    const measured = catalog?.entries.filter(x => x.status === "real_case_measured").length ?? 0;
    const distinct = catalog ? new Set(catalog.entries.map(x => x.anatomy + "|" + x.pathology)).size : 0;
    return <section className="cs-geometry" aria-label={__ui("\u041A\u0430\u0440\u0442\u0430 \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u043E\u0433\u043E \u043F\u043E\u043A\u0440\u044B\u0442\u0438\u044F \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0439")}>
  <div className="cs-intro">
   <div><div className="cs-kicker">OPUS RADIOLOGY / EVIDENCE COVERAGE</div>
    <h1><LocalizedUi value={"\u041F\u043E\u043A\u0440\u044B\u0442\u0438\u0435 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0439"}/></h1>
    <p><LocalizedUi value={"\u0423\u0447\u0438\u0442\u044B\u0432\u0430\u044E\u0442\u0441\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0435 \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438, \u0430 \u043D\u0435 \u0447\u0438\u0441\u043B\u043E \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D\u043D\u044B\u0445 \u043D\u0435\u0439\u0440\u043E\u0441\u0435\u0442\u0435\u0439 \u0438\u043B\u0438 \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0438\u0445 \u043C\u0430\u0441\u043E\u043A."}/></p></div>
  </div>
  <p role="alert"><strong><LocalizedUi value={"\u041D\u0438 \u043E\u0434\u043D\u0430 \u0441\u0442\u0440\u043E\u043A\u0430 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430 \u043D\u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0430\u0435\u0442 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u0438\u0435."}/></strong><LocalizedUi value={"\u00AB\u0418\u043D\u0444\u0435\u0440\u0435\u043D\u0441 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u00BB \u043E\u0437\u043D\u0430\u0447\u0430\u0435\u0442 \u043B\u0438\u0448\u044C \u043E\u0434\u0438\u043D \u0438\u043B\u0438 \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0445 \u043F\u0440\u0438\u043C\u0435\u0440\u043E\u0432, \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E \u0441 \u043F\u0435\u0440\u0435\u0441\u0435\u0447\u0435\u043D\u0438\u0435\u043C \u043E\u0431\u0443\u0447\u0435\u043D\u0438\u044F. \u042D\u0442\u043E \u043D\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u0430\u044F \u0447\u0443\u0432\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C, \u0441\u043F\u0435\u0446\u0438\u0444\u0438\u0447\u043D\u043E\u0441\u0442\u044C \u0438\u043B\u0438 \u0441\u043F\u043E\u0441\u043E\u0431\u043D\u043E\u0441\u0442\u044C \u0438\u0441\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u044E \u043D\u0430 \u0432\u0430\u0448\u0435\u043C \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0438."}/></p>
  <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
  <LocalizedUi value={!catalog && !error && <p><LocalizedUi value={"\u0427\u0442\u0435\u043D\u0438\u0435 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430\u2026"}/></p>}/>
  <LocalizedUi value={catalog && <>
   <div style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "12px 0" }}>
    <div style={{ border: "1px solid #789085", padding: 12, borderRadius: 9 }}>
     <strong><LocalizedUi value={catalog.entries.length}/></strong><div><LocalizedUi value={"\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0445 \u043C\u0430\u0440\u0448\u0440\u0443\u0442\u043E\u0432/\u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432"}/></div>
    </div>
    <div style={{ border: "1px solid #789085", padding: 12, borderRadius: 9 }}>
     <strong><LocalizedUi value={distinct}/></strong><div><LocalizedUi value={"\u0420\u0430\u0437\u043B\u0438\u0447\u043D\u044B\u0445 \u0437\u0430\u0434\u0430\u0447 (\u043E\u0431\u043B\u0430\u0441\u0442\u044C \u00D7 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u044F)"}/></div>
    </div>
    <div style={{ border: "1px solid #789085", padding: 12, borderRadius: 9 }}>
     <strong><LocalizedUi value={measured}/></strong><div><LocalizedUi value={"\u0417\u0430\u043F\u0438\u0441\u0435\u0439 \u0441 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u043C \u0438\u043D\u0444\u0435\u0440\u0435\u043D\u0441\u043E\u043C"}/></div>
    </div>
    <div style={{ border: "1px solid #789085", padding: 12, borderRadius: 9 }}>
     <strong>0</strong><div><LocalizedUi value={"\u0417\u0430\u044F\u0432\u043B\u0435\u043D\u043D\u044B\u0445 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0438 \u0432\u0430\u043B\u0438\u0434\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u043C\u0430\u0440\u0448\u0440\u0443\u0442\u043E\u0432"}/></div>
    </div>
   </div>
   <p><small><LocalizedUi value={"\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u043A\u0430\u0442\u0430\u043B\u043E\u0433 \u043D\u0430"}/><LocalizedUi value={catalog.asOf}/><LocalizedUi value={". \u041D\u0435 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 DICOM, \u0438\u043C\u0451\u043D \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u043E\u0432, \u043A\u043B\u044E\u0447\u0435\u0439 \u0438\u043B\u0438 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u043E\u0432 \u0442\u0435\u043A\u0443\u0449\u0435\u0439 \u0441\u0435\u0440\u0438\u0438."}/></small></p>
   <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
    <label><LocalizedUi value={"\u041E\u0431\u043B\u0430\u0441\u0442\u044C"}/><LocalizedUi value={" "}/>
     <select value={region} onChange={e => setRegion(e.target.value)}>
      <option value="all"><LocalizedUi value={"\u0412\u0441\u0435 \u043B\u043E\u043A\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u0438"}/></option>
      <LocalizedUi value={regions.map(s => <option value={s} key={s}><LocalizedUi value={regionLabels[s] ?? s}/></option>)}/>
     </select>
    </label>
    <label><LocalizedUi value={"\u0414\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C"}/><LocalizedUi value={" "}/>
     <select value={state} onChange={e => setState(e.target.value as Status | "all")}>
      <option value="all"><LocalizedUi value={"\u0412\u0441\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044F"}/></option>
      <LocalizedUi value={(Object.keys(statuses) as Status[]).map(s => <option value={s} key={s}><LocalizedUi value={statuses[s]}/></option>)}/>
     </select>
    </label>
   </div>
   <p><LocalizedUi value={"\u041E\u0442\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u043E:"}/><strong><LocalizedUi value={visible.length}/></strong><LocalizedUi value={". \u041D\u0430 \u0443\u0440\u043E\u0432\u043D\u0435 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0430 \u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u043D\u043E\u0441\u0442\u044C \u043D\u0435 \u043E\u0446\u0435\u043D\u0435\u043D\u0430."}/></p>
   <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
    <LocalizedUi value={visible.map(entry => <article key={entry.id} style={{ border: "1px solid #8c9b95", borderRadius: 10, padding: 12 }}>
     <h3 style={{ margin: "0 0 6px" }}><LocalizedUi value={entry.pathology}/></h3>
     <p><strong><LocalizedUi value={regionLabels[entry.anatomy] ?? entry.anatomy}/></strong><LocalizedUi value={" · "}/><LocalizedUi value={entry.modality}/>
      <LocalizedUi value={" · "}/><strong><LocalizedUi value={statuses[entry.status]}/></strong></p>
     <p><LocalizedUi value={"\u041C\u043E\u0434\u0435\u043B\u044C/\u0432\u0435\u0441\u0430:"}/><LocalizedUi value={entry.weights}/></p>
     <p><LocalizedUi value={"\u042D\u0442\u0430\u043B\u043E\u043D:"}/><LocalizedUi value={entry.reference}/></p>
     <p><strong><LocalizedUi value={"\u041E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u0435:"}/></strong> <LocalizedUi value={entry.restriction}/></p>
     <details><summary><LocalizedUi value={"\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0438 \u0437\u043D\u0430\u0447\u0438\u043C\u044B\u0439 \u0448\u0430\u0433"}/></summary>
      <p><LocalizedUi value={entry.next}/></p>
      <a href={entry.source} rel="noopener noreferrer" target="_blank"><LocalizedUi value={"\u041F\u0443\u0431\u043B\u0438\u043A\u0430\u0446\u0438\u044F \u0438\u043B\u0438 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u043C\u043E\u0434\u0435\u043B\u0438"}/></a>
     </details>
    </article>)}/>
   </div>
   <LocalizedUi value={visible.length === 0 && <p><LocalizedUi value={"\u0412 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u043E\u0431\u043B\u0430\u0441\u0442\u0438 \u043D\u0435\u0442 \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u0437\u0430\u0434\u0430\u0447 \u0441 \u0437\u0430\u0434\u0430\u043D\u043D\u044B\u043C \u0441\u0442\u0430\u0442\u0443\u0441\u043E\u043C."}/></p>}/>
  </>}/>
  <DualPublicDetectorReview />
 </section>;
}
