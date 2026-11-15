"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useState, type ChangeEvent } from "react";
import { sha256 } from "@noble/hashes/sha2.js";
import dynamic from "next/dynamic";
const LungscapeSourceSliceReview = dynamic(() => import("./LungscapeSourceSliceReview"), { ssr: false });
type Candidate = {
    modelClassId: number;
    sourceModelLabel: string;
    candidateVoxelCount: number;
    sourceVoxelBoundsInclusive: number[][];
    volumeMlOnlyWhenOriginalUnitsVerified: number | null;
    clinicalDiagnosis: null;
    interpretationStatus: string;
};
type Report = {
    schema: string;
    model: string;
    sourceSha256: string;
    originalPredictionSha256: string;
    patientClinicalUseAllowed: false;
    independentAccuracyValidated: false;
    sourceGeometryVerified: true;
    findingStatus: string;
    candidates: Candidate[];
    individualMaskComponents?: Candidate[];
    sourceMaskComponentExtractionCompleted?: boolean;
};
function validate(value: unknown): Report {
    if (!value || typeof value !== "object")
        throw Error("Некорректный JSON");
    const q = value as Record<string, unknown>;
    if (q.schema !== "opus-physician-research-candidates/v1" || q.model !== "LungSCAPE191" || q.patientClinicalUseAllowed !== false || q.independentAccuracyValidated !== false || q.sourceGeometryVerified !== true || q.findingStatus !== "research_candidates_not_diagnosis")
        throw Error("Это не подтверждённый исследовательский отчёт LungSCAPE191");
    if (typeof q.sourceSha256 !== "string" || !/^[0-9a-f]{64}$/.test(q.sourceSha256))
        throw Error("Отсутствует SHA-256 источника");
    if (typeof q.originalPredictionSha256 !== "string" || !/^[0-9a-f]{64}$/.test(q.originalPredictionSha256))
        throw Error("Отсутствует SHA-256 оригинальной маски");
    if (!Array.isArray(q.candidates) || q.candidates.length > 100)
        throw Error("Некорректное количество кандидатов");
    if (q.individualMaskComponents !== undefined && (!Array.isArray(q.individualMaskComponents) || q.individualMaskComponents.length > 400))
        throw Error("Недопустимый массив компонентов маски");
    for (const k of [...q.candidates, ...(Array.isArray(q.individualMaskComponents) ? q.individualMaskComponents : [])]) {
        if (!k || typeof k !== "object" || !Number.isInteger(k.modelClassId) || k.modelClassId < 1 || typeof k.sourceModelLabel !== "string" || k.sourceModelLabel.length > 100 || !Number.isSafeInteger(k.candidateVoxelCount) || k.candidateVoxelCount < 1 || k.clinicalDiagnosis !== null || k.interpretationStatus !== "requires_physician_review" || !Array.isArray(k.sourceVoxelBoundsInclusive) || k.sourceVoxelBoundsInclusive.length !== 2 || !k.sourceVoxelBoundsInclusive.every((a: unknown) => Array.isArray(a) && a.length === 3 && a.every((n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0)))
            throw Error("Недопустимые координаты или клинические утверждения");
    }
    return q as unknown as Report;
}
export default function LungscapePhysicianEvidencePanel() {
    const __ui = useUiTranslator();
    const [report, setReport] = useState<Report | null>(null);
    const [problem, setProblem] = useState("");
    const [sourceVerified, setSourceVerified] = useState(false);
    const [verifiedFile, setVerifiedFile] = useState<File | null>(null);
    const [verifiedMask, setVerifiedMask] = useState<File | null>(null);
    const [verifying, setVerifying] = useState(false);
    async function open(e: ChangeEvent<HTMLInputElement>) {
        setReport(null);
        setProblem("");
        setSourceVerified(false);
        setVerifiedFile(null);
        setVerifiedMask(null);
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file)
            return;
        if (file.size > 128000) {
            setProblem("Файл превышает лимит 128 КБ");
            return;
        }
        try {
            setReport(validate(JSON.parse(await file.text())));
        }
        catch (err) {
            setProblem(err instanceof Error ? err.message : "Неизвестная ошибка");
        }
    }
    async function verifySource(e: ChangeEvent<HTMLInputElement>) {
        setSourceVerified(false);
        setVerifiedFile(null);
        setProblem("");
        const source = e.target.files?.[0];
        e.target.value = "";
        if (!source || !report)
            return;
        // Streaming digest avoids full-volume allocation on 8 GiB Macs.
        if (source.size > 1024 * 1024 * 1024) {
            setProblem("Исходная КТ превышает безопасный предел 1 ГБ.");
            return;
        }
        setVerifying(true);
        try {
            const reader = source.stream().getReader();
            const digest = sha256.create();
            let received = 0;
            try {
                for (;;) {
                    const chunk = await reader.read();
                    if (chunk.done)
                        break;
                    received += chunk.value.byteLength;
                    if (received > 1024 * 1024 * 1024)
                        throw Error("Размер источника превышает лимит");
                    digest.update(chunk.value);
                }
            }
            finally {
                reader.releaseLock();
            }
            if (received !== source.size)
                throw Error("Неполный файл источника");
            const hash = Array.from(digest.digest()).map(x => x.toString(16).padStart(2, "0")).join("");
            if (hash !== report.sourceSha256)
                throw Error("SHA-256 исходной КТ не совпадает с отчётом. Находки нельзя привязать к этой КТ.");
            setVerifiedFile(source);
            setSourceVerified(true);
        }
        catch (err) {
            setProblem(err instanceof Error ? err.message : "Ошибка проверки источника");
        }
        finally {
            setVerifying(false);
        }
    }
    async function verifyMask(e: ChangeEvent<HTMLInputElement>) {
        setVerifiedMask(null);
        setProblem("");
        const mask = e.target.files?.[0];
        e.target.value = "";
        if (!mask || !sourceVerified || !report)
            return;
        if (mask.size > 1024 * 1024 * 1024) {
            setProblem("Файл маски превышает 1 ГБ");
            return;
        }
        setVerifying(true);
        try {
            const reader = mask.stream().getReader(), digest = sha256.create();
            let received = 0;
            try {
                for (;;) {
                    const item = await reader.read();
                    if (item.done)
                        break;
                    received += item.value.byteLength;
                    if (received > 1024 * 1024 * 1024)
                        throw Error("Размер маски превышает лимит");
                    digest.update(item.value);
                }
            }
            finally {
                reader.releaseLock();
            }
            if (received !== mask.size)
                throw Error("Файл маски прочитан не полностью");
            const hash = Array.from(digest.digest(), n => n.toString(16).padStart(2, "0")).join("");
            if (hash !== report.originalPredictionSha256)
                throw Error("SHA-256 маски не соответствует исходному предсказанию LungSCAPE191");
            setVerifiedMask(mask);
        }
        catch (err) {
            setProblem(err instanceof Error ? err.message : "Ошибка проверки маски");
        }
        finally {
            setVerifying(false);
        }
    }
    return <section aria-label={__ui("LungSCAPE191 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0435 \u043D\u0430\u0445\u043E\u0434\u043A\u0438")}>
  <h3><LocalizedUi value={"LungSCAPE191 \u00B7 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u0434\u043B\u044F \u0432\u0440\u0430\u0447\u0435\u0431\u043D\u043E\u0439 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438"}/></h3>
  <p><LocalizedUi value={"\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0442\u043E\u043B\u044C\u043A\u043E \u0447\u0438\u0441\u043B\u043E\u0432\u043E\u0439 JSON \u0438\u0437 GitHub Actions. \u0414\u0430\u043D\u043D\u044B\u0435 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u043E\u0432 \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u044E\u0442\u0441\u044F. \u042D\u0442\u043E \u043D\u0435 \u0434\u0438\u0430\u0433\u043D\u043E\u0437 \u0438 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u044F \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0438."}/></p>
  <label><LocalizedUi value={"\u0418\u043C\u043F\u043E\u0440\u0442 \u0447\u0438\u0441\u043B\u043E\u0432\u043E\u0433\u043E \u043E\u0442\u0447\u0451\u0442\u0430"}/><input type="file" accept=".json,application/json" onChange={open}/></label>
  <LocalizedUi value={problem && <p role="alert"><LocalizedUi value={problem}/></p>}/>
  <LocalizedUi value={report && <div><p><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u041A\u0422 SHA-256:"}/><code><LocalizedUi value={report.sourceSha256}/></code></p>
  <label><LocalizedUi value={"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0439 NIfTI .nii.gz \u043F\u043E SHA-256"}/><input type="file" accept=".nii.gz,.nii" onChange={e => void verifySource(e)} disabled={verifying}/></label>
  <p role="status"><LocalizedUi value={sourceVerified ? "✓ SHA-256 исходной КТ совпадает с отчётом. Геометрическая привязка к DICOM ещё не подтверждена." : verifying ? "Проверка SHA-256…" : "Исходная КТ ещё не подтверждена: координаты не применять к текущей серии."}/></p>
  <LocalizedUi value={sourceVerified && <label><LocalizedUi value={"\u041E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u043C\u0430\u0441\u043A\u0430 \u043C\u043E\u0434\u0435\u043B\u0438 NIfTI .nii.gz (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)"}/><input type="file" accept=".nii,.nii.gz" onChange={e => void verifyMask(e)} disabled={verifying}/></label>}/>
  <LocalizedUi value={verifiedMask && <p role="status"><LocalizedUi value={"\u2713 SHA-256 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u043F\u0440\u0435\u0434\u0441\u043A\u0430\u0437\u0430\u043D\u0438\u044F \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442. \u0414\u043B\u044F \u0437\u0430\u043B\u0438\u0432\u043A\u0438 \u043F\u0438\u043A\u0441\u0435\u043B\u0435\u0439 \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u0438."}/></p>}/>
  <p><LocalizedUi value={"\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0435 \u043E\u0431\u043B\u0430\u0441\u0442\u0438 \u043A\u043B\u0430\u0441\u0441\u043E\u0432:"}/><LocalizedUi value={report.candidates.length}/><LocalizedUi value={"; \u0441\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0445 3D-\u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u043E\u0432 \u043C\u0430\u0441\u043A\u0438:"}/><LocalizedUi value={report.individualMaskComponents?.length ?? "не подсчитаны"}/><LocalizedUi value={". \u041D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u0430\u044F \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u044C \u043D\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0430."}/></p>
  <ol><LocalizedUi value={sourceVerified && (report.individualMaskComponents?.length ? report.individualMaskComponents : report.candidates).map((k, i) => <li key={i}><LocalizedUi value={"\u041A\u043B\u0430\u0441\u0441 \u043C\u043E\u0434\u0435\u043B\u0438"}/><LocalizedUi value={k.modelClassId}/>: <LocalizedUi value={k.sourceModelLabel}/>. <LocalizedUi value={k.candidateVoxelCount}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439. \u0413\u0440\u0430\u043D\u0438\u0446\u044B IJK:"}/><LocalizedUi value={JSON.stringify(k.sourceVoxelBoundsInclusive)}/>. <LocalizedUi value={k.volumeMlOnlyWhenOriginalUnitsVerified === null ? "Объём в мл не подтверждён." : `Объём ${k.volumeMlOnlyWhenOriginalUnitsVerified} мл.`}/><LocalizedUi value={"\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0432\u0440\u0430\u0447\u0435\u0431\u043D\u0430\u044F \u043E\u0446\u0435\u043D\u043A\u0430."}/></li>)}/></ol>
  <LocalizedUi value={verifiedFile && <LungscapeSourceSliceReview source={verifiedFile} mask={verifiedMask} candidates={report.individualMaskComponents?.length ? report.individualMaskComponents : report.candidates} individual={!!report.individualMaskComponents?.length}/>}/>
  <p><LocalizedUi value={"\u041D\u0430\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u043D\u0430 \u0442\u0435\u043A\u0443\u0449\u0443\u044E DICOM-\u0441\u0435\u0440\u0438\u044E \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u043E: \u043D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u0430 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0438\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u043E\u0441\u0442\u0438 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u041A\u0422 \u0438 \u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u0438."}/></p></div>}/>
 </section>;
}
