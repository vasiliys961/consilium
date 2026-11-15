"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useMemo, useState } from "react";
import { decodeDicomPreview } from "../lib/dicom-lite";
import { sha256 } from "@noble/hashes/sha2.js";
import type { DicomSeries } from "../lib/dicom-series";
import { parseOriginalXrvReport, type OriginalXrvCxrResult } from "../lib/xrv-original-cxr";
import VisionPrivacyPreparation from "./VisionPrivacyPreparation";
function checksum(bytes: Uint8Array) {
    return Array.from(sha256(bytes), x => x.toString(16).padStart(2, "0")).join("");
}
async function downsampleReviewedCxr(url: string, signal: AbortSignal): Promise<string> {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    if (signal.aborted)
        throw new DOMException("Исследование изменилось.", "AbortError");
    if (image.width < 128 || image.height < 128 || image.width * image.height > 4096 * 4096)
        throw Error("Размер исходной рентгенограммы не подходит для визуальной оценки.");
    const ratio = Math.min(1, 1000 / image.width, 1000 / image.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(image.width * ratio));
    canvas.height = Math.max(1, Math.floor(image.height * ratio));
    const context = canvas.getContext("2d");
    if (!context)
        throw Error("Нельзя подготовить обезличенную PNG-копию.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
}
/** Run only AFTER genuinely completed original TorchXRayVision. No image cloud
 * upload or paid provider requests without explicit clinician pixel review.
 */
export default function CxrIndependentVisionReview({ series, files, report, onNavigate, }: {
    series: DicomSeries;
    files: ReadonlyMap<string, File>;
    report: OriginalXrvCxrResult;
    onNavigate: (index: number) => void;
}) {
    const __ui = useUiTranslator();
    const [preview, setPreview] = useState<string | null>(null);
    const [status, setStatus] = useState("Готовим ограниченную копию рентгенограммы...");
    const [error, setError] = useState("");
    const localIds = useMemo(() => [series.members[0]?.id ?? ""], [series]);
    const previews = useMemo(() => preview ? [preview] : [], [preview]);
    useEffect(() => {
        const controller = new AbortController();
        setPreview(null);
        setError("");
        setStatus("Сверяем DICOM и снимок оригинального детектора...");
        void (async () => {
            parseOriginalXrvReport(report);
            if ((series.modality !== "CR" && series.modality !== "DX") || series.members.length !== 1)
                throw Error("Это не одиночная CR/DX рентгенограмма.");
            const file = files.get(series.members[0].id);
            if (!file)
                throw Error("Оригинальный DICOM больше недоступен.");
            const decoded = await decodeDicomPreview(file, { maxPixels: 4096 * 4096 });
            if (decoded.metadata.modality !== series.modality)
                throw Error("Снимок CXR не соответствует выбранной DICOM-серии.");
            const b64 = decoded.url.split(",")[1];
            const original = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
            if (checksum(original) !== report.sourcePngSha256)
                throw Error("Визуальная копия не совпала с исходным снимком, проверенным TorchXRayVision.");
            const limited = await downsampleReviewedCxr(decoded.url, controller.signal);
            if (!controller.signal.aborted) {
                setPreview(limited);
                setStatus("Исходный снимок подтверждён. Локально очищаем PNG и проверяем надписи...");
            }
        })().catch(e => {
            if (!controller.signal.aborted)
                setError(e instanceof Error ? e.message : "Кадр недоступен.");
        });
        return () => controller.abort();
    }, [series, files, report]);
    return <section className="cs-geometry" aria-label={__ui("\u041D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u044B\u0439 Gemini Vision \u043F\u043E \u0440\u0435\u043D\u0442\u0433\u0435\u043D\u043E\u0433\u0440\u0430\u043C\u043C\u0435, \u0437\u0430\u0442\u0435\u043C Opus")}>
  <h3><LocalizedUi value={"\u041E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u0441\u043D\u0438\u043C\u043E\u043A \u2192 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u044B\u0439 Gemini Vision \u2192 Opus"}/></h3>
  <p><LocalizedUi value={"Gemini \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u0443\u0432\u0438\u0434\u0438\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u043E\u0431\u0435\u0437\u043B\u0438\u0447\u0435\u043D\u043D\u044B\u0439 \u0441\u043D\u0438\u043C\u043E\u043A. \u0427\u0438\u0441\u043B\u043E\u0432\u044B\u0435 \u043E\u0446\u0435\u043D\u043A\u0438 TorchXRayVision \u0435\u043C\u0443 \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u044E\u0442\u0441\u044F. \u041F\u043E\u0441\u043B\u0435 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0433\u043E \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u044F Opus \u043F\u043E\u043B\u0443\u0447\u0438\u0442 \u0448\u0435\u0441\u0442\u044C \u0431\u0430\u043B\u043B\u043E\u0432 \u0438 \u043E\u0446\u0435\u043D\u0438\u0442 \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u044F, \u0440\u0430\u0441\u0445\u043E\u0436\u0434\u0435\u043D\u0438\u044F, \u043F\u0440\u043E\u0435\u043A\u0446\u0438\u044E AP/PA \u0438 \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E\u0435 \u0443\u0432\u0435\u043B\u0438\u0447\u0435\u043D\u0438\u0435 \u0441\u0435\u0440\u0434\u0435\u0447\u043D\u043E\u0439 \u0442\u0435\u043D\u0438. \u041F\u0440\u043E\u0435\u043A\u0446\u0438\u044E \u043D\u0435\u043B\u044C\u0437\u044F \u0432\u044B\u0434\u0443\u043C\u044B\u0432\u0430\u0442\u044C."}/></p>
  <LocalizedUi value={status && <p role="status"><LocalizedUi value={status}/></p>}/>
  <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/><LocalizedUi value={"\u041E\u0431\u043B\u0430\u0447\u043D\u0430\u044F \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0430 \u0437\u0430\u043F\u0440\u0435\u0449\u0435\u043D\u0430."}/></p>}/>
  <LocalizedUi value={preview && <VisionPrivacyPreparation key={report.sourcePngSha256} previews={previews} modality={series.modality} originalLocalFileIds={localIds} onOpenOriginalSlice={() => onNavigate(0)} originalCxrEvidence={report} autoStartAfterDetectors={true}/>}/>
 </section>;
}
