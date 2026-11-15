"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useRef, useState } from "react";
import { sha256 } from "@noble/hashes/sha2.js";
import type { IchReferenceComparison } from "../lib/ich-reference-comparison";
import type { IchResearchReport } from "../lib/ich-research";
import { parseIchExpertSubtypeCoverage, type IchExpertSubtypeCoverage } from "../lib/ich-subtype-coverage";
async function matchSha(file: File, expected: string, limit: number, signal: AbortSignal) {
    if (!file.size || file.size > limit)
        throw Error("Неверный размер оригинального файла.");
    const hash = sha256.create();
    for (let offset = 0; offset < file.size; offset += 1024 * 1024) {
        if (signal.aborted)
            throw Error("Чтение отменено.");
        hash.update(new Uint8Array(await file.slice(offset, Math.min(offset + 1024 * 1024, file.size)).arrayBuffer()));
    }
    if (signal.aborted)
        throw Error("Чтение отменено.");
    const digest = Array.from(hash.digest(), v => v.toString(16).padStart(2, "0")).join("");
    if (digest !== expected)
        throw Error("SHA-256 оригинального файла не соответствует паспорту классов.");
}
export default function IchExpertSubtypeCoveragePanel({ comparison, model, onGoToSlice, onClearFocus }: {
    comparison: IchReferenceComparison;
    model: IchResearchReport;
    onGoToSlice?: (sliceIndex: number, verifiedExpert?: {
        file: File;
        label: number;
        subtype: string;
    }) => void;
    onClearFocus?: () => void;
}) {
    const __ui = useUiTranslator();
    const [report, setReport] = useState<IchExpertSubtypeCoverage | null>(null);
    const [originalOk, setOriginalOk] = useState(false);
    const [originalFile, setOriginalFile] = useState<File | null>(null);
    const [ontologyOk, setOntologyOk] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const abort = useRef<AbortController | null>(null);
    useEffect(() => () => abort.current?.abort(), []);
    function reset() {
        onClearFocus?.();
        abort.current?.abort();
        abort.current = null;
        setReport(null);
        setOriginalOk(false);
        setOriginalFile(null);
        setOntologyOk(false);
        setBusy(false);
        setError("");
    }
    async function readReport(file: File) {
        reset();
        try {
            if (!file.size || file.size > 1024 * 1024)
                throw Error("Паспорт превышает 1 МиБ.");
            setReport(parseIchExpertSubtypeCoverage(await file.text(), comparison, model));
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Паспорт классов не принят.");
        }
    }
    async function verify(file: File, kind: "original" | "ontology") {
        if (!report)
            return;
        abort.current?.abort();
        const controller = new AbortController();
        abort.current = controller;
        setBusy(true);
        setError("");
        onClearFocus?.();
        if (kind === "original") {
            setOriginalOk(false);
            setOriginalFile(null);
        }
        else
            setOntologyOk(false);
        try {
            await matchSha(file, kind === "original" ? report.evidenceHashes.originalExpertMaskSha256 :
                report.evidenceHashes.ontologySha256, kind === "original" ? 512 * 1024 * 1024 : 64 * 1024, controller.signal);
            if (!controller.signal.aborted) {
                if (kind === "original") {
                    setOriginalOk(true);
                    setOriginalFile(file);
                }
                else
                    setOntologyOk(true);
            }
        }
        catch (e) {
            if (!controller.signal.aborted)
                setError(e instanceof Error ? e.message : "SHA не совпал.");
        }
        finally {
            if (abort.current === controller) {
                abort.current = null;
                setBusy(false);
            }
        }
    }
    const rows = [...(report?.expertVoxelClasses ?? [])].sort((a, b) => b.modelMissedExpertVoxels - a.modelMissedExpertVoxels);
    return <section aria-label={__ui("\u041F\u043E\u043A\u0440\u044B\u0442\u0438\u0435 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0445 \u0442\u0438\u043F\u043E\u0432 \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u044F")} style={{ margin: "16px 0", padding: 12, border: "1px solid #97b9a9", borderRadius: 8 }}>
   <h5><LocalizedUi value={"\u041A\u0430\u043A\u0438\u0435 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0435 \u0442\u0438\u043F\u044B \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u044F \u043F\u043E\u043A\u0440\u044B\u0442\u044B SAMIHS?"}/></h5>
   <p><LocalizedUi value={"\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u043F\u0430\u0441\u043F\u043E\u0440\u0442 \u0438\u0437"}/><code>ich-expert-subtype-coverage.py</code><LocalizedUi value={", \u0441\u043E\u0437\u0434\u0430\u043D\u043D\u044B\u0439 \u0435\u0434\u0438\u043D\u044B\u043C \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u043C \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F. \u042D\u0442\u043E \u043D\u0435 \u043A\u043B\u0430\u0441\u0441\u0438\u0444\u0438\u043A\u0430\u0446\u0438\u044F \u043C\u043E\u0434\u0435\u043B\u0438, \u0430 \u043F\u043E\u0434\u0441\u0447\u0451\u0442 \u043F\u043E\u043A\u0440\u044B\u0442\u044B\u0445 \u0438 \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043D\u044B\u0445 \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u043E\u0439 \u043C\u043D\u043E\u0433\u043E\u043A\u043B\u0430\u0441\u0441\u043E\u0432\u043E\u0439 \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0438."}/></p>
   <label><LocalizedUi value={"\u041F\u0430\u0441\u043F\u043E\u0440\u0442 \u043A\u043B\u0430\u0441\u0441\u043E\u0432 (JSON)"}/><input type="file" accept=".json,application/json" onChange={e => {
            const file = e.target.files?.[0];
            e.currentTarget.value = "";
            if (file)
                void readReport(file);
        }}/>
   </label>
   <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
   <LocalizedUi value={report && <>
     <p><LocalizedUi value={"\u041F\u0430\u0441\u043F\u043E\u0440\u0442 \u0441\u043E\u0433\u043B\u0430\u0441\u043E\u0432\u0430\u043D \u0441 SHA \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u041A\u0422, SAMIHS-\u043C\u0430\u0441\u043A\u0438, \u0431\u0438\u043D\u0430\u0440\u043D\u043E\u0433\u043E \u044D\u0442\u0430\u043B\u043E\u043D\u0430 \u0438 \u0441 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u043C\u0438 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u044B\u043C\u0438 3D TP/FN. \u0414\u043B\u044F \u043F\u043E\u043A\u0430\u0437\u0430 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0439 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u0434\u0432\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0445 \u0444\u0430\u0439\u043B\u0430:"}/></p>
     <label><LocalizedUi value={"\u041D\u0435\u0438\u0437\u043C\u0435\u043D\u0451\u043D\u043D\u0430\u044F \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u043C\u043D\u043E\u0433\u043E\u043A\u043B\u0430\u0441\u0441\u043E\u0432\u0430\u044F \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u0430\u044F \u043C\u0430\u0441\u043A\u0430"}/><input type="file" disabled={busy} accept=".nii,.nii.gz,.gz" onChange={e => {
                const file = e.target.files?.[0];
                e.currentTarget.value = "";
                if (file)
                    void verify(file, "original");
            }}/>
     </label>
     <label><LocalizedUi value={"\u041E\u043D\u0442\u043E\u043B\u043E\u0433\u0438\u044F \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E \u043D\u0430\u0431\u043E\u0440\u0430 \u0434\u0430\u043D\u043D\u044B\u0445 (JSON)"}/><input type="file" disabled={busy} accept=".json,application/json" onChange={e => {
                const file = e.target.files?.[0];
                e.currentTarget.value = "";
                if (file)
                    void verify(file, "ontology");
            }}/>
     </label>
     <p role="status"><LocalizedUi value={"\u041E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0430:"}/><LocalizedUi value={originalOk ? "SHA подтверждён" : "не подтверждена"}/><LocalizedUi value={". \u041E\u043D\u0442\u043E\u043B\u043E\u0433\u0438\u044F:"}/><LocalizedUi value={ontologyOk ? "SHA подтверждён" : "не подтверждена"}/>.</p>
     <LocalizedUi value={busy && <p role="status"><LocalizedUi value={"\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 SHA-256 \u0431\u0435\u0437 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u0434\u0430\u043D\u043D\u044B\u0445\u2026"}/></p>}/>
     <LocalizedUi value={originalOk && ontologyOk && <>
       <p role="status"><LocalizedUi value={"\u041E\u0431\u0435 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0435 \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u044B\u0435 \u0441\u0443\u043C\u043C\u044B \u0441\u043E\u0432\u043F\u0430\u043B\u0438. \u041D\u0438\u0436\u0435 \u043F\u0440\u0435\u0434\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u044B \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F \u0432\u043D\u0435\u0448\u043D\u0435\u0433\u043E \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0433\u043E \u0440\u0430\u0441\u0447\u0451\u0442\u0430, \u0441\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0435 \u0441 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0438\u043C\u0438 \u0444\u0430\u0439\u043B\u0430\u043C\u0438."}/></p>
       <div style={{ overflowX: "auto" }}>
         <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
           <thead><tr><th><LocalizedUi value={"\u0422\u0438\u043F \u043F\u043E \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u0443"}/></th><th><LocalizedUi value={"\u041E\u0431\u044A\u0451\u043C \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u0430"}/></th>
             <th><LocalizedUi value={"\u041F\u043E\u043A\u0440\u044B\u0442\u043E SAMIHS"}/></th><th><LocalizedUi value={"\u041F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E (FN)"}/></th><th><LocalizedUi value={"\u0412\u043E\u043A\u0441\u0435\u043B\u044C\u043D\u043E\u0435 \u043F\u043E\u043A\u0440\u044B\u0442\u0438\u0435"}/></th><th><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u041A\u0422"}/></th></tr></thead>
           <tbody><LocalizedUi value={rows.map(x => <tr key={x.sourceLabel}>
             <td><LocalizedUi value={x.expertSubtype}/><LocalizedUi value={"(\u043C\u0435\u0442\u043A\u0430"}/><LocalizedUi value={x.sourceLabel}/>)</td>
             <td><LocalizedUi value={x.expertVolumeMl.toFixed(3)}/><LocalizedUi value={"\u043C\u043B"}/></td>
             <td><LocalizedUi value={x.modelOverlappingExpertVoxels}/><LocalizedUi value={"\u0432\u043E\u043A\u0441."}/><LocalizedUi value={x.modelOverlappingExpertVolumeMl !== undefined ?
                        <small> · <LocalizedUi value={x.modelOverlappingExpertVolumeMl.toFixed(3)}/><LocalizedUi value={"\u043C\u043B"}/></small> : null}/></td>
             <td><strong><LocalizedUi value={x.modelMissedExpertVoxels}/></strong><LocalizedUi value={"\u0432\u043E\u043A\u0441."}/><LocalizedUi value={x.modelMissedExpertVolumeMl !== undefined ?
                        <strong> · <LocalizedUi value={x.modelMissedExpertVolumeMl.toFixed(3)}/><LocalizedUi value={"\u043C\u043B"}/></strong> : null}/></td>
             <td><LocalizedUi value={x.voxelCoverageFraction === null ? "Нет эталонных вокселей" :
                        (100 * x.voxelCoverageFraction).toFixed(1) + "%"}/></td>
             <td><LocalizedUi value={typeof x.peakMissedSliceIndexK === "number" && onGoToSlice ?
                        <button type="button" aria-label={`Перейти к КТ k ${x.peakMissedSliceIndexK + 1} с максимумом пропусков ${x.expertSubtype}`} onClick={() => onGoToSlice(x.peakMissedSliceIndexK!, originalFile ? { file: originalFile, label: x.sourceLabel, subtype: x.expertSubtype } : undefined)}><LocalizedUi value={"\u041A\u0422 k"}/><LocalizedUi value={x.peakMissedSliceIndexK + 1}/> · FN <LocalizedUi value={x.peakMissedSliceVoxels}/>
               </button> : "—"}/></td>
           </tr>)}/></tbody>
         </table>
       </div>
       <p><small><LocalizedUi value={"\u041F\u0440\u0438 \u043D\u0430\u0436\u0430\u0442\u0438\u0438 \u043D\u0430 \u043A\u043B\u0430\u0441\u0441 \u043F\u0435\u0440\u0435\u0434\u0430\u0451\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439, \u0441\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0439 \u043F\u043E SHA \u0444\u0430\u0439\u043B \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u043E\u0439 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0438 \u0432 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0449\u0438\u043A, \u0447\u0442\u043E\u0431\u044B \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C FN \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u043A\u043B\u0430\u0441\u0441\u0430, \u0430 \u043D\u0435 \u0441\u043C\u0435\u0448\u0430\u043D\u043D\u0443\u044E \u043E\u0431\u0449\u0443\u044E \u043C\u0430\u0441\u043A\u0443."}/></small></p>
       <p><LocalizedUi value={"\u0412\u0441\u0435\u0433\u043E \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0445 \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439:"}/><LocalizedUi value={report.totalExpertVoxels}/><LocalizedUi value={". \u0421\u043E\u0432\u043F\u0430\u0432\u0448\u0438\u0445 \u0441 \u0431\u0438\u043D\u0430\u0440\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u043E\u0439:"}/><LocalizedUi value={report.totalOverlappingExpertVoxels}/><LocalizedUi value={". \u041F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E:"}/><LocalizedUi value={report.totalMissedExpertVoxels}/>.</p>
       <p><small><LocalizedUi value={"\u041E\u043D\u0442\u043E\u043B\u043E\u0433\u0438\u044F \u0437\u0430\u044F\u0432\u043B\u0435\u043D\u0430 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u043C \u0434\u0430\u0442\u0430\u0441\u0435\u0442\u043E\u043C:"}/><LocalizedUi value={report.ontologySourceUrl}/><LocalizedUi value={". SHA \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442, \u043E\u0434\u043D\u0430\u043A\u043E \u044D\u0442\u043E \u043D\u0435 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u044B\u0439 \u044E\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0430\u0443\u0434\u0438\u0442 \u043B\u0438\u0446\u0435\u043D\u0437\u0438\u0438 \u0438\u043B\u0438 \u043F\u043E\u0434\u043B\u0438\u043D\u043D\u043E\u0441\u0442\u0438 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u0430\u043D\u043D\u043E\u0442\u0430\u0446\u0438\u0438."}/></small></p>
     </>}/>
     <p><small><LocalizedUi value={"\u041F\u0435\u0440\u0435\u0445\u043E\u0434 \u043A k-\u0441\u0440\u0435\u0437\u0443 \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u0442 \u043C\u0430\u043A\u0441\u0438\u043C\u0443\u043C \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043D\u044B\u0445 \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439 \u0434\u0430\u043D\u043D\u043E\u0433\u043E \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0433\u043E \u0442\u0438\u043F\u0430 \u043F\u043E \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u043E\u0441\u0438 NIfTI. \u042D\u0442\u043E \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0439 DICOM-\u0441\u0440\u0435\u0437, \u0430 \u0441\u0442\u0430\u0440\u044B\u0435 \u043E\u0442\u0447\u0451\u0442\u044B \u0431\u0435\u0437 \u043B\u043E\u043A\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u0438 \u043D\u0435 \u043F\u0440\u0435\u0434\u043B\u0430\u0433\u0430\u044E\u0442 \u043F\u0435\u0440\u0435\u0445\u043E\u0434."}/></small></p>
     <p><small><LocalizedUi value={"\u041A\u043B\u0430\u0441\u0441\u044B \u0432\u0437\u044F\u0442\u044B \u0438\u0441\u043A\u043B\u044E\u0447\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u0438\u0437 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u043E\u0439 \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0438, \u043D\u0435 \u043F\u0440\u0435\u0434\u0441\u043A\u0430\u0437\u0430\u043D\u044B SAMIHS. \u0412\u043E\u043A\u0441\u0435\u043B\u044C\u043D\u043E\u0435 \u043F\u043E\u043A\u0440\u044B\u0442\u0438\u0435 \u043D\u0435 \u0440\u0430\u0432\u043D\u043E \u0447\u0443\u0432\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u0438 \u043A \u043E\u0447\u0430\u0433\u0430\u043C \u0438\u043B\u0438 \u0434\u0438\u0430\u0433\u043D\u043E\u0437\u0443. \u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0430 \u043D\u0435 \u0438\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u0435."}/></small></p>
     <button type="button" onClick={reset}><LocalizedUi value={"\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0430\u043D\u0430\u043B\u0438\u0437 \u043A\u043B\u0430\u0441\u0441\u043E\u0432"}/></button>
   </>}/>
 </section>;
}
