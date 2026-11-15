"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useRef, useState } from "react";
import LocalLungmaskPanel from "./LocalLungmaskPanel";
import SegmentationEvidenceReview from "./SegmentationEvidenceReview";
import { buildSegmentationEvidence, type SegmentationEvidence } from "../lib/segmentation-evidence";
import type { Laa950CpuResearch } from "../lib/cpu-lung-laa950";
import type { AnalysisStream } from "../lib/analysis-stream";
import { parseResearchAnatomy, type AnatomyProof } from "../lib/totalseg-abdomen-import";
import { buildResearchAnatomyRegions, type LobeRegion } from "../lib/totalseg-lobe-navigation";
import { maskColor, MAX_MASK_FILE_BYTES, readNiftiMaskFile, type LabelMask, type Point3 } from "../lib/segmentation-mask";
import { assertResultBinding, MAX_RESULT_JSON_BYTES, parseSegmentationResult, sha256, type AnalysisPackage, type AnalysisRequest, type SegmentationResult } from "../lib/analysis-package";
export type MaskDisplay = {
    visible: boolean;
    opacity: number;
    label: number | null;
};
type Summary = {
    name: string;
    labels: LabelMask["labels"];
    result?: SegmentationResult;
    evidence?: SegmentationEvidence;
    evidenceRevision?: number;
    fullCtDerived?: boolean;
    research?: AnatomyProof;
    researchRegions?: LobeRegion[];
    researchSourceVerified?: boolean;
};
type DownloadPackage = {
    request: AnalysisRequest;
    volumeUrl: string;
    manifestUrl: string;
};
export default function SegmentationControls({ ready, onPrepare, onPrepareStream, onImport, onDisplay, onClear, onNavigatePoint, onSampleMask, onFullCtLoad, onVerifyResearchSource, onEvidenceChange, onQuantifyLaa950, onLaa950Change }: {
    ready: boolean;
    onPrepare: (signal: AbortSignal) => Promise<AnalysisPackage>;
    onPrepareStream: (signal: AbortSignal) => Promise<AnalysisStream>;
    onImport: (mask: LabelMask, display: MaskDisplay) => void;
    onDisplay: (display: MaskDisplay) => void;
    onClear: () => void;
    onNavigatePoint: (point: Point3) => void;
    onSampleMask: (point: Point3) => number | null;
    onFullCtLoad?: (signal: AbortSignal) => Promise<LabelMask>;
    onEvidenceChange?: (evidence: SegmentationEvidence | null) => void;
    onQuantifyLaa950?: (evidence: SegmentationEvidence, operatorConfirmed: boolean, signal: AbortSignal) => Promise<Laa950CpuResearch>;
    onLaa950Change?: (report: Laa950CpuResearch | null) => void;
    onVerifyResearchSource?: (passportJson: string, proof: AnatomyProof, signal: AbortSignal) => Promise<void>;
}) {
    const __ui = useUiTranslator();
    const input = useRef<HTMLInputElement>(null);
    const researchInput = useRef<HTMLInputElement>(null);
    const resultInput = useRef<HTMLInputElement>(null);
    const version = useRef(0);
    const preparation = useRef<AbortController | null>(null);
    const researchController = useRef<AbortController | null>(null);
    const packageRef = useRef<DownloadPackage | null>(null);
    const callbacks = useRef({ onPrepare, onPrepareStream, onImport, onDisplay, onClear, onNavigatePoint, onVerifyResearchSource, onEvidenceChange, onLaa950Change });
    callbacks.current = { onPrepare, onPrepareStream, onImport, onDisplay, onClear, onNavigatePoint, onVerifyResearchSource, onEvidenceChange, onLaa950Change };
    const [summary, setSummary] = useState<Summary | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [display, setDisplay] = useState<MaskDisplay>({ visible: true, opacity: 0.4, label: null });
    const [packet, setPacket] = useState<DownloadPackage | null>(null);
    const [exportBusy, setExportBusy] = useState(false);
    const [exportError, setExportError] = useState("");
    const [localCommandCopied, setLocalCommandCopied] = useState(false);
    const [workerBusy, setWorkerBusy] = useState(false);
    const [laaConfirmed, setLaaConfirmed] = useState(false);
    const [laaBusy, setLaaBusy] = useState(false);
    const [laaError, setLaaError] = useState("");
    const [laaResult, setLaaResult] = useState<Laa950CpuResearch | null>(null);
    const laaController = useRef<AbortController | null>(null);
    useEffect(() => {
        laaController.current?.abort();
        setLaaResult(null);
        setLaaError("");
        setLaaConfirmed(false);
        setLaaBusy(false);
        callbacks.current.onLaa950Change?.(null);
    }, [summary?.evidenceRevision, summary?.name, ready]);
    const quantifyLaa = async () => {
        if (!onQuantifyLaa950 || !summary?.evidence || !laaConfirmed || laaBusy || !ready)
            return;
        const evidence = summary.evidence, controller = new AbortController();
        laaController.current?.abort();
        laaController.current = controller;
        setLaaBusy(true);
        setLaaError("");
        setLaaResult(null);
        try {
            const measured = await onQuantifyLaa950(evidence, true, controller.signal);
            if (!controller.signal.aborted) {
                setLaaResult(measured);
                callbacks.current.onLaa950Change?.(measured);
            }
        }
        catch (e) {
            if (!controller.signal.aborted)
                setLaaError(e instanceof Error ? e.message : "Расчёт HU остановлен");
        }
        finally {
            if (laaController.current === controller) {
                laaController.current = null;
                setLaaBusy(false);
            }
        }
    };
    useEffect(() => {
        if (!onFullCtLoad) {
            version.current++;
            preparation.current?.abort();
            researchController.current?.abort();
            setBusy(false);
            setSummary(current => {
                if (current?.fullCtDerived) {
                    callbacks.current.onClear();
                    callbacks.current.onEvidenceChange?.(null);
                    return null;
                }
                return current;
            });
        }
    }, [Boolean(onFullCtLoad)]);
    const localOnnxCommand = packet ? [
        'cd "$HOME/Desktop/opus-radiology-ai-github"',
        'source .venv-local-ai/bin/activate',
        'python3 scripts/run-local-onnx.py ' +
            '--input "$HOME/Downloads/opus-' + packet.request.requestId + '_0000.nii" ' +
            '--request "$HOME/Downloads/opus-' + packet.request.requestId + '.request.json" ' +
            '--model "$HOME/Models/Opus/model.onnx" ' +
            '--profile "$HOME/Models/Opus/model.profile.json" ' +
            '--mask "$HOME/Downloads/opus-' + packet.request.requestId + '.mask.nii" ' +
            '--result "$HOME/Downloads/opus-' + packet.request.requestId + '.result.json"',
    ].join('\n') : "";
    const releasePackage = () => {
        const previous = packageRef.current;
        if (previous) {
            URL.revokeObjectURL(previous.volumeUrl);
            URL.revokeObjectURL(previous.manifestUrl);
        }
        packageRef.current = null;
    };
    useEffect(() => () => { version.current++; preparation.current?.abort(); researchController.current?.abort(); releasePackage(); }, []);
    useEffect(() => {
        if (!ready) {
            version.current++;
            preparation.current?.abort();
            researchController.current?.abort();
            releasePackage();
            setPacket(null);
            setExportBusy(false);
            setExportError("");
            setSummary(null);
            setBusy(false);
            setError("");
            callbacks.current.onEvidenceChange?.(null);
        }
    }, [ready]);
    const prepare = async () => {
        const request = ++version.current, controller = new AbortController();
        preparation.current?.abort();
        preparation.current = controller;
        setExportBusy(true);
        setExportError("");
        let volumeUrl: string | null = null, manifestUrl: string | null = null;
        try {
            const generated = await callbacks.current.onPrepare(controller.signal);
            if (request !== version.current || controller.signal.aborted)
                return;
            volumeUrl = URL.createObjectURL(new Blob([generated.buffer], { type: "application/octet-stream" }));
            manifestUrl = URL.createObjectURL(new Blob([JSON.stringify(generated.request, null, 2)], { type: "application/json" }));
            releasePackage();
            const next = { request: generated.request, volumeUrl, manifestUrl };
            packageRef.current = next;
            setPacket(next);
            volumeUrl = null;
            manifestUrl = null;
        }
        catch (cause) {
            if (request === version.current && !controller.signal.aborted)
                setExportError(cause instanceof Error ? cause.message : String(cause));
        }
        finally {
            if (volumeUrl)
                URL.revokeObjectURL(volumeUrl);
            if (manifestUrl)
                URL.revokeObjectURL(manifestUrl);
            if (request === version.current) {
                setExportBusy(false);
                preparation.current = null;
            }
        }
    };
    const load = async (file: File) => {
        const request = ++version.current;
        researchController.current?.abort();
        setBusy(true);
        setError("");
        try {
            const mask = await readNiftiMaskFile(file);
            if (request !== version.current)
                return;
            const next = { visible: true, opacity: 0.4, label: mask.labels[0]?.id ?? null };
            // Runtime validates physical geometry before replacing an existing overlay.
            callbacks.current.onImport(mask, next);
            setSummary({ name: file.name, labels: mask.labels });
            setDisplay(next);
            callbacks.current.onEvidenceChange?.(null);
        }
        catch (cause) {
            if (request === version.current)
                setError(cause instanceof Error ? cause.message : String(cause));
        }
        finally {
            if (request === version.current)
                setBusy(false);
        }
    };
    const loadResearch = async (files: File[]) => {
        const revision = ++version.current;
        researchController.current?.abort();
        const controller = new AbortController();
        researchController.current = controller;
        setBusy(true);
        setError("");
        try {
            const masks = files.filter(f => f.name.toLowerCase().endsWith(".nii"));
            const json = files.filter(f => f.name.toLowerCase().endsWith(".json"));
            if (files.length !== 2 || masks.length !== 1 || json.length !== 1)
                throw Error("Выберите одну исследовательскую маску .nii и один паспорт .json.");
            if (!masks[0].size || masks[0].size > MAX_MASK_FILE_BYTES || !json[0].size || json[0].size > 65536)
                throw Error("Недопустимый размер файла исследовательской маски или паспорта.");
            const digest = await sha256(await masks[0].arrayBuffer());
            const mask = await readNiftiMaskFile(masks[0]);
            const passport = await json[0].text();
            const research = parseResearchAnatomy(passport, mask, digest);
            if (!callbacks.current.onVerifyResearchSource)
                throw Error("Проверка источника DICOM не подключена. Исследовательская маска заблокирована.");
            await callbacks.current.onVerifyResearchSource(passport, research, controller.signal);
            if (revision !== version.current || controller.signal.aborted)
                return;
            const researchRegions = await buildResearchAnatomyRegions(mask, research, { cancelled: () => revision !== version.current || controller.signal.aborted });
            if (revision !== version.current || controller.signal.aborted)
                return;
            // The exact selected DICOM byte hashes were compared to the research manifest.
            // MPR also independently validates physical geometry.
            const next = { visible: true, opacity: 0.4, label: null };
            callbacks.current.onImport(mask, next);
            setSummary({ name: masks[0].name, labels: mask.labels, research, researchRegions, researchSourceVerified: true });
            setDisplay(next);
            callbacks.current.onEvidenceChange?.(null);
        }
        catch (cause) {
            if (revision === version.current)
                setError(cause instanceof Error ? cause.message : String(cause));
        }
        finally {
            if (revision === version.current) {
                setBusy(false);
                researchController.current = null;
            }
        }
    };
    const loadResult = async (files: File[]) => {
        const request = ++version.current;
        researchController.current?.abort();
        setBusy(true);
        setError("");
        try {
            const active = packageRef.current;
            if (!active)
                throw new Error("Сначала подготовьте пакет выбранной серии.");
            const json = files.filter(f => f.name.toLowerCase().endsWith(".json"));
            const masks = files.filter(f => /\.nii(\.gz)?$/i.test(f.name));
            if (files.length !== 2 || json.length !== 1 || masks.length !== 1)
                throw new Error("Выберите вместе одну NIfTI-маску и один JSON-паспорт результата.");
            if (json[0].size > MAX_RESULT_JSON_BYTES || masks[0].size > MAX_MASK_FILE_BYTES)
                throw new Error("Превышен лимит размера маски или паспорта.");
            const result = parseSegmentationResult(await json[0].text());
            const maskSha256 = await sha256(await masks[0].arrayBuffer());
            const mask = await readNiftiMaskFile(masks[0]);
            if (request !== version.current)
                return;
            assertResultBinding(result, active.request, mask, maskSha256);
            const evidence = await buildSegmentationEvidence(active.request, result, mask, maskSha256);
            if (request !== version.current)
                return;
            const next = { visible: true, opacity: 0.4, label: mask.labels[0]?.id ?? null };
            callbacks.current.onImport(mask, next);
            setSummary({ name: masks[0].name, labels: mask.labels, result, evidence, evidenceRevision: request });
            setDisplay(next);
            callbacks.current.onEvidenceChange?.(evidence);
        }
        catch (cause) {
            if (request === version.current)
                setError(cause instanceof Error ? cause.message : String(cause));
        }
        finally {
            if (request === version.current)
                setBusy(false);
        }
    };
    const change = (next: MaskDisplay) => {
        try {
            callbacks.current.onDisplay(next);
            setDisplay(next);
            setError("");
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        }
    };
    const selected = display.label === null ? null : summary?.labels.find(l => l.id === display.label);
    const loadFull = async () => {
        if (!onFullCtLoad)
            return;
        researchController.current?.abort();
        const revision = ++version.current, controller = new AbortController();
        preparation.current?.abort();
        preparation.current = controller;
        setBusy(true);
        setError("");
        try {
            const mask = await onFullCtLoad(controller.signal);
            if (revision !== version.current || controller.signal.aborted)
                return;
            const next = { visible: true, opacity: 0.4, label: null };
            callbacks.current.onImport(mask, next);
            setSummary({ name: "R231 · привязанный фрагмент полного задания (Evidence — в полной КТ)", labels: mask.labels, fullCtDerived: true });
            setDisplay(next);
            callbacks.current.onEvidenceChange?.(null);
        }
        catch (e) {
            if (revision === version.current)
                setError(e instanceof Error ? e.message : "Ошибка фрагмента полной маски.");
        }
        finally {
            if (revision === version.current) {
                setBusy(false);
                preparation.current = null;
            }
        }
    };
    const voxels = selected?.voxels ?? summary?.labels.reduce((n, l) => n + l.voxels, 0) ?? 0;
    const volumeMl = selected?.volumeMl ?? summary?.labels.reduce((n, l) => n + l.volumeMl, 0) ?? 0;
    return <section className="ora-mask-controls" aria-label={__ui("\u0420\u0430\u0437\u043C\u0435\u0442\u043A\u0430 \u043E\u0440\u0433\u0430\u043D\u043E\u0432 \u0438 \u043E\u0447\u0430\u0433\u043E\u0432 \u043D\u0430 \u0441\u043D\u0438\u043C\u043A\u0430\u0445")}>
    <div className="ora-mask-heading"><strong><LocalizedUi value={"\u0426\u0432\u0435\u0442\u043E\u0432\u0430\u044F \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0430 \u043D\u0430 \u0441\u043D\u0438\u043C\u043A\u0430\u0445"}/></strong><span><LocalizedUi value={"\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442"}/></span></div>
    <p><LocalizedUi value={"\u0420\u0430\u0437\u043C\u0435\u0442\u043A\u0430, \u0438\u043B\u0438 \u00AB\u043C\u0430\u0441\u043A\u0430\u00BB, \u2014 \u044D\u0442\u043E \u0446\u0432\u0435\u0442\u043D\u043E\u0435 \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u0438\u0435 \u043E\u0440\u0433\u0430\u043D\u0430 \u0438\u043B\u0438 \u043E\u0447\u0430\u0433\u0430 \u043F\u043E\u0432\u0435\u0440\u0445 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u043E\u0432. \u041E\u043D\u0430 \u043F\u043E\u043C\u043E\u0433\u0430\u0435\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0433\u0440\u0430\u043D\u0438\u0446\u044B \u0438 \u0440\u0430\u0441\u0441\u0447\u0438\u0442\u0430\u0442\u044C \u043E\u0431\u044A\u0451\u043C \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u043D\u043E\u0439 \u043E\u0431\u043B\u0430\u0441\u0442\u0438. \u0421\u0430\u043C\u0430 \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0430 \u043D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0434\u0438\u0430\u0433\u043D\u043E\u0437\u043E\u043C."}/></p>
    <p><LocalizedUi value={"\u0414\u043B\u044F \u043E\u0431\u044B\u0447\u043D\u043E\u0433\u043E \u0430\u043D\u0430\u043B\u0438\u0437\u0430 \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u0439\u0442\u0435 DICOM \u0432 \u0440\u0430\u0437\u0434\u0435\u043B\u0435 \u00AB\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435\u00BB \u0438 \u043D\u0430\u0436\u0438\u043C\u0430\u0439\u0442\u0435 \u00AB\u0410\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435\u00BB. \u0417\u0434\u0435\u0441\u044C \u043C\u043E\u0436\u043D\u043E \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0443 \u043B\u0451\u0433\u043A\u0438\u0445 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E\u0439 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u043C\u043E\u0434\u0435\u043B\u044C\u044E \u0438\u043B\u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0443\u0436\u0435 \u0433\u043E\u0442\u043E\u0432\u0443\u044E \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0443 \u0438\u043C\u0435\u043D\u043D\u043E \u044D\u0442\u043E\u0439 \u0441\u0435\u0440\u0438\u0438. \u0415\u0441\u043B\u0438 \u0442\u0430\u043A\u043E\u0433\u043E \u0444\u0430\u0439\u043B\u0430 \u0443 \u0432\u0430\u0441 \u043D\u0435\u0442, \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u0442\u044C \u0441\u044E\u0434\u0430 \u043D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0443\u0436\u043D\u043E."}/></p>
    <LocalizedUi value={onFullCtLoad && <button type="button" disabled={!ready || busy || exportBusy || workerBusy} onClick={() => void loadFull()}><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043C\u0430\u0441\u043A\u0443 \u043F\u043E\u043B\u043D\u043E\u0433\u043E \u0437\u0430\u0434\u0430\u043D\u0438\u044F \u0434\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442\u0430"}/></button>}/>
    <LocalLungmaskPanel ready={ready && !busy && !exportBusy && !onFullCtLoad} onBusy={setWorkerBusy} onPrepare={signal => callbacks.current.onPrepareStream(signal)} onResult={(mask, result, evidence) => {
            const next = { visible: true, opacity: 0.4, label: null };
            callbacks.current.onImport(mask, next);
            setSummary({ name: "Lungmask R231 · локальный worker", labels: mask.labels, result, evidence, evidenceRevision: ++version.current });
            setDisplay(next);
            setError("");
            callbacks.current.onEvidenceChange?.(evidence);
        }}/>
    <div className="ora-mask-actions">
      <button type="button" disabled={!ready || busy || exportBusy || workerBusy} onClick={() => input.current?.click()}><LocalizedUi value={busy ? "Проверяем разметку…" : summary ? "Открыть другую готовую разметку" : "Открыть готовую разметку"}/></button>
      <button type="button" disabled={!ready || busy || exportBusy || workerBusy} onClick={() => researchInput.current?.click()}><LocalizedUi value={"\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0443 TotalSegmentator \u0441 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435\u043C"}/></button>
      <input type="file" ref={researchInput} hidden multiple accept=".nii,.json" onChange={event => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length && ready)
                void loadResearch(files);
        }}/>
      <LocalizedUi value={summary && <button type="button" disabled={exportBusy || workerBusy} onClick={() => {
                version.current++;
                researchController.current?.abort();
                callbacks.current.onClear();
                setSummary(null);
                setBusy(false);
                setError("");
                callbacks.current.onEvidenceChange?.(null);
            }}><LocalizedUi value={"\u0423\u0431\u0440\u0430\u0442\u044C \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0443 \u0441\u043E \u0441\u043D\u0438\u043C\u043A\u043E\u0432"}/></button>}/>
      <input ref={input} type="file" accept=".nii,.nii.gz" hidden onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file && ready)
                void load(file);
        }}/>
    </div>
    <small><LocalizedUi value={"\u0413\u043E\u0442\u043E\u0432\u0430\u044F \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0430 \u2014 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u0444\u0430\u0439\u043B .nii \u0438\u043B\u0438 .nii.gz, \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u043D\u044B\u0439 \u043F\u0440\u0438 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0435 \u044D\u0442\u043E\u0439 \u0441\u0435\u0440\u0438\u0438. \u0414\u043B\u044F TotalSegmentator \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0432\u043C\u0435\u0441\u0442\u0435 .nii \u0438 \u0441\u043E\u043F\u0440\u043E\u0432\u043E\u0436\u0434\u0430\u044E\u0449\u0438\u0439 .json \u0441 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435\u043C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430. \u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0435 DICOM \u0437\u0434\u0435\u0441\u044C \u0432\u044B\u0431\u0438\u0440\u0430\u0442\u044C \u043D\u0435 \u043D\u0443\u0436\u043D\u043E."}/></small>
    <LocalizedUi value={error && <p className="ora-mask-error" role="alert"><LocalizedUi value={error}/> <LocalizedUi value={summary ? "Предыдущая разметка сохранена." : "Разметка не открыта."}/></p>}/>
    <LocalizedUi value={summary && <>
      <p className="ora-mask-success" role="status"><LocalizedUi value={"\u0421\u0435\u0442\u043A\u0430 \u0441\u043E\u0432\u043C\u0435\u0449\u0435\u043D\u0430 \u00B7"}/><LocalizedUi value={summary.name}/><LocalizedUi value={"\u00B7 \u043C\u0435\u0442\u043E\u043A:"}/><LocalizedUi value={summary.labels.length}/></p>
      <small><LocalizedUi value={"\u0421\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0435 \u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u0438 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0430 \u0438\u043B\u0438 \u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0441\u0435\u0433\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u0438. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u0440\u0438\u043D\u0430\u0434\u043B\u0435\u0436\u043D\u043E\u0441\u0442\u044C \u0444\u0430\u0439\u043B\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u0441\u0435\u0440\u0438\u0438 \u0438 \u0433\u0440\u0430\u043D\u0438\u0446\u044B \u043D\u0430 \u0432\u0441\u0435\u0445 \u043F\u043B\u043E\u0441\u043A\u043E\u0441\u0442\u044F\u0445."}/></small>
      <p className="ora-mask-coverage" role="note"><LocalizedUi value={"\u041F\u043E\u043B\u043D\u043E\u0442\u0430 \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u043E\u0445\u0432\u0430\u0442\u0430 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0430. \u041E\u0431\u044A\u0451\u043C \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0438 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043A \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u043C \u0441\u0440\u0435\u0437\u0430\u043C, \u0430 \u043D\u0435 \u043A\u043E \u0432\u0441\u0435\u043C\u0443 \u043E\u0440\u0433\u0430\u043D\u0443."}/></p>
      <LocalizedUi value={summary.research && <details className="ora-mask-provenance" open>
        <summary><LocalizedUi value={"\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0430\u044F \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0430 TotalSegmentator \u00B7"}/><LocalizedUi value={summary.research.anatomy === "abdomen" ? "органы брюшной полости" : "доли лёгких"}/></summary>
        <p><LocalizedUi value={"\u0421\u0440\u0435\u0437\u044B \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u0441\u0435\u0440\u0438\u0438:"}/><LocalizedUi value={summary.research.firstSlice}/>–<LocalizedUi value={summary.research.lastSlice}/><LocalizedUi value={"(\u0438\u043D\u0434\u0435\u043A\u0441\u044B \u0441 \u043D\u0443\u043B\u044F); \u043F\u043E\u043B\u043D\u044B\u0439 \u043E\u0431\u044A\u0451\u043C:"}/><LocalizedUi value={summary.research.fullDimensions.join(" × ")}/>.</p>
        <LocalizedUi value={summary.research.missingLabels.length ?
                    <p role="alert"><LocalizedUi value={"\u0422\u0440\u0435\u0431\u0443\u044E\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0435 \u043C\u0435\u0442\u043A\u0438:"}/><LocalizedUi value={summary.research.missingLabels.map(id => summary.research!.labelNames[id]).join(", ")}/>.</p> :
                    <p><LocalizedUi value={"\u0412\u0441\u0435"}/><LocalizedUi value={summary.research.anatomy === "abdomen" ? "четыре" : "пять"}/><LocalizedUi value={"\u043C\u0435\u0442\u043E\u043A \u043F\u0440\u0438\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0442, \u043D\u043E \u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0438\u0445 \u0433\u0440\u0430\u043D\u0438\u0446 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0430."}/></p>}/>
        <LocalizedUi value={summary.researchSourceVerified && <p role="status"><LocalizedUi value={"SHA-256 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u0445 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 DICOM-\u0441\u0440\u0435\u0437\u043E\u0432 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u044B \u043F\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u043E\u043C\u0443 \u043F\u0430\u0441\u043F\u043E\u0440\u0442\u0443."}/></p>}/>
        <small><LocalizedUi value={"SHA-256 \u043C\u0430\u0441\u043A\u0438 \u0438 \u0447\u0438\u0441\u043B\u043E \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u044E\u0442 \u0441 \u043F\u0430\u0441\u043F\u043E\u0440\u0442\u043E\u043C. JSON \u043D\u0435 \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D; SHA \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0435 \u0442\u0435\u043A\u0443\u0449\u0438\u0445 \u0444\u0430\u0439\u043B\u043E\u0432 \u0441 \u0437\u0430\u044F\u0432\u043B\u0435\u043D\u043D\u044B\u043C \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u043E\u043C, \u043D\u043E \u043D\u0435 \u0443\u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u044F\u0435\u0442 \u0430\u0432\u0442\u043E\u0440\u0430, \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0430, \u043C\u043E\u0434\u0435\u043B\u044C \u0438\u043B\u0438 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0443\u044E \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u044C. \u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u0440\u0435\u0436\u0438\u043C."}/></small>
      </details>}/>
      <LocalizedUi value={summary.research && summary.researchRegions && <section className="ora-mask-settings" aria-label={__ui("\u041D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044F \u043F\u043E \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0438\u043C \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0430\u043C")}>
        <h3><LocalizedUi value={"\u041D\u0430\u0439\u0434\u0435\u043D\u043D\u044B\u0435 \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u044B \u00B7 \u043E\u0431\u0437\u043E\u0440 \u043D\u0430 MPR"}/></h3>
        <p><LocalizedUi value={"\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0443, \u0447\u0442\u043E\u0431\u044B \u043F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u0437\u0430\u043D\u044F\u0442\u043E\u043C\u0443 \u0435\u044E \u0432\u043E\u043A\u0441\u0435\u043B\u044E \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u0430\u0445. \u0422\u043E\u0447\u043A\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u0430 \u043F\u043E \u0446\u0435\u043D\u0442\u0440\u0443 \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0438, \u0430 \u043D\u0435 \u043F\u043E \u043F\u043E\u0434\u043E\u0437\u0440\u0435\u043D\u0438\u044E \u043D\u0430 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u044E."}/></p>
        <ul><LocalizedUi value={summary.researchRegions.map(region => <li key={region.id}>
          <strong><LocalizedUi value={region.name}/></strong> · <LocalizedUi value={region.voxels.toLocaleString("ru-RU")}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439 \u00B7"}/><LocalizedUi value={region.volumeMl.toFixed(2)}/><LocalizedUi value={"\u043C\u043B \u0432 \u043F\u0440\u0435\u0434\u0435\u043B\u0430\u0445 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u043E\u0433\u043E \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442\u0430 \u00B7 \u0441\u0440\u0435\u0437\u044B"}/><LocalizedUi value={region.originalSliceRange[0]}/>–<LocalizedUi value={region.originalSliceRange[1]}/>
          <LocalizedUi value={" "}/><button type="button" disabled={!ready || busy} onClick={() => {
                        try {
                            callbacks.current.onNavigatePoint(region.anchorLpsMm);
                            change({ ...display, visible: true, label: region.id });
                        }
                        catch (cause) {
                            setError(cause instanceof Error ? cause.message : "Не удалось открыть долю в MPR.");
                        }
                    }}><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0443 \u0432 MPR"}/></button>
        </li>)}/></ul>
        <small><LocalizedUi value={"\u041E\u0431\u044A\u0451\u043C\u044B \u043E\u0442\u043D\u043E\u0441\u044F\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043A \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u043D\u044B\u043C \u0441\u0440\u0435\u0437\u0430\u043C. \u0413\u0440\u0430\u043D\u0438\u0446\u044B \u0438 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u044E \u0434\u043E\u043B\u0436\u0435\u043D \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0432\u0440\u0430\u0447;"}/></small>
        <small><LocalizedUi value={"\u043D\u0430\u0432\u0438\u0433\u0430\u0446\u0438\u044F \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0443\u044E \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u044C \u0438\u043B\u0438 \u043F\u043E\u043B\u043D\u044B\u0439 \u043E\u0445\u0432\u0430\u0442 \u043E\u0440\u0433\u0430\u043D\u0430. \u0414\u043B\u044F MSD Task09 \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u044D\u0442\u0430\u043B\u043E\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u0441\u0435\u043B\u0435\u0437\u0451\u043D\u043A\u0438; \u0435\u0433\u043E Dice \u043D\u0435 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u043A \u0434\u0430\u043D\u043D\u043E\u043C\u0443 \u0444\u0430\u0439\u043B\u0443 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438."}/></small>
      </section>}/>
      <LocalizedUi value={summary.result ? <details className="ora-mask-provenance">
        <summary><LocalizedUi value={"\u0421\u0443\u043C\u043C\u044B \u0441\u043E\u0432\u043F\u0430\u043B\u0438 \u00B7"}/><LocalizedUi value={summary.result.model.id}/><LocalizedUi value={"\u00B7 \u0441\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u043E \u043C\u043E\u0434\u0435\u043B\u0438"}/></summary>
        <p><LocalizedUi value={"\u0417\u0430\u044F\u0432\u043B\u0435\u043D\u043D\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C:"}/><LocalizedUi value={summary.result.model.id}/> · <LocalizedUi value={summary.result.model.version}/><LocalizedUi value={". \u0417\u0430\u0434\u0430\u0447\u0430:"}/><LocalizedUi value={summary.result.model.task}/>.</p>
        <small><LocalizedUi value={"\u0417\u0430\u043F\u0440\u043E\u0441:"}/><LocalizedUi value={summary.result.requestId}/><br /><LocalizedUi value={"SHA-256 \u0432\u0435\u0441\u043E\u0432:"}/><LocalizedUi value={summary.result.model.weightsSha256}/></small>
        <LocalizedUi value={summary.result.limitations.length > 0 && <ul><LocalizedUi value={summary.result.limitations.map((s, i) => <li key={i}><LocalizedUi value={s}/></li>)}/></ul>}/>
        <small><LocalizedUi value={"\u041F\u0430\u0441\u043F\u043E\u0440\u0442 \u043D\u0435 \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D. \u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u044B\u0435 \u0441\u0443\u043C\u043C\u044B \u043D\u0435 \u0443\u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u044F\u044E\u0442 \u0430\u0432\u0442\u043E\u0440\u0430 \u043C\u043E\u0434\u0435\u043B\u0438, \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0443\u044E \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u044C \u0438\u043B\u0438 \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u043C\u043E\u0441\u0442\u044C \u043A \u043F\u043E\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u0438."}/></small>
      </details> : !summary.research && <p className="ora-mask-binding-note"><LocalizedUi value={"\u041F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u044F. \u0421\u0432\u044F\u0437\u044C \u0441 \u043F\u0430\u043A\u0435\u0442\u043E\u043C \u0441\u0435\u0440\u0438\u0438 \u0438 \u0441\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u043E \u043C\u043E\u0434\u0435\u043B\u0438 \u043D\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u044B."}/></p>}/>
      <LocalizedUi value={summary.labels.length ? <>
        <div className="ora-mask-settings">
          <label className="ora-mask-visible"><input type="checkbox" checked={display.visible} onChange={event => change({ ...display, visible: event.target.checked })}/><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043D\u0430 MPR"}/></label>
          <label><LocalizedUi value={"\u041C\u0435\u0442\u043A\u0430"}/><select value={display.label ?? "all"} onChange={event => change({ ...display, label: event.target.value === "all" ? null : Number(event.target.value) })}>
            <option value="all"><LocalizedUi value={"\u0412\u0441\u0435 \u043C\u0435\u0442\u043A\u0438"}/></option>
            <LocalizedUi value={summary.labels.map(l => <option value={l.id} key={l.id}><LocalizedUi value={"\u041C\u0435\u0442\u043A\u0430"}/><LocalizedUi value={l.id}/><LocalizedUi value={summary.result ? ` · ${summary.result.labels.find(item => item.id === l.id)?.name}` : summary.research ? ` · ${summary.research.labelNames[l.id]}` : ""}/> · <LocalizedUi value={l.voxels.toLocaleString("ru-RU")}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439"}/></option>)}/>
          </select></label>
          <label><LocalizedUi value={"\u041D\u0435\u043F\u0440\u043E\u0437\u0440\u0430\u0447\u043D\u043E\u0441\u0442\u044C:"}/><LocalizedUi value={Math.round(display.opacity * 100)}/>%<input type="range" min="0" max="80" value={Math.round(display.opacity * 100)} onChange={event => change({ ...display, opacity: Number(event.target.value) / 100 })}/></label>
        </div>
        <p className="ora-mask-quantification"><LocalizedUi value={selected && <i aria-hidden="true" style={{ background: `rgb(${maskColor(selected.id).join(",")})` }}/>}/><LocalizedUi value={selected ? (summary?.research?.labelNames[selected.id] ?? `Метка ${selected.id}`) : "Все метки"}/>: <LocalizedUi value={voxels.toLocaleString("ru-RU")}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439 \u00B7 \u043E\u0431\u044A\u0451\u043C \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0438 \u2248"}/><LocalizedUi value={volumeMl.toFixed(3)}/><LocalizedUi value={"\u043C\u043B."}/></p>
        <small><LocalizedUi value={"\u041E\u0431\u044A\u0451\u043C \u0440\u0430\u0441\u0441\u0447\u0438\u0442\u0430\u043D \u043F\u043E \u043C\u0435\u0442\u043A\u0430\u043C \u0438 \u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u0438 \u043C\u0430\u0441\u043A\u0438; \u044D\u0442\u043E \u043D\u0435 \u043E\u0446\u0435\u043D\u043A\u0430 \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u0438 \u043C\u043E\u0434\u0435\u043B\u0438. \u041D\u0430\u0437\u0432\u0430\u043D\u0438\u044F \u0438\u0437 \u043F\u0430\u0441\u043F\u043E\u0440\u0442\u0430 \u0437\u0430\u044F\u0432\u043B\u0435\u043D\u044B \u043F\u043E\u0441\u0442\u0430\u0432\u0449\u0438\u043A\u043E\u043C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430. \u041C\u0430\u0441\u043A\u0430 \u043E\u0442\u043E\u0431\u0440\u0430\u0436\u0430\u0435\u0442\u0441\u044F \u043F\u043E\u0432\u0435\u0440\u0445 MPR, \u0431\u0435\u0437 3D-\u043F\u043E\u0432\u0435\u0440\u0445\u043D\u043E\u0441\u0442\u0435\u0439."}/></small>
      </> : <p><LocalizedUi value={"\u041C\u0430\u0441\u043A\u0430 \u043D\u0435 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u043D\u0435\u043D\u0443\u043B\u0435\u0432\u044B\u0445 \u043C\u0435\u0442\u043E\u043A. \u042D\u0442\u043E \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0445 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439."}/></p>}/>
    </>}/>
    <LocalizedUi value={summary?.evidence?.producer.model.id === "lungmask-R231" &&
            summary.evidence.producer.executionMode === "local" && onQuantifyLaa950 &&
            <details className="ora-lung-laa950">
        <summary><LocalizedUi value={"CPU: LAA\u2212950 \u0432 \u043C\u0430\u0441\u043A\u0435 R231 \u00B7 \u0442\u043E\u043B\u044C\u043A\u043E \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442 \u041A\u0422"}/></summary>
        <p><LocalizedUi value={"\u041F\u043E\u0434\u0441\u0447\u0451\u0442 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0438\u0445 \u0434\u0435\u043A\u043E\u0434\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u041A\u0422-\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439 \u2264\u2212950 HU \u0432\u043D\u0443\u0442\u0440\u0438 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u0438 R231. \u041C\u043E\u0434\u0435\u043B\u044C \u043D\u0435 \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u0440\u0443\u0435\u0442 \u044D\u043C\u0444\u0438\u0437\u0435\u043C\u0443 \u0438\u043B\u0438 \u0425\u041E\u0411\u041B. \u041F\u043E\u043B\u043D\u043E\u0442\u0430 \u043E\u0431\u043E\u0438\u0445 \u043B\u0451\u0433\u043A\u0438\u0445 \u043D\u0435 \u0434\u043E\u043A\u0430\u0437\u0430\u043D\u0430; \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u0437\u0430\u0432\u0438\u0441\u044F\u0442 \u043E\u0442 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u0430 \u041A\u0422."}/></p>
        <label><input type="checkbox" checked={laaConfirmed} disabled={laaBusy} onChange={e => { setLaaConfirmed(e.target.checked); setLaaResult(null); callbacks.current.onLaa950Change?.(null); }}/><LocalizedUi value={"\u042F \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u043B \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0435 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435: \u0438\u043D\u0441\u043F\u0438\u0440\u0430\u0442\u043E\u0440\u043D\u0430\u044F \u041A\u0422 \u0431\u0435\u0437 \u0432\u043D\u0443\u0442\u0440\u0438\u0432\u0435\u043D\u043D\u043E\u0433\u043E \u043A\u043E\u043D\u0442\u0440\u0430\u0441\u0442\u0430, \u0440\u0435\u043A\u043E\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u044F \u043F\u043E\u0434\u0445\u043E\u0434\u0438\u0442 \u0434\u043B\u044F \u0434\u0435\u043D\u0441\u0438\u0442\u043E\u043C\u0435\u0442\u0440\u0438\u0438; \u043F\u043E\u043D\u0438\u043C\u0430\u044E, \u0447\u0442\u043E \u0432\u044B\u0431\u043E\u0440\u043A\u0430 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u043D\u0435\u043F\u043E\u043B\u043D\u043E\u0439."}/></label>
        <div className="ora-mask-actions">
          <button type="button" disabled={!laaConfirmed || !ready || laaBusy || busy} onClick={() => void quantifyLaa()}>
            <LocalizedUi value={laaBusy ? "Идёт подсчёт HU…" : "Измерить LAA−950 локально на CPU"}/>
          </button>
          <LocalizedUi value={laaBusy && <button type="button" onClick={() => laaController.current?.abort()}><LocalizedUi value={"\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C"}/></button>}/>
        </div>
        <LocalizedUi value={laaError && <p role="alert" className="ora-mask-error"><LocalizedUi value={laaError}/></p>}/>
        <LocalizedUi value={laaResult && <div role="status">
          <p><strong><LocalizedUi value={"\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u043D\u043E\u043C\u0443 \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442\u0443:"}/></strong>
            <LocalizedUi value={" "}/><LocalizedUi value={laaResult.totalMaskLowAttenuationPct.toFixed(2)}/><LocalizedUi value={"% \u043C\u0430\u0441\u043A\u0438 \u0438\u043C\u0435\u044E\u0442 \u043F\u043B\u043E\u0442\u043D\u043E\u0441\u0442\u044C \u2264\u2212950 HU. \u041D\u0435 \u044D\u043A\u0441\u0442\u0440\u0430\u043F\u043E\u043B\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043D\u0430 \u043B\u0451\u0433\u043A\u0438\u0435 \u0446\u0435\u043B\u0438\u043A\u043E\u043C."}/></p>
          <ul><LocalizedUi value={laaResult.lungs.map(x => <li key={x.label}>
            <LocalizedUi value={x.anatomy === "right" ? "Правое лёгкое" : "Левое лёгкое"}/>:
            <LocalizedUi value={" "}/><LocalizedUi value={x.lowAttenuationPctOfSampledMask.toFixed(2)}/>%,
            <LocalizedUi value={" "}/><LocalizedUi value={x.lowAttenuationVolumeMl.toFixed(2)}/><LocalizedUi value={"\u043C\u043B \u0438\u0437"}/><LocalizedUi value={x.maskVolumeMl.toFixed(2)}/><LocalizedUi value={"\u043C\u043B \u043C\u0430\u0441\u043A\u0438 ("}/><LocalizedUi value={x.maskVoxelCount.toLocaleString("ru-RU")}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439)"}/></li>)}/></ul>
          <small><LocalizedUi value={"\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u043F\u043E\u043B\u043D\u043E\u0446\u0435\u043D\u043D\u043E\u0441\u0442\u044C \u041A\u0422 \u0438 \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u044C HU-\u0442\u0440\u0430\u043D\u0441\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u0438. \u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043D\u0438\u0437\u043A\u043E\u043F\u043B\u043E\u0442\u043D\u044B\u0445 \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439 \u0432 \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442\u0435 \u043D\u0435 \u0438\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u0431\u043E\u043B\u0435\u0437\u043D\u044C. \u0420\u0430\u0441\u0447\u0451\u0442 \u043F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439, \u043D\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u044F\u0435\u0442 \u0432\u044B\u0437\u043E\u0432\u043E\u0432 Gemini/Opus."}/></small>
        </div>}/>
      </details>}/>
    <LocalizedUi value={summary?.evidence && <SegmentationEvidenceReview key={summary.evidenceRevision} evidence={summary.evidence} onSampleMask={onSampleMask} onNavigate={(point, labelId) => {
                callbacks.current.onNavigatePoint(point);
                change({ ...display, visible: true, label: labelId });
            }}/>}/>
    <details className="ora-analysis-package">
      <summary><LocalizedUi value={"\u0414\u043B\u044F \u0441\u043F\u0435\u0446\u0438\u0430\u043B\u0438\u0441\u0442\u0430: \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C \u0441\u0435\u0440\u0438\u044E \u0432\u043E \u0432\u043D\u0435\u0448\u043D\u0435\u0439 \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0435"}/></summary>
      <p><LocalizedUi value={"\u042D\u0442\u043E \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0440\u0443\u0447\u043D\u043E\u0439 \u0441\u043F\u043E\u0441\u043E\u0431 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0438, \u0430 \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0448\u0430\u0433 \u0430\u043D\u0430\u043B\u0438\u0437\u0430. \u0421\u043A\u0430\u0447\u0430\u0439\u0442\u0435 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u0441\u0435\u0440\u0438\u0438 (.nii) \u0438 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0435\u0433\u043E \u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u0438 (.json), \u043F\u0435\u0440\u0435\u0434\u0430\u0439\u0442\u0435 \u0438\u0445 \u0441\u043F\u0435\u0446\u0438\u0430\u043B\u0438\u0441\u0442\u0443, \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442 \u0441\u043E\u0432\u043C\u0435\u0441\u0442\u0438\u043C\u0443\u044E \u043C\u043E\u0434\u0435\u043B\u044C. \u041F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0441\u0430\u043C\u043E \u043D\u0438\u043A\u0443\u0434\u0430 \u044D\u0442\u0438 \u0444\u0430\u0439\u043B\u044B \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442."}/></p>
      <small><LocalizedUi value={"\u0412 \u043F\u0430\u043A\u0435\u0442 \u0432\u0445\u043E\u0434\u0438\u0442 \u043E\u0434\u043D\u0430 \u0441\u0435\u0440\u0438\u044F. \u041F\u043E\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0438 \u043F\u043E\u043B\u043D\u043E\u0442\u0430 \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u043F\u043E\u043A\u0440\u044B\u0442\u0438\u044F \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u044B. \u0418\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u043C\u043E\u0436\u0435\u0442 \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u0438\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u0443\u044E\u0449\u0443\u044E \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044E; \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0435 DICOM-\u0442\u0435\u0433\u043E\u0432 \u043D\u0435 \u0433\u0430\u0440\u0430\u043D\u0442\u0438\u0440\u0443\u0435\u0442 \u043E\u0431\u0435\u0437\u043B\u0438\u0447\u0438\u0432\u0430\u043D\u0438\u044F."}/></small>
      <div className="ora-mask-actions">
        <button type="button" disabled={!ready || busy || exportBusy || workerBusy} onClick={() => void prepare()}><LocalizedUi value={exportBusy ? "Подготовка объёма…" : packet ? "Подготовить новый пакет" : "Подготовить пакет серии"}/></button>
        <LocalizedUi value={exportBusy && <button type="button" onClick={() => {
                version.current++;
                preparation.current?.abort();
                preparation.current = null;
                setExportBusy(false);
            }}><LocalizedUi value={"\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0443"}/></button>}/>
      </div>
      <LocalizedUi value={exportError && <p className="ora-package-error" role="alert"><LocalizedUi value={exportError}/></p>}/>
      <LocalizedUi value={packet && <>
        <p className="ora-package-ready" role="status"><LocalizedUi value={"\u041F\u0430\u043A\u0435\u0442 \u0433\u043E\u0442\u043E\u0432 \u00B7"}/><LocalizedUi value={packet.request.frameCount}/><LocalizedUi value={"\u043A\u0430\u0434\u0440\u043E\u0432 \u00B7"}/><LocalizedUi value={packet.request.geometry.dimensions.join(" × ")}/> · <LocalizedUi value={packet.request.modality}/></p>
        <div className="ora-package-downloads">
          <a href={packet.volumeUrl} download={`opus-${packet.request.requestId}_0000.nii`}><LocalizedUi value={"\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u0441\u0435\u0440\u0438\u0438 (.nii)"}/></a>
          <a href={packet.manifestUrl} download={`opus-${packet.request.requestId}.request.json`}><LocalizedUi value={"\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0441\u0435\u0440\u0438\u0438 (.json)"}/></a>
        </div>
        <details className="ora-offline-model-instructions">
          <summary><LocalizedUi value={"\u041D\u0430\u0441\u0442\u043E\u044F\u0449\u0438\u0439 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 AI \u043D\u0430 Mac \u00B7 ONNX \u00B7 \u0431\u0435\u0437 \u043E\u0431\u043B\u0430\u043A\u0430"}/></summary>
          <p><LocalizedUi value={"\u041E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u043E\u0444\u043B\u0430\u0439\u043D-\u043C\u043E\u0434\u0443\u043B\u044C v1.9 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u0443\u044E \u043D\u0430 Mac \u043C\u043E\u0434\u0435\u043B\u044C \u043D\u0430 \u041A\u0422/\u041C\u0420\u0422-\u0441\u0435\u0440\u0438\u0438, \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u043C\u043E\u0439 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u043C ONNX-\u0447\u0435\u043A\u043F\u043E\u0439\u043D\u0442\u043E\u043C. OpenRouter \u043D\u0435 \u0432\u044B\u0437\u044B\u0432\u0430\u0435\u0442\u0441\u044F. \u041F\u043E\u043A\u0430 \u043D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u044B \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0435 \u0432\u0435\u0441\u0430 \u0438 \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u043C\u043E\u0434\u0435\u043B\u0438."}/></p>
          <p><LocalizedUi value={"\u0421\u043A\u0430\u0447\u0430\u0439\u0442\u0435 \u043E\u0431\u0430 \u0444\u0430\u0439\u043B\u0430 \u0432\u044B\u0448\u0435, \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0435 Python \u0438 ONNX Runtime \u0441\u043E\u0433\u043B\u0430\u0441\u043D\u043E"}/><a href="https://github.com/vasiliys961/opus-radiology-ai/blob/main/docs/LOCAL_ONNX_AI.md" target="_blank" rel="noreferrer"><LocalizedUi value={"\u0440\u0443\u043A\u043E\u0432\u043E\u0434\u0441\u0442\u0432\u0443"}/></a><LocalizedUi value={". \u041C\u043E\u0434\u0435\u043B\u044C \u0438 \u0435\u0451 \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u0434\u043E\u043B\u0436\u043D\u044B \u043D\u0430\u0445\u043E\u0434\u0438\u0442\u044C\u0441\u044F \u0432"}/><code>~/Models/Opus</code>.</p>
          <pre><LocalizedUi value={localOnnxCommand}/></pre>
          <button type="button" onClick={() => {
                void navigator.clipboard.writeText(localOnnxCommand).then(() => setLocalCommandCopied(true), () => setLocalCommandCopied(false));
            }}><LocalizedUi value={localCommandCopied ? "Команда скопирована" : "Скопировать команду для Cursor"}/></button>
          <p><LocalizedUi value={"\u041F\u043E\u0441\u043B\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u00AB\u0418\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043C\u043E\u0434\u0435\u043B\u0438\u00BB \u0438 \u043E\u0434\u043D\u043E\u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E \u0434\u0432\u0430 \u043D\u043E\u0432\u044B\u0445 \u0444\u0430\u0439\u043B\u0430"}/><code>.mask.nii</code><LocalizedUi value={"\u0438"}/><code>.result.json</code><LocalizedUi value={". \u0412\u0440\u0430\u0447 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442 \u043C\u0430\u0441\u043A\u0443 \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u0430\u0445; \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043C\u0435\u0442\u043E\u043A \u043D\u0435 \u0434\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u0442 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u0431\u043E\u043B\u0435\u0437\u043D\u0438."}/></p>
        </details>
        <small><LocalizedUi value={"\u0417\u0430\u043F\u0440\u043E\u0441:"}/><LocalizedUi value={packet.request.requestId}/><LocalizedUi value={". \u0414\u043B\u044F \u0438\u043C\u043F\u043E\u0440\u0442\u0430 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0432\u043C\u0435\u0441\u0442\u0435 \u043C\u0430\u0441\u043A\u0443 \u0438 \u043F\u0430\u0441\u043F\u043E\u0440\u0442 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430 \u044D\u0442\u043E\u0433\u043E \u043F\u0430\u043A\u0435\u0442\u0430."}/></small>
        <div className="ora-mask-actions"><button type="button" disabled={busy || exportBusy || workerBusy || !ready} onClick={() => resultInput.current?.click()}><LocalizedUi value={"\u0418\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043C\u043E\u0434\u0435\u043B\u0438"}/></button></div>
        <input ref={resultInput} type="file" accept=".json,.nii,.nii.gz" multiple hidden onChange={event => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (files.length && ready)
                    void loadResult(files);
            }}/>
      </>}/>
    </details>
  </section>;
}
