"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useState, type ChangeEvent } from "react";
import { sha256 } from "@noble/hashes/sha2.js";
type RenalReport = {
    schema: "opus-real-public-kits23-kidney-cyst-comparison/v1";
    task: "kidney_cysts";
    truePretrainedModelInferenceCompleted: true;
    originalNativeSourceGridVerified: true;
    clinicalValidation: false;
    noCystDiagnosisPermitted: false;
    sourceSha256: string;
    originalDimensions: number[];
    publicCaseCode: string;
    expertRenalCystLabel3Voxels: number;
    truePositiveCystVoxels: number;
    falsePositiveCystVoxels: number;
    falseNegativeCystVoxels: number;
    falseCystVoxelsInsideExpertTumor: number;
    oneSourceCystDice: number | null;
    oneSourceCystVoxelRecall: number;
    singleCaseLesionEvidence?: {
        expertConnectedCysts: number;
        expertComponentsOverlappedByCandidates: number;
        oneSourceLesionRecall: number | null;
        candidateComponents: {
            sourceVoxelBoundsInclusive: number[][];
            centroidSourceIJK: number[];
            centroidWorldCoordinate: number[];
            worldCoordinateUnits: string;
            predictedVoxels: number;
            overlapsExpertCyst: boolean;
            cystDiagnosisProven: false;
        }[];
    };
};
function readReport(raw: unknown): RenalReport {
    if (!raw || typeof raw !== "object")
        throw Error("Требуется числовой JSON-отчёт");
    const p = raw as Record<string, unknown>;
    if (p.schema !== "opus-real-public-kits23-kidney-cyst-comparison/v1" ||
        p.task !== "kidney_cysts" || p.truePretrainedModelInferenceCompleted !== true ||
        p.originalNativeSourceGridVerified !== true || p.clinicalValidation !== false ||
        p.noCystDiagnosisPermitted !== false || typeof p.sourceSha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(p.sourceSha256))
        throw Error("Неизвестный протокол проверки кист");
    if (!Array.isArray(p.originalDimensions) || p.originalDimensions.length !== 3 ||
        p.originalDimensions.some((x: unknown) => !Number.isSafeInteger(x) || Number(x) <= 0))
        throw Error("Недопустимая геометрия КТ");
    for (const k of ["expertRenalCystLabel3Voxels", "truePositiveCystVoxels",
        "falsePositiveCystVoxels", "falseNegativeCystVoxels", "falseCystVoxelsInsideExpertTumor"]) {
        if (!Number.isSafeInteger(p[k]) || Number(p[k]) < 0)
            throw Error("Неверные счётчики экспертной разметки");
    }
    if (p.oneSourceCystDice !== null &&
        (typeof p.oneSourceCystDice !== "number" || p.oneSourceCystDice < 0 || p.oneSourceCystDice > 1))
        throw Error("Неверный Dice");
    if (typeof p.oneSourceCystVoxelRecall !== "number" ||
        p.oneSourceCystVoxelRecall < 0 || p.oneSourceCystVoxelRecall > 1)
        throw Error("Неверная полнота");
    return p as unknown as RenalReport;
}
export default function RenalCystResearchEvidence() {
    const __ui = useUiTranslator();
    const [data, setData] = useState<RenalReport | null>(null);
    const [verified, setVerified] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    async function readFile(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = "";
        setData(null);
        setVerified(false);
        setError("");
        if (!file)
            return;
        if (file.size > 100000) {
            setError("Отчёт слишком велик");
            return;
        }
        try {
            setData(readReport(JSON.parse(await file.text())));
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Неверный отчёт");
        }
    }
    async function verify(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = "";
        setVerified(false);
        setError("");
        if (!file || !data)
            return;
        if (file.size > 1024 ** 3) {
            setError("Лимит исходной КТ: 1 ГБ");
            return;
        }
        setBusy(true);
        const hash = sha256.create();
        let bytes = 0;
        const reader = file.stream().getReader();
        try {
            for (;;) {
                const part = await reader.read();
                if (part.done)
                    break;
                bytes += part.value.length;
                if (bytes > 1024 ** 3)
                    throw Error("Размер КТ превышает лимит");
                hash.update(part.value);
            }
            const digest = Array.from(hash.digest(), x => x.toString(16).padStart(2, "0")).join("");
            if (bytes !== file.size || digest !== data.sourceSha256)
                throw Error("Исходная КТ не совпадает по SHA-256");
            setVerified(true);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Невозможно проверить КТ");
        }
        finally {
            reader.releaseLock();
            setBusy(false);
        }
    }
    return <section aria-label={__ui("\u041A\u0438\u0441\u0442\u044B \u043F\u043E\u0447\u0435\u043A: \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u0430\u043D\u0430\u043B\u0438\u0437 KiTS23")}>
 <h3><LocalizedUi value={"\u041F\u043E\u0447\u043A\u0438 \u00B7 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C \u043A\u0438\u0441\u0442 \u00B7 KiTS23"}/></h3>
 <p><LocalizedUi value={"\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u043E\u0435 \u0441\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u043F\u0440\u0435\u0434\u043E\u0431\u0443\u0447\u0435\u043D\u043D\u043E\u0439 \u043C\u043E\u0434\u0435\u043B\u0438 \u0441 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u043E\u0439 \u043A\u0438\u0441\u0442 \u043D\u0430 \u043E\u0434\u043D\u043E\u0439 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0439 \u041A\u0422. \u041D\u0435 \u0441\u0442\u0430\u0432\u0438\u0442 \u0434\u0438\u0430\u0433\u043D\u043E\u0437 \u0438 \u043D\u0435 \u0438\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u043A\u0438\u0441\u0442\u044B \u0438\u043B\u0438 \u043E\u043F\u0443\u0445\u043E\u043B\u0438. \u041B\u0438\u0446\u0435\u043D\u0437\u0438\u044F \u043D\u0430\u0431\u043E\u0440\u0430 KiTS23 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0438\u0432\u0430\u0435\u0442 \u043A\u043E\u043C\u043C\u0435\u0440\u0447\u0435\u0441\u043A\u043E\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u0435\u043D\u0438\u0435."}/></p>
 <label><LocalizedUi value={"\u041E\u0442\u0447\u0451\u0442 \u043E\u0446\u0435\u043D\u043A\u0438 \u043C\u043E\u0434\u0435\u043B\u0438 (.json)"}/><input type="file" accept=".json,application/json" onChange={e => void readFile(e)}/></label>
 <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
 <LocalizedUi value={data && <div>
  <p><LocalizedUi value={"\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A:"}/><LocalizedUi value={data.publicCaseCode}/><LocalizedUi value={"; \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0435 \u0432\u043E\u043A\u0441\u0435\u043B\u0438 \u043A\u0438\u0441\u0442:"}/><LocalizedUi value={data.expertRenalCystLabel3Voxels}/>.</p>
  <p><LocalizedUi value={"\u041E\u0434\u043D\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435: Dice"}/><LocalizedUi value={data.oneSourceCystDice === null ? "не рассчитан" : data.oneSourceCystDice.toFixed(3)}/><LocalizedUi value={"; \u043F\u043E\u043B\u043D\u043E\u0442\u0430 \u043F\u043E \u0432\u043E\u043A\u0441\u0435\u043B\u044F\u043C"}/><LocalizedUi value={data.oneSourceCystVoxelRecall.toFixed(3)}/><LocalizedUi value={". \u041A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0447\u0443\u0432\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0438 \u0441\u043F\u0435\u0446\u0438\u0444\u0438\u0447\u043D\u043E\u0441\u0442\u044C \u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B."}/></p>
  <label><LocalizedUi value={"\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0438\u0441\u0445\u043E\u0434\u043D\u0443\u044E \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u0443\u044E \u041A\u0422 (.nii.gz)"}/><input disabled={busy} type="file" accept=".nii,.gz" onChange={e => void verify(e)}/></label>
  <p role="status"><LocalizedUi value={verified ? "Совпадение SHA-256 подтверждено" : "Привязка к исходной КТ не подтверждена"}/></p>
  <LocalizedUi value={verified && data.singleCaseLesionEvidence && <div>
   <p><LocalizedUi value={"3D-\u043B\u043E\u043A\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F \u00B7 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0445 \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u043E\u0432:"}/><LocalizedUi value={data.singleCaseLesionEvidence.expertConnectedCysts}/><LocalizedUi value={"; \u043F\u0435\u0440\u0435\u0441\u0435\u0447\u0435\u043D\u043E \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432 \u0441 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u043E\u0439:"}/><LocalizedUi value={data.singleCaseLesionEvidence.expertComponentsOverlappedByCandidates}/><LocalizedUi value={"; \u043F\u043E\u043B\u043D\u043E\u0442\u0430 \u043E\u0434\u043D\u043E\u0433\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F:"}/><LocalizedUi value={data.singleCaseLesionEvidence.oneSourceLesionRecall?.toFixed(3) ?? "не рассчитана"}/>.</p>
   <ol><LocalizedUi value={data.singleCaseLesionEvidence.candidateComponents.slice(0, 50).map((c, i) => <li key={i}><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442"}/><LocalizedUi value={i + 1}/>: IJK <LocalizedUi value={c.centroidSourceIJK.join(", ")}/><LocalizedUi value={", \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u044B"}/><LocalizedUi value={c.centroidWorldCoordinate.join(", ")}/> (<LocalizedUi value={c.worldCoordinateUnits}/>), <LocalizedUi value={c.predictedVoxels}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439; \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0435 \u043F\u0435\u0440\u0435\u0441\u0435\u0447\u0435\u043D\u0438\u0435:"}/><LocalizedUi value={c.overlapsExpertCyst ? "да" : "нет"}/>.</li>)}/></ol>
   <LocalizedUi value={data.singleCaseLesionEvidence.candidateComponents.length > 50 && <p><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u043F\u0435\u0440\u0432\u044B\u0435 50 \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u043E\u0432."}/></p>}/>
  </div>}/>
  <LocalizedUi value={verified && <p>TP: <LocalizedUi value={data.truePositiveCystVoxels}/>; FP: <LocalizedUi value={data.falsePositiveCystVoxels}/>; FN: <LocalizedUi value={data.falseNegativeCystVoxels}/><LocalizedUi value={"; \u043E\u0448\u0438\u0431\u043E\u0447\u043D\u043E\u0435 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043E\u043F\u0443\u0445\u043E\u043B\u0438:"}/><LocalizedUi value={data.falseCystVoxelsInsideExpertTumor}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439."}/></p>}/>
 </div>}/>
 </section>;
}
