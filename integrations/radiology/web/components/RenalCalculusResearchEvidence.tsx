"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useState, type ChangeEvent } from "react";
import { sha256 } from "@noble/hashes/sha2.js";
type Candidate = {
    anatomyMaskSide: "left" | "right";
    sourceVoxelBox: number[][];
    sourceCentroidIJK: number[];
    centroidWorldRASmm: number[];
    candidateVolumeMm3: number;
    equivalentSphereDiameterMm: number;
    maxCandidateHU: number;
    meanCandidateHU: number;
    stoneDiagnosisProven: false;
};
type Report = {
    schema: "opus-kidney-calculus-ncct-candidates/v1";
    modality: "NCCT";
    sourceCTSHA256: string;
    sourcePublicURL: string;
    densityThresholdHU: number;
    candidateComponents: Candidate[];
    numberOfCandidateComponents: number;
    stoneSpecificPretrainedDetector: false;
    researchOnly: true;
    patientUseAllowed: false;
    absenceOfStonesEstablished: false;
    ureterEvaluated: false;
    definitiveDiagnosis: null;
};
const finite = (x: unknown) => typeof x === "number" && Number.isFinite(x);
function decode(raw: unknown): Report {
    if (!raw || typeof raw !== "object")
        throw Error("Некорректный JSON");
    const x = raw as Record<string, unknown>;
    if (x.schema !== "opus-kidney-calculus-ncct-candidates/v1" || x.modality !== "NCCT" ||
        !/^[a-f0-9]{64}$/.test(String(x.sourceCTSHA256)) || x.stoneSpecificPretrainedDetector !== false ||
        x.researchOnly !== true || x.patientUseAllowed !== false || x.absenceOfStonesEstablished !== false ||
        x.ureterEvaluated !== false || x.definitiveDiagnosis !== null ||
        !finite(x.densityThresholdHU) || Number(x.densityThresholdHU) < 120 || Number(x.densityThresholdHU) > 250 ||
        typeof x.sourcePublicURL !== "string" || !x.sourcePublicURL.startsWith("https://") ||
        !Array.isArray(x.candidateComponents) || x.candidateComponents.length > 256 ||
        !Number.isSafeInteger(x.numberOfCandidateComponents) || x.numberOfCandidateComponents !== x.candidateComponents.length)
        throw Error("Недостоверная схема исследовательского отчёта");
    for (const c of x.candidateComponents as Record<string, unknown>[]) {
        if (!c || !["left", "right"].includes(String(c.anatomyMaskSide)) ||
            !Array.isArray(c.sourceVoxelBox) || c.sourceVoxelBox.length !== 3 ||
            c.sourceVoxelBox.some((b: unknown) => !Array.isArray(b) || b.length !== 2 || b.some((v: unknown) => !Number.isSafeInteger(v) || Number(v) < 0) || b[1] < b[0]) ||
            !Array.isArray(c.sourceCentroidIJK) || c.sourceCentroidIJK.length !== 3 || !c.sourceCentroidIJK.every(finite) ||
            !Array.isArray(c.centroidWorldRASmm) || c.centroidWorldRASmm.length !== 3 || !c.centroidWorldRASmm.every(finite) ||
            !["candidateVolumeMm3", "equivalentSphereDiameterMm", "maxCandidateHU", "meanCandidateHU"].every(k => finite(c[k]) && Number(c[k]) >= 0) ||
            c.stoneDiagnosisProven !== false)
            throw Error("Недостоверные пространственные координаты кандидата");
    }
    return x as unknown as Report;
}
export default function RenalCalculusResearchEvidence() {
    const __ui = useUiTranslator();
    const [report, setReport] = useState<Report | null>(null), [verified, setVerified] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
    async function load(e: ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0];
        e.target.value = "";
        setReport(null);
        setVerified(false);
        setError("");
        if (!f)
            return;
        try {
            if (f.size > 150000)
                throw Error("JSON превышает 150 КБ");
            setReport(decode(JSON.parse(await f.text())));
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Ошибка чтения");
        }
    }
    async function verify(e: ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0];
        e.target.value = "";
        setVerified(false);
        setError("");
        if (!f || !report)
            return;
        if (f.size > 800 * 1024 * 1024) {
            setError("КТ превышает 800 МиБ");
            return;
        }
        setBusy(true);
        const hash = sha256.create();
        const reader = f.stream().getReader();
        let total = 0;
        try {
            for (;;) {
                const x = await reader.read();
                if (x.done)
                    break;
                total += x.value.length;
                if (total > 800 * 1024 * 1024)
                    throw Error("Превышен лимит");
                hash.update(x.value);
            }
            const digest = Array.from(hash.digest(), v => v.toString(16).padStart(2, "0")).join("");
            if (total !== f.size || digest !== report.sourceCTSHA256)
                throw Error("Несовпадение исходной КТ по SHA-256");
            setVerified(true);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Проверка не удалась");
        }
        finally {
            reader.releaseLock();
            setBusy(false);
        }
    }
    return <section aria-label={__ui("\u041F\u043E\u0447\u043A\u0438: \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0435 \u0433\u0438\u043F\u0435\u0440\u0434\u0435\u043D\u0441\u043D\u044B\u0435 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F")}>
  <h3><LocalizedUi value={"\u041F\u043E\u0447\u043A\u0438 \u00B7 \u0433\u0438\u043F\u0435\u0440\u0434\u0435\u043D\u0441\u043D\u044B\u0435 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F NCCT"}/></h3>
  <p><LocalizedUi value={"\u041F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 3D-\u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432 \u0438\u0437 \u043D\u0430\u0442\u0438\u0432\u043D\u043E\u0439 \u041A\u0422 \u0441 \u043C\u0430\u0441\u043A\u0430\u043C\u0438 \u043F\u043E\u0447\u0435\u043A. \u042D\u0442\u043E \u043F\u043E\u0440\u043E\u0433\u043E\u0432\u044B\u0439 HU-\u0430\u043B\u0433\u043E\u0440\u0438\u0442\u043C, \u0430 \u043D\u0435 \u043E\u0431\u0443\u0447\u0435\u043D\u043D\u044B\u0439 \u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440 \u043A\u0430\u043C\u043D\u0435\u0439. \u041C\u043E\u0447\u0435\u0442\u043E\u0447\u043D\u0438\u043A\u0438 \u043D\u0435 \u0430\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u0443\u044E\u0442\u0441\u044F; \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432 \u043D\u0435 \u0438\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u043C\u043E\u0447\u0435\u043A\u0430\u043C\u0435\u043D\u043D\u0443\u044E \u0431\u043E\u043B\u0435\u0437\u043D\u044C."}/></p>
  <label><LocalizedUi value={"\u0427\u0438\u0441\u043B\u043E\u0432\u043E\u0439 \u043E\u0442\u0447\u0451\u0442 (.json)"}/><input type="file" accept=".json,application/json" onChange={e => void load(e)}/></label>
  <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
  <LocalizedUi value={report && <div>
   <p><LocalizedUi value={"\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A:"}/><a href={report.sourcePublicURL} target="_blank" rel="noreferrer"><LocalizedUi value={"\u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0435 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435"}/></a><LocalizedUi value={"; \u043F\u043E\u0440\u043E\u0433"}/><LocalizedUi value={report.densityThresholdHU}/><LocalizedUi value={"HU; \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432:"}/><LocalizedUi value={report.numberOfCandidateComponents}/>.</p>
   <label><LocalizedUi value={"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0443\u044E \u041A\u0422 (.nii.gz)"}/><input disabled={busy} type="file" accept=".nii,.gz" onChange={e => void verify(e)}/></label>
   <p role="status"><LocalizedUi value={verified ? "SHA-256 исходной КТ подтверждён" : "Источник пока не подтверждён"}/></p>
   <LocalizedUi value={verified && <div>
    <LocalizedUi value={report.candidateComponents.length === 0 ? <p><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u044B \u043D\u0435 \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u044B. \u042D\u0442\u043E \u041D\u0415 \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0434\u0438\u0430\u0433\u043D\u043E\u0437."}/></p> :
                    <ol><LocalizedUi value={report.candidateComponents.map((c, i) => <li key={i}>
      <LocalizedUi value={c.anatomyMaskSide === "left" ? "Левая" : "Правая"}/><LocalizedUi value={"\u043F\u043E\u0447\u043A\u0430, \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442"}/><LocalizedUi value={i + 1}/><LocalizedUi value={"; RAS (\u043C\u043C):"}/><LocalizedUi value={c.centroidWorldRASmm.join(", ")}/><LocalizedUi value={"; \u0446\u0435\u043D\u0442\u0440 IJK:"}/><LocalizedUi value={c.sourceCentroidIJK.join(", ")}/><LocalizedUi value={"; \u043E\u0431\u044A\u0451\u043C"}/><LocalizedUi value={c.candidateVolumeMm3.toFixed(1)}/><LocalizedUi value={"\u043C\u043C\u00B3; \u044D\u043A\u0432\u0438\u0432\u0430\u043B\u0435\u043D\u0442\u043D\u044B\u0439 \u0434\u0438\u0430\u043C\u0435\u0442\u0440"}/><LocalizedUi value={c.equivalentSphereDiameterMm.toFixed(1)}/><LocalizedUi value={"\u043C\u043C; \u043C\u0430\u043A\u0441\u0438\u043C\u0430\u043B\u044C\u043D\u0430\u044F \u043F\u043B\u043E\u0442\u043D\u043E\u0441\u0442\u044C"}/><LocalizedUi value={c.maxCandidateHU.toFixed(0)}/> HU.
     </li>)}/></ol>}/>
    <p><LocalizedUi value={"\u0413\u0438\u043F\u0435\u0440\u0434\u0435\u043D\u0441\u043D\u043E\u0435 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u0441\u043E\u0441\u0443\u0434\u0438\u0441\u0442\u044B\u043C \u043A\u0430\u043B\u044C\u0446\u0438\u043D\u0430\u0442\u043E\u043C \u0438\u043B\u0438 \u0430\u0440\u0442\u0435\u0444\u0430\u043A\u0442\u043E\u043C. \u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u043E\u0432 \u0432\u0440\u0430\u0447\u043E\u043C."}/></p>
   </div>}/>
  </div>}/>
 </section>;
}
