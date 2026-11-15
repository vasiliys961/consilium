"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useConciliumViewerCopy } from "./ConciliumBridge";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DicomSeries } from "../lib/dicom-series";
import { planNativeStudyAnalysis } from "../lib/unified-study-dispatch";
import { canUseVisionOnlyAsPrimary, canAutoPrepareLocalVision } from "../lib/automatic-primary-series";
import { assessAutomaticBrainFlair } from "../lib/automatic-brain-flair";
import { verifyRenalThreePhaseStudy, type RenalPhaseRole } from "../lib/renal-three-phase-gate";
import { runRenalMonaiThreePhase, type RenalMonaiResult } from "../lib/renal-monai-direct";
import { prepareDicomMonaiFile, prepareDicomCtForPathology } from "../lib/dicom-monai-direct";
import { runOriginalAbdominalModels, checkAutomaticAbdomenReady, type AbdominalStudyResults } from "../lib/real-abdominal-worker";
import { executeRealNodule, checkAutomaticMonaiExecutor, type AutomaticMonaiStatus } from "../lib/live-nodule-worker";
import type { BoundNoduleReport } from "../lib/live-nodule-report";
import { runOriginalEffusionTask315, checkAutomaticEffusionReady, type OriginalEffusionRun } from "../lib/real-effusion-worker";
import { executeOriginalPeCtp, checkAutomaticPeReady, type PeCtpSourceReport } from "../lib/pe-ctpa-direct-worker";
import { runOriginalRaidionicsNodes, checkAutomaticNodesReady, type MediastinalNodeReport } from "../lib/mediastinal-raidionics-worker";
import { runPublicIchWorker, checkAutomaticIchReady } from "../lib/public-ich-worker";
import { call, type WorkerSession } from "../lib/local-worker";
import { bindWmhToSelectedDicom, type BoundWmh } from "../lib/wmh-source-review";
import type { EvidenceJson } from "../lib/evidence-json";
import { createNativePhysicianDraft, type NativeDicomDigest } from "../lib/native-physician-draft";
import { prepareNativeBrainMr } from "../lib/brain-native-mr-dicom";
import { executeOriginalBrain, checkAutomaticBrainReady, BRAIN_ROLES, type BrainTask, type BrainModelReport } from "../lib/brain-multisequence-original-worker";
import DetectorGeminiOpusConsilium from "./DetectorGeminiOpusConsilium";
import type { SanitizedDetectorBundle } from "../lib/detector-consilium-evidence";
import { checkOriginalXrvReady, runCxrXrvFromDicom, XRV_CXR_LABELS, type OriginalXrvCxrResult } from "../lib/xrv-original-cxr";
import CxrIndependentVisionReview from "./CxrIndependentVisionReview";
import OriginalWorkerFleetReadiness from "./OriginalWorkerFleetReadiness";
import { checkAutomaticClnReady, executeOriginalCln, type ClnReport } from "../lib/cln-native-worker";
import ClnOriginalPhysicianReview from "./ClnOriginalPhysicianReview";
import type { ClnVerifiedLocalEvidence } from "../lib/cln-physician-local-review";
import { checkAutomaticLungscapeReady, executeOriginalLungscape, type LungscapeReport } from "../lib/lungscape-native-worker";
/** A single primary action that reuses the real DICOM -> MONAI/ianpan/WMH paths.
 * Never advertises a checkpoint as installed until its private worker proves it.
 * No automatic cloud image transfer; Gemini/Opus require a separate privacy gate.
 */
