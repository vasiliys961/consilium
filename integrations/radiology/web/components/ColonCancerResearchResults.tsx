"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useState } from "react";
type Box = {
    nativeVoxelBoxXYZ: number[][];
    volumeVoxels: number;
    sourceGeometry: string;
};
type ColonResult = {
    schema: "opus-msd-colon-real-vista3d-expert-v1";
    task: string;
    modality: "CT";
    region: string[];
    realOfficialPretrainedInference: true;
    sourceBoundVoxelGrid: true;
    boundToDicomSop: false;
    independentTrainingHoldout: false;
    clinicalValidation: false;
    patientUseAllowed: false;
    case: string;
    model: string;
    modelRevisionSha: string;
    modelWeightsSha256: string;
    sourceSha256: string;
    expertSha256: string;
    predictionSha256: string;
    nativeShape: number[];
    classId: 27;
    expertVoxels: number;
    predictedVoxels: number;
    TP: number;
    FP: number;
    FN: number;
    voxelDice: number | null;
    voxelRecall: number | null;
    voxelPrecision: number | null;
    localizedNativeVoxelCandidates: Box[];
    limitations: string[];
};
const sha = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const goodCount = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const score = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1);
const axes = ["X", "Y", "Z"];
export function parseColonCancerResearchResult(text: string): ColonResult {
    if (text.length > 1024 * 1024)
        throw Error("Отчёт превышает 1 МиБ.");
    const v: unknown = JSON.parse(text);
    if (!v || typeof v !== "object")
        throw Error("Некорректный JSON.");
    const r = v as Partial<ColonResult>;
    if (r.schema !== "opus-msd-colon-real-vista3d-expert-v1" ||
        r.task !== "CT colon cancer primary lesion segmentation" ||
        r.modality !== "CT" || r.model !== "MONAI/vista3d" || r.classId !== 27 ||
        !Array.isArray(r.region) || r.region.join(",") !== "abdomen,pelvis" ||
        r.realOfficialPretrainedInference !== true ||
        r.sourceBoundVoxelGrid !== true || r.boundToDicomSop !== false ||
        r.independentTrainingHoldout !== false || r.clinicalValidation !== false ||
        r.patientUseAllowed !== false ||
        !sha(r.modelWeightsSha256) || !sha(r.sourceSha256) ||
        !sha(r.expertSha256) || !sha(r.predictionSha256) ||
        typeof r.modelRevisionSha !== "string" || !/^[a-f0-9]{40}$/.test(r.modelRevisionSha) ||
        typeof r.case !== "string" || !/^[a-z0-9_]{1,40}\.nii\.gz$/i.test(r.case) ||
        !Array.isArray(r.nativeShape) || r.nativeShape.length !== 3 ||
        !r.nativeShape.every(x => goodCount(x) && x >= 32 && x <= 850) ||
        !goodCount(r.expertVoxels) || !goodCount(r.predictedVoxels) ||
        !goodCount(r.TP) || !goodCount(r.FP) || !goodCount(r.FN) ||
        r.TP + r.FP !== r.predictedVoxels || r.TP + r.FN !== r.expertVoxels ||
        !score(r.voxelDice) || !score(r.voxelRecall) || !score(r.voxelPrecision) ||
        !Array.isArray(r.localizedNativeVoxelCandidates) ||
        r.localizedNativeVoxelCandidates.length > 100 ||
        !Array.isArray(r.limitations) || r.limitations.length < 1 || r.limitations.length > 20)
        throw Error("Не подтверждён формат или происхождение реального исследовательского результата.");
    for (const c of r.localizedNativeVoxelCandidates) {
        if (!goodCount(c.volumeVoxels) || c.volumeVoxels < 10 ||
            c.sourceGeometry !== "NIfTI affine; not DICOM SOP resolved" ||
            !Array.isArray(c.nativeVoxelBoxXYZ) || c.nativeVoxelBoxXYZ.length !== 3 ||
            !c.nativeVoxelBoxXYZ.every((v, i) => Array.isArray(v) && v.length === 2 &&
                v.every(goodCount) && v[0] <= v[1] && v[1] < r.nativeShape![i]))
            throw Error("Координаты очага выходят за границы публичного тома.");
    }
    for (const key of ["voxelDice", "voxelRecall", "voxelPrecision"] as const) {
        const x = r[key];
        if (x !== null && typeof x === "number" && x > 1)
            throw Error("Недопустимая метрика.");
    }
    return r as ColonResult;
}
/** File-only research result. Does NOT analyze the currently loaded DICOM/patient. */
export default function ColonCancerResearchResults() {
    const __ui = useUiTranslator();
    const [report, setReport] = useState<ColonResult | null>(null);
    const [error, setError] = useState("");
    const fmt = (x: number | null) => x === null ? "не определено" : x.toFixed(4);
    return <section className="cs-geometry" aria-label={__ui("\u0420\u0435\u0430\u043B\u044C\u043D\u0430\u044F \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0430\u044F \u0434\u0435\u0442\u0435\u043A\u0446\u0438\u044F \u043E\u043F\u0443\u0445\u043E\u043B\u0438 \u0442\u043E\u043B\u0441\u0442\u043E\u0439 \u043A\u0438\u0448\u043A\u0438")}>
  <h2><LocalizedUi value={"\u0422\u043E\u043B\u0441\u0442\u0430\u044F \u043A\u0438\u0448\u043A\u0430 \u00B7 \u043E\u043F\u0443\u0445\u043E\u043B\u044C \u043D\u0430 \u041A\u0422"}/></h2>
  <p><LocalizedUi value={"MONAI VISTA3D: \u0441\u043F\u0435\u0446\u0438\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u0430\u044F \u043F\u0440\u0435\u0434\u043E\u0431\u0443\u0447\u0435\u043D\u043D\u0430\u044F \u043C\u0435\u0442\u043A\u0430"}/><strong>27 — colon cancer primaries</strong><LocalizedUi value={". \u042D\u0442\u043E \u043D\u0435 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u043E\u043F\u0443\u0445\u043E\u043B\u0438 \u0432 \u0442\u0435\u043A\u0443\u0449\u0435\u0439 DICOM-\u0441\u0435\u0440\u0438\u0438. \u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 GPU-\u0438\u043D\u0444\u0435\u0440\u0435\u043D\u0441 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E."}/></p>
  <p role="alert"><LocalizedUi value={"\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u043C\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u043A \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0439 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0439 \u041A\u0422 MSD Task10 \u0438 \u0435\u0451 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u0435. \u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u043E\u0439 \u0441\u0432\u044F\u0437\u0438 \u0441 DICOM SOP, \u0430\u043D\u0430\u043B\u0438\u0437\u0430 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0430 \u0437\u0434\u0435\u0441\u044C \u043D\u0435\u0442. \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u0438\u0435 \u0432\u0435\u0441\u043E\u0432 \u2014 \u0442\u043E\u043B\u044C\u043A\u043E \u043D\u0435\u043A\u043E\u043C\u043C\u0435\u0440\u0447\u0435\u0441\u043A\u043E\u0435 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435."}/></p>
  <label><LocalizedUi value={"\u0418\u043C\u043F\u043E\u0440\u0442 \u0447\u0438\u0441\u043B\u043E\u0432\u043E\u0433\u043E JSON, \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u043D\u043E\u0433\u043E \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0438\u043C \u0437\u0430\u043F\u0443\u0441\u043A\u043E\u043C VISTA3D"}/><input type="file" accept=".json,application/json" onChange={async (event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            setError("");
            setReport(null);
            if (!file)
                return;
            try {
                if (file.size > 1024 * 1024)
                    throw Error("Файл больше 1 МиБ.");
                setReport(parseColonCancerResearchResult(await file.text()));
            }
            catch (err) {
                setError(err instanceof Error ? err.message : "Ошибка чтения отчёта.");
            }
        }}/>
  </label>
  <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
  <LocalizedUi value={!report ? <p><LocalizedUi value={"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043D\u0435 \u0438\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u043D. \u041D\u0435\u0442 \u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0439 \u0433\u043E\u0432\u043E\u0440\u0438\u0442\u044C \u043E \u0432\u044B\u044F\u0432\u043B\u0435\u043D\u0438\u0438 \u043B\u0438\u0431\u043E \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0438 \u043E\u043F\u0443\u0445\u043E\u043B\u0438."}/></p> : <>
    <h3><LocalizedUi value={"\u041E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0439 \u0441\u043B\u0443\u0447\u0430\u0439:"}/><LocalizedUi value={report.case}/></h3>
    <p><LocalizedUi value={"\u0412\u0435\u0441\u0430 SHA-256:"}/><code><LocalizedUi value={report.modelWeightsSha256.slice(0, 20)}/>…</code><LocalizedUi value={". \u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u041A\u0422:"}/><code><LocalizedUi value={report.sourceSha256.slice(0, 20)}/>…</code>.</p>
    <p><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u0441\u0435\u0442\u043A\u0430:"}/><LocalizedUi value={report.nativeShape.join(" × ")}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439. \u041E\u0431\u044A\u0451\u043C \u043E\u043F\u0443\u0445\u043E\u043B\u0438 \u0432 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u0435:"}/><LocalizedUi value={report.expertVoxels.toLocaleString("ru-RU")}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439. \u041F\u0440\u0435\u0434\u0441\u043A\u0430\u0437\u0430\u043D\u043E:"}/><LocalizedUi value={report.predictedVoxels.toLocaleString("ru-RU")}/>.</p>
    <table><thead><tr><th>TP</th><th>FP</th><th>FN</th><th>Dice</th><th>Recall</th><th>Precision</th></tr></thead>
     <tbody><tr><td><LocalizedUi value={report.TP}/></td><td><LocalizedUi value={report.FP}/></td><td><LocalizedUi value={report.FN}/></td>
      <td><LocalizedUi value={fmt(report.voxelDice)}/></td><td><LocalizedUi value={fmt(report.voxelRecall)}/></td><td><LocalizedUi value={fmt(report.voxelPrecision)}/></td>
     </tr></tbody></table>
    <h4><LocalizedUi value={"\u041F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0435 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u044B \u043C\u043E\u0434\u0435\u043B\u0438 ("}/><LocalizedUi value={report.localizedNativeVoxelCandidates.length}/>)</h4>
    <LocalizedUi value={report.localizedNativeVoxelCandidates.length ?
                <ol><LocalizedUi value={report.localizedNativeVoxelCandidates.map((c, i) => <li key={i}>
       <LocalizedUi value={c.volumeVoxels}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439, \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u044B"}/><LocalizedUi value={c.nativeVoxelBoxXYZ.map((b, j) => axes[j] + ": " + b.join("–")).join("; ")}/>.
       <small><LocalizedUi value={"\u041D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E \u0432\u0440\u0430\u0447\u043E\u043C. \u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u043D\u0430\u044F \u0441\u0435\u0442\u043A\u0430 NIfTI."}/></small>
      </li>)}/></ol> :
                <p role="alert"><LocalizedUi value={"\u041C\u043E\u0434\u0435\u043B\u044C \u043D\u0435 \u0432\u043E\u0437\u0432\u0440\u0430\u0442\u0438\u043B\u0430 \u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0445 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432. \u042D\u0442\u043E \u043D\u0435 \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435."}/></p>}/>
    <p><strong><LocalizedUi value={"\u041E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u044F:"}/></strong><LocalizedUi value={"\u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0433\u043E holdout, \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u0438 \u043D\u0430 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0430\u0445 \u0438 DICOM-SOP-\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438. Dice \u043E\u0434\u043D\u043E\u0433\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F \u043D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0447\u0443\u0432\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C\u044E."}/></p>
    <button type="button" onClick={() => setReport(null)}><LocalizedUi value={"\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442"}/></button>
   </>}/>
  <p><a href="https://github.com/vasiliys961/opus-radiology-ai/blob/main/docs/MSD_COLON_CANCER_REAL_PRETRAINED.md" target="_blank" rel="noreferrer"><LocalizedUi value={"\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B \u0438 \u043B\u0438\u0446\u0435\u043D\u0437\u0438\u044F \u043C\u043E\u0434\u0435\u043B\u0438"}/></a></p>
 </section>;
}
