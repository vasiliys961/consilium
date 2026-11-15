"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useRef, useState } from "react";
import { sha256 } from "@noble/hashes/sha2.js";
import { parseNiftiMask, MAX_MASK_FILE_BYTES } from "../lib/segmentation-mask";
import type { IchAlternativeReport } from "../lib/ianpan-ich-report";
import { parseIchBloodExpertSpatialReview, type IchBloodReferenceResult } from "../lib/ianpan-blood-reference";
const digestHex = (bytes: Uint8Array) => Array.from(sha256(bytes), v => v.toString(16).padStart(2, "0")).join("");
/** Never show imported numbers as trusted unless original blood-label bytes
 * exactly match the reference report. The browser does NOT independently
 * verify the author's radiologist qualifications or original CT affine.
 */
export default function IchBloodReferenceReview({ model, originalModelReportSha256 }: {
    model: IchAlternativeReport;
    originalModelReportSha256: string;
}) {
    const __ui = useUiTranslator();
    const [comparison, setComparison] = useState<IchBloodReferenceResult | null>(null);
    const [maskVerified, setMaskVerified] = useState(false);
    const [referenceError, setReferenceError] = useState("");
    const [busy, setBusy] = useState(false);
    const serial = useRef(0);
    const openReport = async (file: File) => {
        ++serial.current;
        setComparison(null);
        setMaskVerified(false);
        setReferenceError("");
        try {
            if (!file.size || file.size > 2 * 1024 * 1024)
                throw Error("Паспорт экспертного сравнения превышает 2 МиБ.");
            const parsed = parseIchBloodExpertSpatialReview(await file.text(), model, originalModelReportSha256);
            setComparison(parsed);
        }
        catch (e) {
            setReferenceError(e instanceof Error ? e.message : "Не удалось сверить экспертный паспорт.");
        }
    };
    const verifyMask = async (file: File) => {
        const token = ++serial.current;
        setMaskVerified(false);
        setReferenceError("");
        setBusy(true);
        try {
            if (!comparison || file.size < 352 || file.size > MAX_MASK_FILE_BYTES ||
                !file.name.toLowerCase().endsWith(".nii"))
                throw Error("Нужна оригинальная маска крови NIfTI-1 .nii размером не более 32 МиБ.");
            const bytes = new Uint8Array(await file.arrayBuffer());
            if (token !== serial.current)
                return;
            if (digestHex(bytes) !== comparison.evidenceHashes.originalExpertMaskSha256)
                throw Error("SHA-256 экспертной маски НЕ совпал с источником отчёта.");
            const original = parseNiftiMask(bytes.buffer as ArrayBuffer);
            const dims = comparison.originalNativeShapeXYZ;
            if (dims.some((v, i) => v !== original.dimensions[i]))
                throw Error("Размеры оригинальной маски не совпадают с КТ.");
            const allowed = new Set(comparison.referenceClasses.map(c => c.label));
            if (original.labels.some(l => !allowed.has(l.id)))
                throw Error("В маске присутствуют метки без документированного значения крови.");
            for (const c of comparison.referenceClasses) {
                const item = original.labels.find(l => l.id === c.label);
                const voxels = item?.voxels ?? 0;
                if (voxels !== c.referencePositiveVoxels ||
                    Math.abs(voxels * original.voxelVolumeMm3 / 1000 - c.expertReferenceVolumeMl) > 0.00001)
                    throw Error("Воксели/физический объём крови не совпадают с паспортом сравнения.");
            }
            if (token === serial.current)
                setMaskVerified(true);
        }
        catch (e) {
            if (token === serial.current)
                setReferenceError(e instanceof Error ? e.message : "Экспертный файл не принят.");
        }
        finally {
            if (token === serial.current)
                setBusy(false);
        }
    };
    return <section aria-label={__ui("\u042D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0435 \u0441\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 ICH-\u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432 \u0441 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u043E\u0439 \u043A\u0440\u043E\u0432\u0438")} style={{ border: "1px solid #91a5a0", borderRadius: 9, padding: 12, marginTop: 16 }}>
    <h4><LocalizedUi value={"\u041D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u0430\u044F \u043C\u0430\u0441\u043A\u0430 \u043A\u0440\u043E\u0432\u0438 \u00B7 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043B\u043E\u043A\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u0438"}/></h4>
    <p><LocalizedUi value={"\u041C\u043E\u0434\u0443\u043B\u044C \u043F\u0440\u0438\u043D\u0438\u043C\u0430\u0435\u0442 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0439 \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u043E\u0439 \u0432\u0440\u0430\u0447\u0435\u0431\u043D\u043E\u0439 \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0438 \u0433\u0435\u043C\u043E\u0440\u0440\u0430\u0433\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u043E\u0447\u0430\u0433\u0430 \u0438 \u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0433\u043E \u0441\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u044F \u0441 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u043C\u0438 \u043E\u0431\u043B\u0430\u0441\u0442\u044F\u043C\u0438 \u043F\u0440\u0435\u0434\u043E\u0431\u0443\u0447\u0435\u043D\u043D\u043E\u0439 \u043C\u043E\u0434\u0435\u043B\u0438."}/><strong><LocalizedUi value={"\u041C\u0430\u0441\u043A\u0430 \u043F\u0435\u0440\u0438\u0444\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u043E\u0442\u0451\u043A\u0430 \u0434\u043B\u044F \u0442\u0430\u043A\u043E\u0439 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u043D\u0435\u043F\u0440\u0438\u0433\u043E\u0434\u043D\u0430."}/></strong></p>
    <label><LocalizedUi value={"\u041F\u0430\u0441\u043F\u043E\u0440\u0442 \u0432\u043D\u0435\u0448\u043D\u0435\u0433\u043E \u0441\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u044F \u0441 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0435\u0439 \u043C\u0430\u0441\u043A\u043E\u0439 \u043A\u0440\u043E\u0432\u0438 (.json)"}/><input type="file" accept=".json,application/json" onChange={e => {
            const f = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (f)
                void openReport(f);
        }}/>
    </label>
    <LocalizedUi value={referenceError && <p role="alert"><LocalizedUi value={referenceError}/></p>}/>
    <LocalizedUi value={comparison && <>
      <p><LocalizedUi value={"\u041F\u0430\u0441\u043F\u043E\u0440\u0442 \u0441\u0432\u044F\u0437\u0430\u043D \u0441 \u0442\u0435\u043A\u0443\u0449\u0435\u0439 \u043C\u043E\u0434\u0435\u043B\u044C\u044E \u0438 SHA-256 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u041A\u0422. \u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u0440\u0435\u0444\u0435\u0440\u0435\u043D\u0441\u043D\u0430\u044F \u043C\u0430\u0441\u043A\u0430 \u0434\u043E\u043B\u0436\u043D\u0430 \u0431\u044B\u0442\u044C \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0430 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E."}/></p>
      <label><LocalizedUi value={"\u041E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u0430\u044F \u043C\u0430\u0441\u043A\u0430 \u043A\u0440\u043E\u0432\u0438 (\u043D\u0435\u0441\u0436\u0430\u0442\u044B\u0439 .nii)"}/><input type="file" accept=".nii,application/octet-stream" disabled={busy} onChange={e => {
                const f = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (f)
                    void verifyMask(f);
            }}/>
      </label>
      <LocalizedUi value={busy && <p role="status"><LocalizedUi value={"\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 SHA-256 \u0438 \u043C\u0435\u0442\u043E\u043A \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u043E\u0439 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u0438\u2026"}/></p>}/>
      <LocalizedUi value={maskVerified ? <div>
        <p role="status"><LocalizedUi value={"\u041E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u0431\u0430\u0439\u0442\u044B \u043C\u0430\u0441\u043A\u0438, \u043D\u043E\u043C\u0435\u0440\u0430 \u043C\u0435\u0442\u043E\u043A, \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439 \u0438 \u0444\u0438\u0437\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u043E\u0431\u044A\u0451\u043C\u044B \u0441\u043E\u0432\u043F\u0430\u043B\u0438 \u0441 \u0432\u043D\u0435\u0448\u043D\u0438\u043C \u043F\u0430\u0441\u043F\u043E\u0440\u0442\u043E\u043C. \u041F\u043E\u0434\u043B\u0438\u043D\u043D\u043E\u0441\u0442\u044C \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0433\u043E \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0433\u043E \u0430\u0432\u0442\u043E\u0440\u0441\u0442\u0432\u0430 \u0438 \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0435 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 DICOM \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435 \u043D\u0435 \u0443\u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u0435\u043D\u044B."}/></p>
        <LocalizedUi value={comparison.referenceClasses.map(c => <div key={c.referenceClass} style={{ borderBottom: "1px solid #91a5a0", padding: "8px 0" }}>
          <strong><LocalizedUi value={c.referenceClass}/><LocalizedUi value={"\u00B7 \u0442\u043E\u043B\u044C\u043A\u043E \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u0430\u044F \u043A\u0440\u043E\u0432\u044C"}/></strong>
          <div><LocalizedUi value={"\u0420\u0430\u0437\u043C\u0435\u0447\u0435\u043D\u043E:"}/><LocalizedUi value={c.referencePositiveVoxels}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439; \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0439 \u043E\u0431\u044A\u0451\u043C"}/><LocalizedUi value={c.expertReferenceVolumeMl.toFixed(3)}/><LocalizedUi value={"\u043C\u043B."}/></div>
          <div><LocalizedUi value={"\u0427\u0438\u0441\u043B\u043E \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u043C\u043E\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u0440\u0430\u043C\u043E\u043A:"}/><LocalizedUi value={c.subtypeCandidateBoxes}/>.</div>
          <LocalizedUi value={c.expertVoxelShareInsideModelBoxes === null ?
                        <div><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C \u043F\u043E\u043A\u0440\u044B\u0442\u0438\u044F \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442: \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u0430\u044F \u043C\u0430\u0441\u043A\u0430 \u043A\u043B\u0430\u0441\u0441\u0430 \u043F\u0443\u0441\u0442\u0430."}/></div> :
                        <div><LocalizedUi value={"\u0412\u043D\u0443\u0442\u0440\u0438 \u043C\u043E\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0438\u0432\u0430\u044E\u0449\u0438\u0445 \u043E\u0431\u043B\u0430\u0441\u0442\u0435\u0439:"}/><LocalizedUi value={" "}/><LocalizedUi value={c.expertVoxelsInsideModelBoxUnion}/><LocalizedUi value={"\u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0445 \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439"}/><LocalizedUi value={" "}/>(<LocalizedUi value={(c.expertVoxelShareInsideModelBoxes * 100).toFixed(1)}/>%).
            </div>}/>
          <div><LocalizedUi value={"\u042D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0445 6-\u0441\u0432\u044F\u0437\u043D\u044B\u0445 \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442\u043E\u0432, \u0441\u043E\u043F\u0440\u0438\u043A\u0430\u0441\u0430\u044E\u0449\u0438\u0445\u0441\u044F \u0441 \u043C\u043E\u0434\u0435\u043B\u044C\u043D\u044B\u043C\u0438 \u043F\u0440\u044F\u043C\u043E\u0443\u0433\u043E\u043B\u044C\u043D\u0438\u043A\u0430\u043C\u0438:"}/><LocalizedUi value={c.expertComponentsWithBoxIntersection}/>/
            <LocalizedUi value={c.expertComponentsTotal}/>.</div>
        </div>)}/>
        <p role="alert"><strong><LocalizedUi value={"\u041D\u0435 \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u0438 \u0441\u0435\u0433\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u0438."}/></strong><LocalizedUi value={"\u041E\u0445\u0432\u0430\u0442 \u0440\u0430\u043C\u043A\u0430\u043C\u0438 \u043D\u0435 \u0440\u0430\u0432\u0435\u043D Dice, \u0432\u043E\u043A\u0441\u0435\u043B\u044C\u043D\u043E\u0439 \u0447\u0443\u0432\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u0438, \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u0443 \u0438\u0441\u0442\u0438\u043D\u043D\u043E \u043E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u0445 \u0433\u0435\u043C\u0430\u0442\u043E\u043C \u0438\u043B\u0438 \u043F\u0440\u043E\u0433\u043D\u043E\u0437\u0443. \u0421\u0430\u043C\u043E\u0441\u0442\u043E\u044F\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u0434\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u043E \u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u043D\u043E\u0441\u0442\u0438 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0445 \u043C\u0435\u0442\u043E\u043A \u0438 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u043E\u0433\u043E DICOM \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442."}/></p>
      </div> : <p><small><LocalizedUi value={"\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u043F\u043E\u043A\u0440\u044B\u0442\u0438\u044F \u0441\u043A\u0440\u044B\u0442\u044B, \u043F\u043E\u043A\u0430 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u043C\u0430\u0441\u043A\u0430 \u043A\u0440\u043E\u0432\u0438 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0451\u0442 \u043F\u043E SHA-256 \u0438 \u0434\u0430\u043D\u043D\u044B\u043C \u0441 \u043E\u0442\u0447\u0451\u0442\u043E\u043C."}/></small></p>}/>
      <button type="button" onClick={() => {
                ++serial.current;
                setComparison(null);
                setMaskVerified(false);
                setReferenceError("");
                setBusy(false);
            }}><LocalizedUi value={"\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0435 \u0441\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435"}/></button>
    </>}/>
    <LocalizedUi value={!comparison && <p><small><LocalizedUi value={"\u0414\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u043D\u043E\u0433\u043E \u0432\u043D\u0435\u0448\u043D\u0435\u0433\u043E \u044D\u0442\u0430\u043B\u043E\u043D\u0430 \u0433\u0435\u043C\u0430\u0442\u043E\u043C\u044B \u0434\u043B\u044F \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u043D\u043E\u0439 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u043E\u0439 \u041A\u0422 \u0441\u0435\u0439\u0447\u0430\u0441 \u043D\u0435\u0442. \u0418\u0437 \u0447\u0438\u0441\u0435\u043B \u0441\u0430\u043C\u043E\u0439 \u043D\u0435\u0439\u0440\u043E\u0441\u0435\u0442\u0438 \u043D\u0435\u043B\u044C\u0437\u044F \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u0443\u044E \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0443."}/></small></p>}/>
  </section>;
}
