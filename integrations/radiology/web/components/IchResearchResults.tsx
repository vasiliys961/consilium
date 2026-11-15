"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useRef, useState } from "react";
import { sha256 } from "@noble/hashes/sha2.js";
import IchNativeOverlay from "./IchNativeOverlay";
import IchReferenceComparisonPanel from "./IchReferenceComparisonPanel";
import { parseIchResearchReport, buildIchLocalReview, type IchResearchReport, type IchReviewDecision } from "../lib/ich-research";
type Decision = {
    decision: IchReviewDecision;
    note: string;
};
const names: Record<IchReviewDecision, string> = {
    unreviewed: "Не оценён",
    needs_source_review: "Требуется проверка по исходной КТ",
    rejected_by_reviewer: "Отклонён врачом (локальная отметка)",
};
async function matchFileSha(file: File, expected: string, signal: AbortSignal) {
    if (file.size < 1 || file.size > 512 * 1024 * 1024)
        throw Error("Файл должен быть от 1 байта до 512 МиБ.");
    const digest = sha256.create();
    for (let at = 0; at < file.size; at += 2 * 1024 * 1024) {
        if (signal.aborted)
            throw Error("Проверка отменена.");
        const chunk = await file.slice(at, Math.min(file.size, at + 2 * 1024 * 1024)).arrayBuffer();
        digest.update(new Uint8Array(chunk));
    }
    if (signal.aborted)
        throw Error("Проверка отменена.");
    const actual = Array.from(digest.digest(), n => n.toString(16).padStart(2, "0")).join("");
    if (actual !== expected)
        throw Error("SHA-256 не совпадает с исследовательским отчётом.");
}
function downloadReview(filename: string, data: unknown) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function IchResearchResults() {
    const __ui = useUiTranslator();
    const [report, setReport] = useState<IchResearchReport | null>(null);
    const [sourceOk, setSourceOk] = useState(false);
    const [maskOk, setMaskOk] = useState(false);
    const [sourceFile, setSourceFile] = useState<File | null>(null);
    const [maskFile, setMaskFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [decisions, setDecisions] = useState<Record<number, Decision>>({});
    const abort = useRef<AbortController | null>(null);
    useEffect(() => () => abort.current?.abort(), []);
    function clear() {
        abort.current?.abort();
        abort.current = null;
        setReport(null);
        setMaskOk(false);
        setSourceOk(false);
        setSourceFile(null);
        setMaskFile(null);
        setDecisions({});
        setError("");
    }
    async function loadReport(file: File) {
        clear();
        try {
            if (file.size > 2 * 1024 * 1024)
                throw Error("Отчёт превышает 2 МиБ.");
            const validated = parseIchResearchReport(await file.text());
            setReport(validated);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Некорректный исследовательский отчёт.");
        }
    }
    async function verify(file: File, kind: "source" | "mask") {
        if (!report)
            return;
        abort.current?.abort();
        const controller = new AbortController();
        abort.current = controller;
        setBusy(true);
        setError("");
        if (kind === "source") {
            setSourceOk(false);
            setSourceFile(null);
        }
        else {
            setMaskOk(false);
            setMaskFile(null);
        }
        try {
            await matchFileSha(file, kind === "source" ? report.source.sha256 : report.prediction.maskSha256, controller.signal);
            if (!controller.signal.aborted) {
                if (kind === "source") {
                    setSourceOk(true);
                    setSourceFile(file);
                }
                else {
                    setMaskOk(true);
                    setMaskFile(file);
                }
            }
        }
        catch (e) {
            if (!controller.signal.aborted)
                setError(e instanceof Error ? e.message : "Файл не совпадает.");
        }
        finally {
            if (abort.current === controller) {
                abort.current = null;
                setBusy(false);
            }
        }
    }
    return <section aria-label={__ui("\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u0441\u043F\u0435\u0446\u0438\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u043E\u0439 \u043C\u043E\u0434\u0435\u043B\u0438 \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u0439")} style={{ padding: 14, border: "1px solid #77928a", borderRadius: 10, marginTop: 18 }}>
    <h3><LocalizedUi value={"\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0430\u044F \u0441\u0435\u0433\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u044F \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u0439 \u00B7 SAMIHS"}/></h3>
    <p><LocalizedUi value={"\u0418\u043C\u043F\u043E\u0440\u0442 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430"}/><strong><LocalizedUi value={"\u043F\u0440\u0435\u0434\u043E\u0431\u0443\u0447\u0435\u043D\u043D\u043E\u0433\u043E \u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440\u0430"}/></strong><LocalizedUi value={", \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043D\u043E\u0433\u043E \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E \u043D\u0430 \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u043E\u0439 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0439 3D-\u041A\u0422. \u042D\u0442\u043E"}/><strong><LocalizedUi value={"\u043D\u0435 \u0430\u043D\u0430\u043B\u0438\u0437 \u0442\u0435\u043A\u0443\u0449\u0435\u0439 \u043E\u0442\u043A\u0440\u044B\u0442\u043E\u0439 DICOM-\u0441\u0435\u0440\u0438\u0438"}/></strong><LocalizedUi value={". \u041F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u043D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442 \u043C\u043E\u0434\u0435\u043B\u044C \u043D\u0430 Mac \u0438 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u0432 \u0438\u043D\u0442\u0435\u0440\u043D\u0435\u0442."}/></p>
    <label><LocalizedUi value={"JSON-\u043E\u0442\u0447\u0451\u0442 \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0437\u0430\u043F\u0443\u0441\u043A\u0430 SAMIHS"}/><input type="file" accept=".json,application/json" onChange={e => {
            const file = e.target.files?.[0];
            e.currentTarget.value = "";
            if (file)
                void loadReport(file);
        }}/>
    </label>
    <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
    <LocalizedUi value={report && <>
      <p role="alert"><strong><LocalizedUi value={"\u041D\u0435 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0434\u0438\u0430\u0433\u043D\u043E\u0437."}/></strong><LocalizedUi value={"\u0418\u043C\u0435\u044E\u0449\u0430\u044F\u0441\u044F \u043C\u043E\u0434\u0435\u043B\u044C \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 \u0431\u0438\u043D\u0430\u0440\u043D\u044B\u0435 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u044B \u0431\u0435\u0437 \u0442\u0438\u043F\u0430 \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u044F; \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438 \u0438 \u043C\u0430\u0441\u043A\u0438 \u043D\u0435 \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D\u044B \u043A DICOM SOP UID. \u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043C\u0430\u0441\u043A\u0438 \u043D\u0435 \u043E\u0437\u043D\u0430\u0447\u0430\u0435\u0442 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0438."}/></p>
      <p><LocalizedUi value={"\u041C\u043E\u0434\u0435\u043B\u044C:"}/><LocalizedUi value={report.model.id}/><LocalizedUi value={". \u041F\u0440\u0438\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \u0432\u0435\u0441\u043E\u0432 \u0437\u0430\u044F\u0432\u043B\u0435\u043D\u043E \u0432\u043E \u0432\u043D\u0435\u0448\u043D\u0435\u043C \u043E\u0442\u0447\u0451\u0442\u0435; \u043F\u043E\u0434\u043B\u0438\u043D\u043D\u043E\u0441\u0442\u044C \u0438\u043D\u0444\u0435\u0440\u0435\u043D\u0441\u0430 \u043D\u0435 \u0434\u043E\u043A\u0430\u0437\u0430\u043D\u0430 \u0441\u0430\u043C\u0438\u043C \u0438\u043C\u043F\u043E\u0440\u0442\u043E\u043C JSON."}/></p>
      <p><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F 3D-\u041A\u0422:"}/><LocalizedUi value={report.source.geometry.dimensions.join(" × ")}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439. \u041F\u0440\u0435\u0434\u0441\u043A\u0430\u0437\u0430\u043D\u043D\u0430\u044F \u043C\u0430\u0441\u043A\u0430:"}/><LocalizedUi value={report.prediction.predictedMaskVolumeMl.toFixed(2)}/><LocalizedUi value={"\u043C\u043B,"}/><LocalizedUi value={report.prediction.predictedPositiveVoxelCount}/><LocalizedUi value={"\u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0445 \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439. \u041A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u044B \u0441\u0432\u044F\u0437\u043D\u043E\u0441\u0442\u0438:"}/><LocalizedUi value={report.prediction.connectedComponentsTotal}/>.</p>
      <p><LocalizedUi value={"\u041D\u0430\u0431\u043E\u0440 \u043D\u0430\u0445\u043E\u0434\u043E\u043A \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439. Dice, \u0447\u0443\u0432\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0438 \u0441\u043F\u0435\u0446\u0438\u0444\u0438\u0447\u043D\u043E\u0441\u0442\u044C \u043D\u0435 \u0440\u0430\u0441\u0441\u0447\u0438\u0442\u0430\u043D\u044B \u043D\u0430 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0439 \u0432\u044B\u0431\u043E\u0440\u043A\u0435."}/></p>
      <div>
        <label><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0439 NIfTI (.nii/.nii.gz) \u2014 SHA-256"}/><input disabled={busy} type="file" accept=".nii,.gz,.nii.gz" onChange={e => {
                const f = e.target.files?.[0];
                e.currentTarget.value = "";
                if (f)
                    void verify(f, "source");
            }}/>
        </label>
        <p role="status"><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u041A\u0422:"}/><LocalizedUi value={sourceOk ? "SHA-256 совпал" : "не подтверждена по файлу"}/></p>
        <label><LocalizedUi value={"\u0411\u0438\u043D\u0430\u0440\u043D\u0430\u044F \u043C\u0430\u0441\u043A\u0430 SAMIHS (.nii/.nii.gz) \u2014 SHA-256"}/><input disabled={busy} type="file" accept=".nii,.gz,.nii.gz" onChange={e => {
                const f = e.target.files?.[0];
                e.currentTarget.value = "";
                if (f)
                    void verify(f, "mask");
            }}/>
        </label>
        <p role="status"><LocalizedUi value={"\u041C\u0430\u0441\u043A\u0430:"}/><LocalizedUi value={maskOk ? "SHA-256 совпал" : "не подтверждена по файлу"}/></p>
      </div>
      <LocalizedUi value={sourceOk && maskOk && sourceFile && maskFile && <>
        <IchNativeOverlay source={sourceFile} mask={maskFile} report={report}/>
        <IchReferenceComparisonPanel modelReport={report} source={sourceFile} mask={maskFile}/>
      </>}/>
      <p><small><LocalizedUi value={"SHA \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u043C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u043C \u0444\u0430\u0439\u043B\u0430\u043C, \u0430 \u043D\u0435 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0443\u044E \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u044C, \u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0438 \u0438\u043B\u0438 \u0434\u043E\u0432\u0435\u0440\u0438\u0435 \u043A \u0430\u0432\u0442\u043E\u0440\u0443 \u043E\u0442\u0447\u0451\u0442\u0430."}/></small></p>
      <LocalizedUi value={report.prediction.largestComponents.length === 0 ?
                <p><LocalizedUi value={"\u041C\u043E\u0434\u0435\u043B\u044C \u043D\u0435 \u0441\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u043B\u0430 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432."}/><strong><LocalizedUi value={"\u042D\u0442\u043E \u043D\u0435 \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435."}/></strong></p> :
                <div style={{ maxHeight: 420, overflowY: "auto" }}>
          <LocalizedUi value={report.prediction.largestComponents.map(c => {
                        const current = decisions[c.componentIndex] ?? { decision: "unreviewed", note: "" };
                        return <fieldset key={c.componentIndex} style={{ margin: "12px 0", padding: 10 }}>
              <legend><strong><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442"}/><LocalizedUi value={c.componentIndex + 1}/></strong></legend>
              <p><LocalizedUi value={"\u041F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u043C\u043E\u0434\u0435\u043B\u0438:"}/><LocalizedUi value={c.volumeMl.toFixed(2)}/><LocalizedUi value={"\u043C\u043B;"}/><LocalizedUi value={c.peakSliceIndexK !== undefined ?
                                <><LocalizedUi value={"\u043D\u0430\u0438\u0431\u043E\u043B\u0435\u0435 \u043D\u0430\u0441\u044B\u0449\u0435\u043D\u043D\u044B\u0439 \u0441\u0440\u0435\u0437 k"}/><LocalizedUi value={c.peakSliceIndexK + 1}/>
                    (<LocalizedUi value={c.peakSliceComponentVoxels}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439 \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u044B);"}/></> : null}/><LocalizedUi value={"\u0431\u043E\u043A\u0441 \u0432 \u0438\u043D\u0434\u0435\u043A\u0441\u0430\u0445 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E NIfTI:"}/><LocalizedUi value={c.boundsVoxelMin.join("/")}/>
                <LocalizedUi value={" — "}/><LocalizedUi value={c.boundsVoxelMax.join("/")}/><LocalizedUi value={". \u041D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D \u043A\u0430\u043A \u0433\u0435\u043C\u0430\u0442\u043E\u043C\u0430."}/></p>
              <label><LocalizedUi value={"\u0412\u0440\u0430\u0447\u0435\u0431\u043D\u0430\u044F \u043E\u0446\u0435\u043D\u043A\u0430"}/><select value={current.decision} onChange={e => setDecisions(prev => ({ ...prev, [c.componentIndex]: {
                                    ...current, decision: e.target.value as IchReviewDecision
                                } }))}>
                  <LocalizedUi value={Object.entries(names).map(([value, label]) => <option key={value} value={value}><LocalizedUi value={label}/></option>)}/>
                </select>
              </label>
              <label style={{ display: "block" }}><LocalizedUi value={"\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 \u0432\u0440\u0430\u0447\u0430"}/><textarea style={{ display: "block", width: "100%" }} rows={2} maxLength={1000} value={current.note} onChange={e => setDecisions(prev => ({ ...prev,
                                [c.componentIndex]: { ...current, note: e.target.value } }))}/>
              </label>
            </fieldset>;
                    })}/>
        </div>}/>
      <button type="button" disabled={!sourceOk || !maskOk || busy} onClick={() => {
                try {
                    downloadReview("opus-ich-physician-research-review.json", buildIchLocalReview(report, sourceOk, maskOk, decisions));
                    setError("");
                }
                catch (e) {
                    setError(e instanceof Error ? e.message : "Некорректный разбор.");
                }
            }}><LocalizedUi value={"\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0440\u0430\u0437\u0431\u043E\u0440 \u0441 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u043C\u0438 SHA-256"}/></button><LocalizedUi value={" "}/>
      <button type="button" onClick={clear}><LocalizedUi value={"\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442"}/></button>
      <p><small><LocalizedUi value={"\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043F\u043E SHA-256 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u0430 \u0434\u043B\u044F \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0430 \u0432\u0440\u0430\u0447\u0435\u0431\u043D\u043E\u0439 \u0437\u0430\u043F\u0438\u0441\u0438. \u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0435 \u043F\u0438\u043A\u0441\u0435\u043B\u0438 \u0438 \u043C\u0430\u0441\u043A\u0430 \u043D\u0435 \u043A\u043E\u043F\u0438\u0440\u0443\u044E\u0442\u0441\u044F \u0432 JSON \u0438 \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u044E\u0442\u0441\u044F \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440. \u0420\u0435\u0448\u0435\u043D\u0438\u044F \u043D\u0435 \u0443\u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u0435\u043D\u044B \u0446\u0438\u0444\u0440\u043E\u0432\u043E\u0439 \u043F\u043E\u0434\u043F\u0438\u0441\u044C\u044E."}/></small></p>
    </>}/>
  </section>;
}
