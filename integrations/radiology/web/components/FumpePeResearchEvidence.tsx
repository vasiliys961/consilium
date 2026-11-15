"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useState, type ChangeEvent } from "react";
import { sha256 } from "@noble/hashes/sha2.js";
type Location = {
    originalSourceVoxelBoundsInclusive: [
        number[],
        number[]
    ];
    originalSourceVoxelCentroid: number[];
    originalSourceRasMmCentroid: number[] | null;
    candidateVolumeMl: number | null;
    voxels: number;
    matchesOneExpertLesion: boolean;
    notConfirmedPE: true;
};
type Report = {
    schema: "opus-real-public-ctpa-fumpe-embolism-expert-comparison/v1";
    sourceSha256: string;
    actualFull3DTrainedInferenceCompleted: true;
    clinicalValidation: false;
    patientDiagnosisAllowed: false;
    modelConnectedPECandidates: number;
    candidateLocationsOriginalSourceRasMm: Location[];
    originalFullVolumeShape: number[];
    oneVolumeEmbolusDice: number;
    singleStudyComponentRecall: number;
    candidateLocationListTruncated: boolean;
};
function parse(value: unknown): Report {
    if (!value || typeof value !== "object")
        throw Error("Отчёт должен быть JSON-объектом");
    const v = value as Record<string, unknown>;
    if (v.schema !== "opus-real-public-ctpa-fumpe-embolism-expert-comparison/v1" ||
        v.actualFull3DTrainedInferenceCompleted !== true || v.clinicalValidation !== false ||
        v.patientDiagnosisAllowed !== false || !/^[a-f0-9]{64}$/.test(String(v.sourceSha256)))
        throw Error("Неизвестный или недостоверный исследовательский отчёт ТЭЛА");
    if (!Array.isArray(v.originalFullVolumeShape) || v.originalFullVolumeShape.length !== 3 ||
        v.originalFullVolumeShape.some((x: unknown) => !Number.isSafeInteger(x) || Number(x) < 2))
        throw Error("Нет размерности исходной КТ");
    if (!Number.isInteger(v.modelConnectedPECandidates) || Number(v.modelConnectedPECandidates) < 0 ||
        !Array.isArray(v.candidateLocationsOriginalSourceRasMm) || v.candidateLocationsOriginalSourceRasMm.length > 40)
        throw Error("Недопустимое количество находок");
    for (const obj of v.candidateLocationsOriginalSourceRasMm) {
        if (!obj || obj.notConfirmedPE !== true || !Number.isSafeInteger(obj.voxels) || obj.voxels < 1 ||
            !Array.isArray(obj.originalSourceVoxelBoundsInclusive) || obj.originalSourceVoxelBoundsInclusive.length !== 2)
            throw Error("Находка не прошла проверку");
        const [lo, hi] = obj.originalSourceVoxelBoundsInclusive;
        if (!Array.isArray(lo) || !Array.isArray(hi) || lo.length !== 3 || hi.length !== 3 ||
            lo.some((x: number, i: number) => !Number.isSafeInteger(x) || x < 0 || x > hi[i] || hi[i] >= Number((v.originalFullVolumeShape as number[])[i])))
            throw Error("Находка выходит за пределы исходной КТ");
    }
    return v as unknown as Report;
}
export default function FumpePeResearchEvidence() {
    const __ui = useUiTranslator();
    const [report, setReport] = useState<Report | null>(null), [error, setError] = useState("");
    const [bound, setBound] = useState(false), [working, setWorking] = useState(false);
    async function load(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        setReport(null);
        setBound(false);
        setError("");
        if (!file)
            return;
        if (file.size > 200000) {
            setError("Числовой отчёт слишком большой");
            return;
        }
        try {
            setReport(parse(JSON.parse(await file.text())));
        }
        catch (x) {
            setError(x instanceof Error ? x.message : "Ошибка отчёта");
        }
    }
    async function verify(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        setBound(false);
        setError("");
        if (!file || !report)
            return;
        if (file.size > 1024 * 1024 * 1024) {
            setError("Превышен лимит 1 ГБ");
            return;
        }
        setWorking(true);
        const digest = sha256.create();
        let total = 0;
        const reader = file.stream().getReader();
        try {
            for (;;) {
                const item = await reader.read();
                if (item.done)
                    break;
                total += item.value.byteLength;
                if (total > 1024 * 1024 * 1024)
                    throw Error("Превышен лимит чтения");
                digest.update(item.value);
            }
            const actual = Array.from(digest.digest(), b => b.toString(16).padStart(2, "0")).join("");
            if (actual !== report.sourceSha256 || total !== file.size)
                throw Error("SHA-256 КТ не совпадает: координаты скрыты");
            setBound(true);
        }
        catch (x) {
            setError(x instanceof Error ? x.message : "Ошибка SHA-256");
        }
        finally {
            reader.releaseLock();
            setWorking(false);
        }
    }
    return <section aria-label={__ui("\u0422\u042D\u041B\u0410: \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0430\u044F \u0434\u0435\u0442\u0435\u043A\u0446\u0438\u044F \u043D\u0430 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0439 \u041A\u0422-\u0430\u043D\u0433\u0438\u043E\u0433\u0440\u0430\u0444\u0438\u0438")}>
 <h3><LocalizedUi value={"\u0422\u042D\u041B\u0410 \u00B7 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C FUMPE / Mazurowski"}/></h3>
 <p><LocalizedUi value={"\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0447\u0438\u0441\u043B\u043E\u0432\u043E\u0433\u043E \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430 \u043F\u0440\u0435\u0434\u043E\u0431\u0443\u0447\u0435\u043D\u043D\u043E\u0439 \u043C\u043E\u0434\u0435\u043B\u0438 \u043D\u0430 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0439 \u041A\u0422-\u0430\u043D\u0433\u0438\u043E\u0433\u0440\u0430\u0444\u0438\u0438. \u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u0440\u0435\u0436\u0438\u043C CC BY-NC 4.0. \u041D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u043E\u0439 \u0422\u042D\u041B\u0410 \u0438 \u043D\u0435 \u0438\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u0435\u0451 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435."}/></p>
 <label><LocalizedUi value={"\u0427\u0438\u0441\u043B\u043E\u0432\u043E\u0439 \u043E\u0442\u0447\u0451\u0442 \u0441\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u044F \u0441 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u043E\u0439"}/><input type="file" accept=".json,application/json" onChange={e => void load(e)}/></label>
 <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
 <LocalizedUi value={report && <div>
 <p><LocalizedUi value={"\u041E\u0434\u043D\u0430 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u0430\u044F \u041A\u0422: Dice"}/><LocalizedUi value={report.oneVolumeEmbolusDice.toFixed(3)}/><LocalizedUi value={"; \u0447\u0443\u0432\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u043F\u043E \u0441\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u043C \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u0430\u043C"}/><LocalizedUi value={report.singleStudyComponentRecall.toFixed(3)}/><LocalizedUi value={". \u041D\u0435 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u0438 \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u0438."}/></p>
 <label><LocalizedUi value={"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u0438\u0441\u0445\u043E\u0434\u043D\u0443\u044E \u041A\u0422 NIfTI \u043F\u043E SHA-256"}/><input type="file" accept=".nii.gz,.nii" disabled={working} onChange={e => void verify(e)}/></label>
 <p role="status"><LocalizedUi value={bound ? "✓ Источник идентичен исходной КТ отчёта" : "Координаты скрыты до проверки оригинального файла"}/></p>
 <LocalizedUi value={bound && <><p><LocalizedUi value={"\u0412\u0441\u0435\u0433\u043E \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u043E\u0432 \u043C\u043E\u0434\u0435\u043B\u0438:"}/><LocalizedUi value={report.modelConnectedPECandidates}/>. <LocalizedUi value={report.candidateLocationListTruncated ? "Показаны не все кандидаты." : ""}/></p>
 <ol><LocalizedUi value={report.candidateLocationsOriginalSourceRasMm.map((x, i) => <li key={i}><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442"}/><LocalizedUi value={i + 1}/>: <LocalizedUi value={x.voxels}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439; \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u044B IJK"}/><LocalizedUi value={JSON.stringify(x.originalSourceVoxelBoundsInclusive)}/>;
 <LocalizedUi value={x.matchesOneExpertLesion ? " пересекается с одним экспертным компонентом" : " экспертное совпадение не установлено"}/>.
 </li>)}/></ol></>}/>
 </div>}/>
 </section>;
}
