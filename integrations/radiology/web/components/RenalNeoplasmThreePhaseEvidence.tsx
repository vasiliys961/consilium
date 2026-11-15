"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useState, type ChangeEvent } from "react";
import { sha256 } from "@noble/hashes/sha2.js";
type Finding = {
    sourceVoxelBox: number[][];
    sourceVoxelCentroid: number[];
    niftiWorldCentroidMm: number[];
    candidateVolumeMl: number;
    candidateVoxels: number;
    renalCancerProven: false;
};
type Report = {
    schema: "opus-original-MONAI-renal-CECT-neoplasm-3phase/v1";
    phaseSHA256: Record<string, string>;
    predictionMaskSHA256: string;
    checkpointSHA256: string;
    sourceNativeShape: number[];
    componentCandidates: Finding[];
    threeRegisteredPhasesUsed: true;
    originalPretrainedInferenceCompleted: true;
    sourceGridVerified: true;
    neoplasmModelOutputChannel: 4;
    clinicallyValidated: false;
    patientUseAllowed: false;
    negativeCancerDiagnosis: false;
    independentHoldout: false;
    TP?: number;
    FP?: number;
    FN?: number;
    singleCaseVoxelDice?: number | null;
};
const sha = (s: unknown) => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
const nonnegative = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0;
function parse(raw: unknown): Report {
    if (!raw || typeof raw !== "object")
        throw Error("Некорректный JSON");
    const x = raw as Record<string, unknown>, phases = x.phaseSHA256 as Record<string, unknown>;
    if (x.schema !== "opus-original-MONAI-renal-CECT-neoplasm-3phase/v1" ||
        !phases || Object.keys(phases).sort().join(",") !== "artery,excret,vein" ||
        !["artery", "vein", "excret"].every(p => sha(phases[p])) ||
        !sha(x.checkpointSHA256) || !sha(x.predictionMaskSHA256) ||
        x.threeRegisteredPhasesUsed !== true || x.originalPretrainedInferenceCompleted !== true ||
        x.sourceGridVerified !== true || x.neoplasmModelOutputChannel !== 4 ||
        x.clinicallyValidated !== false || x.patientUseAllowed !== false ||
        x.negativeCancerDiagnosis !== false || x.independentHoldout !== false ||
        !Array.isArray(x.sourceNativeShape) || x.sourceNativeShape.length !== 3 ||
        x.sourceNativeShape.some((n: unknown) => !Number.isSafeInteger(n) || Number(n) < 16) ||
        !Array.isArray(x.componentCandidates) || x.componentCandidates.length > 128)
        throw Error("Неподдерживаемый отчёт трёхфазной модели почек");
    for (const item of x.componentCandidates as Record<string, unknown>[]) {
        if (!item || item.renalCancerProven !== false || !nonnegative(item.candidateVolumeMl) ||
            !Number.isSafeInteger(item.candidateVoxels) || Number(item.candidateVoxels) < 1 ||
            !Array.isArray(item.sourceVoxelCentroid) || item.sourceVoxelCentroid.length !== 3 ||
            !item.sourceVoxelCentroid.every(nonnegative) ||
            !Array.isArray(item.niftiWorldCentroidMm) || item.niftiWorldCentroidMm.length !== 3 ||
            !item.niftiWorldCentroidMm.every((n: unknown) => typeof n === "number" && Number.isFinite(n)) ||
            !Array.isArray(item.sourceVoxelBox) || item.sourceVoxelBox.length !== 3 ||
            item.sourceVoxelBox.some((b: unknown, i: number) => !Array.isArray(b) || b.length !== 2 || b.some((n: unknown) => !Number.isSafeInteger(n)) || b[0] < 0 || b[1] < b[0] || b[1] >= Number((x.sourceNativeShape as number[])[i])))
            throw Error("Некорректные 3D-координаты предполагаемой опухоли");
    }
    if (["TP", "FP", "FN"].some(k => x[k] !== undefined) &&
        !["TP", "FP", "FN"].every(k => Number.isSafeInteger(x[k]) && Number(x[k]) >= 0))
        throw Error("Неверные экспертные счётчики");
    if (x.singleCaseVoxelDice !== undefined && x.singleCaseVoxelDice !== null && (!nonnegative(x.singleCaseVoxelDice) || Number(x.singleCaseVoxelDice) > 1))
        throw Error("Недостоверный Dice");
    return x as unknown as Report;
}
export default function RenalNeoplasmThreePhaseEvidence() {
    const __ui = useUiTranslator();
    const [report, setReport] = useState<Report | null>(null), [verified, setVerified] = useState<Record<string, boolean>>({}), [error, setError] = useState(""), [busy, setBusy] = useState(false);
    async function load(e: ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0];
        e.target.value = "";
        setReport(null);
        setVerified({});
        setError("");
        if (!f)
            return;
        try {
            if (f.size > 120000)
                throw Error("Отчёт превышает 120 КБ");
            setReport(parse(JSON.parse(await f.text())));
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Ошибка JSON");
        }
    }
    async function check(e: ChangeEvent<HTMLInputElement>, field: string) {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f || !report)
            return;
        setVerified(v => ({ ...v, [field]: false }));
        setError("");
        if (f.size > 800 * 1024 * 1024) {
            setError("Лимит одного исходного файла 800 МиБ");
            return;
        }
        setBusy(true);
        const reader = f.stream().getReader();
        const h = sha256.create();
        let size = 0;
        try {
            for (;;) {
                const b = await reader.read();
                if (b.done)
                    break;
                size += b.value.length;
                if (size > 800 * 1024 * 1024)
                    throw Error("Превышен предел файла");
                h.update(b.value);
            }
            const digest = Array.from(h.digest(), v => v.toString(16).padStart(2, "0")).join("");
            const expected = field === "mask" ? report.predictionMaskSHA256 : report.phaseSHA256[field];
            if (digest !== expected || size !== f.size)
                throw Error("SHA-256 не совпадает: " + field);
            setVerified(v => ({ ...v, [field]: true }));
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Ошибка проверки SHA");
        }
        finally {
            reader.releaseLock();
            setBusy(false);
        }
    }
    const ready = ["artery", "vein", "excret", "mask"].every(p => verified[p]);
    return <section aria-label={__ui("\u041F\u043E\u0447\u043A\u0438: \u0442\u0440\u0451\u0445\u0444\u0430\u0437\u043D\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C \u043E\u043F\u0443\u0445\u043E\u043B\u0438, \u043D\u0430\u0443\u0447\u043D\u044B\u0439 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440")}>
 <h3><LocalizedUi value={"\u041F\u043E\u0447\u043A\u0438 \u00B7 MONAI \u00B7 \u0442\u0440\u0451\u0445\u0444\u0430\u0437\u043D\u0430\u044F \u041A\u0422 \u00B7 \u043E\u043F\u0443\u0445\u043E\u043B\u0435\u0432\u044B\u0435 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u044B"}/></h3>
 <p><LocalizedUi value={"\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u043E\u0442\u0447\u0451\u0442: \u0430\u0440\u0442\u0435\u0440\u0438\u0430\u043B\u044C\u043D\u0430\u044F, \u0432\u0435\u043D\u043E\u0437\u043D\u0430\u044F \u0438 \u044D\u043A\u0441\u043A\u0440\u0435\u0442\u043E\u0440\u043D\u0430\u044F \u0444\u0430\u0437\u044B \u0434\u043E\u043B\u0436\u043D\u044B \u0431\u044B\u0442\u044C \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u044B. \u041D\u0438 \u043E\u0434\u0438\u043D \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u0440\u0430\u043A; \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432 \u043D\u0435 \u0438\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u043E\u043F\u0443\u0445\u043E\u043B\u044C."}/></p>
 <label><LocalizedUi value={"\u0427\u0438\u0441\u043B\u043E\u0432\u043E\u0439 \u043E\u0442\u0447\u0451\u0442 \u043C\u043E\u0434\u0435\u043B\u0438"}/><input type="file" accept=".json" onChange={e => void load(e)}/></label>
 <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
 <LocalizedUi value={report && <div>
 <LocalizedUi value={(["artery", "vein", "excret", "mask"] as const).map(p => <label key={p}><LocalizedUi value={({ artery: "Артериальная КТ", vein: "Венозная КТ", excret: "Экскреторная КТ", mask: "Маска модели" } as const)[p]}/> · <LocalizedUi value={verified[p] ? "SHA подтверждён" : "не проверено"}/> <input type="file" accept=".nii,.gz" disabled={busy} onChange={e => void check(e, p)}/></label>)}/>
 <p role="status"><LocalizedUi value={ready ? "Все четыре источника совпали по SHA-256" : "Для просмотра числовых находок подтвердите три фазы и маску"}/></p>
 <LocalizedUi value={ready && <div><p><LocalizedUi value={"\u041F\u0440\u0435\u0434\u043F\u043E\u043B\u0430\u0433\u0430\u0435\u043C\u044B\u0445 \u043E\u0447\u0430\u0433\u043E\u0432:"}/><LocalizedUi value={report.componentCandidates.length}/><LocalizedUi value={". \u0423\u0432\u0435\u0440\u0435\u043D\u043D\u043E\u0441\u0442\u044C \u0438 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u044C \u043D\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u044B."}/></p>
 <ol><LocalizedUi value={report.componentCandidates.map((c, i) => <li key={i}><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442"}/><LocalizedUi value={i + 1}/><LocalizedUi value={": \u0446\u0435\u043D\u0442\u0440 RAS"}/><LocalizedUi value={c.niftiWorldCentroidMm.join(", ")}/><LocalizedUi value={"\u043C\u043C, \u043E\u0431\u044A\u0451\u043C"}/><LocalizedUi value={c.candidateVolumeMl.toFixed(2)}/><LocalizedUi value={"\u043C\u043B; IJK"}/><LocalizedUi value={c.sourceVoxelCentroid.join(", ")}/>.</li>)}/></ol>
 <LocalizedUi value={typeof report.TP === "number" && <p><LocalizedUi value={"\u041E\u0434\u0438\u043D \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0439 \u0441\u043B\u0443\u0447\u0430\u0439: TP"}/><LocalizedUi value={report.TP}/>, FP <LocalizedUi value={report.FP}/>, FN <LocalizedUi value={report.FN}/>; Dice <LocalizedUi value={report.singleCaseVoxelDice?.toFixed(3) ?? "нет"}/><LocalizedUi value={"\u2014 \u043D\u0435 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u0430\u044F \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F."}/></p>}/>
 </div>}/>
 </div>}/></section>;
}