export default function UnifiedDicomStudyAnalysis({ series, allSeries, files, researchMode = false, onMonaiReady, onNavigate, onDetectorEvidence, onReadyForVision, onClnBoundReady, onAnalysisStage }: {
    series: DicomSeries;
    allSeries: ReadonlyArray<DicomSeries>;
    files: ReadonlyMap<string, File>;
    researchMode?: boolean;
    onMonaiReady: (source: File, session: WorkerSession, completedReport?: BoundNoduleReport) => void;
    onNavigate: (slice: number) => void;
    onDetectorEvidence?: (seriesKey: string, bundle: SanitizedDetectorBundle | null) => void;
    onClnBoundReady?: (seriesKey: string, verified: ClnVerifiedLocalEvidence) => void;
    onReadyForVision?: (seriesKey: string) => void;
    onAnalysisStage?: (seriesKey: string, stage: "running" | "completed" | "vision-only" | "cancelled") => void;
}) {
    const __ui = useUiTranslator();
    const available = useMemo(() => new Set(files.keys()), [files]);
    const viewerCopy = useConciliumViewerCopy();
    const [clinicianConfirmedChest, setClinicianConfirmedChest] = useState(false);
    const confirmableChest = series.modality === "CT" && series.volumeReady && series.spatiallySorted &&
        series.members.length >= 8 && series.members.length <= 300 &&
        series.members.every(m => m.metadata.modality === "CT" &&
            (m.metadata.bodyRegion === "CHEST" || m.metadata.bodyRegion === null) &&
            m.metadata.imageRole !== "LOCALIZER" && !!m.metadata.studyUid &&
            !!m.metadata.seriesUid && !!m.metadata.sopInstanceUid && files.has(m.id) &&
            (m.metadata.numberOfFrames === null || m.metadata.numberOfFrames === 1)) &&
        (series.members.some(m => m.metadata.bodyRegion === null) ||
            series.members.some(m => m.metadata.imageRole === "DERIVED"));
    // Missing coded anatomy can be explicitly reviewed without rewriting original DICOM.
    const sourceSeries = useMemo(() => clinicianConfirmedChest && confirmableChest ? {
        ...series, members: series.members.map(m => ({ ...m, metadata: {
                ...m.metadata, bodyRegion: "CHEST" as const,
            } })),
    } : series, [clinicianConfirmedChest, confirmableChest, series]);
    const clnSourceFiles = useMemo(() => sourceSeries.members.map(m => files.get(m.id))
        .filter((f): f is File => !!f), [sourceSeries, files]);
    const plan = useMemo(() => planNativeStudyAnalysis(sourceSeries, available, {
        clinicianConfirmedChest: clinicianConfirmedChest && confirmableChest,
    }), [sourceSeries, available, clinicianConfirmedChest, confirmableChest]);
    const visionOnlyAvailable = useMemo(() => plan.route === null && canUseVisionOnlyAsPrimary(series, available), [plan.route, series, available]);
    useEffect(() => { setClinicianConfirmedChest(false); }, [series, files]);
    const [renalPhaseRoles, setRenalPhaseRoles] = useState<Partial<Record<RenalPhaseRole, string>>>({});
    const [renalMonaiResult, setRenalMonaiResult] = useState<RenalMonaiResult | null>(null);
    const [renalMonaiIssue, setRenalMonaiIssue] = useState("");
    const renalPhaseGate = useMemo(() => verifyRenalThreePhaseStudy(allSeries, available, renalPhaseRoles), [allSeries, available, renalPhaseRoles]);
    const [endpoint, setEndpoint] = useState("");
    const [token, setToken] = useState("");
    const [autoMonaiReady, setAutoMonaiReady] = useState(false);
    const [autoMonaiChecking, setAutoMonaiChecking] = useState(false);
    const [monaiExecutor, setMonaiExecutor] = useState<AutomaticMonaiStatus | null>(null);
    const [monaiState, setMonaiState] = useState<"idle" | "running" | "completed" | "failed" | "cancelled">("idle");
    const [effusionEndpoint, setEffusionEndpoint] = useState("http://127.0.0.1:8774");
    const [effusionToken, setEffusionToken] = useState("");
    const [autoEffusionReady, setAutoEffusionReady] = useState(false);
    const [autoEffusionChecking, setAutoEffusionChecking] = useState(false);
    const [peEndpoint, setPeEndpoint] = useState("http://127.0.0.1:8776");
    const [peToken, setPeToken] = useState("");
    const [autoPeReady, setAutoPeReady] = useState(false);
    const [autoPeChecking, setAutoPeChecking] = useState(false);
    const [ctpaConfirmed, setCtpaConfirmed] = useState(false);
    const [chestPe, setChestPe] = useState<PeCtpSourceReport | null>(null);
    const [nodeEndpoint, setNodeEndpoint] = useState("http://127.0.0.1:8777");
    const [nodeToken, setNodeToken] = useState("");
    const [autoNodesReady, setAutoNodesReady] = useState(false);
    const [autoNodesChecking, setAutoNodesChecking] = useState(false);
    const [enhancedChestConfirmed, setEnhancedChestConfirmed] = useState(false);
    const [chestNodes, setChestNodes] = useState<MediastinalNodeReport | null>(null);
    const [chestSource, setChestSource] = useState<File | null>(null);
    const [chestNodules, setChestNodules] = useState<BoundNoduleReport | null>(null);
    const [clnReady, setClnReady] = useState(false);
    const [clnChecking, setClnChecking] = useState(false);
    const [chestCln, setChestCln] = useState<ClnReport | null>(null);
    const [lungscapeReady, setLungscapeReady] = useState(false);
    const [lungscapeChecking, setLungscapeChecking] = useState(false);
    const [lungscapeResult, setLungscapeResult] = useState<LungscapeReport | null>(null);
    const [chestEffusion, setChestEffusion] = useState<OriginalEffusionRun | null>(null);
    const [chestIssues, setChestIssues] = useState<string[]>([]);
    const [abdomenResult, setAbdomenResult] = useState<AbdominalStudyResults | null>(null);
    const [ncctVerified, setNcctVerified] = useState(false);
    const [autoAbdomenReady, setAutoAbdomenReady] = useState(false);
    const [autoAbdomenChecking, setAutoAbdomenChecking] = useState(false);
    const [xrvReport, setXrvReport] = useState<OriginalXrvCxrResult | null>(null);
    const [xrvStatus, setXrvStatus] = useState<"checking" | "ready" | "unavailable">("checking");
    const [xrvChestConfirmed, setXrvChestConfirmed] = useState(false);
    const [researchAuthorized, setResearchAuthorized] = useState(false);
    const authorized = !researchMode || researchAuthorized; // Local analysis begins on the doctor's single action.
    // Cloud images remain gated by the signed localhost operator session.
    const [flairConfirmed, setFlairConfirmed] = useState(false);
    const [autoWmhReady, setAutoWmhReady] = useState(false);
    const [autoWmhChecking, setAutoWmhChecking] = useState(false);
    const [sourceUrl, setSourceUrl] = useState("");
    const [sourceLicense, setSourceLicense] = useState("");
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [ich, setIch] = useState<EvidenceJson | null>(null);
    const [autoIchReady, setAutoIchReady] = useState(false);
    const [autoIchChecking, setAutoIchChecking] = useState(false);
    const [wmh, setWmh] = useState<BoundWmh | null>(null);
    const [brainTask, setBrainTask] = useState<"wmh" | BrainTask>("wmh");
    const [autoBrainReady, setAutoBrainReady] = useState(false);
    const [autoBrainChecking, setAutoBrainChecking] = useState(false);
    const [brainSeriesByRole, setBrainSeriesByRole] = useState<Record<string, string>>({});
    const [brainSequenceApproved, setBrainSequenceApproved] = useState(false);
    const [brainResult, setBrainResult] = useState<BrainModelReport | null>(null);
    const [decisions, setDecisions] = useState<Record<string, "accepted" | "rejected">>({});
    const [draftText, setDraftText] = useState("");
    const [exporting, setExporting] = useState(false);
    const serial = useRef(0), active = useRef<AbortController | null>(null);
    const preset = plan.route === "monai-nodules" ? "http://127.0.0.1:8768" :
        plan.route === "ianpan-ich" ? "http://127.0.0.1:8766" :
            plan.route === "totalseg-abdomen" ? "http://127.0.0.1:8775" :
                plan.route === "wmh-flair" && brainTask !== "wmh" ? "http://127.0.0.1:8778" : "http://127.0.0.1:8772";
    const compatibleBrainSeries = useMemo(() => {
        if (plan.route !== "wmh-flair")
            return [];
        const study = series.members[0]?.metadata.studyUid;
        const frame = series.members[0]?.metadata.frameOfReferenceUid;
        if (!study || !frame)
            return [];
        return allSeries.filter(s => s.modality === "MR" && s.volumeReady && s.spatiallySorted &&
            s.members.length >= 8 && s.members.length <= 300 &&
            s.members.every(m => m.metadata.bodyRegion === "HEAD" &&
                m.metadata.studyUid === study && m.metadata.frameOfReferenceUid === frame &&
                m.metadata.imageRole !== "DERIVED" && m.metadata.imageRole !== "LOCALIZER" && files.has(m.id)));
    }, [allSeries, files, plan.route, series]);
    const assignedBrainRoles = brainTask === "wmh" ? [] : BRAIN_ROLES[brainTask];
    const brainAssignedReady = brainTask !== "wmh" &&
        assignedBrainRoles.every(role => !!brainSeriesByRole[role] &&
            compatibleBrainSeries.some(s => s.key === brainSeriesByRole[role])) &&
        new Set(assignedBrainRoles.map(role => brainSeriesByRole[role])).size === assignedBrainRoles.length;
    useEffect(() => {
        serial.current++;
        active.current?.abort();
        setEndpoint(preset);
        setToken("");
        setEffusionEndpoint("http://127.0.0.1:8774");
        setEffusionToken("");
        setPeEndpoint("http://127.0.0.1:8776");
        setPeToken("");
        setCtpaConfirmed(false);
        setChestPe(null);
        setNodeEndpoint("http://127.0.0.1:8777");
        setNodeToken("");
        setEnhancedChestConfirmed(false);
        setChestNodes(null);
        setChestSource(null);
        setChestNodules(null);
        setChestCln(null);
        setLungscapeResult(null);
        setChestEffusion(null);
        setChestPe(null);
        setChestNodes(null);
        setChestIssues([]);
        setAbdomenResult(null);
        setNcctVerified(false);
        setXrvReport(null);
        setXrvChestConfirmed(false);
        setResearchAuthorized(false);
        setFlairConfirmed(false);
        setSourceUrl("");
        setSourceLicense("");
        setBusy(false);
        setError("");
        setStatus("");
        setIch(null);
        setWmh(null);
        setBrainResult(null);
        setDecisions({});
        setDraftText("");
        setExporting(false);
        setMonaiState("idle");
        return () => { serial.current++; active.current?.abort(); };
    }, [series, files, preset]);
    const chestPlan = plan.route === "monai-nodules";
    useEffect(() => {
        if (plan.route !== "wmh-flair" || brainTask === "wmh")
            return;
        const controller = new AbortController();
        const probeSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
        setAutoBrainReady(false);
        setAutoBrainChecking(true);
        void checkAutomaticBrainReady(brainTask, probeSignal).then(v => {
            if (!controller.signal.aborted)
                setAutoBrainReady(v);
        }).catch(() => {
            if (!controller.signal.aborted)
                setAutoBrainReady(false);
        })
            .finally(() => {
            if (!controller.signal.aborted)
                setAutoBrainChecking(false);
        });
        return () => controller.abort();
    }, [plan.route, brainTask, series.key]);
    useEffect(() => {
        if (plan.route !== "wmh-flair")
            return;
        const controller = new AbortController();
        const probeSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
        setAutoWmhReady(false);
        setAutoWmhChecking(true);
        void fetch("/api/local-wmh", { signal: probeSignal, credentials: "same-origin", cache: "no-store" })
            .then(r => r.ok ? r.json() : null).then(c => {
            if (!controller.signal.aborted)
                setAutoWmhReady(!!c && c.schema === "opus-direct-wmh-worker/v1" && c.originalModelReady === true && c.imageUpload === true && c.patientMode === false && c.dataPolicy === "approved-public-research-only" && c.modelVersion === "1.6.0");
        }).catch(() => {
            if (!controller.signal.aborted)
                setAutoWmhReady(false);
        })
            .finally(() => {
            if (!controller.signal.aborted)
                setAutoWmhChecking(false);
        });
        return () => controller.abort();
    }, [plan.route, series.key]);
    useEffect(() => {
        if (!chestPlan)
            return;
        const controller = new AbortController();
        const probeSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
        setLungscapeReady(false);
        setLungscapeChecking(true);
        void checkAutomaticLungscapeReady(probeSignal).then(ok => {
            if (!controller.signal.aborted)
                setLungscapeReady(ok);
        })
            .catch(() => {
            if (!controller.signal.aborted)
                setLungscapeReady(false);
        })
            .finally(() => {
            if (!controller.signal.aborted)
                setLungscapeChecking(false);
        });
        setClnReady(false);
        setClnChecking(true);
        void checkAutomaticClnReady(probeSignal).then(ok => {
            if (!controller.signal.aborted)
                setClnReady(ok);
        })
            .catch(() => {
            if (!controller.signal.aborted)
                setClnReady(false);
        })
            .finally(() => {
            if (!controller.signal.aborted)
                setClnChecking(false);
        });
        setAutoMonaiChecking(true);
        setAutoMonaiReady(false);
        setMonaiExecutor(null);
        void checkAutomaticMonaiExecutor(probeSignal).then(result => {
            if (!controller.signal.aborted) {
                setAutoMonaiReady(result.ready);
                setMonaiExecutor(result);
            }
        }).catch(() => {
            if (!controller.signal.aborted)
                setAutoMonaiReady(false);
        })
            .finally(() => {
            if (!controller.signal.aborted)
                setAutoMonaiChecking(false);
        });
        setAutoNodesChecking(true);
        setAutoNodesReady(false);
        void checkAutomaticNodesReady(probeSignal).then(ok => {
            if (!controller.signal.aborted)
                setAutoNodesReady(ok);
        }).catch(() => {
            if (!controller.signal.aborted)
                setAutoNodesReady(false);
        })
            .finally(() => {
            if (!controller.signal.aborted)
                setAutoNodesChecking(false);
        });
        setAutoPeChecking(true);
        setAutoPeReady(false);
        void checkAutomaticPeReady(probeSignal).then(ok => {
            if (!controller.signal.aborted)
                setAutoPeReady(ok);
        }).catch(() => {
            if (!controller.signal.aborted)
                setAutoPeReady(false);
        })
            .finally(() => {
            if (!controller.signal.aborted)
                setAutoPeChecking(false);
        });
        setAutoEffusionChecking(true);
        setAutoEffusionReady(false);
        void checkAutomaticEffusionReady(probeSignal).then(ok => {
            if (!controller.signal.aborted)
                setAutoEffusionReady(ok);
        }).catch(() => {
            if (!controller.signal.aborted)
                setAutoEffusionReady(false);
        })
            .finally(() => {
            if (!controller.signal.aborted)
                setAutoEffusionChecking(false);
        });
        return () => controller.abort();
    }, [chestPlan, series.key]);
    useEffect(() => {
        if (plan.route !== "ianpan-ich")
            return;
        const controller = new AbortController();
        const probeSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
        setAutoIchReady(false);
        setAutoIchChecking(true);
        void checkAutomaticIchReady(probeSignal).then(ok => {
            if (!controller.signal.aborted)
                setAutoIchReady(ok);
        }).catch(() => {
            if (!controller.signal.aborted)
                setAutoIchReady(false);
        })
            .finally(() => {
            if (!controller.signal.aborted)
                setAutoIchChecking(false);
        });
        return () => controller.abort();
    }, [plan.route, series.key]);
    const xrvPlan = plan.route === "xrv-cxr";
    useEffect(() => {
        if (plan.route !== "totalseg-abdomen")
            return;
        const controller = new AbortController();
        const probeSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
        setAutoAbdomenChecking(true);
        setAutoAbdomenReady(false);
        void checkAutomaticAbdomenReady(probeSignal).then(ready => {
            if (!controller.signal.aborted)
                setAutoAbdomenReady(ready);
        }).catch(() => {
            if (!controller.signal.aborted)
                setAutoAbdomenReady(false);
        })
            .finally(() => {
            if (!controller.signal.aborted)
                setAutoAbdomenChecking(false);
        });
        return () => controller.abort();
    }, [plan.route, series.key]);
    useEffect(() => {
        if (!xrvPlan)
            return;
        const controller = new AbortController();
        const probeSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
        setXrvStatus("checking");
        void checkOriginalXrvReady(probeSignal).then(ok => {
            if (!controller.signal.aborted)
                setXrvStatus(ok ? "ready" : "unavailable");
        }).catch(() => {
            if (!controller.signal.aborted)
                setXrvStatus("unavailable");
        });
        return () => controller.abort();
    }, [xrvPlan, series.key]);
    const autoFlair = useMemo(() => assessAutomaticBrainFlair(series), [series]);
    // Missing or inconsistent MR weighting must not run the WMH model.
    // Keep the native source-bound, consent-gated Vision pathway available.
    const brainVisionOnly = plan.route === "wmh-flair" && brainTask === "wmh" &&
        canAutoPrepareLocalVision(series) &&
        ((!flairConfirmed && !autoFlair.eligible) || (!autoWmhReady && !token.trim()) ||
            (!researchMode && (!sourceUrl.startsWith("https://") || !sourceLicense.trim())));
    const readinessChecksPending = chestPlan ?
        (clnChecking || lungscapeChecking || autoMonaiChecking || autoEffusionChecking || autoPeChecking || autoNodesChecking) :
        plan.route === "totalseg-abdomen" ? autoAbdomenChecking :
            plan.route === "ianpan-ich" ? autoIchChecking :
                plan.route === "wmh-flair" ? (brainTask === "wmh" ? autoWmhChecking : autoBrainChecking) : false;
    const ready = (!!plan.route || visionOnlyAvailable) && authorized && !busy && !readinessChecksPending &&
        ((visionOnlyAvailable || brainVisionOnly) ? true : xrvPlan ? (!researchMode || (xrvStatus === "ready" && xrvChestConfirmed && sourceUrl.startsWith("https://"))) : plan.route === "totalseg-abdomen" ? true : chestPlan ? true :
            (plan.route === "ianpan-ich" ? true :
                plan.route === "wmh-flair" ? true :
                    (!!token && !!endpoint.trim()))) &&
        (!plan.needsExplicitFlair || brainVisionOnly || (!researchMode && canAutoPrepareLocalVision(series)) || (brainTask === "wmh" ?
            ((flairConfirmed || autoFlair.eligible) && sourceUrl.startsWith("https://") && !!sourceLicense.trim()) :
            (brainSequenceApproved && brainAssignedReady && sourceUrl.startsWith("https://") && !!sourceLicense.trim())));
    async function launch() {
        if (!ready || (!plan.route && !visionOnlyAvailable))
            return;
        if (xrvPlan && !researchMode) {
            onDetectorEvidence?.(series.key, null);
            onAnalysisStage?.(series.key, "vision-only");
            setError("");
            setStatus("Рентгенограмма открыта. Gemini и Opus разбирают снимок; шесть признаков добавляются, если служба рентгена отвечает.");
            onReadyForVision?.(series.key);
            return;
        }
        if (!plan.route) {
            // No original detector is available for this anatomy. Open the same
            // source-bound Vision/OCR/privacy workflow from the primary action.
            // Neither an artificial negative model result nor a provider request
            // is emitted. Paid Gemini/Opus authorization stays in Vision.
            onDetectorEvidence?.(series.key, null);
            onAnalysisStage?.(series.key, "vision-only");
            setError("");
            setStatus(series.modality === "CR" || series.modality === "DX" ?
                "Рентгенограмма открыта. Gemini и Opus разбирают снимок." :
                "Для этой КТ/МРТ оригинальный патологический детектор не назначен. Открыта подготовка кадров Gemini и Opus.");
            onReadyForVision?.(series.key);
            return;
        }
        if (brainVisionOnly) {
            // The generic brain MRI route does not prove FLAIR. Instead of sending a
            // non-FLAIR original DICOM to WMH, open the same independent Vision path.
            onDetectorEvidence?.(series.key, null);
            setError("");
            setStatus(!autoWmhReady && !token.trim() ?
                "Оригинальная WMH-модель недоступна. Открыта независимая подготовка Gemini + Opus; результатов WMH нет." :
                "FLAIR не подтверждена по DICOM TR/TE/TI. WMH не запускалась; открыт независимый просмотр Gemini + Opus с отдельным разрешением передачи.");
            onReadyForVision?.(series.key);
            return;
        }
        const version = ++serial.current;
        active.current?.abort();
        const controller = new AbortController();
        active.current = controller;
        setBusy(true);
        onAnalysisStage?.(series.key, "running");
        setStatus("Проверяем совместимость и доступность настоящей модели...");
        onDetectorEvidence?.(series.key, null);
        setError("");
        setIch(null);
        setWmh(null);
        setBrainResult(null);
        setChestSource(null);
        setChestNodules(null);
        setChestCln(null);
        setLungscapeResult(null);
        setMonaiState("idle");
        setChestEffusion(null);
        setChestPe(null);
        setChestNodes(null);
        setChestIssues([]);
        setAbdomenResult(null);
        setRenalMonaiResult(null);
        setRenalMonaiIssue("");
        setXrvReport(null);
        setDecisions({});
        setDraftText("");
        // Start local source-bound Vision frame planning immediately, in parallel with
        // authenticated original detector inference. This does not authorize external
        // image transfer: pixel/metadata review and paid-provider approval remain separate.
        if (series.modality === "CT" || series.modality === "MR")
            onReadyForVision?.(series.key);
        const session: WorkerSession = { endpoint, token };
        const progress = (message: string) => {
            if (version === serial.current && !controller.signal.aborted)
                setStatus(message);
        };
        try {
            if (plan.route === "xrv-cxr") {
                const original = files.get(series.members[0].id);
                if (!original)
                    throw Error("Исходный рентгеновский DICOM отсутствует.");
                const result = await runCxrXrvFromDicom(original, sourceUrl, authorized && xrvChestConfirmed, controller.signal, progress);
                if (version !== serial.current || controller.signal.aborted)
                    return;
                setXrvReport(result);
                setDraftText("Исследовательская рентгенография: оригинальная NIH DenseNet121 " +
                    "выдала шесть некалиброванных оценок. Требуется независимая " +
                    "оценка исходного изображения врачом, Gemini и Opus.");
                setStatus("Настоящая TorchXRayVision завершена. Шесть модельных NIH-показателей " +
                    "привязаны к исходной рентгенограмме; клиническая точность не подтверждена.");
                return;
            }
            if (plan.route === "monai-nodules") {
                // Recheck at the physician's primary action; a resource shortage during
                // initial study loading must not permanently disable a now-ready worker.
                const monaiNow = await checkAutomaticMonaiExecutor(controller.signal);
                if (version !== serial.current || controller.signal.aborted)
                    return;
                setMonaiExecutor(monaiNow);
                setAutoMonaiReady(monaiNow.ready);
                // One native HU conversion, TWO truly trained pathology tasks.
                // Each worker runs sequentially: no heavy simultaneous RAM pressure.
                const original = series.members.map(m => files.get(m.id));
                if (original.some(f => !f))
                    throw Error("Исходная DICOM-КТ больше недоступна.");
                const chestWorkerAvailable = monaiNow.ready || !!token.trim() || clnReady || lungscapeReady ||
                    autoEffusionReady || !!effusionToken.trim() ||
                    (ctpaConfirmed && (autoPeReady || !!peToken.trim())) ||
                    (enhancedChestConfirmed && (autoNodesReady || !!nodeToken.trim()));
                if (!chestWorkerAvailable) {
                    setStatus("Патологические модели грудной клетки недоступны; детекторы не выполнялись.");
                    setDraftText("Исследовательская КТ грудной клетки. Детекторы не выполнены; отсутствие патологии не установлено.");
                    onReadyForVision?.(series.key);
                    return;
                }
                let nifti: File;
                try {
                    nifti = await prepareDicomMonaiFile(sourceSeries, original as File[], controller.signal, progress);
                }
                catch (cause) {
                    if (controller.signal.aborted || version !== serial.current)
                        return;
                    setStatus("Подготовка КТ для патологических моделей не выполнена; детекторы не запускались.");
                    setError(cause instanceof Error ? cause.message : "Ошибка DICOM→NIfTI");
                    setDraftText("Исследовательская КТ грудной клетки. Детекторы не выполнены; отсутствие патологии не установлено.");
                    onReadyForVision?.(series.key);
                    return;
                }
                if (version !== serial.current || controller.signal.aborted)
                    return;
                setChestSource(nifti);
                const problems: string[] = [];
                let completed = 0;
                if (monaiNow.ready || token.trim()) {
                    try {
                        setMonaiState("running");
                        const result = await executeRealNodule(monaiNow.ready ? null : session, nifti, controller.signal, progress, location => {
                            if (version === serial.current && !controller.signal.aborted)
                                setMonaiExecutor({ ready: true, location, reason: "ready" });
                        });
                        if (version !== serial.current || controller.signal.aborted)
                            return;
                        setChestNodules(result.report);
                        setMonaiState("completed");
                        completed++;
                    }
                    catch (e) {
                        if (version !== serial.current || controller.signal.aborted)
                            return;
                        setMonaiState("failed");
                        problems.push("MONAI узлы: " + (e instanceof Error ? e.message : "исполнитель недоступен"));
                    }
                }
                else
                    problems.push("MONAI узлы: оригинальная модель не доступна на сервере и ручной worker не настроен; не исследовано.");
                if (clnReady) {
                    try {
                        const tumor = await executeOriginalCln(nifti, controller.signal, progress);
                        if (version !== serial.current || controller.signal.aborted)
                            return;
                        // Publish the genuine CLN report immediately. The physician
                        // component separately verifies exact source SHA/geometry and
                        // can rebuild an evicted OPFS source from the ORIGINAL DICOM.
                        // Never block model completion on an unreadable browser File.
                        setChestCln(tumor);
                        completed++;
                    }
                    catch (e) {
                        if (controller.signal.aborted)
                            return;
                        problems.push("CLN опухоль лёгкого: " + (e instanceof Error ? e.message : "недоступен"));
                    }
                }
                else
                    problems.push("CLN опухоли лёгких: оригинальный worker не установлен; не исследовано.");
                if (lungscapeReady) {
                    try {
                        const ild = await executeOriginalLungscape(nifti, controller.signal, progress);
                        if (version !== serial.current || controller.signal.aborted)
                            return;
                        setLungscapeResult(ild);
                        completed++;
                    }
                    catch (e) {
                        if (controller.signal.aborted)
                            return;
                        problems.push("LungSCAPE191 модельные классы: " + (e instanceof Error ? e.message : "недоступен"));
                    }
                }
                else
                    problems.push("LungSCAPE191: оригинальная модель не установлена; ILD не исследовано.");
                if (autoEffusionReady || effusionToken.trim()) {
                    try {
                        const result = await runOriginalEffusionTask315((autoEffusionReady ? null : { endpoint: effusionEndpoint, token: effusionToken }), nifti, controller.signal, progress);
                        if (version !== serial.current || controller.signal.aborted)
                            return;
                        setChestEffusion(result);
                        completed++;
                    }
                    catch (e) {
                        if (controller.signal.aborted)
                            return;
                        problems.push("TotalSegmentator выпоты: " + (e instanceof Error ? e.message : "исполнитель недоступен"));
                    }
                }
                else
                    problems.push("Плевральный/перикардиальный выпот: нет токена task315; не исследовано.");
                if (ctpaConfirmed) {
                    if (autoPeReady || peToken.trim()) {
                        try {
                            const result = await executeOriginalPeCtp(autoPeReady ? null : { endpoint: peEndpoint, token: peToken }, nifti, true, controller.signal, progress);
                            if (version !== serial.current || controller.signal.aborted)
                                return;
                            setChestPe(result);
                            completed++;
                        }
                        catch (e) {
                            if (controller.signal.aborted)
                                return;
                            problems.push("ТЭЛА nnU-Net: " + (e instanceof Error ? e.message : "исполнитель недоступен"));
                        }
                    }
                    else
                        problems.push("ТЭЛА nnU-Net: оригинальная модель недоступна автоматически, ручной worker не настроен.");
                }
                else {
                    problems.push("ТЭЛА не исследована: тип серии CTPA не подтверждён врачом.");
                }
                if (enhancedChestConfirmed) {
                    if (autoNodesReady || nodeToken.trim()) {
                        try {
                            const result = await runOriginalRaidionicsNodes(autoNodesReady ? null : { endpoint: nodeEndpoint, token: nodeToken }, nifti, true, controller.signal, progress);
                            if (version !== serial.current || controller.signal.aborted)
                                return;
                            setChestNodes(result);
                            completed++;
                        }
                        catch (e) {
                            if (controller.signal.aborted)
                                return;
                            problems.push("Лимфоузлы средостения Raidionics: " +
                                (e instanceof Error ? e.message : "исполнитель недоступен"));
                        }
                    }
                    else
                        problems.push("Лимфоузлы средостения: оригинальный Raidionics не готов автоматически, ручной worker не настроен; не исследовано.");
                }
                else
                    problems.push("Лимфоузлы средостения: контрастная КТ не подтверждена; не исследовано.");
                if (version !== serial.current || controller.signal.aborted)
                    return;
                setChestIssues(problems);
                const total = 4 + Number(ctpaConfirmed) + Number(enhancedChestConfirmed);
                setDraftText("Исследовательская КТ грудной клетки. Выполнено настоящих патологических моделей: " +
                    completed + " из " + total + ". Условия оценки ограничены выбранной серией. " +
                    "Результаты являются кандидатами, которые обязан проверить врач. " +
                    "Остальные заболевания грудной клетки не оценены.");
                setStatus(completed ?
                    "Завершено моделей: " + completed + " из " + total + ". Недоступные анализы явно отмечены." :
                    "Ни одна патологическая модель не выполнена. Исследование не оценено.");
                // Vision is independent of specialty-model availability; privacy/budget gates remain upstream.
                onReadyForVision?.(series.key);
                return;
            }
            if (plan.route === "totalseg-abdomen") {
                if (renalPhaseGate.status === "ready_for_registration") {
                    try {
                        progress("Проверяем оригинальный MONAI для трёхфазной КТ почек…");
                        const renal = await runRenalMonaiThreePhase(allSeries, files, renalPhaseRoles, controller.signal, progress);
                        if (version !== serial.current || controller.signal.aborted)
                            return;
                        setRenalMonaiResult(renal);
                    }
                    catch (cause) {
                        if (controller.signal.aborted)
                            return;
                        setRenalMonaiIssue(cause instanceof Error ? cause.message : "MONAI не выполнил анализ трёх фаз");
                    }
                }
                const original = series.members.map(m => files.get(m.id));
                if (original.some(f => !f))
                    throw Error("Исходная DICOM-КТ брюшной полости больше недоступна.");
                if (!autoAbdomenReady && !token.trim()) {
                    setStatus("Модели патологии живота недоступны; исследование не оценено детекторами.");
                    setDraftText("Исследовательская КТ брюшной полости. Патологические модели не выполнены: worker не настроен. Отсутствие патологии не установлено.");
                    onReadyForVision?.(series.key);
                    return;
                }
                let nifti: File;
                try {
                    nifti = await prepareDicomCtForPathology(series, original as File[], controller.signal, "ABDOMEN", progress);
                }
                catch (cause) {
                    if (version !== serial.current || controller.signal.aborted)
                        return;
                    setStatus("Конвертация КТ живота для патологических моделей не выполнена; детекторы не запускались.");
                    setError(cause instanceof Error ? cause.message : "Ошибка DICOM→NIfTI");
                    setDraftText("Исследовательская КТ брюшной полости. Детекторы не выполнены; отсутствие патологии не установлено.");
                    onReadyForVision?.(series.key);
                    return;
                }
                if (version !== serial.current || controller.signal.aborted)
                    return;
                let result;
                try {
                    result = await runOriginalAbdominalModels(autoAbdomenReady ? null : session, nifti, controller.signal, progress, ncctVerified);
                }
                catch (cause) {
                    if (version !== serial.current || controller.signal.aborted)
                        return;
                    setStatus("Модели патологии живота не выполнились; исследование не оценено детекторами.");
                    setDraftText("Исследовательская КТ брюшной полости. Патологические модели не выполнены. Отсутствие патологии не установлено.");
                    setError(cause instanceof Error ? cause.message : "Ошибка патологического worker");
                    onReadyForVision?.(series.key);
                    return;
                }
                if (version !== serial.current || controller.signal.aborted)
                    return;
                setAbdomenResult(result);
                const done = Object.values(result.tasks).filter(x => x.status === "completed").length;
                setDraftText("Исследовательская КТ брюшной полости. Исполнены оригинальные " +
                    "патологические модели: " + done + " из 4 (кисты почек, очаги печени, опухолевые изменения поджелудочной, почечные HU-кандидаты). " +
                    "Модельные кандидаты неспецифичны; врач проверяет находки на исходных срезах. " +
                    "Невыполненная модель не означает отрицательный результат.");
                setStatus(done ?
                    "Оригинальные патологические модели завершены: " + done + " из 4. " +
                        "Неоценённые задачи показаны отдельно." :
                    "Модели патологии живота не смогли завершить инференс; отсутствие патологии не установлено.");
                // A missing abdominal worker must not suppress an otherwise authorized Vision review.
                onReadyForVision?.(series.key);
                return;
            }
            if (plan.route === "ianpan-ich") {
                if (!autoIchReady && !token.trim()) {
                    setStatus("ICH-модель не установлена; КТ головы не оценена патологическим детектором.");
                    setDraftText("Исследовательская КТ головы. Детектор кровоизлияния не выполнен; отсутствие кровоизлияния не установлено.");
                    onReadyForVision?.(series.key);
                    return;
                }
                let evidence;
                try {
                    evidence = await runPublicIchWorker(autoIchReady ? null : session, series, files, controller.signal, progress);
                }
                catch (cause) {
                    if (version !== serial.current || controller.signal.aborted)
                        return;
                    setStatus("ICH-модель не выполнилась; КТ головы не оценена патологическим детектором.");
                    setDraftText("Исследовательская КТ головы. Детектор кровоизлияния не выполнен; отсутствие кровоизлияния не установлено.");
                    setError(cause instanceof Error ? cause.message : "Ошибка ICH worker");
                    onReadyForVision?.(series.key);
                    return;
                }
                if (version !== serial.current || controller.signal.aborted)
                    return;
                const sop = new Set(series.members.map(m => m.metadata.sopInstanceUid));
                const uid = new Set(series.members.map(m => m.metadata.seriesUid));
                if (evidence.seriesReviewed.some(x => !uid.has(x)) || evidence.findings.some(f => !sop.has(f.source.sopInstanceUid) || !uid.has(f.source.seriesUid) || f.source.frameIndex !== 0))
                    throw Error("ICH-находки не соответствуют оригинальным DICOM.");
                setIch(evidence);
                setDraftText("Исследовательская КТ головы: исполнена модель ianpan. Кандидатов на кровоизлияние: " +
                    evidence.findings.length + ". Требуется сверка каждого очага с исходной КТ. " +
                    "Отсутствие кандидатов не исключает кровоизлияние; анализ других патологий не проводился.");
                setStatus("Настоящий ianpan выполнен. Кандидаты требуют проверки врача.");
                onReadyForVision?.(series.key);
                return;
            }
            if (plan.route === "wmh-flair" && brainTask !== "wmh") {
                if (!brainSequenceApproved || !brainAssignedReady)
                    throw Error("МР-последовательности не подтверждены врачом.");
                const sourceFiles: Record<string, File> = {};
                const usedSeries = new Set<string>();
                for (const role of assignedBrainRoles) {
                    if (controller.signal.aborted)
                        throw new DOMException("Оригинальная МРТ отменена.", "AbortError");
                    const chosen = compatibleBrainSeries.find(x => x.key === brainSeriesByRole[role]);
                    if (!chosen || usedSeries.has(chosen.key))
                        throw Error("Исходная МР-серия для " + role + " не установлена или повторяется.");
                    usedSeries.add(chosen.key);
                    const volume = chosen.members.map(m => files.get(m.id));
                    if (volume.some(x => !x))
                        throw Error("Исходный DICOM " + role + " больше недоступен.");
                    progress("Подготавливаем исходную МР-последовательность " + role + "…");
                    sourceFiles[role] = await prepareNativeBrainMr(chosen, volume as File[], role, controller.signal, progress);
                }
                if (controller.signal.aborted || version !== serial.current)
                    return;
                if (!autoBrainReady && !token.trim()) {
                    setStatus("Оригинальная МР-модель не установлена; детектор не выполнил анализ.");
                    setDraftText("Исследовательская МРТ головного мозга. Патологический детектор не выполнен; отсутствие патологии не установлено.");
                    onReadyForVision?.(series.key);
                    return;
                }
                let result;
                try {
                    result = await executeOriginalBrain(autoBrainReady ? null : session, brainTask, sourceFiles, brainSequenceApproved, controller.signal, progress);
                }
                catch (cause) {
                    if (controller.signal.aborted || version !== serial.current)
                        return;
                    setStatus("Оригинальная МР-модель не выполнила анализ.");
                    setError(cause instanceof Error ? cause.message : "Ошибка МР worker");
                    setDraftText("Исследовательская МРТ головного мозга. Патологический детектор не выполнен; отсутствие патологии не установлено.");
                    onReadyForVision?.(series.key);
                    return;
                }
                if (controller.signal.aborted || version !== serial.current)
                    return;
                setBrainResult(result);
                const count = Object.values(result.modelRegions).reduce((sum, region) => sum + region.components.length, 0);
                setDraftText("Исследовательская МРТ головного мозга: модель " +
                    (brainTask === "stroke" ? "ISLES22 DWI/ADC/FLAIR (ишемические очаги)" :
                        "BraTS T1CE/T1/T2/FLAIR (опухолевые субрегионы)") +
                    " выполнена на подтверждённых исходных последовательностях. " +
                    "Модельных компонентов: " + count + ". Окончательная диагностика требует " +
                    "проверки врача с сопоставлением всех оригинальных серий.");
                setStatus("Настоящая " + (brainTask === "stroke" ? "ISLES22" : "BraTS") +
                    " завершена. Показаны исследовательские очаги на исходной физической сетке.");
                onReadyForVision?.(series.key);
                return;
            }
            // MR weighting cannot be inferred reliably from scanning sequence codes;
            // require a separate explicit FLAIR operator check and public-source rights.
            if (!autoWmhReady && !token.trim()) {
                setStatus("Оригинальная WMH-модель не установлена; FLAIR не оценена детектором.");
                setDraftText("Исследовательская FLAIR-МРТ. WMH-детектор не выполнен; отсутствие очагов не установлено.");
                onReadyForVision?.(series.key);
                return;
            }
            try {
                const wmhSession = autoWmhReady ? null : session;
                const invokeWmh = (path: "/v1/wmh/capabilities" | "/v1/wmh/analyze", init: RequestInit = {}) => wmhSession ? call(wmhSession, path, init) : fetch("/api/local-wmh", {
                    ...init, method: path.endsWith("/capabilities") ? "GET" : "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
                }).then(res => {
                    if (!res.ok)
                        throw Error("WMH worker недоступен: HTTP " + res.status);
                    return res;
                });
                const response = await invokeWmh("/v1/wmh/capabilities", { signal: controller.signal });
                const cap = await response.json() as Record<string, unknown>;
                if (cap.schema !== "opus-direct-wmh-worker/v1" || cap.originalModelReady !== true ||
                    cap.patientMode !== false || cap.imageUpload !== true ||
                    cap.dataPolicy !== "approved-public-research-only" || cap.modelVersion !== "1.6.0")
                    throw Error("WMH worker не подтвердил подлинную установленную модель.");
                const form = new FormData();
                form.set("confirmed", "yes");
                form.set("publicRights", "yes");
                form.set("sourceUrl", sourceUrl);
                form.set("sourceLicense", sourceLicense);
                for (const member of series.members) {
                    if (controller.signal.aborted)
                        throw new DOMException("Отменено", "AbortError");
                    const file = files.get(member.id);
                    if (!file)
                        throw Error("Отсутствует исходный DICOM-срез МРТ.");
                    form.append("dicom", file, "slice.dcm");
                }
                progress("Загружаем разрешённые исходные FLAIR DICOM в приватный worker...");
                const output = await invokeWmh("/v1/wmh/analyze", {
                    method: "POST", body: form, signal: controller.signal,
                    headers: wmhSession ? {} : { "X-Opus-Public-Research-Authorization": "approved-nonpatient-source" },
                });
                const data: unknown = await output.json();
                const bound = await bindWmhToSelectedDicom(data, series, files);
                if (version !== serial.current || controller.signal.aborted)
                    return;
                setWmh(bound);
                setDraftText("Исследовательская FLAIR-МРТ головы: выполнен WMH fold 0. " +
                    "Кандидатных гиперинтенсивных компонентов: " + bound.components.length +
                    "; суммарный объём " + bound.totalMl.toFixed(2) + " мл. " +
                    "Изменения неспецифичны; требуется врачебная оценка и дифференциальная интерпретация.");
                setStatus("Оригинальный WMH fold 0 выполнен. Сверены SHA-256 исходных DICOM.");
                onReadyForVision?.(series.key);
            }
            catch (cause) {
                if (controller.signal.aborted || version !== serial.current)
                    return;
                setStatus("WMH worker не завершил анализ; FLAIR не оценена детектором.");
                setError(cause instanceof Error ? cause.message : "Ошибка WMH worker");
                setDraftText("Исследовательская FLAIR-МРТ. WMH-детектор не выполнен; отсутствие очагов не установлено.");
                onReadyForVision?.(series.key);
            }
        }
        catch (e) {
            if (version === serial.current && !controller.signal.aborted)
                setError(e instanceof Error ? e.message : "Анализ не завершился. Результата нет.");
        }
        finally {
            if (version === serial.current) {
                setBusy(false);
                onAnalysisStage?.(series.key, "completed");
            }
        }
    }
    async function saveUnsignedDraft() {
        if (!ich && !wmh || !draftText.trim() || exporting)
            return;
        const revision = serial.current;
        setExporting(true);
        setError("");
        try {
            const digests: NativeDicomDigest[] = [];
            for (const member of series.members) {
                if (revision !== serial.current)
                    throw Error("Исследование изменилось во время сохранения.");
                const file = files.get(member.id), sop = member.metadata.sopInstanceUid;
                if (!file || !sop)
                    throw Error("Отсутствует оригинальный DICOM для локального сохранения.");
                // One original DICOM file in memory at a time; no upload or persistence.
                const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
                const sha = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
                digests.push({ sopInstanceUid: sop, sha256: sha });
            }
            const input = ich ? { kind: "ianpan-ich" as const, result: ich } :
                { kind: "wmh-flair" as const, result: wmh! };
            if (revision !== serial.current)
                throw Error("Исследование изменилось во время сохранения.");
            const draft = createNativePhysicianDraft(series, input, decisions, draftText, digests, new Date().toISOString());
            const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }));
            try {
                const a = document.createElement("a");
                a.href = url;
                a.download = "opus-native-unsigned-physician-review.json";
                document.body.appendChild(a);
                a.click();
                a.remove();
            }
            finally {
                window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
            setStatus("Неподписанный предварительный отчёт с UID и SHA-256 сохранён локально.");
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось сохранить черновик.");
        }
        finally {
            setExporting(false);
        }
    }
    function cancel() {
        serial.current++;
        active.current?.abort();
        active.current = null;
        setBusy(false);
        onAnalysisStage?.(series.key, "cancelled");
        setMonaiState(old => old === "running" ? "cancelled" : old);
        setStatus("Анализ отменён. Неинтерпретированные зоны остаются неоценёнными.");
    }
    return <section className="cs-geometry" aria-label={__ui("\u0415\u0434\u0438\u043D\u044B\u0439 \u0430\u043D\u0430\u043B\u0438\u0437 DICOM")}>
  <h2><LocalizedUi value={"\u0410\u043D\u0430\u043B\u0438\u0437 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F"}/></h2>
  
   <LocalizedUi value={researchMode && confirmableChest && <label><input type="checkbox" checked={clinicianConfirmedChest} disabled={busy} onChange={e => setClinicianConfirmedChest(e.target.checked)}/><LocalizedUi value={"\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u043B \u0441\u043D\u0438\u043C\u043A\u0438: \u044D\u0442\u043E \u041A\u0422 \u0433\u0440\u0443\u0434\u043D\u043E\u0439 \u043A\u043B\u0435\u0442\u043A\u0438, \u043D\u0435 \u043B\u043E\u043A\u0430\u043B\u0438\u0437\u0430\u0442\u043E\u0440."}/></label>}/>
  <LocalizedUi value={researchMode && <p><strong><LocalizedUi value={plan.route === "monai-nodules" ? "КТ грудной клетки" :
                plan.route === "totalseg-abdomen" ? "КТ брюшной полости" :
                    plan.route === "ianpan-ich" ? "КТ головного мозга" :
                        plan.route === "wmh-flair" ? "МРТ головного мозга" :
                            plan.route === "xrv-cxr" ? "Рентгенография" : "Исследование DICOM"}/></strong>
     <LocalizedUi value={plan.route ? " · подходящие модели выбираются автоматически" : ""}/></p>}/>
  <LocalizedUi value={plan.reason && <p role="status"><LocalizedUi value={visionOnlyAvailable ?
                (series.members.length === 1 ?
                    "Один DICOM-файл. Объёмные детекторы не запускаются: для них нужна серия срезов. Разбор этого снимка через Gemini и Opus доступен." :
                    series.members.some(m => m.metadata.imageRole === "DERIVED") ?
                        "Серия помечена DICOM как производная (DERIVED). Доступен визуальный анализ проверенных кадров; количественные детекторы для исходной серии не назначены." :
                        "Локальный детектор не назначен: " + plan.reason + " Доступен независимый Gemini + Opus.") :
                "Не запущено: " + plan.reason}/></p>}/>
  <LocalizedUi value={(plan.route || visionOnlyAvailable) && <>
   <LocalizedUi value={researchMode && plan.route && <details>
    <summary><LocalizedUi value={"\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u00B7 \u043F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u044B \u043C\u043E\u0434\u0435\u043B\u0435\u0439 \u0438 \u0443\u0442\u043E\u0447\u043D\u0435\u043D\u0438\u0435 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u0430"}/></summary>
    <details><summary><LocalizedUi value={"\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0441\u0435\u0440\u0432\u0435\u0440\u043E\u0432 \u043C\u043E\u0434\u0435\u043B\u0435\u0439"}/></summary><OriginalWorkerFleetReadiness /></details>
    <LocalizedUi value={!xrvPlan && !(plan.route === "totalseg-abdomen" && autoAbdomenReady) && !(chestPlan && autoMonaiReady) && !(plan.route === "wmh-flair" && (brainTask === "wmh" ? autoWmhReady : autoBrainReady)) && !(plan.route === "ianpan-ich" && autoIchReady) && <label><LocalizedUi value={"\u0410\u0434\u0440\u0435\u0441 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0433\u043E worker"}/><input type="text" value={endpoint} disabled={busy} onChange={e => setEndpoint(e.target.value)}/></label>}/>
    <LocalizedUi value={!xrvPlan && !(plan.route === "totalseg-abdomen" && autoAbdomenReady) && !(chestPlan && autoMonaiReady) && !(plan.route === "wmh-flair" && (brainTask === "wmh" ? autoWmhReady : autoBrainReady)) && !(plan.route === "ianpan-ich" && autoIchReady) && <label><LocalizedUi value={"\u0422\u043E\u043A\u0435\u043D worker"}/><input type="password" autoComplete="off" value={token} disabled={busy} onChange={e => setToken(e.target.value)}/></label>}/>
    <LocalizedUi value={plan.route === "totalseg-abdomen" && <label><input type="checkbox" checked={ncctVerified} disabled={busy} onChange={e => setNcctVerified(e.target.checked)}/><LocalizedUi value={"\u041F\u043E \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u043C\u0443 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u0443 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E \u043D\u0430\u0442\u0438\u0432\u043D\u0443\u044E \u041A\u0422 \u0431\u0435\u0437 \u043A\u043E\u043D\u0442\u0440\u0430\u0441\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F (\u0438\u043D\u0430\u0447\u0435 HU-\u043F\u043E\u0438\u0441\u043A \u043A\u0430\u043C\u043D\u0435\u0439 \u043D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F)"}/></label>}/>
    <LocalizedUi value={plan.route === "totalseg-abdomen" && <p role="status"><LocalizedUi value={"\u041A\u0422 \u0436\u0438\u0432\u043E\u0442\u0430 \u00B7 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0445 \u043C\u043E\u0434\u0435\u043B\u0435\u0439:"}/><LocalizedUi value={autoAbdomenChecking ? "проверяем…" : autoAbdomenReady ?
                        "готовы к запуску через приватный сервер; врачу не нужен токен" :
                        "не настроено; доступен резервный ручной режим для исследователя"}/><LocalizedUi value={". \u0415\u0441\u043B\u0438 \u0447\u0430\u0441\u0442\u044C \u043C\u043E\u0434\u0435\u043B\u0435\u0439 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442, \u043E\u043D\u0438 \u0431\u0443\u0434\u0443\u0442 \u043E\u0442\u043C\u0435\u0447\u0435\u043D\u044B \u043D\u0435\u043E\u0446\u0435\u043D\u0451\u043D\u043D\u044B\u043C\u0438."}/></p>}/>
     <LocalizedUi value={xrvPlan && <div className="cs-geometry">
      <strong><LocalizedUi value={"\u041E\u0434\u043D\u0430 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F NIH DenseNet121 \u00B7 \u0448\u0435\u0441\u0442\u044C \u0440\u0435\u043D\u0442\u0433\u0435\u043D\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0445 \u043F\u0440\u0438\u0437\u043D\u0430\u043A\u043E\u0432"}/></strong>
      <p role="status"><LocalizedUi value={"\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0432\u0435\u0441\u043E\u0432 \u0438 Linux worker:"}/><LocalizedUi value={xrvStatus === "checking" ?
                        "проверяем" : xrvStatus === "ready" ? "оригинальные веса проверены SHA-256 и worker доступен" :
                        "пока недоступен; обратитесь к администратору сервера"}/>.</p>
      <label><input type="checkbox" checked={xrvChestConfirmed} disabled={busy} onChange={e => setXrvChestConfirmed(e.target.checked)}/><LocalizedUi value={"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E: \u044D\u0442\u043E \u0438\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u0440\u0435\u043D\u0442\u0433\u0435\u043D\u043E\u0433\u0440\u0430\u043C\u043C\u0430 \u0433\u0440\u0443\u0434\u043D\u043E\u0439 \u043A\u043B\u0435\u0442\u043A\u0438 CR/DX, \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u043C\u0430\u044F \u0432 \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u043E\u043C \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u043C \u043D\u0435\u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0441\u043A\u043E\u043C \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0438."}/></label>
      <label><LocalizedUi value={"URL \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0433\u043E \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F"}/><input type="url" value={sourceUrl} disabled={busy} onChange={e => setSourceUrl(e.target.value)}/></label>
      <p><LocalizedUi value={"\u041C\u043E\u0434\u0435\u043B\u0438 \u043D\u0435 \u043D\u0443\u0436\u043D\u043E \u043F\u0435\u0440\u0435\u0434\u0430\u0432\u0430\u0442\u044C DICOM: \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E \u0441\u043E\u0437\u0434\u0430\u0451\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0440\u0430\u0441\u0442\u0440\u043E\u0432\u0430\u044F \u043A\u043E\u043F\u0438\u044F PNG. \u0422\u043E\u043A\u0435\u043D \u0438 \u043F\u0443\u0442\u044C \u043A \u0432\u0435\u0441\u0430\u043C \u0445\u0440\u0430\u043D\u044F\u0442\u0441\u044F \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435, \u043D\u0435 \u0443 \u0432\u0440\u0430\u0447\u0430."}/></p>
     </div>}/>
     <LocalizedUi value={chestPlan && <div className="cs-geometry">
      <strong><LocalizedUi value={"\u0412\u0442\u043E\u0440\u043E\u0439 \u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440 \u0442\u043E\u0439 \u0436\u0435 \u041A\u0422: \u043F\u043B\u0435\u0432\u0440\u0430\u043B\u044C\u043D\u044B\u0439 \u0438 \u043F\u0435\u0440\u0438\u043A\u0430\u0440\u0434\u0438\u0430\u043B\u044C\u043D\u044B\u0439 \u0432\u044B\u043F\u043E\u0442"}/></strong>
      <p role="status"><LocalizedUi value={autoEffusionChecking ?
                        "Проверяем оригинальную TotalSegmentator task315…" :
                        autoEffusionReady ?
                            "Оригинальная TotalSegmentator task315 доступна на приватном сервере. Токен врачу не нужен." :
                            "Серверная task315 недоступна; предусмотрен резервный ручной исследовательский режим."}/></p>
      <LocalizedUi value={!autoEffusionReady && <label><LocalizedUi value={"\u0410\u0434\u0440\u0435\u0441 TotalSegmentator task315 worker"}/><input type="text" value={effusionEndpoint} disabled={busy} onChange={e => setEffusionEndpoint(e.target.value)}/></label>}/>
      <LocalizedUi value={!autoEffusionReady && <label><LocalizedUi value={"\u0422\u043E\u043A\u0435\u043D task315"}/><input type="password" autoComplete="off" value={effusionToken} disabled={busy} onChange={e => setEffusionToken(e.target.value)}/></label>}/>
      <p><LocalizedUi value={"\u041F\u043B\u0435\u0432\u0440\u0430\u043B\u044C\u043D\u044B\u0439 \u0438 \u043F\u0435\u0440\u0438\u043A\u0430\u0440\u0434\u0438\u0430\u043B\u044C\u043D\u044B\u0439 \u043A\u043B\u0430\u0441\u0441\u044B \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442 \u041E\u0414\u041D\u0410 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C; \u0434\u0440\u0443\u0433\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C \u043D\u0430 \u0442\u0435 \u0436\u0435 \u043A\u043B\u0430\u0441\u0441\u044B \u043D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F."}/></p>
    </div>}/>
    <LocalizedUi value={chestPlan && <div className="cs-geometry">
      <strong><LocalizedUi value={"\u0427\u0435\u0442\u0432\u0451\u0440\u0442\u0430\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u0430\u044F \u0437\u0430\u0434\u0430\u0447\u0430: \u043B\u0438\u043C\u0444\u043E\u0443\u0437\u043B\u044B \u0441\u0440\u0435\u0434\u043E\u0441\u0442\u0435\u043D\u0438\u044F \u00B7 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439 Raidionics"}/></strong>
      <label><input type="checkbox" checked={enhancedChestConfirmed} disabled={busy} onChange={e => setEnhancedChestConfirmed(e.target.checked)}/><LocalizedUi value={"\u0412\u0440\u0430\u0447 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u043B: \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u2014 \u043A\u043E\u043D\u0442\u0440\u0430\u0441\u0442\u043D\u0430\u044F \u041A\u0422 \u0433\u0440\u0443\u0434\u043D\u043E\u0439 \u043A\u043B\u0435\u0442\u043A\u0438 \u0441 \u043E\u0446\u0435\u043D\u043A\u043E\u0439 \u0441\u0440\u0435\u0434\u043E\u0441\u0442\u0435\u043D\u0438\u044F."}/></label>
      <LocalizedUi value={enhancedChestConfirmed && <><p role="status"><LocalizedUi value={autoNodesChecking ? "Проверяем оригинальный Raidionics…" : autoNodesReady ? "Raidionics готов автоматически: токен врачу не требуется." : "Raidionics недоступен автоматически; возможен ручной исследовательский запуск."}/></p>
        <label><LocalizedUi value={"\u0410\u0434\u0440\u0435\u0441 Raidionics worker"}/><input type="text" value={nodeEndpoint} disabled={busy} onChange={e => setNodeEndpoint(e.target.value)}/></label>
        <label><LocalizedUi value={"\u0422\u043E\u043A\u0435\u043D Raidionics"}/><input type="password" autoComplete="off" value={nodeToken} disabled={busy} onChange={e => setNodeToken(e.target.value)}/></label>
      </>}/>
      <p><LocalizedUi value={"\u041C\u0430\u0441\u043A\u0430 \u043B\u0451\u0433\u043A\u0438\u0445 R231 \u0441\u0442\u0440\u043E\u0438\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043D\u0430 \u0442\u043E\u0439 \u0436\u0435 \u041A\u0422 \u043A\u0430\u043A \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u0443\u0441\u043B\u043E\u0432\u0438\u0435 Raidionics. \u042D\u0442\u043E \u041D\u0415 \u0432\u0442\u043E\u0440\u043E\u0439 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440. \u041B\u0438\u043C\u0444\u043E\u0443\u0437\u043B\u044B \u043D\u0435 \u043A\u043B\u0430\u0441\u0441\u0438\u0444\u0438\u0446\u0438\u0440\u0443\u044E\u0442\u0441\u044F \u043A\u0430\u043A \u043C\u0435\u0442\u0430\u0441\u0442\u0430\u0437\u044B."}/></p>
    </div>}/>
    <LocalizedUi value={chestPlan && <div className="cs-geometry">
      <strong><LocalizedUi value={"\u0422\u0440\u0435\u0442\u044C\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u0430\u044F \u0437\u0430\u0434\u0430\u0447\u0430: \u0422\u042D\u041B\u0410 \u00B7 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u0430\u044F CTPA"}/></strong>
      <label><input type="checkbox" checked={ctpaConfirmed} disabled={busy} onChange={e => setCtpaConfirmed(e.target.checked)}/><LocalizedUi value={"\u0412\u0440\u0430\u0447 \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u043B \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B: \u044D\u0442\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u0430\u044F \u0441\u0435\u0440\u0438\u044F \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u041A\u0422-\u0430\u043D\u0433\u0438\u043E\u0433\u0440\u0430\u0444\u0438\u0435\u0439 \u043B\u0451\u0433\u043E\u0447\u043D\u044B\u0445 \u0430\u0440\u0442\u0435\u0440\u0438\u0439 \u0441 \u043F\u0440\u0438\u0433\u043E\u0434\u043D\u043E\u0439 \u043A\u043E\u043D\u0442\u0440\u0430\u0441\u0442\u043D\u043E\u0439 \u0444\u0430\u0437\u043E\u0439."}/></label>
      <LocalizedUi value={ctpaConfirmed && <><p role="status"><LocalizedUi value={autoPeChecking ? "Проверяем оригинальный PE worker…" : autoPeReady ? "PE nnU-Net готов к автоматическому запуску через приватный сервер; токен врачу не нужен." : "PE worker не готов автоматически; доступен ручной исследовательский запуск."}/></p>
        <label><LocalizedUi value={"\u0410\u0434\u0440\u0435\u0441 PE nnU-Net worker"}/><input type="text" value={peEndpoint} disabled={busy} onChange={e => setPeEndpoint(e.target.value)}/></label>
        <label><LocalizedUi value={"\u0422\u043E\u043A\u0435\u043D PE worker"}/><input type="password" autoComplete="off" value={peToken} disabled={busy} onChange={e => setPeToken(e.target.value)}/></label>
      </>}/>
      <p><LocalizedUi value={"\u041D\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u0442\u044C \u043D\u0430 \u043F\u0440\u043E\u0438\u0437\u0432\u043E\u043B\u044C\u043D\u043E\u0439 \u041A\u0422 \u0433\u0440\u0443\u0434\u043D\u043E\u0439 \u043A\u043B\u0435\u0442\u043A\u0438. \u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C \u043F\u043E\u043A\u0430\u0437\u0430\u043B\u0430 Dice 0,038 \u043D\u0430 \u043E\u0434\u043D\u043E\u043C FUMPE; \u0440\u0435\u0448\u0435\u043D\u0438\u0435 \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0440\u0443\u0447\u043D\u043E\u0439 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438, \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u0422\u042D\u041B\u0410 \u043D\u0435 \u0438\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u0442\u0441\u044F."}/></p>
    </div>}/>
    <LocalizedUi value={plan.needsExplicitFlair && <div className="cs-geometry">
      <label><LocalizedUi value={"\u0417\u0430\u0434\u0430\u0447\u0430 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u043E\u0439 \u043C\u043E\u0434\u0435\u043B\u0438 \u041C\u0420\u0422 \u0433\u043E\u043B\u043E\u0432\u043D\u043E\u0433\u043E \u043C\u043E\u0437\u0433\u0430"}/><select value={brainTask} disabled={busy} onChange={e => {
                        setBrainTask(e.target.value as "wmh" | BrainTask);
                        setBrainSequenceApproved(false);
                        setBrainResult(null);
                        setBrainSeriesByRole({});
                    }}>
        <option value="wmh"><LocalizedUi value={"FLAIR \u00B7 \u0433\u0438\u043F\u0435\u0440\u0438\u043D\u0442\u0435\u043D\u0441\u0438\u0432\u043D\u043E\u0441\u0442\u0438 WMH (\u043E\u0434\u043D\u0430 \u043C\u043E\u0434\u0435\u043B\u044C)"}/></option>
        <option value="stroke"><LocalizedUi value={"DWI + ADC + FLAIR \u00B7 \u0438\u0448\u0435\u043C\u0438\u044F ISLES22"}/></option>
        <option value="glioma"><LocalizedUi value={"T1CE + T1 + T2 + FLAIR \u00B7 \u0433\u043B\u0438\u043E\u043C\u0430 BraTS"}/></option>
       </select>
      </label>
      <LocalizedUi value={brainTask === "wmh" ? <>
        <LocalizedUi value={autoFlair.eligible ? <p role="status"><LocalizedUi value={"\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u043D\u0430 \u043F\u043E\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C, \u0441\u043E\u0432\u043C\u0435\u0441\u0442\u0438\u043C\u0430\u044F \u0441 T2-FLAIR: TR"}/><LocalizedUi value={autoFlair.parameters!.trMs}/><LocalizedUi value={"\u043C\u0441, TE"}/><LocalizedUi value={autoFlair.parameters!.teMs}/><LocalizedUi value={"\u043C\u0441, TI"}/><LocalizedUi value={autoFlair.parameters!.tiMs}/><LocalizedUi value={"\u043C\u0441. \u041F\u0440\u0438 \u043D\u0430\u043B\u0438\u0447\u0438\u0438 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u043E\u0439 WMH-\u043C\u043E\u0434\u0435\u043B\u0438 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u0432\u044B\u0431\u043E\u0440 \u0442\u0438\u043F\u0430 \u043F\u043E\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u0438 \u043D\u0435 \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F."}/></p> : <>
          <p role="status"><LocalizedUi value={autoFlair.reason}/><LocalizedUi value={"\u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u044B\u0439 \u0430\u043D\u0430\u043B\u0438\u0437 \u043A\u0430\u0434\u0440\u043E\u0432 Gemini + Opus; WMH \u043D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F \u0431\u0435\u0437 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F."}/></p>
          <label><input type="checkbox" checked={flairConfirmed} disabled={busy} onChange={e => setFlairConfirmed(e.target.checked)}/><LocalizedUi value={"\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u043B \u0438\u0441\u0445\u043E\u0434\u043D\u0443\u044E \u0441\u0435\u0440\u0438\u044E: \u044D\u0442\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E FLAIR. \u0420\u0430\u0437\u0440\u0435\u0448\u0430\u044E \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0443\u044E WMH-\u043C\u043E\u0434\u0435\u043B\u044C."}/></label>
        </>}/>
      </> : <>
        <p><LocalizedUi value={"\u0414\u043B\u044F \u043C\u043E\u0434\u0435\u043B\u0438"}/><LocalizedUi value={brainTask === "stroke" ? "ISLES22" : "BraTS"}/><LocalizedUi value={"\u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0440\u0430\u0437\u043B\u0438\u0447\u043D\u044B\u0435 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0435 \u0441\u0435\u0440\u0438\u0438 \u043E\u0434\u043D\u043E\u0433\u043E StudyUID \u0438 FrameOfReferenceUID. \u041D\u0430\u0437\u0432\u0430\u043D\u0438\u044F \u043F\u043E\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u0435\u0439 \u043D\u0435 \u0443\u0433\u0430\u0434\u044B\u0432\u0430\u044E\u0442\u0441\u044F \u043F\u043E DICOM: \u0438\u0445 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u0432\u0440\u0430\u0447."}/></p>
        <LocalizedUi value={assignedBrainRoles.map(role => <label key={role}><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u0441\u0435\u0440\u0438\u044F \u0434\u043B\u044F"}/><LocalizedUi value={role.toUpperCase()}/>
         <select value={brainSeriesByRole[role] ?? ""} disabled={busy} onChange={e => {
                                setBrainSeriesByRole(old => ({ ...old, [role]: e.target.value }));
                                setBrainSequenceApproved(false);
                                setBrainResult(null);
                            }}>
          <option value=""><LocalizedUi value={"\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0438\u0441\u0445\u043E\u0434\u043D\u0443\u044E \u041C\u0420-\u0441\u0435\u0440\u0438\u044E"}/></option>
          <LocalizedUi value={compatibleBrainSeries.map(item => <option key={item.key} value={item.key}>
             <LocalizedUi value={item.label}/> · <LocalizedUi value={item.members.length}/><LocalizedUi value={"\u0441\u0440\u0435\u0437\u043E\u0432"}/></option>)}/>
         </select>
        </label>)}/>
        <label><input type="checkbox" checked={brainSequenceApproved} disabled={busy || !brainAssignedReady} onChange={e => setBrainSequenceApproved(e.target.checked)}/><LocalizedUi value={"\u042F \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u043B \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u0432\u0441\u0435\u0445 \u043F\u043E\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u0435\u0439, \u0438\u0445 \u043F\u0440\u0438\u043D\u0430\u0434\u043B\u0435\u0436\u043D\u043E\u0441\u0442\u044C \u043E\u0434\u043D\u043E\u043C\u0443 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044E, \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0443\u044E \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044E \u0438 \u043F\u0440\u0430\u0432\u043E\u043C\u0435\u0440\u043D\u043E\u0441\u0442\u044C \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0438."}/></label>
        <LocalizedUi value={brainTask === "glioma" && <p><LocalizedUi value={"BraTS \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0447\u0435\u0442\u044B\u0440\u0435 \u0443\u0436\u0435 \u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u041C\u0420-\u0441\u0435\u0440\u0438\u0438 \u0440\u0430\u0437\u043C\u0435\u0440\u043E\u043C 240\u00D7240\u00D7155. \u041D\u0435\u0441\u043E\u0432\u043C\u0435\u0441\u0442\u0438\u043C\u043E\u0435 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u043D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F."}/></p>}/>
      </>}/>
      <LocalizedUi value={!brainVisionOnly && <>
        <label><LocalizedUi value={"URL \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u043E\u0433\u043E \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0433\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F"}/><input type="url" value={sourceUrl} disabled={busy} onChange={e => setSourceUrl(e.target.value)}/></label>
        <label><LocalizedUi value={"\u041B\u0438\u0446\u0435\u043D\u0437\u0438\u044F \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F"}/><input type="text" value={sourceLicense} disabled={busy} onChange={e => setSourceLicense(e.target.value)}/></label>
      </>}/>
    </div>}/>
    <p><LocalizedUi value={"MONAI, task315, \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439 Raidionics, \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 PE, TotalSegmentator \u0436\u0438\u0432\u043E\u0442\u0430 \u0438 WMH \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044E\u0442 \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u044B\u0435 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u0432 loopback worker; ianpan \u043F\u0435\u0440\u0435\u0434\u0430\u0451\u0442 \u0442\u043E\u043B\u044C\u043A\u043E SHA-256 \u0438 \u0430\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u0443\u0435\u0442 \u0437\u0430\u0440\u0430\u043D\u0435\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u0443\u044E \u0438\u0434\u0435\u043D\u0442\u0438\u0447\u043D\u0443\u044E \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u0443\u044E \u041A\u0422. \u041E\u0431\u043B\u0430\u0447\u043D\u0430\u044F \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0430 \u043D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F."}/></p>
   </details>}/>
   {/* Authorization is a primary clinical action, not a hidden developer setting. */}
    <LocalizedUi value={researchMode && <label className="cs-clinician-consent"><input type="checkbox" checked={researchAuthorized} disabled={busy} onChange={e => setResearchAuthorized(e.target.checked)}/><LocalizedUi value={"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E \u043F\u0440\u0430\u0432\u043E\u043C\u0435\u0440\u043D\u043E\u0441\u0442\u044C \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u043E\u0439 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0438."}/></label>}/>
   <LocalizedUi value={chestPlan && <p role="status" aria-label={__ui("\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C \u0434\u043B\u044F \u0443\u0437\u043B\u043E\u0432 \u043B\u0451\u0433\u043A\u0438\u0445")}><LocalizedUi value={"\u0423\u0437\u043B\u044B \u043B\u0451\u0433\u043A\u0438\u0445:"}/><LocalizedUi value={autoMonaiChecking ? "проверяем доступных исполнителей…" :
                    monaiState === "running" ? (monaiExecutor?.location === "private" ?
                        "выполняется на подключённом приватном сервере…" : "выполняется через подключённый локальный канал…") :
                        monaiState === "failed" ? "детектор завершился с ошибкой; задача не оценена. Другой детектор автоматически не запускался." :
                            monaiState === "cancelled" ? "обработка отменена; задача не оценена." :
                                chestNodules ? "обработка завершена; находки доступны на исходной КТ." :
                                    monaiExecutor?.ready ? (monaiExecutor.location === "private" ?
                                        "выбран подключённый приватный сервер; запуск одной кнопкой." :
                                        "выбран проверенный исполнитель через локальный канал; запуск одной кнопкой.") :
                                        monaiExecutor?.reason === "not_ready" ? "исполнитель занят или не готов по ресурсам; задача не оценена." :
                                            monaiExecutor?.reason === "unverified" ? "оригинальные веса исполнителя не подтверждены; задача не оценена." :
                                                monaiExecutor?.reason === "unreachable" ? "нет связи с настроенным исполнителем; задача не оценена." :
                                                    "совместимый исполнитель не подключён; задача не оценена. Остальные доступные инструменты продолжат работу."}/>
   </p>}/>
   <button type="button" disabled={!ready} onClick={() => void launch()}>
    <LocalizedUi value={busy ? viewerCopy.running : viewerCopy.analyze}/>
   </button>
   <LocalizedUi value={busy && <button type="button" onClick={cancel}><LocalizedUi value={"\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C"}/></button>}/>
   <LocalizedUi value={researchMode && !ready && !busy && <p role="status"><LocalizedUi value={readinessChecksPending ?
                    "Проверяем доступность оригинальных патологических моделей перед запуском." : plan.route === "totalseg-abdomen" ?
                    "Серверные оригинальные веса КТ живота пока не готовы либо источник не подтверждён. Токены в автоматическом режиме врачу не нужны." :
                    visionOnlyAvailable ?
                        "Подтвердите разрешённый источник для локальной подготовки Gemini + Opus. Облачный вызов разрешается отдельно." :
                        "Разрешите анализ исследования. Недоступные модели будут пропущены."}/></p>}/>
  </>}/>
  <LocalizedUi value={researchMode && status && <p role="status"><LocalizedUi value={status}/></p>}/>
   <LocalizedUi value={!researchMode && busy && <p role="status"><LocalizedUi value={"\u0410\u043D\u0430\u043B\u0438\u0437 \u0441\u043D\u0438\u043C\u043A\u043E\u0432 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F\u2026"}/></p>}/>
   {/* The cloud report panel owns the final result. Original worker completion
                  alone never implies that Gemini/Opus ran or that a report exists. */}
  <LocalizedUi value={error && <p role="alert"><LocalizedUi value={"\u041D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E:"}/><LocalizedUi value={error}/></p>}/>
  <details className="cs-geometry" style={researchMode ? undefined : { display: "none" }} aria-label={__ui("\u0414\u0435\u0442\u0430\u043B\u044C\u043D\u044B\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u043C\u043E\u0434\u0435\u043B\u0435\u0439")}>
    <summary><LocalizedUi value={"\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440\u043E\u0432 \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u043D\u0430\u0445\u043E\u0434\u043E\u043A"}/></summary>
  <LocalizedUi value={xrvReport && <section className="cs-geometry" aria-label={__ui("\u0428\u0435\u0441\u0442\u044C \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0438\u0445 \u043C\u043E\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u0435\u0439 TorchXRayVision")}>
    <h3><LocalizedUi value={"TorchXRayVision NIH DenseNet121 \u00B7 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0430\u044F \u0440\u0435\u043D\u0442\u0433\u0435\u043D\u043E\u0433\u0440\u0430\u0444\u0438\u044F"}/></h3>
    <p><LocalizedUi value={"\u041E\u0434\u0438\u043D \u043E\u0431\u0443\u0447\u0435\u043D\u043D\u044B\u0439 \u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440, \u0448\u0435\u0441\u0442\u044C \u043D\u0435\u043A\u0430\u043B\u0438\u0431\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0445 \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u0435\u0439, \u0430 \u043D\u0435 \u0448\u0435\u0441\u0442\u044C \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u043D\u0435\u0439\u0440\u043E\u0441\u0435\u0442\u0435\u0439. \u041D\u0438 \u043E\u0434\u0438\u043D \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0432\u0435\u0440\u043E\u044F\u0442\u043D\u043E\u0441\u0442\u044C\u044E \u0434\u0438\u0430\u0433\u043D\u043E\u0437\u0430 \u0438\u043B\u0438 \u0434\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u043E\u043C \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u044F \u0431\u043E\u043B\u0435\u0437\u043D\u0438."}/></p>
    <LocalizedUi value={XRV_CXR_LABELS.map(label => <p key={label}>
      <strong><LocalizedUi value={label}/></strong>: <LocalizedUi value={xrvReport.labels[label].toFixed(4)}/>
    </p>)}/>
    <p><LocalizedUi value={"\u041F\u0440\u043E\u0435\u043A\u0446\u0438\u044F AP/PA \u0438 \u0441\u0442\u0435\u043F\u0435\u043D\u044C \u0443\u0432\u0435\u043B\u0438\u0447\u0435\u043D\u0438\u044F \u0441\u0435\u0440\u0434\u0435\u0447\u043D\u043E\u0439 \u0442\u0435\u043D\u0438 \u043D\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u044B \u044D\u0442\u043E\u0439 \u043C\u043E\u0434\u0435\u043B\u044C\u044E. Gemini \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u0434\u043E\u043B\u0436\u0435\u043D \u0441\u0430\u043C\u043E\u0441\u0442\u043E\u044F\u0442\u0435\u043B\u044C\u043D\u043E \u043E\u0446\u0435\u043D\u0438\u0442\u044C \u0441\u043D\u0438\u043C\u043E\u043A; Opus \u0441\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442 \u0435\u0433\u043E \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0441 \u043E\u0446\u0435\u043D\u043A\u0430\u043C\u0438 DenseNet121."}/></p>
    <label><LocalizedUi value={"\u041F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 \u0432\u0440\u0430\u0447\u0430"}/><textarea data-concilium-report="true" rows={4} maxLength={12000} value={draftText} onChange={e => setDraftText(e.target.value)}/>
    </label>
  </section>}/>
  <LocalizedUi value={xrvReport && <CxrIndependentVisionReview series={series} files={files} report={xrvReport} onNavigate={onNavigate}/>}/>
  <LocalizedUi value={plan.route === "totalseg-abdomen" && <div className="cs-geometry" role="status">
   <strong><LocalizedUi value={"\u041E\u043F\u0443\u0445\u043E\u043B\u0438 \u043F\u043E\u0447\u0435\u043A \u00B7 MONAI 3-\u0444\u0430\u0437\u043D\u0430\u044F \u041A\u0422"}/></strong>
   <p><LocalizedUi value={"\u0421\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0444\u0430\u0437 (\u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u043E\u043C \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u0435):"}/></p>
   <LocalizedUi value={(["artery", "vein", "excret"] as const).map(role => <label key={role}><LocalizedUi value={role === "artery" ? "Артериальная" : role === "vein" ? "Венозная" : "Экскреторная"}/><LocalizedUi value={"\u0444\u0430\u0437\u0430"}/><select disabled={busy} value={renalPhaseRoles[role] ?? ""} onChange={e => setRenalPhaseRoles(previous => ({ ...previous, [role]: e.target.value || undefined }))}>
     <option value=""><LocalizedUi value={"\u041D\u0435 \u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D\u0430"}/></option>
     <LocalizedUi value={allSeries.filter(candidate => candidate.modality === "CT" && candidate.members.every(member => member.metadata.bodyRegion === "ABDOMEN")).map(candidate => <option value={candidate.key} key={candidate.key}><LocalizedUi value={candidate.label}/></option>)}/>
    </select></label>)}/>
   <p><LocalizedUi value={renalPhaseGate.status === "not_assessed" ? "Не исследовано: " : "Готово только к проверке совмещения: "}/><LocalizedUi value={renalPhaseGate.reason}/></p>
   <p><LocalizedUi value={"\u042D\u0442\u043E \u043D\u0435 \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442. \u041E\u0434\u043D\u043E\u0444\u0430\u0437\u043D\u0443\u044E \u041A\u0422 \u0438 \u0441\u043B\u0443\u0447\u0430\u0439\u043D\u044B\u0435 \u0441\u0435\u0440\u0438\u0438 \u043D\u0435\u043B\u044C\u0437\u044F \u043F\u0435\u0440\u0435\u0434\u0430\u0432\u0430\u0442\u044C \u0442\u0440\u0451\u0445\u0444\u0430\u0437\u043D\u043E\u0439 \u043C\u043E\u0434\u0435\u043B\u0438."}/></p>
   <LocalizedUi value={renalMonaiIssue && <p role="status"><LocalizedUi value={"MONAI \u043D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D:"}/><LocalizedUi value={renalMonaiIssue}/></p>}/>
   <LocalizedUi value={renalMonaiResult && <div><strong><LocalizedUi value={"\u041E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439 MONAI SegResNet \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D \u00B7 \u043E\u043F\u0443\u0445\u043E\u043B\u0435\u0432\u044B\u0445 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432:"}/><LocalizedUi value={renalMonaiResult.report.componentCandidates.length}/></strong>
    <LocalizedUi value={renalMonaiResult.report.componentCandidates.map((candidate, i) => <p key={i}><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442"}/><LocalizedUi value={i + 1}/>: <LocalizedUi value={candidate.candidateVolumeMl.toFixed(3)}/><LocalizedUi value={"\u043C\u043B,"}/><LocalizedUi value={candidate.candidateVoxels}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439; \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u044B RAS"}/><LocalizedUi value={candidate.niftiWorldCentroidMm.join(", ")}/><LocalizedUi value={"\u043C\u043C"}/></p>)}/>
   </div>}/>
  </div>}/>
  <LocalizedUi value={abdomenResult && <section className="cs-geometry" aria-label={__ui("\u041A\u0438\u0441\u0442\u044B \u043F\u043E\u0447\u0435\u043A, \u043E\u0447\u0430\u0433\u0438 \u043F\u0435\u0447\u0435\u043D\u0438 \u0438 \u043F\u043E\u0434\u0436\u0435\u043B\u0443\u0434\u043E\u0447\u043D\u0430\u044F \u00B7 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0439 DICOM")}>
    <h3><LocalizedUi value={"\u041A\u0422 \u0436\u0438\u0432\u043E\u0442\u0430 \u00B7 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u043C\u043E\u0434\u0435\u043B\u0438 \u0438 HU-\u043F\u043E\u0438\u0441\u043A \u043F\u043E\u0447\u0435\u0447\u043D\u044B\u0445 \u043A\u043E\u043D\u043A\u0440\u0435\u043C\u0435\u043D\u0442\u043E\u0432"}/></h3>
    <p><LocalizedUi value={"\u041E\u0434\u043D\u0430 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u043D\u0430\u044F HU-\u041A\u0422, \u043F\u043E\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u0431\u0435\u0437 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u044B\u0445 \u043C\u043E\u0434\u0435\u043B\u0435\u0439 \u043E\u0434\u043D\u043E\u0439 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0438. \u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u043E\u0431\u044A\u0451\u043C \u0438 \u043E\u0442\u0447\u0451\u0442\u044B \u0441\u0432\u044F\u0437\u0430\u043D\u044B \u043F\u043E SHA-256. \u041A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u044B \u0441\u0440\u0435\u0437\u043E\u0432 \u2014 \u043F\u0440\u0435\u0434\u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u0435 DICOM; \u0432\u0440\u0430\u0447 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442 \u0444\u0438\u0437\u0438\u0447\u0435\u0441\u043A\u0443\u044E \u0441\u0435\u0442\u043A\u0443."}/></p>
    <LocalizedUi value={(["kidney_cysts", "liver_lesions", "pancreatic_tumor", "renal_calculus_candidates"] as const).map(task => {
                const item = abdomenResult.tasks[task];
                return <div key={task}>
        <h4><LocalizedUi value={task === "kidney_cysts" ? "Кисты почек · TotalSegmentator" : task === "liver_lesions" ? "Очаги печени · TotalSegmentator" : task === "renal_calculus_candidates" ? "Почечные плотные компоненты · TotalSegmentator + HU" : "Опухолевые кандидаты поджелудочной · MONAI DiNTS"}/></h4>
        <LocalizedUi value={item.status !== "completed" ? <p role="status"><LocalizedUi value={"\u041D\u0435 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u043E:"}/><LocalizedUi value={item.reason}/><LocalizedUi value={". \u042D\u0442\u043E \u043D\u0435 \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u043D\u0430\u0445\u043E\u0434\u043A\u0430."}/></p> :
                        <div>
            <p><LocalizedUi value={"\u041E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0430. \u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u044B \u0442\u0440\u0435\u0431\u0443\u044E\u0442 \u0432\u0440\u0430\u0447\u0435\u0431\u043D\u043E\u0439 \u043E\u0446\u0435\u043D\u043A\u0438."}/></p>
            <LocalizedUi value={item.report.schema === "opus-kidney-calculus-ncct-candidates/v1" ? <div>
                <p><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432:"}/><LocalizedUi value={item.report.numberOfCandidateComponents}/><LocalizedUi value={". \u042D\u0442\u043E \u043D\u0435 \u0434\u0438\u0430\u0433\u043D\u043E\u0437 \u043C\u043E\u0447\u0435\u043A\u0430\u043C\u0435\u043D\u043D\u043E\u0439 \u0431\u043E\u043B\u0435\u0437\u043D\u0438. \u041C\u043E\u0447\u0435\u0442\u043E\u0447\u043D\u0438\u043A\u0438 \u043D\u0435 \u043E\u0446\u0435\u043D\u0438\u0432\u0430\u043B\u0438\u0441\u044C."}/></p>
                <LocalizedUi value={item.report.candidateComponents.map((c, i) => <p key={i}><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442"}/><LocalizedUi value={i + 1}/>: <LocalizedUi value={c.anatomyMaskSide === "left" ? "левая" : "правая"}/><LocalizedUi value={"\u043F\u043E\u0447\u043A\u0430;"}/><LocalizedUi value={c.equivalentSphereDiameterMm.toFixed(2)}/><LocalizedUi value={"\u043C\u043C (\u044D\u043A\u0432\u0438\u0432\u0430\u043B\u0435\u043D\u0442\u043D\u044B\u0439 \u0434\u0438\u0430\u043C\u0435\u0442\u0440), \u043E\u0431\u044A\u0451\u043C"}/><LocalizedUi value={c.candidateVolumeMm3.toFixed(2)}/><LocalizedUi value={"\u043C\u043C\u00B3, \u043C\u0430\u043A\u0441\u0438\u043C\u0443\u043C"}/><LocalizedUi value={c.maxCandidateHU.toFixed(0)}/><LocalizedUi value={"HU, \u0441\u0440\u0435\u0434\u043D\u044F\u044F"}/><LocalizedUi value={c.meanCandidateHU.toFixed(0)}/> HU, RAS <LocalizedUi value={c.centroidWorldRASmm.join(", ")}/><LocalizedUi value={"\u043C\u043C."}/><button type="button" onClick={() => {
                                        const k = Math.round(c.sourceCentroidIJK[2]);
                                        if (k >= 0 && k < series.members.length)
                                            onNavigate(k);
                                    }}><LocalizedUi value={"\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u0440\u0435\u0434\u043F\u043E\u043B\u0430\u0433\u0430\u0435\u043C\u044B\u0439 \u0441\u0440\u0435\u0437"}/></button></p>)}/>
                <LocalizedUi value={item.report.numberOfCandidateComponents === 0 && <p><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u044B \u043D\u0435 \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u044B; \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043A\u0430\u043C\u043D\u0435\u0439 \u043D\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E."}/></p>}/>
              </div> : item.report.schema === "opus-real-monai-pancreatic-tumor-source-candidates/v1" ?
                                <div>
                <p><LocalizedUi value={"\u041C\u043E\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439 \u043A\u043B\u0430\u0441\u0441\u0430 2:"}/><LocalizedUi value={item.report.sourceNativeTumorVoxelCount}/><LocalizedUi value={". \u041E\u0440\u0433\u0430\u043D\u043D\u0430\u044F \u043C\u0435\u0442\u043A\u0430 \u043F\u043E\u0434\u0436\u0435\u043B\u0443\u0434\u043E\u0447\u043D\u043E\u0439 (\u043A\u043B\u0430\u0441\u0441 1) \u041D\u0415 \u0441\u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044F \u043E\u043F\u0443\u0445\u043E\u043B\u044C\u044E."}/></p>
                <LocalizedUi value={item.report.tumorCandidateComponents.map((c, i) => <div key={i}>
                  <p><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442"}/><LocalizedUi value={i + 1}/>: <LocalizedUi value={c.candidateVoxelCount}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439,"}/><LocalizedUi value={c.candidateVolumeMl.toFixed(2)}/><LocalizedUi value={"\u043C\u043B. \u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A RAS:"}/><LocalizedUi value={c.worldRasCentroidMm.join(", ")}/><LocalizedUi value={"\u043C\u043C."}/></p>
                  <button type="button" onClick={() => {
                                            const k = Math.round(c.nativeSourceCentroidIJK[2]);
                                            if (k >= 0 && k < series.members.length)
                                                onNavigate(k);
                                        }}><LocalizedUi value={"\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u0440\u0435\u0434\u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 DICOM-\u0441\u0440\u0435\u0437 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0430"}/></button>
                </div>)}/>
                <LocalizedUi value={item.report.tumorCandidateComponents.length === 0 && <p><LocalizedUi value={"\u041F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0445 \u043C\u043E\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432 \u043D\u0435\u0442; \u043E\u043F\u0443\u0445\u043E\u043B\u044C \u043D\u0435 \u0438\u0441\u043A\u043B\u044E\u0447\u0435\u043D\u0430."}/></p>}/>
              </div> :
                                item.report.schema === "opus-real-abdominal-ct-pathology-proposals/v1" && item.report.proposals.map(c => <div key={c.labelId}>
              <p><strong><LocalizedUi value={c.pathologyClass}/></strong><LocalizedUi value={"\u00B7 \u043C\u043E\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439"}/><LocalizedUi value={c.modelCandidateVoxels}/><LocalizedUi value={"; \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u043E\u0431\u044A\u0451\u043C"}/><LocalizedUi value={c.modelCandidateVolumeMl.toFixed(2)}/><LocalizedUi value={"\u043C\u043B."}/></p>
              <LocalizedUi value={c.nativeSliceIndicesK.length > 0 && <button type="button" onClick={() => {
                                            const index = c.nativeSliceIndicesK[Math.floor(c.nativeSliceIndicesK.length / 2)];
                                            if (index >= 0 && index < series.members.length)
                                                onNavigate(index);
                                        }}><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043F\u0440\u0435\u0434\u043F\u043E\u043B\u0430\u0433\u0430\u0435\u043C\u044B\u0439 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 DICOM-\u0441\u0440\u0435\u0437"}/></button>}/>
              <LocalizedUi value={c.modelCandidateVoxels === 0 && <p><LocalizedUi value={"\u041C\u043E\u0434\u0435\u043B\u044C \u043D\u0435 \u0432\u044B\u0434\u0435\u043B\u0438\u043B\u0430 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432; \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u044F \u043D\u0435 \u0438\u0441\u043A\u043B\u044E\u0447\u0435\u043D\u0430."}/></p>}/>
            </div>)}/>
          </div>}/>
      </div>;
            })}/>
    <label><LocalizedUi value={"\u041F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0432\u0440\u0430\u0447\u0430"}/><textarea data-concilium-report="true" rows={4} maxLength={12000} value={draftText} onChange={e => setDraftText(e.target.value)}/>
    </label>
    <p><LocalizedUi value={"\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u043D\u0435 \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0433\u043E \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F. \u041E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0430 Gemini/Opus \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E \u043F\u043E\u0441\u043B\u0435 \u043E\u0431\u0435\u0437\u043B\u0438\u0447\u0438\u0432\u0430\u043D\u0438\u044F \u0438 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u0438\u044F \u0432\u0440\u0430\u0447\u0430."}/></p>
  </section>}/>
  <LocalizedUi value={chestPlan && chestIssues.length > 0 && <div role="status" className="cs-geometry">
    <strong><LocalizedUi value={"\u041D\u0435\u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0435 \u043D\u0430\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F"}/></strong>
    <LocalizedUi value={chestIssues.map((message, i) => <p key={i}><LocalizedUi value={message}/></p>)}/>
  </div>}/>
  <LocalizedUi value={chestNodules && <div className="cs-geometry">
    <h3><LocalizedUi value={"\u0423\u0437\u043B\u044B \u043B\u0451\u0433\u043A\u0438\u0445 \u00B7 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F MONAI RetinaNet"}/></h3>
    <p><LocalizedUi value={"\u041D\u0430\u0441\u0442\u043E\u044F\u0449\u0438\u0439 pretrained inference \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D. \u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432:"}/><strong><LocalizedUi value={chestNodules.candidates.length}/></strong><LocalizedUi value={". \u0421\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0435 NIfTI \u0438 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E DICOM \u043F\u043E \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u043C SOP \u0435\u0449\u0451 \u043D\u0435 \u0434\u043E\u043A\u0430\u0437\u0430\u043D\u043E; \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u0434\u0438\u0430\u0433\u043D\u043E\u0437\u0430 \u043D\u0435\u0442."}/></p>
    <LocalizedUi value={chestNodules.candidates.slice(0, 30).map(c => <p key={c.index}><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442 #"}/><LocalizedUi value={c.index + 1}/>, score <LocalizedUi value={c.score.toFixed(3)}/><LocalizedUi value={"; \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u0430 LPS"}/><LocalizedUi value={c.centerLpsMm.map(n => n.toFixed(1)).join(" / ")}/><LocalizedUi value={"\u043C\u043C."}/></p>)}/>
    <LocalizedUi value={chestNodules.candidates.length > 30 && <p><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u043F\u0435\u0440\u0432\u044B\u0435 30 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432."}/></p>}/>
    <LocalizedUi value={chestSource && <button type="button" onClick={() => onMonaiReady(chestSource, autoMonaiReady ? { endpoint: "http://127.0.0.1:8768", token: "" } : { endpoint, token }, chestNodules)}><LocalizedUi value={"\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u043E\u0434\u0440\u043E\u0431\u043D\u044B\u0439 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u0438 \u0432\u0440\u0430\u0447\u0435\u0431\u043D\u0443\u044E \u043E\u0446\u0435\u043D\u043A\u0443 MONAI"}/></button>}/>
  </div>}/>
  <LocalizedUi value={chestNodes && <div className="cs-geometry" aria-label={__ui("\u0421\u0440\u0435\u0434\u043E\u0441\u0442\u0435\u043D\u0438\u0435 \u2014 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439 Raidionics")}>
    <h3><LocalizedUi value={"\u041B\u0438\u043C\u0444\u043E\u0443\u0437\u043B\u044B \u0441\u0440\u0435\u0434\u043E\u0441\u0442\u0435\u043D\u0438\u044F \u00B7 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0438\u0439 Raidionics ONNX"}/></h3>
    <p><LocalizedUi value={"\u041E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439 Lungmask R231 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u043B \u043D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u0443\u044E \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0443\u044E \u043C\u0430\u0441\u043A\u0443, \u0437\u0430\u0442\u0435\u043C \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439 ONNX. \u042D\u0442\u043E \u043E\u0434\u043D\u0430 \u0437\u0430\u0434\u0430\u0447\u0430 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0441\u0435\u0433\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u0438, \u043D\u0435 \u0434\u0438\u0430\u0433\u043D\u043E\u0437 \u043C\u0435\u0442\u0430\u0441\u0442\u0430\u0437\u043E\u0432, \u043E\u043F\u0443\u0445\u043E\u043B\u0438 \u0438\u043B\u0438 \u0432\u043E\u0441\u043F\u0430\u043B\u0435\u043D\u0438\u044F."}/></p>
    <p><LocalizedUi value={"\u041C\u043E\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439:"}/><LocalizedUi value={chestNodes.modelPositiveVoxels}/><LocalizedUi value={"; \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432:"}/><LocalizedUi value={chestNodes.candidates.length}/>.</p>
    <LocalizedUi value={chestNodes.candidates.slice(0, 50).map((c, i) => <div key={i}>
      <p><LocalizedUi value={"\u041B\u0438\u043C\u0444\u043E\u0443\u0437\u0435\u043B-\u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442"}/><LocalizedUi value={i + 1}/>: <LocalizedUi value={c.candidateVolumeMl.toFixed(3)}/><LocalizedUi value={"\u043C\u043B; RAS"}/><LocalizedUi value={c.sourceRASmm.join(", ")}/><LocalizedUi value={"\u043C\u043C."}/></p>
      <button type="button" onClick={() => {
                    const k = Math.round(c.sourceCentroidIJK[2]);
                    if (k >= 0 && k < series.members.length)
                        onNavigate(k);
                }}><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043F\u0440\u0435\u0434\u043F\u043E\u043B\u0430\u0433\u0430\u0435\u043C\u044B\u0439 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0439 DICOM-\u0441\u0440\u0435\u0437"}/></button>
    </div>)}/>
    <LocalizedUi value={chestNodes.candidates.length > 50 && <p><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u043F\u0435\u0440\u0432\u044B\u0435 50 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432."}/></p>}/>
    <LocalizedUi value={chestNodes.candidates.length === 0 && <p><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432 \u043D\u0435\u0442; \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043B\u0438\u043C\u0444\u0430\u0434\u0435\u043D\u043E\u043F\u0430\u0442\u0438\u0438 \u043D\u0435 \u0434\u043E\u043A\u0430\u0437\u0430\u043D\u043E."}/></p>}/>
  </div>}/>
  <LocalizedUi value={chestPe && <div className="cs-geometry" aria-label={__ui("CTPA \u2014 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C \u0422\u042D\u041B\u0410")}>
    <h3><LocalizedUi value={"\u0422\u042D\u041B\u0410 \u00B7 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0438\u0439 Mazurowski nnU-Net"}/></h3>
    <p><LocalizedUi value={"\u041F\u0440\u043E\u0442\u043E\u043A\u043E\u043B CTPA \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D \u0432\u0440\u0430\u0447\u043E\u043C. \u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u041A\u0422 \u0438 \u043C\u0430\u0441\u043A\u0430 \u0441\u0432\u044F\u0437\u0430\u043D\u044B \u043F\u043E SHA-256. \u041C\u043E\u0434\u0435\u043B\u044C \u043D\u0435 \u0432\u0430\u043B\u0438\u0434\u0438\u0440\u043E\u0432\u0430\u043D\u0430 \u0438 \u0440\u0430\u043D\u0435\u0435 \u043D\u0430 \u043E\u0434\u043D\u043E\u043C FUMPE \u043F\u043E\u043A\u0430\u0437\u0430\u043B\u0430 Dice 0,038. \u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043D\u0430\u0445\u043E\u0434\u043E\u043A \u043D\u0435 \u0438\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u0442\u0440\u043E\u043C\u0431\u043E\u044D\u043C\u0431\u043E\u043B\u0438\u044E."}/></p>
    <p><LocalizedUi value={"\u041F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0445 \u043C\u043E\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439:"}/><LocalizedUi value={chestPe.sourceNativeVoxelPositiveCount}/><LocalizedUi value={"; \u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0445 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432:"}/><LocalizedUi value={chestPe.lesions.length}/>.</p>
    <LocalizedUi value={chestPe.lesions.slice(0, 60).map((c, i) => <div key={i}>
      <p><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442"}/><LocalizedUi value={i + 1}/>: <LocalizedUi value={c.modelCandidateMl.toFixed(3)}/><LocalizedUi value={"\u043C\u043B, RAS"}/><LocalizedUi value={c.sourceRASmm.join(", ")}/><LocalizedUi value={"\u043C\u043C."}/></p>
      <button type="button" onClick={() => {
                    const k = Math.round(c.sourceCentroidIJK[2]);
                    if (k >= 0 && k < series.members.length)
                        onNavigate(k);
                }}><LocalizedUi value={"\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u0440\u0435\u0434\u043F\u043E\u043B\u0430\u0433\u0430\u0435\u043C\u044B\u0439 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0439 DICOM-\u0441\u0440\u0435\u0437"}/></button>
    </div>)}/>
    <LocalizedUi value={chestPe.lesions.length > 60 && <p><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u043F\u0435\u0440\u0432\u044B\u0435 60 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432."}/></p>}/>
  </div>}/>
  <LocalizedUi value={chestEffusion && <div className="cs-geometry">
    <h3><LocalizedUi value={"\u041F\u043B\u0435\u0432\u0440\u0430\u043B\u044C\u043D\u044B\u0439 \u0438 \u043F\u0435\u0440\u0438\u043A\u0430\u0440\u0434\u0438\u0430\u043B\u044C\u043D\u044B\u0439 \u0432\u044B\u043F\u043E\u0442 \u00B7 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0438\u0439 task315"}/></h3>
    <p><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F HU-\u041A\u0422 \u0438 \u043C\u043E\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u043E\u0442\u0447\u0451\u0442 \u0441\u0432\u044F\u0437\u0430\u043D\u044B \u043F\u043E SHA-256. \u041A\u043B\u0430\u0441\u0441 1 \u2014 \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0438\u0439, \u043D\u0435 \u0436\u0438\u0434\u043A\u043E\u0441\u0442\u044C."}/></p>
    <LocalizedUi value={chestEffusion.report.evidence.fluidCandidates.map(c => <div key={c.labelId}>
      <p><strong><LocalizedUi value={c.labelId === 2 ? "Плевральная жидкость" : "Перикардиальная жидкость"}/></strong><LocalizedUi value={": \u043C\u043E\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439"}/><LocalizedUi value={c.modelPositiveNativeVoxelCount}/><LocalizedUi value={"; \u043E\u0431\u044A\u0451\u043C \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0430"}/><LocalizedUi value={c.modelUnvalidatedFluidLabelVolumeMl.toFixed(2)}/><LocalizedUi value={"\u043C\u043B."}/></p>
      <LocalizedUi value={c.nativeSourceSliceIndicesK.length > 0 && <button type="button" onClick={() => {
                        const k = c.nativeSourceSliceIndicesK[Math.floor(c.nativeSourceSliceIndicesK.length / 2)];
                        if (k >= 0 && k < series.members.length)
                            onNavigate(k);
                    }}><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043F\u0440\u0435\u0434\u043F\u043E\u043B\u0430\u0433\u0430\u0435\u043C\u044B\u0439 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 DICOM-\u0441\u0440\u0435\u0437 (\u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u044E)"}/></button>}/>
      <LocalizedUi value={c.modelPositiveNativeVoxelCount === 0 && <p><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432 \u043D\u0435\u0442; \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u0432\u044B\u043F\u043E\u0442\u0430 \u043D\u0435 \u0434\u043E\u043A\u0430\u0437\u0430\u043D\u043E."}/></p>}/>
    </div>)}/>
    <p><LocalizedUi value={"\u041C\u043E\u0434\u0435\u043B\u044C \u043D\u0435 \u0432\u0430\u043B\u0438\u0434\u0438\u0440\u043E\u0432\u0430\u043D\u0430 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E. \u0412\u0440\u0430\u0447 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u0435 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F, \u043E\u0431\u044A\u0451\u043C\u0430 \u0438 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u0430."}/></p>
  </div>}/>
  <LocalizedUi value={chestPlan && (chestNodules || chestEffusion) && <div className="cs-geometry">
    <h3><LocalizedUi value={"\u041F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u00B7 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442 \u0432\u0440\u0430\u0447"}/></h3>
    <label><LocalizedUi value={"\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 \u043A \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430\u043C"}/><textarea data-concilium-report="true" rows={4} maxLength={12000} value={draftText} onChange={e => setDraftText(e.target.value)}/>
    </label>
    <p><LocalizedUi value={"\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435 \u043E\u0431\u0449\u0435\u0433\u043E source-bound \u043E\u0442\u0447\u0451\u0442\u0430 \u0434\u043B\u044F \u0434\u0432\u0443\u0445 \u043C\u043E\u0434\u0435\u043B\u0435\u0439 \u0435\u0449\u0451 \u043D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E; \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u0434\u0435\u0442\u0430\u043B\u044C\u043D\u0443\u044E \u043E\u0446\u0435\u043D\u043A\u0443 MONAI \u0438 \u0430\u043D\u0430\u043B\u0438\u0437 \u0432\u044B\u043F\u043E\u0442\u043E\u0432 \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u043A\u0430\u0434\u0440\u0430\u0445."}/></p>
  </div>}/>
  <LocalizedUi value={brainResult && <section className="cs-geometry" aria-label={__ui("\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0435 \u041C\u0420\u0422 \u2014 \u043C\u043E\u0434\u0435\u043B\u044C\u043D\u044B\u0435 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u044B")}>
    <h3><LocalizedUi value={brainResult.task === "stroke" ? "Ишемические очаги · оригинальный ISLES22 nnU-Net" :
                "Глиома · оригинальный BraTS SegResNet"}/></h3>
    <p><LocalizedUi value={"\u041D\u0430\u0441\u0442\u043E\u044F\u0449\u0430\u044F \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0430. \u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u0441\u0432\u044F\u0437\u0430\u043D\u044B \u043F\u043E SHA-256 \u0441 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u043C\u0438 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u043C\u0438 \u041C\u0420-\u043F\u043E\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044F\u043C\u0438. \u041A\u0430\u0436\u0434\u0430\u044F \u0437\u043E\u043D\u0430 \u2014 \u0442\u043E\u043B\u044C\u043A\u043E \u043D\u0435\u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0439 \u043C\u043E\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442."}/></p>
    <LocalizedUi value={Object.entries(brainResult.modelRegions).map(([kind, region]) => <div key={kind}>
      <h4><LocalizedUi value={kind}/> · <LocalizedUi value={region.sourcePositiveVoxels}/><LocalizedUi value={"\u043C\u043E\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439"}/></h4>
      <LocalizedUi value={region.components.slice(0, 50).map((c, i) => <p key={i}><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442"}/><LocalizedUi value={i + 1}/>: <LocalizedUi value={c.candidateVolumeMl.toFixed(3)}/><LocalizedUi value={"\u043C\u043B; \u0438\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u044F RAS"}/><LocalizedUi value={c.nativeCenterRASmm.join(", ")}/><LocalizedUi value={"\u043C\u043C; \u0438\u043D\u0434\u0435\u043A\u0441 \u0441\u0440\u0435\u0437\u0430"}/><LocalizedUi value={Math.round(c.nativeCenterIJK[2]) + 1}/><LocalizedUi value={"\u0440\u0435\u0444\u0435\u0440\u0435\u043D\u0441\u043D\u043E\u0439"}/><LocalizedUi value={brainResult.sourceReferenceRole.toUpperCase()}/><LocalizedUi value={"\u0441\u0435\u0440\u0438\u0438."}/></p>)}/>
      <LocalizedUi value={region.components.length === 0 && <p><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432 \u043D\u0435\u0442; \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u044F \u043D\u0435 \u0438\u0441\u043A\u043B\u044E\u0447\u0435\u043D\u0430."}/></p>}/>
      <LocalizedUi value={region.components.length > 50 && <p><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u043F\u0435\u0440\u0432\u044B\u0435 50 \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u043E\u0432."}/></p>}/>
    </div>)}/>
    <label><LocalizedUi value={"\u041F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0442\u0435\u043A\u0441\u0442, \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442 \u0432\u0440\u0430\u0447"}/><textarea data-concilium-report="true" rows={5} maxLength={12000} value={draftText} onChange={e => setDraftText(e.target.value)}/>
    </label>
    <p><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u0444\u0438\u0437\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0441\u0435\u0442\u043A\u0430 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0430, \u043D\u043E \u0442\u043E\u0447\u043D\u0430\u044F \u043F\u0440\u0438\u0432\u044F\u0437\u043A\u0430 \u043A DICOM SOP \u0435\u0449\u0451 \u043D\u0435 \u0434\u043E\u043A\u0430\u0437\u0430\u043D\u0430. \u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C \u043D\u0435 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u044F\u0435\u0442 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0434\u0438\u0430\u0433\u043D\u043E\u0437. Gemini/Opus \u043C\u043E\u0433\u0443\u0442 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E \u0430\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u044B\u0435 \u043A\u0430\u0434\u0440\u044B, \u043D\u043E \u043D\u0435 \u0437\u0430\u043C\u0435\u043D\u044F\u044E\u0442 \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044E."}/></p>
  </section>}/>
  <LocalizedUi value={ich && <div>
   <p><strong>ianpan: <LocalizedUi value={ich.findings.length}/><LocalizedUi value={"\u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432."}/></strong><LocalizedUi value={"\u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432 \u043D\u0435 \u0438\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u0435."}/></p>
   <LocalizedUi value={ich.findings.map((f, i) => {
                const slice = series.members.findIndex(m => m.metadata.sopInstanceUid === f.source.sopInstanceUid);
                return <div key={f.findingId + "-" + i}>
       <button type="button" disabled={slice < 0} onClick={() => onNavigate(slice)}>
        <LocalizedUi value={f.sign}/><LocalizedUi value={"\u00B7 \u043F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u043C\u0443 \u0441\u0440\u0435\u0437\u0443"}/><LocalizedUi value={slice + 1}/>
       </button>
       <span> <LocalizedUi value={decisions["ich-" + i] ?? "требует оценки"}/></span>
       <button type="button" onClick={() => setDecisions(s => ({ ...s, ["ich-" + i]: "accepted" }))}><LocalizedUi value={"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C"}/></button>
       <button type="button" onClick={() => setDecisions(s => ({ ...s, ["ich-" + i]: "rejected" }))}><LocalizedUi value={"\u041E\u0442\u043A\u043B\u043E\u043D\u0438\u0442\u044C"}/></button>
     </div>;
            })}/>
  </div>}/>
  <LocalizedUi value={wmh && <div>
   <p><strong>WMH: <LocalizedUi value={wmh.components.length}/><LocalizedUi value={"\u043E\u0447\u0430\u0433\u043E\u0432;"}/><LocalizedUi value={wmh.totalMl.toFixed(2)}/><LocalizedUi value={"\u043C\u043B."}/></strong><LocalizedUi value={"FLAIR-\u0433\u0438\u043F\u0435\u0440\u0438\u043D\u0442\u0435\u043D\u0441\u0438\u0432\u043D\u043E\u0441\u0442\u0438 \u043D\u0435\u0441\u043F\u0435\u0446\u0438\u0444\u0438\u0447\u043D\u044B."}/></p>
   <LocalizedUi value={wmh.components.slice(0, 100).map((c, i) => {
                const slice = Math.floor((c.sourceVoxelBoundsInclusive[0][2] + c.sourceVoxelBoundsInclusive[1][2]) / 2);
                return <div key={c.component}>
      <button type="button" onClick={() => onNavigate(slice)}><LocalizedUi value={"\u041E\u0447\u0430\u0433"}/><LocalizedUi value={i + 1}/>, <LocalizedUi value={c.volumeMl.toFixed(3)}/><LocalizedUi value={"\u043C\u043B \u00B7 \u043F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u0441\u0440\u0435\u0437\u0443"}/><LocalizedUi value={slice + 1}/>
      </button>
      <span> <LocalizedUi value={decisions["wmh-" + c.component] ?? "требует оценки"}/></span>
      <button type="button" onClick={() => setDecisions(s => ({ ...s, ["wmh-" + c.component]: "accepted" }))}><LocalizedUi value={"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C"}/></button>
      <button type="button" onClick={() => setDecisions(s => ({ ...s, ["wmh-" + c.component]: "rejected" }))}><LocalizedUi value={"\u041E\u0442\u043A\u043B\u043E\u043D\u0438\u0442\u044C"}/></button>
     </div>;
            })}/>
   <LocalizedUi value={wmh.components.length > 100 && <p><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u043F\u0435\u0440\u0432\u044B\u0435 100 \u043E\u0447\u0430\u0433\u043E\u0432."}/></p>}/>
  </div>}/>
  <LocalizedUi value={(ich || wmh) && <div className="cs-geometry" aria-label={__ui("\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u0443\u0435\u043C\u044B\u0439 \u043F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0432\u0440\u0430\u0447\u0435\u0431\u043D\u044B\u0439 \u043E\u0442\u0447\u0451\u0442")}>
   <h3><LocalizedUi value={"\u041F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u00B7 \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u0443\u0435\u0442 \u0432\u0440\u0430\u0447"}/></h3>
   <label><LocalizedUi value={"\u0422\u0435\u043A\u0441\u0442 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A\u0430"}/><textarea data-concilium-report="true" rows={5} maxLength={12000} value={draftText} disabled={exporting} onChange={e => setDraftText(e.target.value)}/>
   </label>
   <button type="button" disabled={exporting || !draftText.trim()} onClick={() => void saveUnsignedDraft()}>
     <LocalizedUi value={exporting ? "Сверяем SHA-256 исходных DICOM..." : "Сохранить неподписанный отчёт и решения врача"}/>
   </button>
   <p><LocalizedUi value={"\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 JSON \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0435 SOP/Series UID, SHA-256 \u043A\u0430\u0436\u0434\u043E\u0433\u043E DICOM, \u0432\u0435\u0440\u0441\u0438\u044E/\u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u043C\u043E\u0434\u0435\u043B\u0438, \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u044B \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432 \u0438 \u0440\u0435\u0448\u0435\u043D\u0438\u044F \u0432\u0440\u0430\u0447\u0430. \u041D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u0439\u0442\u0435 \u0442\u0430\u043A\u043E\u0439 \u0444\u0430\u0439\u043B \u0432 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0439 GitHub \u0438\u043B\u0438 \u043E\u0431\u043B\u0430\u0447\u043D\u044B\u0439 LLM. \u042D\u0442\u043E \u043D\u0435 \u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043D\u043E\u0435 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435."}/></p>
  </div>}/>
  <LocalizedUi value={chestCln && chestSource && <ClnOriginalPhysicianReview report={chestCln} series={sourceSeries} source={chestSource} sourceFiles={clnSourceFiles} onNavigate={onNavigate} onVerifiedCandidates={verified => onClnBoundReady?.(series.key, verified)}/>}/>
   <LocalizedUi value={lungscapeResult && <p role="status"><LocalizedUi value={"LungSCAPE191: \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0438\u0439 \u0438\u043D\u0444\u0435\u0440\u0435\u043D\u0441 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D, \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u043E\u0432"}/><LocalizedUi value={lungscapeResult.componentCount}/><LocalizedUi value={". \u041A\u043B\u0430\u0441\u0441\u044B \u043C\u043E\u0434\u0435\u043B\u0438 \u043D\u0435 \u044F\u0432\u043B\u044F\u044E\u0442\u0441\u044F \u0434\u0438\u0430\u0433\u043D\u043E\u0437\u043E\u043C ILD/UIP/IPF."}/></p>}/>
  <LocalizedUi value={(chestNodules || chestCln || lungscapeResult || chestEffusion || chestPe || chestNodes || abdomenResult || ich || wmh || brainResult) &&
            <details><summary><LocalizedUi value={"\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u00B7 \u0447\u0438\u0441\u043B\u043E\u0432\u043E\u0439 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u043A\u043E\u043D\u0441\u0438\u043B\u0438\u0443\u043C (\u043D\u0435 \u043E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 Vision)"}/></summary><DetectorGeminiOpusConsilium onBundleReady={bundle => onDetectorEvidence?.(series.key, bundle)} snapshot={{
                    modality: series.modality as "CT" | "MR",
                    region: plan.route === "monai-nodules" ? "chest" :
                        plan.route === "totalseg-abdomen" ? "abdomen" : "brain",
                    nativeSourceSha256: lungscapeResult?.sourceNiftiSha256 ?? chestCln?.sourceNiftiSha256 ?? chestNodules?.source.sha256 ??
                        chestEffusion?.sourceSha256 ??
                        chestPe?.sourceNiftiSHA256 ??
                        chestNodes?.sourceNiftiSHA256 ??
                        abdomenResult?.sourceNiftiSha256 ?? null,
                    nodules: chestNodules, cln: chestCln, lungscape: lungscapeResult, effusion: chestEffusion, pe: chestPe, nodes: chestNodes,
                    abdomen: abdomenResult, ich, wmh, brain: brainResult,
                }}/></details>}/>
  </details>
 </section>;
}
