"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useRef, useState } from "react";
import { sha256 } from "@noble/hashes/sha2.js";
import IchExpertErrorOverlay from "./IchExpertErrorOverlay";
import IchSliceEvidencePanel from "./IchSliceEvidencePanel";
import IchComponentEvidencePanel from "./IchComponentEvidencePanel";
import IchExpertSubtypeCoveragePanel from "./IchExpertSubtypeCoveragePanel";
import { parseIchReferenceComparison, type IchReferenceComparison, } from "../lib/ich-reference-comparison";
import type { IchResearchReport } from "../lib/ich-research";
import { parseIchCompletedCase, type IchCompletedCase } from "../lib/ich-completed-case";
async function verifySha(file: File, expected: string, signal: AbortSignal) {
    if (!file.size || file.size > 512 * 1024 * 1024)
        throw Error("Файл экспертной разметки не должен превышать 512 МиБ.");
    const h = sha256.create();
    for (let i = 0; i < file.size; i += 2 * 1024 * 1024) {
        if (signal.aborted)
            throw Error("Проверка отменена.");
        h.update(new Uint8Array(await file.slice(i, Math.min(file.size, i + 2 * 1024 * 1024)).arrayBuffer()));
    }
    if (signal.aborted)
        throw Error("Проверка отменена.");
    const actual = Array.from(h.digest(), x => x.toString(16).padStart(2, "0")).join("");
    if (actual !== expected)
        throw Error("SHA-256 экспертной маски не совпадает.");
}
const num = (v: number | null, precision = 3) => v === null ? "не рассчитан" : v.toFixed(precision);
export default function IchReferenceComparisonPanel({ modelReport, source, mask }: {
    modelReport: IchResearchReport;
    source: File;
    mask: File;
}) {
    const __ui = useUiTranslator();
    const [comparison, setComparison] = useState<IchReferenceComparison | null>(null);
    const [complete, setComplete] = useState<IchCompletedCase | null>(null);
    const [completeError, setCompleteError] = useState("");
    const [jumpTo, setJumpTo] = useState<{
        sliceIndex: number;
        requestId: number;
    } | null>(null);
    const [subtypeFocus, setSubtypeFocus] = useState<{
        file: File;
        label: number;
        subtype: string;
        requestId: number;
    } | null>(null);
    const [referenceVerified, setReferenceVerified] = useState(false);
    const [referenceFile, setReferenceFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const ctrl = useRef<AbortController | null>(null);
    useEffect(() => () => ctrl.current?.abort(), []);
    function clear() {
        ctrl.current?.abort();
        ctrl.current = null;
        setComparison(null);
        setComplete(null);
        setCompleteError("");
        setReferenceVerified(false);
        setReferenceFile(null);
        setJumpTo(null);
        setSubtypeFocus(null);
        setBusy(false);
        setError("");
    }
    async function open(file: File) {
        clear();
        try {
            if (!file.size || file.size > 2 * 1024 * 1024)
                throw Error("Паспорт сравнения превышает 2 МиБ.");
            const value = parseIchReferenceComparison(await file.text(), modelReport);
            setComparison(value);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Паспорт сравнения не принят.");
        }
    }
    async function verify(file: File) {
        if (!comparison)
            return;
        ctrl.current?.abort();
        const current = new AbortController();
        ctrl.current = current;
        setReferenceVerified(false);
        setReferenceFile(null);
        setBusy(true);
        setError("");
        try {
            await verifySha(file, comparison.evidenceHashes.expertMaskSha256, current.signal);
            if (!current.signal.aborted) {
                setReferenceFile(file);
                setReferenceVerified(true);
            }
        }
        catch (e) {
            if (!current.signal.aborted)
                setError(e instanceof Error ? e.message : "Неподходящая маска.");
        }
        finally {
            if (ctrl.current === current) {
                ctrl.current = null;
                setBusy(false);
            }
        }
    }
    const m = comparison?.metrics;
    return <section aria-label={__ui("\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u0435\u043D\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u044F \u043F\u043E \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u0435")} style={{ border: "1px solid #95b4a8", padding: 12, borderRadius: 10, margin: "16px 0" }}>
   <h4><LocalizedUi value={"\u0412\u0440\u0430\u0447\u0435\u0431\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u00B7 \u0441\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u0441 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u043E\u0439"}/></h4>
   <p><LocalizedUi value={"\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0432\u043D\u0435\u0448\u043D\u0435\u0433\u043E \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0433\u043E \u0440\u0430\u0441\u0447\u0451\u0442\u0430"}/><code> evaluate-ich-public-mask.py</code><LocalizedUi value={". \u041E\u0446\u0435\u043D\u043A\u0430 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043A \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u043E\u0439 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0439 \u041A\u0422 \u0438 \u0442\u0435\u043A\u0443\u0449\u0435\u0439 \u043C\u0430\u0441\u043A\u0435 SAMIHS. \u041D\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F \u043A \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044E \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0430 \u0438\u0437 DICOM-\u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0449\u0438\u043A\u0430."}/></p>
   <label><LocalizedUi value={"\u041F\u0430\u0441\u043F\u043E\u0440\u0442 \u0441\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u044F JSON"}/><input type="file" accept=".json,application/json" onChange={e => {
            const file = e.target.files?.[0];
            e.currentTarget.value = "";
            if (file)
                void open(file);
        }}/>
   </label>
   <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
   <LocalizedUi value={comparison && <>
     <p><LocalizedUi value={"\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0430 \u0438 \u043F\u0440\u0435\u0434\u0441\u043A\u0430\u0437\u0430\u043D\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u0438: \u0441\u043E\u0432\u043F\u0430\u043B \u0441 \u0442\u0435\u043A\u0443\u0449\u0438\u043C \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435\u043C. \u042D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u0430\u044F \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0430: \u043C\u0435\u0442\u043A\u0430"}/><LocalizedUi value={comparison.referenceLabel}/><LocalizedUi value={"; \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043F\u0440\u0430\u0432 \u043D\u0430 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u044F\u0432\u043B\u0435\u043D\u0430 \u0430\u0432\u0442\u043E\u0440\u043E\u043C \u0432\u043D\u0435\u0448\u043D\u0435\u0433\u043E \u043E\u0442\u0447\u0451\u0442\u0430, \u043D\u043E \u043D\u0435 \u0443\u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u0435\u043D\u0430 \u044D\u0442\u0438\u043C \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435\u043C."}/></p>
     <label><LocalizedUi value={"\u041E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u0430\u044F \u043C\u0430\u0441\u043A\u0430 (.nii / .nii.gz), \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 SHA-256"}/><input disabled={busy} type="file" accept=".nii,.gz,.nii.gz" onChange={e => {
                const file = e.target.files?.[0];
                e.currentTarget.value = "";
                if (file)
                    void verify(file);
            }}/>
     </label>
     <LocalizedUi value={busy && <p role="status"><LocalizedUi value={"\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 SHA-256 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u0438 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u2026"}/></p>}/>
     <LocalizedUi value={referenceVerified && m && <>
       <p role="status"><LocalizedUi value={"SHA-256 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u0438 \u0441\u043E\u0432\u043F\u0430\u043B. \u041D\u0438\u0436\u0435 \u043F\u0440\u0435\u0434\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u044B \u043C\u0435\u0442\u0440\u0438\u043A\u0438 \u0432\u043D\u0435\u0448\u043D\u0435\u0433\u043E \u0432\u044B\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F, \u0430 \u043D\u0435 \u043F\u0435\u0440\u0435\u0441\u0447\u0451\u0442 \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435."}/></p>
       <section style={{ border: "1px solid #8ba9a0", borderRadius: 8, padding: 10, margin: "12px 0" }}>
         <h5><LocalizedUi value={"\u0418\u0442\u043E\u0433\u043E\u0432\u044B\u0439 \u043F\u0430\u0441\u043F\u043E\u0440\u0442 \u043F\u043E\u043B\u043D\u043E\u0433\u043E \u0432\u043D\u0435\u0448\u043D\u0435\u0433\u043E SAMIHS-\u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F"}/></h5>
         <p><LocalizedUi value={"\u041E\u0442\u0434\u0435\u043B\u044C\u043D\u0430\u044F \u0441\u0432\u0435\u0440\u043A\u0430 \u0434\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432: \u0438\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u041A\u0422, \u043C\u043E\u0434\u0435\u043B\u044C, \u043C\u0430\u0441\u043A\u0430, \u044D\u0442\u0430\u043B\u043E\u043D \u0438 \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u0438 \u0434\u043E\u043B\u0436\u043D\u044B \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u043E\u0432\u0430\u0442\u044C \u043E\u0434\u043D\u043E\u043C\u0443 \u0437\u0430\u043F\u0443\u0441\u043A\u0443. JSON \u0441\u0430\u043C \u043F\u043E \u0441\u0435\u0431\u0435 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u0438\u0441\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u043C\u043E\u0434\u0435\u043B\u0438 \u043D\u0430 GPU."}/></p>
         <label><LocalizedUi value={"\u041F\u043E\u043B\u043D\u044B\u0439 \u043F\u0430\u0441\u043F\u043E\u0440\u0442 opus-ich-first-public-case-complete.json"}/><input type="file" accept=".json,application/json" onChange={e => {
                    const file = e.target.files?.[0];
                    e.currentTarget.value = "";
                    if (!file)
                        return;
                    setComplete(null);
                    setCompleteError("");
                    if (file.size < 1 || file.size > 2 * 1024 * 1024) {
                        setCompleteError("Неподдерживаемый размер паспорта.");
                        return;
                    }
                    void file.text().then(raw => setComplete(parseIchCompletedCase(raw, modelReport, comparison))).catch(err => setCompleteError(err instanceof Error ? err.message : "Паспорт не принят."));
                }}/>
         </label>
         <LocalizedUi value={completeError && <p role="alert"><LocalizedUi value={completeError}/></p>}/>
         <LocalizedUi value={complete && <p role="status"><LocalizedUi value={"\u041F\u0430\u0441\u043F\u043E\u0440\u0442 \u043F\u043E\u043B\u043D\u043E\u0433\u043E \u0441\u043B\u0443\u0447\u0430\u044F \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D \u0441 \u0438\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u043C\u0438 \u0444\u0430\u0439\u043B\u0430\u043C\u0438 \u0438 \u043C\u0435\u0442\u0440\u0438\u043A\u0430\u043C\u0438. \u0417\u0430\u044F\u0432\u043B\u0435\u043D\u043D\u043E\u0435 \u0432\u0440\u0435\u043C\u044F CUDA-\u0438\u043D\u0444\u0435\u0440\u0435\u043D\u0441\u0430:"}/><strong> <LocalizedUi value={complete.modelExecutionSeconds.toFixed(2)}/><LocalizedUi value={"\u0441"}/></strong><LocalizedUi value={". \u042D\u0442\u043E \u0442\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0441\u0432\u0435\u0440\u043A\u0430 \u043E\u0442\u0447\u0451\u0442\u043E\u0432, \u043D\u0435 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u0430\u044F \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F."}/></p>}/>
       </section>
       <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
         <p><strong>Dice: <LocalizedUi value={num(m.dice)}/></strong></p>
         <p><strong>IoU: <LocalizedUi value={num(m.iou)}/></strong></p>
         <p><strong>HD95: <LocalizedUi value={m.hd95Mm === null ? "не рассчитан" : num(m.hd95Mm, 2) + " мм"}/></strong></p>
       </div>
       <p><LocalizedUi value={"\u041F\u0440\u0435\u0434\u0441\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0439 \u043E\u0431\u044A\u0451\u043C:"}/><LocalizedUi value={num(m.predictedVolumeMl, 2)}/><LocalizedUi value={"\u043C\u043B. \u042D\u0442\u0430\u043B\u043E\u043D\u043D\u044B\u0439 \u043E\u0431\u044A\u0451\u043C:"}/><LocalizedUi value={num(m.expertMaskVolumeMl, 2)}/><LocalizedUi value={"\u043C\u043B. \u0410\u0431\u0441\u043E\u043B\u044E\u0442\u043D\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430 \u043E\u0431\u044A\u0451\u043C\u0430:"}/><LocalizedUi value={num(m.absoluteVolumeErrorMl, 2)}/><LocalizedUi value={"\u043C\u043B."}/></p>
       <p><LocalizedUi value={"\u0412\u043E\u043A\u0441\u0435\u043B\u044C\u043D\u0430\u044F \u043F\u043E\u043B\u043D\u043E\u0442\u0430:"}/><LocalizedUi value={num(m.voxelRecall)}/><LocalizedUi value={"; \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u044C \u043F\u043E \u0432\u043E\u043A\u0441\u0435\u043B\u044F\u043C:"}/><LocalizedUi value={num(m.voxelPrecision)}/><LocalizedUi value={". \u042D\u0442\u0438 \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u0438 \u043D\u0435 \u044F\u0432\u043B\u044F\u044E\u0442\u0441\u044F \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0447\u0443\u0432\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C\u044E \u0438\u043B\u0438 \u0441\u043F\u0435\u0446\u0438\u0444\u0438\u0447\u043D\u043E\u0441\u0442\u044C\u044E \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0438."}/></p>
       <LocalizedUi value={m.hd95UnavailableReason && <p><small><LocalizedUi value={"HD95 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442:"}/><LocalizedUi value={m.hd95UnavailableReason}/></small></p>}/>
       <LocalizedUi value={m.bothMasksEmpty && <p role="alert"><LocalizedUi value={"\u041E\u0431\u0435 \u043C\u0430\u0441\u043A\u0438 \u043F\u0443\u0441\u0442\u044B. \u042D\u0442\u043E \u043D\u0435 \u0434\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u043E \u0437\u0434\u043E\u0440\u043E\u0432\u043E\u0439 \u041A\u0422, Dice \u043D\u0435 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0451\u043D."}/></p>}/>
       <LocalizedUi value={referenceFile && <IchExpertErrorOverlay source={source} mask={mask} expert={referenceFile} referenceLabel={comparison.referenceLabel} modelReport={modelReport} jumpTo={jumpTo} subtypeFocus={subtypeFocus}/>}/>
       <IchSliceEvidencePanel comparison={comparison} model={modelReport} onGoToSlice={sliceIndex => setJumpTo(prev => ({
                    sliceIndex, requestId: (prev?.requestId ?? 0) + 1,
                }))}/>
       <IchComponentEvidencePanel comparison={comparison} model={modelReport} onGoToSlice={sliceIndex => setJumpTo(prev => ({
                    sliceIndex, requestId: (prev?.requestId ?? 0) + 1,
                }))}/>
       <IchExpertSubtypeCoveragePanel comparison={comparison} model={modelReport} onClearFocus={() => setSubtypeFocus(null)} onGoToSlice={(sliceIndex, verifiedExpert) => {
                    setSubtypeFocus(verifiedExpert ? {
                        ...verifiedExpert, requestId: (subtypeFocus?.requestId ?? 0) + 1
                    } : null);
                    setJumpTo(prev => ({
                        sliceIndex, requestId: (prev?.requestId ?? 0) + 1,
                    }));
                }}/>
       <p><strong><LocalizedUi value={"\u041E\u0434\u0438\u043D \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u0441\u043B\u0443\u0447\u0430\u0439."}/></strong><LocalizedUi value={"\u041D\u0435 \u0434\u043E\u043A\u0430\u0437\u0430\u043D\u043E, \u0447\u0442\u043E \u043E\u043D \u043D\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043B\u0441\u044F \u043F\u0440\u0438 \u043E\u0431\u0443\u0447\u0435\u043D\u0438\u0438 \u043C\u043E\u0434\u0435\u043B\u0438. \u041D\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u044B \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0441\u0442\u044C \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0438, \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F \u0438 DICOM SOP-\u043F\u0440\u0438\u0432\u044F\u0437\u043A\u0430."}/></p>
     </>}/>
     <LocalizedUi value={!referenceVerified && <p><small><LocalizedUi value={"\u0427\u0438\u0441\u043B\u0435\u043D\u043D\u044B\u0435 \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u0438 \u0441\u043A\u0440\u044B\u0442\u044B, \u043F\u043E\u043A\u0430 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0439 \u0444\u0430\u0439\u043B \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u043B \u043F\u043E SHA-256 \u0441 \u043F\u0430\u0441\u043F\u043E\u0440\u0442\u043E\u043C \u0441\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u044F."}/></small></p>}/>
     <button type="button" onClick={clear}><LocalizedUi value={"\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0441\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435"}/></button>
   </>}/>
 </section>;
}
