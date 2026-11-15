"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useState, type ChangeEvent } from "react";
import { sha256 } from "@noble/hashes/sha2.js";
type Candidate = {
    sourceNativeVoxelBoundsInclusive: number[][];
    sourceNativeCentroidIJK: number[];
    sourceRASCentroidMm: number[];
    candidateVoxels: number;
    candidateVolumeMl: number;
    malignancyConfirmed: false;
};
type Report = {
    schema: "opus-kits23-original-renal-tumor-voxel-metrics/v1";
    publicResearchCase: string;
    sourceCTSha256: string;
    modelMaskSha256: string;
    originalKS987CheckpointSha256: string;
    nativeSourceGeometryVerified: true;
    originalExpertLabelId: 2;
    predictedTumorLabelId: 1;
    expertTumorVoxels: number;
    predictedTumorVoxels: number;
    voxelTP: number;
    voxelFP: number;
    voxelFN: number;
    voxelDice: number;
    predictedNativeTumorCandidates: Candidate[];
    originalModelForwardNotEstablishedByScorer: true;
    independentHoldoutVerified: false;
    clinicalValidation: false;
    noImagePixelsOrMasksInReport: true;
};
const isHash = (x: unknown) => typeof x === "string" && /^[0-9a-f]{64}$/.test(x);
const finite = (x: unknown) => typeof x === "number" && Number.isFinite(x);
function parse(raw: unknown): Report {
    if (!raw || typeof raw !== "object")
        throw Error("JSON expected");
    const x = raw as Record<string, unknown>;
    if (x.schema !== "opus-kits23-original-renal-tumor-voxel-metrics/v1" ||
        x.publicResearchCase !== "KiTS23 case_00021" || !isHash(x.sourceCTSha256) ||
        !isHash(x.modelMaskSha256) || !isHash(x.originalKS987CheckpointSha256) ||
        x.nativeSourceGeometryVerified !== true || x.originalExpertLabelId !== 2 ||
        x.predictedTumorLabelId !== 1 || x.originalModelForwardNotEstablishedByScorer !== true ||
        x.independentHoldoutVerified !== false || x.clinicalValidation !== false ||
        x.noImagePixelsOrMasksInReport !== true || !Array.isArray(x.predictedNativeTumorCandidates) ||
        x.predictedNativeTumorCandidates.length > 256)
        throw Error("Unsupported research evidence");
    for (const k of ["expertTumorVoxels", "predictedTumorVoxels", "voxelTP", "voxelFP", "voxelFN"]) {
        if (!Number.isSafeInteger(x[k]) || Number(x[k]) < 0)
            throw Error("Invalid expert counters");
    }
    if (Number(x.voxelTP) + Number(x.voxelFN) !== Number(x.expertTumorVoxels) ||
        Number(x.voxelTP) + Number(x.voxelFP) !== Number(x.predictedTumorVoxels) ||
        !finite(x.voxelDice) || Number(x.voxelDice) < 0 || Number(x.voxelDice) > 1)
        throw Error("Inconsistent voxel metrics");
    for (const p of x.predictedNativeTumorCandidates as Record<string, unknown>[]) {
        if (!p || p.malignancyConfirmed !== false || !Number.isSafeInteger(p.candidateVoxels) ||
            Number(p.candidateVoxels) < 1 || !finite(p.candidateVolumeMl) || Number(p.candidateVolumeMl) < 0 ||
            !Array.isArray(p.sourceNativeVoxelBoundsInclusive) || p.sourceNativeVoxelBoundsInclusive.length !== 3 ||
            p.sourceNativeVoxelBoundsInclusive.some((pair: unknown) => !Array.isArray(pair) || pair.length !== 2 || pair.some((v: unknown) => !Number.isSafeInteger(v) || Number(v) < 0) || pair[0] > pair[1]) ||
            !Array.isArray(p.sourceNativeCentroidIJK) || p.sourceNativeCentroidIJK.length !== 3 || !p.sourceNativeCentroidIJK.every(finite) ||
            !Array.isArray(p.sourceRASCentroidMm) || p.sourceRASCentroidMm.length !== 3 || !p.sourceRASCentroidMm.every(finite))
            throw Error("Invalid native 3D tumor candidate");
    }
    return x as unknown as Report;
}
export default function KiTS23RenalTumorEvidence() {
    const __ui = useUiTranslator();
    const [data, setData] = useState<Report | null>(null), [verified, setVerified] = useState<Record<string, boolean>>({}), [busy, setBusy] = useState(false), [error, setError] = useState("");
    async function load(e: ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0];
        e.target.value = "";
        setData(null);
        setVerified({});
        setError("");
        if (!f)
            return;
        try {
            if (f.size > 150000)
                throw Error("JSON exceeds limit");
            setData(parse(JSON.parse(await f.text())));
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Cannot parse report");
        }
    }
    async function check(e: ChangeEvent<HTMLInputElement>, kind: "ct" | "mask") {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f || !data)
            return;
        setVerified(v => ({ ...v, [kind]: false }));
        setError("");
        if (f.size > 1024 ** 3) {
            setError("File exceeds 1 GiB");
            return;
        }
        setBusy(true);
        const h = sha256.create(), reader = f.stream().getReader();
        let count = 0;
        try {
            for (;;) {
                const part = await reader.read();
                if (part.done)
                    break;
                count += part.value.length;
                if (count > 1024 ** 3)
                    throw Error("File too large");
                h.update(part.value);
            }
            const got = Array.from(h.digest(), v => v.toString(16).padStart(2, "0")).join("");
            if (count !== f.size || got !== (kind === "ct" ? data.sourceCTSha256 : data.modelMaskSha256))
                throw Error("SHA-256 mismatch");
            setVerified(v => ({ ...v, [kind]: true }));
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Hash check failed");
        }
        finally {
            reader.releaseLock();
            setBusy(false);
        }
    }
    return <section aria-label="KiTS23 kidney tumor candidate evidence">
 <h3><LocalizedUi value={"\u041F\u043E\u0447\u043A\u0438 \u00B7 KS987 \u00B7 \u043B\u043E\u043A\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F \u043E\u043F\u0443\u0445\u043E\u043B\u0435\u0432\u044B\u0445 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432"}/></h3>
 <p><LocalizedUi value={"\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0430\u044F \u043E\u0446\u0435\u043D\u043A\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 KiTS23 CT \u0438 \u043C\u0430\u0441\u043A\u0438. JSON scorer \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u0440\u0435\u0430\u043B\u044C\u043D\u044B\u0439 forward \u0441\u0430\u043C \u043F\u043E \u0441\u0435\u0431\u0435; \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u044C \u0438 \u0437\u043B\u043E\u043A\u0430\u0447\u0435\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0441\u0442\u044C \u043E\u0447\u0430\u0433\u043E\u0432 \u043D\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u044B."}/></p>
 <label><LocalizedUi value={"\u0427\u0438\u0441\u043B\u043E\u0432\u043E\u0439 \u043E\u0442\u0447\u0451\u0442 (.json)"}/><input type="file" accept=".json" onChange={e => void load(e)}/></label>
 <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
 <LocalizedUi value={data && <div>
 <p><LocalizedUi value={"\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A:"}/><LocalizedUi value={data.publicResearchCase}/><LocalizedUi value={". \u042D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0445 \u043E\u043F\u0443\u0445\u043E\u043B\u0435\u0432\u044B\u0445 \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439:"}/><LocalizedUi value={data.expertTumorVoxels}/>.</p>
 <label><LocalizedUi value={"\u041E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u0430\u044F \u041A\u0422"}/><input type="file" accept=".nii,.gz" disabled={busy} onChange={e => void check(e, "ct")}/></label>
 <label><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u043C\u0430\u0441\u043A\u0430 KS987"}/><input type="file" accept=".nii,.gz" disabled={busy} onChange={e => void check(e, "mask")}/></label>
 <p role="status"><LocalizedUi value={verified.ct && verified.mask ? "Оба SHA-256 совпали" : "Нужно подтвердить исходную КТ и маску"}/></p>
 <LocalizedUi value={verified.ct && verified.mask && <div><p><LocalizedUi value={"\u041E\u0434\u0438\u043D \u0441\u043B\u0443\u0447\u0430\u0439: TP"}/><LocalizedUi value={data.voxelTP}/>; FP <LocalizedUi value={data.voxelFP}/>; FN <LocalizedUi value={data.voxelFN}/>; Dice <LocalizedUi value={data.voxelDice.toFixed(3)}/><LocalizedUi value={". \u041D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u0430\u044F \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442."}/></p>
 <ol><LocalizedUi value={data.predictedNativeTumorCandidates.slice(0, 50).map((p, i) => <li key={i}><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442"}/><LocalizedUi value={i + 1}/>: IJK <LocalizedUi value={p.sourceNativeCentroidIJK.join(", ")}/>; RAS <LocalizedUi value={p.sourceRASCentroidMm.join(", ")}/><LocalizedUi value={"\u043C\u043C; \u043E\u0431\u044A\u0451\u043C"}/><LocalizedUi value={p.candidateVolumeMl.toFixed(3)}/><LocalizedUi value={"\u043C\u043B."}/></li>)}/></ol>
 <LocalizedUi value={data.predictedNativeTumorCandidates.length > 50 && <p><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0435\u0440\u0432\u044B\u0435 50 \u043E\u0447\u0430\u0433\u043E\u0432."}/></p>}/>
 <LocalizedUi value={data.predictedNativeTumorCandidates.length === 0 && <p><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u044B \u043D\u0435 \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u044B. \u042D\u0442\u043E \u043D\u0435 \u0438\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u043E\u043F\u0443\u0445\u043E\u043B\u044C."}/></p>}/>
 </div>}/></div>}/></section>;
}
