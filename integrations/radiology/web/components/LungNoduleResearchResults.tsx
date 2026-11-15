"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useState } from "react";
import PathologyFindingsReview from "./PathologyFindingsReview";
import PublicLuna16SourceSlices from "./PublicLuna16SourceSlices";
import type { MonaiResearchReport } from "../lib/pathology-findings";
import { validateMonaiRealCenterEvidence, type MonaiLunaCenterComparison } from "../lib/monai-luna16-center-evidence";
type Report = MonaiResearchReport & {
    status: string;
    candidateCount: number;
};
type PublicReference = {
    schema: string;
    sourceSeriesIdSha256: string;
    sourceMhdSha256: string;
    annotationsSha256: string;
    referenceNodules: Array<{
        centerMm: number[];
        diameterMm: number;
        nativeVoxelIndex: number[];
        sliceIndex0Based: number;
    }>;
    coordinateMappingStatus: string;
    independentHoldout: false;
    clinicalValidation: false;
    sourceGeometry: {
        dimensions: number[];
        spacingMm: number[];
        origin: number[];
        directionMatrix: number[][];
    };
};
const PUBLIC_MONAI_SHA = "b5e79231466adae93a6fe8e8594029e9add142914e223b879aa0343bb2402d01";
function validatePublicReference(value: unknown, report: Report): PublicReference {
    if (!value || typeof value !== "object")
        throw Error("Неверный формат экспертной разметки.");
    const r = value as Partial<PublicReference>;
    if (r.schema !== "opus-luna16-real-public-reference/v1" ||
        r.sourceSeriesIdSha256 !== report.publicStudy.sourceSeriesIdSha256 ||
        r.sourceMhdSha256 !== report.publicStudy.sourceMhdSha256 ||
        report.model.weightsSha256 !== PUBLIC_MONAI_SHA ||
        r.clinicalValidation !== false || r.independentHoldout !== false ||
        r.coordinateMappingStatus !== "model_to_source_not_independently_validated" ||
        !Array.isArray(r.referenceNodules) ||
        r.referenceNodules.length !== report.publicStudy.luna16GroundTruthNoduleCount ||
        r.referenceNodules.length !== 1 ||
        !Array.isArray(r.sourceGeometry?.dimensions) ||
        r.sourceGeometry.dimensions.join(",") !== report.publicStudy.dimensions.join(",") ||
        !Array.isArray(r.sourceGeometry.spacingMm) ||
        r.sourceGeometry.spacingMm.length !== 3 ||
        !r.sourceGeometry.spacingMm.every(n => finite(n) && n > 0))
        throw Error("Разметка относится к другому исследованию или не прошла проверку.");
    for (const item of r.referenceNodules) {
        if (!Array.isArray(item.centerMm) || item.centerMm.length !== 3 ||
            !item.centerMm.every(finite) || !Array.isArray(item.nativeVoxelIndex) ||
            item.nativeVoxelIndex.length !== 3 || !item.nativeVoxelIndex.every(finite) ||
            !finite(item.diameterMm) || item.diameterMm <= 0 ||
            !Number.isSafeInteger(item.sliceIndex0Based) || item.sliceIndex0Based < 0 ||
            item.sliceIndex0Based >= report.publicStudy.dimensions[2])
            throw Error("Недостоверные координаты экспертного узла.");
    }
    return r as PublicReference;
}
const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
function readReport(raw: string): Report {
    if (raw.length > 4 * 1024 * 1024)
        throw Error("Слишком большой файл отчёта.");
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object")
        throw Error("Некорректный JSON.");
    const r = v as Partial<Report>;
    if (r.schema !== "opus-monai-luna16-real-single-ct-inference/v1" ||
        r.status !== "genuine_trained_checkpoint_executed_on_public_ct" ||
        r.readyForClinicalUse !== false ||
        r.model?.modelCheckpointActualSha256Verified !== true ||
        !/^[a-f0-9]{64}$/.test(r.model.weightsSha256) ||
        r.coverage?.sourceFullCtProcessed !== true ||
        r.coverage?.sourceWorldCoordinateVerification !== "not_yet_completed" ||
        !/^[a-f0-9]{64}$/.test(r.publicStudy?.sourceSeriesIdSha256 ?? "") ||
        !/^[a-f0-9]{64}$/.test(r.publicStudy?.sourceMhdSha256 ?? "") ||
        !/^[a-f0-9]{64}$/.test(r.publicStudy?.sourceRawSha256 ?? "") ||
        !Array.isArray(r.candidates) || r.candidates.length > 300 ||
        r.candidateCount !== r.candidates.length ||
        !Array.isArray(r.publicStudy?.dimensions) || r.publicStudy.dimensions.length !== 3 ||
        !r.publicStudy.dimensions.every(n => Number.isSafeInteger(n) && n > 0) ||
        !Number.isSafeInteger(r.publicStudy.luna16GroundTruthNoduleCount) ||
        r.publicStudy.luna16GroundTruthNoduleCount < 0)
        throw Error("Это не подтверждённый формат исследовательского MONAI-отчёта.");
    for (const c of r.candidates) {
        if (!Number.isSafeInteger(c.candidateIndex) ||
            !Array.isArray(c.centerMonaiWorldMm) || c.centerMonaiWorldMm.length !== 3 ||
            !c.centerMonaiWorldMm.every(finite) ||
            !Array.isArray(c.extentMm) || c.extentMm.length !== 3 ||
            !c.extentMm.every(n => finite(n) && n > 0) ||
            !finite(c.rawClassificationScore) || c.rawClassificationScore < 0 || c.rawClassificationScore > 1 ||
            c.coordinateFrameVerifiedAgainstSource !== false)
            throw Error("Некорректные или неразрешённые координаты кандидата.");
    }
    return r as Report;
}
export default function LungNoduleResearchResults({ isChestCT }: {
    isChestCT: boolean;
}) {
    const __ui = useUiTranslator();
    const [report, setReport] = useState<Report | null>(null), [error, setError] = useState("");
    const [minScore, setMinScore] = useState(0.5);
    const [loadingExample, setLoadingExample] = useState(false);
    const [reference, setReference] = useState<PublicReference | null>(null);
    const [referenceLoading, setReferenceLoading] = useState(false);
    const [referenceError, setReferenceError] = useState("");
    const [comparison, setComparison] = useState<MonaiLunaCenterComparison | null>(null);
    async function reviewReference() {
        if (!report)
            return;
        setReferenceLoading(true);
        setReferenceError("");
        setReference(null);
        setComparison(null);
        try {
            if (!report.publicStudy.sourceSeriesIdSha256 || !report.publicStudy.sourceMhdSha256)
                throw Error("Отчёт не содержит хеши оригинальной публичной КТ.");
            const response = await fetch("/api/research/luna16-reference", { cache: "no-store" });
            if (!response.ok)
                throw Error("Не удалось проверить публикацию LUNA16.");
            const value: unknown = await response.json();
            const checked = validatePublicReference(value, report);
            setReference(checked);
            const evidenceResponse = await fetch("/examples/luna16-monai-expert-center-run-38724788094.json", { cache: "no-store" });
            if (!evidenceResponse.ok)
                throw Error("Недоступно доказательство сравнения с экспертным центром.");
            const evidence: unknown = await evidenceResponse.json();
            setComparison(validateMonaiRealCenterEvidence(evidence, report, checked));
        }
        catch (err) {
            setReferenceError(err instanceof Error ? err.message : "Ошибка сравнения.");
        }
        finally {
            setReferenceLoading(false);
        }
    }
    const visible = report?.candidates.filter(c => c.rawClassificationScore >= minScore)
        .sort((a, b) => b.rawClassificationScore - a.rawClassificationScore) ?? [];
    return <section className="cs-geometry" aria-label={__ui("\u0414\u0435\u0442\u0435\u043A\u0446\u0438\u044F \u043B\u0451\u0433\u043E\u0447\u043D\u044B\u0445 \u0443\u0437\u043B\u043E\u0432 \u00B7 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B MONAI")}>
  <h3><LocalizedUi value={"\u041B\u0451\u0433\u043E\u0447\u043D\u044B\u0435 \u0443\u0437\u043B\u044B \u00B7 MONAI"}/></h3>
  <p><LocalizedUi value={"\u041F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0439 \u043F\u0440\u0438\u043C\u0435\u0440 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0435\u0433\u043E CPU-\u0438\u043D\u0444\u0435\u0440\u0435\u043D\u0441\u0430 MONAI \u043D\u0430 \u041A\u0422 LUNA16. \u041C\u043E\u0434\u0435\u043B\u044C \u043D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F \u043D\u0430 \u044D\u0442\u043E\u043C Mac; \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u044B \u0435\u0449\u0451 \u043D\u0435 \u0441\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u044B \u0441 DICOM."}/></p>
  <LocalizedUi value={!isChestCT ? <p role="status"><LocalizedUi value={"\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0435\u0440\u0438\u044E \u041A\u0422 \u0433\u0440\u0443\u0434\u043D\u043E\u0439 \u043A\u043B\u0435\u0442\u043A\u0438 \u0434\u043B\u044F \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u043E\u0433\u043E \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u0430."}/></p> : null}/>
  <button type="button" disabled={loadingExample} onClick={async () => {
            setLoadingExample(true);
            setReport(null);
            setReference(null);
            setReferenceError("");
            setComparison(null);
            setError("");
            try {
                const response = await fetch("/examples/luna16-monai-cpu-run-38436406805.json", { cache: "no-store" });
                if (!response.ok)
                    throw Error("Не удалось загрузить публичный пример.");
                setReport(readReport(await response.text()));
            }
            catch (err) {
                setError(err instanceof Error ? err.message : "Ошибка загрузки примера.");
            }
            finally {
                setLoadingExample(false);
            }
        }}><LocalizedUi value={loadingExample ? "Загрузка публичного результата…" : "Показать реальный пример LUNA16 (3 кандидата)"}/></button>
  <p><a href="https://github.com/vasiliys961/opus-radiology-ai/actions/runs/38436406805" target="_blank" rel="noopener noreferrer"><LocalizedUi value={"\u0414\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u043E \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F: GitHub Actions #38436406805"}/></a><LocalizedUi value={". \u042D\u0442\u043E \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0434\u0440\u0443\u0433\u043E\u0439 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0439 \u041A\u0422, \u0430 \u043D\u0435 \u0430\u043D\u0430\u043B\u0438\u0437 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u043E\u0433\u043E \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0441\u043A\u043E\u0433\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F."}/></p>
  <label><LocalizedUi value={"\u0418\u043C\u043F\u043E\u0440\u0442 JSON \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430"}/><input type="file" accept=".json,application/json" onChange={async (e) => {
            const file = e.target.files?.[0];
            e.currentTarget.value = "";
            setReport(null);
            setReference(null);
            setReferenceError("");
            setComparison(null);
            setError("");
            if (!file)
                return;
            try {
                if (file.size > 4 * 1024 * 1024)
                    throw Error("Файл превышает 4 МиБ.");
                setReport(readReport(await file.text()));
            }
            catch (err) {
                setError(err instanceof Error ? err.message : "Ошибка импорта.");
            }
        }}/></label>
  <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
  <LocalizedUi value={report && <div>
   <p><strong>MONAI <LocalizedUi value={report.model.version}/></strong> · <LocalizedUi value={report.candidateCount}/><LocalizedUi value={"\u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432 \u00B7"}/><LocalizedUi value={report.publicStudy.luna16GroundTruthNoduleCount}/><LocalizedUi value={"\u044D\u0442\u0430\u043B\u043E\u043D\u043D\u044B\u0445 \u0443\u0437\u043B\u043E\u0432 \u0432 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u043C \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0438."}/></p>
   <p><LocalizedUi value={"\u0412\u0435\u0441\u0430 SHA-256:"}/><code><LocalizedUi value={report.model.weightsSha256.slice(0, 16)}/>…</code></p>
   <p role="alert"><LocalizedUi value={"\u041D\u0430\u0442\u0438\u0432\u043D\u0430\u044F \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0441\u043A\u0430\u044F DICOM/SOP-\u0441\u0435\u0440\u0438\u044F \u043D\u0435 \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D\u0430. \u041F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043A \u044D\u0442\u043E\u0439 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0439 MetaImage \u041A\u0422. \u0421\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0435 \u0441 \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u043D\u044B\u043C \u0443\u0437\u043B\u043E\u043C \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0443\u044E \u0447\u0443\u0432\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0438 \u043D\u0435 \u043E\u0437\u043D\u0430\u0447\u0430\u0435\u0442 \u0434\u0438\u0430\u0433\u043D\u043E\u0437."}/></p>
   <div style={{ border: "1px solid #6d8981", padding: 12, borderRadius: 8, margin: "12px 0" }}>
    <strong><LocalizedUi value={"\u042D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u0430\u044F \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0430 \u00B7 \u0440\u0435\u0430\u043B\u044C\u043D\u0430\u044F \u041A\u0422 LUNA16"}/></strong>
    <p><LocalizedUi value={"\u0421\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u0441 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u043C \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u043C annotations.csv \u0438 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u043E\u043C .mhd. \u041F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0442\u0441\u044F SHA-256 \u043E\u0431\u043E\u0438\u0445 \u0444\u0430\u0439\u043B\u043E\u0432, \u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u044F \u0438 \u0438\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u043E\u0441\u0442\u044C \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F. \u0422\u043E\u043B\u044C\u043A\u043E \u043E\u0442\u043A\u0440\u044B\u0442\u044B\u0435 \u044D\u0442\u0430\u043B\u043E\u043D\u043D\u044B\u0435 \u043C\u0435\u0442\u0430\u0434\u0430\u043D\u043D\u044B\u0435 \u2014 \u0431\u0435\u0437 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u0432\u0430\u0448\u0438\u0445 DICOM."}/></p>
    <button type="button" disabled={referenceLoading} onClick={() => void reviewReference()}>
      <LocalizedUi value={referenceLoading ? "Загрузка проверенной разметки…" : "Сопоставить с экспертной разметкой"}/>
    </button>
    <LocalizedUi value={referenceError && <p role="alert"><LocalizedUi value={referenceError}/></p>}/>
    <LocalizedUi value={reference && <>
      <p><strong><LocalizedUi value={"\u042D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0439 \u0443\u0437\u0435\u043B:"}/></strong> <LocalizedUi value={reference.referenceNodules[0].diameterMm.toFixed(1)}/><LocalizedUi value={"\u043C\u043C \u00B7 \u0446\u0435\u043D\u0442\u0440"}/><LocalizedUi value={reference.referenceNodules[0].centerMm.map(x => x.toFixed(2)).join(" / ")}/><LocalizedUi value={"\u043C\u043C."}/></p>
      <p><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0439 MetaImage: \u0441\u0440\u0435\u0437"}/><LocalizedUi value={reference.referenceNodules[0].sliceIndex0Based + 1}/><LocalizedUi value={"\u0438\u0437"}/><LocalizedUi value={report.publicStudy.dimensions[2]}/><LocalizedUi value={"(\u0440\u0430\u0441\u0441\u0447\u0438\u0442\u0430\u043D\u043E \u043F\u043E \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u0443 \u0438 \u044D\u0442\u0430\u043B\u043E\u043D\u043D\u043E\u0439 \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u0435)."}/></p>
      <LocalizedUi value={comparison && <div style={{ border: "1px solid #888", borderRadius: 8, padding: 12, margin: "10px 0" }}>
        <strong><LocalizedUi value={"\u0418\u0437\u043C\u0435\u0440\u0435\u043D\u043D\u0430\u044F \u043B\u043E\u043A\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F \u043D\u0430 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0435\u0439 \u041A\u0422"}/></strong>
        <p><LocalizedUi value={"\u041F\u0440\u0435\u0434\u043E\u0431\u0443\u0447\u0435\u043D\u043D\u0430\u044F MONAI \u043D\u0430\u0448\u043B\u0430 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442 \u0432\u0431\u043B\u0438\u0437\u0438 \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u043D\u043E\u0433\u043E \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0433\u043E \u0443\u0437\u043B\u0430: \u0440\u0430\u0441\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043C\u0435\u0436\u0434\u0443 \u0446\u0435\u043D\u0442\u0440\u0430\u043C\u0438"}/><strong><LocalizedUi value={comparison.modelCandidatesCompared[0].centerDistanceToExpertMm.toFixed(3)}/><LocalizedUi value={"\u043C\u043C"}/></strong><LocalizedUi value={"; score \u043C\u043E\u0434\u0435\u043B\u0438"}/><strong><LocalizedUi value={comparison.modelCandidatesCompared[0].rawUncalibratedScore.toFixed(6)}/></strong><LocalizedUi value={". \u042D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0439 \u0434\u0438\u0430\u043C\u0435\u0442\u0440 \u0443\u0437\u043B\u0430 \u2014"}/><strong><LocalizedUi value={comparison.independentPublishedLuna16ExpertReference.diameterMm.toFixed(3)}/><LocalizedUi value={"\u043C\u043C"}/></strong>.
        </p>
        <p><LocalizedUi value={"\u041A\u0440\u0438\u0442\u0435\u0440\u0438\u0439 \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u044F \u0441 \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u043D\u044B\u043C \u0446\u0435\u043D\u0442\u0440\u043E\u043C \u043F\u0440\u0438 \u043F\u043E\u0440\u043E\u0433\u0435 0,5:"}/><LocalizedUi value={" "}/>
          <strong><LocalizedUi value={comparison.researchReferenceCenterHitAtScorePoint5 ? "выполнен" : "не выполнен"}/></strong><LocalizedUi value={". \u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0439 MHD, \u0430\u043D\u043D\u043E\u0442\u0430\u0446\u0438\u0438, \u043C\u043E\u0434\u0435\u043B\u044C \u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u044B \u043F\u043E \u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u043C \u0432\u0435\u0440\u0441\u0438\u044F\u043C \u0438 SHA-256."}/></p>
        <p><small><LocalizedUi value={"\u042D\u0442\u043E \u043E\u0434\u0438\u043D \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u043F\u0440\u0438\u043C\u0435\u0440 \u0438\u0437 LUNA16, \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u043D\u043E\u0433\u043E \u0440\u0430\u0437\u0440\u0430\u0431\u043E\u0442\u0447\u0438\u043A\u0430\u043C\u0438 \u0441\u0435\u0442\u0438. \u0412\u043D\u0435\u0448\u043D\u0438\u0439 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u044B\u0439 \u0442\u0435\u0441\u0442, \u044D\u0442\u0430\u043B\u043E\u043D\u043D\u0430\u044F \u043C\u0430\u0441\u043A\u0430, Dice, \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0447\u0443\u0432\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0438 FROC \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0442. \u0422\u043E\u0447\u043D\u043E\u0441\u0442\u044C \u043C\u043E\u0434\u0435\u043B\u0438 \u043D\u0430 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0430\u0445 \u0438\u0437 \u043E\u0434\u043D\u043E\u0433\u043E \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u044F \u043E\u0446\u0435\u043D\u0438\u0442\u044C \u043D\u0435\u043B\u044C\u0437\u044F."}/></small></p>
        <a href="https://github.com/vasiliys961/opus-radiology-ai/actions/runs/38724788094" target="_blank" rel="noopener noreferrer"><LocalizedUi value={"\u0420\u0435\u0430\u043B\u044C\u043D\u043E\u0435 \u0441\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u0438 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F \u00B7 GitHub Actions"}/></a>
      </div>}/>
      <PublicLuna16SourceSlices reference={reference} rawSha256={report.publicStudy.sourceRawSha256} candidates={report.candidates} sourceGeometryVerified={comparison !== null}/>
      <p role="note"><LocalizedUi value={comparison ?
                    "Для этого публичного примера преобразование координат MONAI world → LPS подтверждено оригинальной конфигурацией и геометрией исходного MetaImage. Независимое визуальное подтверждение контура отсутствует; исследовательское совпадение центров не равно клиническому true positive." :
                    "Пространственное сопоставление ещё не прошло проверку подлинных источников. Из одних числовых координат нельзя заключить, что модель обнаружила узел."}/></p>
      <LocalizedUi value={report.candidates.map(c => {
                    const d = Math.hypot(...c.centerMonaiWorldMm.map((v, i) => v - reference.referenceNodules[0].centerMm[i]));
                    return <p key={c.candidateIndex}><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442"}/><LocalizedUi value={c.candidateIndex + 1}/><LocalizedUi value={"\u00B7 \u0447\u0438\u0441\u043B\u043E\u0432\u043E\u0435 \u0440\u0430\u0441\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0434\u043E \u044D\u0442\u0430\u043B\u043E\u043D\u043D\u043E\u0433\u043E \u0446\u0435\u043D\u0442\u0440\u0430:"}/><strong><LocalizedUi value={d.toFixed(2)}/><LocalizedUi value={"\u043C\u043C"}/></strong> · score <LocalizedUi value={(c.rawClassificationScore * 100).toFixed(1)}/>%.</p>;
                })}/>
    </>}/>
   </div>
   <label><LocalizedUi value={"\u041F\u043E\u0440\u043E\u0433 \u043E\u0446\u0435\u043D\u043A\u0438 \u043C\u043E\u0434\u0435\u043B\u0438:"}/><LocalizedUi value={minScore.toFixed(2)}/> <input type="range" min="0" max="1" step="0.05" value={minScore} onChange={e => setMinScore(Number(e.target.value))}/></label>
   <p><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432 \u0432\u044B\u0448\u0435 \u043F\u043E\u0440\u043E\u0433\u0430:"}/><LocalizedUi value={visible.length}/>.</p>
   <div style={{ maxHeight: 280, overflowY: "auto" }}>
    <LocalizedUi value={visible.map(c => <div key={c.candidateIndex} style={{ borderBottom: "1px solid #8b9b97", padding: "8px 0" }}>
      <strong><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442"}/><LocalizedUi value={c.candidateIndex + 1}/></strong> · score <LocalizedUi value={c.rawClassificationScore.toFixed(3)}/>
      <div>MONAI world: <LocalizedUi value={c.centerMonaiWorldMm.map(x => x.toFixed(2)).join(" / ")}/><LocalizedUi value={"\u043C\u043C"}/></div>
      <div><LocalizedUi value={"\u0420\u0430\u0437\u043C\u0435\u0440 \u0431\u043E\u043A\u0441\u0430:"}/><LocalizedUi value={c.extentMm.map(x => x.toFixed(1)).join(" × ")}/><LocalizedUi value={"\u043C\u043C"}/></div>
    </div>)}/>
   </div>
   <PathologyFindingsReview key={report.publicStudy.sourceSeriesIdSha256 + report.model.weightsSha256} report={report}/>
   <button type="button" onClick={() => { setReport(null); setReference(null); setReferenceError(""); setComparison(null); }}><LocalizedUi value={"\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442"}/></button>
  </div>}/>
 </section>;
}
