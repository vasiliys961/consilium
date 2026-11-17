"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DicomSeries } from '../lib/dicom-series';
import type { VisionPrivacyPacket } from '../lib/vision-privacy';
import { MAX_PRIVACY_PIXELS } from '../lib/vision-privacy';
import { planOriginalVolumeSource } from '../lib/vision-volume-source';
import { decodeDicomPreview } from '../lib/dicom-lite';
import { appendGeminiVolumeReceipt, canPayForNextBatch, makeSafeVolumeOpusInput, volumeLedger, type LocalVolumeReceipt } from '../lib/full-volume-receipts';
import { volumeTechnicalContext } from '../lib/volume-technical-context';
import type { VolumeGeminiBatchResult } from '../lib/approved-volume-batch-review';
import type { FullVolumeOpusResult } from '../lib/full-volume-opus-synthesis';
import type { SanitizedDetectorBundle } from '../lib/detector-consilium-evidence';
import { CT_REVIEW_WINDOWS, separateWindowPass, suggestCtReviewWindows, withSeparateWindowBatches, type CtReviewWindow } from '../lib/ct-review-window';
import { selectArgonVisualInput, type TargetedVisualInput } from '../lib/opus-targeted-visual-review';
import type { ClnVerifiedLocalEvidence } from '../lib/cln-physician-local-review';
import { clnDetectorRecheck, type BoundDetectorRecheck } from '../lib/cln-detector-recheck';
import FindingMeasurementReview, { type AcceptedFindingMeasurement } from './FindingMeasurementReview';
import MrSeriesComparison from './MrSeriesComparison';
import StudyPrivacyReview from './StudyPrivacyReview';
import {reviewedConnectionNotice} from '../lib/reviewed-connection-notice';
import {singleFramePilotAllowed} from '../lib/single-frame-pilot';
import StudyReportDiscussion from './StudyReportDiscussion';
import { estimateStudyCost, opusUsageEstimate, argonUsageEstimate } from '../lib/study-cost-estimate';
import { splitReviewedTransport } from '../lib/reviewed-packet-transport';
import type { VisionBatch } from '../lib/vision-batch-ledger';
import { parseStudySliceSelection } from '../lib/study-slice-selection';
type Stage = 'idle' | 'preparing' | 'review' | 'gemini' | 'interrupted' | 'opus' | 'completed';
export default function ReviewedSeriesAnalysis({ series, files, onOpenSlice, onInspectFinding, detectorStage, detectorEvidence, allSeries = [], clnVerifiedLocal = null }: {
    clnVerifiedLocal?: ClnVerifiedLocalEvidence | null;
    allSeries?: readonly DicomSeries[];
    series: DicomSeries;
    files: ReadonlyMap<string, File>;
    onOpenSlice: (id: string) => void;
    onInspectFinding?: (id: string, window: {
        width: number;
        center: number;
    } | null) => void;
    detectorStage: 'idle' | 'running' | 'completed' | 'vision-only' | 'cancelled';
    detectorEvidence: SanitizedDetectorBundle | null;
}) {
    const __ui = useUiTranslator();
    const [executionBatches, setExecutionBatches] = useState<VisionBatch[] | null>(null);
    const [opusSpent, setOpusSpent] = useState(0);
    const [stopReason, setStopReason] = useState('');
    const [clinicalContext, setClinicalContext] = useState('');
    const [visualMode, setVisualMode] = useState('selected'), [physicianSlices, setPhysicianSlices] = useState('');
    const [selection, setSelection] = useState('all'), [selectionText, setSelectionText] = useState('1');
    const [measureSource, setMeasureSource] = useState<{
        sourceIndex: number;
        findingKey: string;
    } | null>(null);
    const [acceptedMeasurements, setAcceptedMeasurements] = useState<AcceptedFindingMeasurement[]>([]);
    const [additionalWindow, setAdditionalWindow] = useState<CtReviewWindow | 'NONE'>(() => suggestCtReviewWindows(series).additional);
    const [reviewWindow, setReviewWindow] = useState<CtReviewWindow>(() => suggestCtReviewWindows(series).primary), [visualEnabled, setVisualEnabled] = useState(true);
    const attemptedDetectorKeys = useRef(new Set<string>());
    const detectorKey = (a: BoundDetectorRecheck) => [a.candidateId, a.sourceIndex, a.xFraction, a.yFraction].join(':');
    const approvedPackets = useRef<VisionPrivacyPacket[]>([]);
    const detectorLocations = useMemo(() => {
        try {
            return { anchors: clnDetectorRecheck(series, clnVerifiedLocal), error: false };
        }
        catch {
            return { anchors: [] as BoundDetectorRecheck[], error: true };
        }
    }, [series, clnVerifiedLocal]);
    const locationsRef = useRef(detectorLocations);
    useEffect(() => { locationsRef.current = detectorLocations; }, [detectorLocations]);
    const targetedVisual = useRef<TargetedVisualInput | null>(null);
    const [analysisResult,setAnalysisResult] = useState<import('../lib/argon-volume-analysis').ArgonVolumeResult>();
    const lastAnalysisPayload=useRef<unknown>(null);
    const [secondOpinionBusy,setSecondOpinionBusy]=useState(false);
    const [opusUsage, setOpusUsage] = useState<FullVolumeOpusResult['receipt']>();
    const [visualResult, setVisualResult] = useState<FullVolumeOpusResult['visualReview']>();
    const [stage, setStage] = useState<Stage>('idle'), [notice, setNotice] = useState('');
    const noticeElement = useRef<HTMLParagraphElement | null>(null);
    useEffect(() => {
        if (stage === 'interrupted')
            noticeElement.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, [stage, notice]);
    const [budget, setBudget] = useState(2), [connected, setConnected] = useState(false);
    const [connectionAttempt, setConnectionAttempt] = useState(0);
    const [singleSliceTest, setSingleSliceTest] = useState(false);
    const [connectionDiagnostic, setConnectionDiagnostic] = useState('');
    const [receipts, setReceipts] = useState<LocalVolumeReceipt[]>([]), [report, setReport] = useState('');
    const ctl = useRef<AbortController | null>(null), sending = useRef(false);
    const detector = useRef({ stage: detectorStage, evidence: detectorEvidence });
    useEffect(() => { detector.current = { stage: detectorStage, evidence: detectorEvidence }; }, [detectorStage, detectorEvidence]);
    const selectionResult = useMemo(() => {
        try {
            return { indices: selection === 'all' ? series.members.map((_, i) => i) : parseStudySliceSelection(selectionText, series.members.length), error: '' };
        }
        catch (e) {
            return { indices: [] as number[], error: e instanceof Error ? e.message : 'Ошибка выбора срезов' };
        }
    }, [selection, selectionText, series]);
    const physicianSelection = useMemo(() => {
        try {
            const indices = physicianSlices.trim() ? parseStudySliceSelection(physicianSlices, series.members.length) : [];
            if (indices.length > 16)
                throw Error('Для дополнительной проверки выберите не более 16 срезов.');
            if (indices.some(n => !selectionResult.indices.includes(n)))
                throw Error('Добавьте указанные для Opus срезы в основной выбор анализа.');
            return { indices, error: '' };
        }
        catch (e) {
            return { indices: [] as number[], error: e instanceof Error ? e.message : 'Ошибка выбора для Opus' };
        }
    }, [physicianSlices, selectionResult, series]);
    const windowPlan = useMemo(() => suggestCtReviewWindows(series), [series]);
    const separate = separateWindowPass(windowPlan.delivery, additionalWindow, selectionResult.error ? 0 : selectionResult.indices.length);
    const basePlan = useMemo(() => {
        try {
            return planOriginalVolumeSource(series, { maxGeminiUSD: budget, selectedIndices: selectionResult.error ? undefined : selectionResult.indices });
        }
        catch {
            return null;
        }
    }, [series, budget, selectionResult]);
    const expandedPlan = useMemo(() => basePlan ? { ...basePlan, batches: withSeparateWindowBatches(basePlan.batches, separate) } : null, [basePlan, separate]);
    const plan = useMemo(() => expandedPlan ? (executionBatches ? { ...expandedPlan, batches: executionBatches } : expandedPlan) : null, [expandedPlan, executionBatches]);
    useEffect(() => { setExecutionBatches(null); }, [selection, selectionText]);
    useEffect(() => {
        ctl.current?.abort();
        ctl.current = null;
        sending.current = false;
        targetedVisual.current = null;
        approvedPackets.current = [];
        attemptedDetectorKeys.current = new Set();
        setVisualResult(undefined);
        setOpusUsage(undefined);setAnalysisResult(undefined);setSecondOpinionBusy(false);lastAnalysisPayload.current=null;
        setReviewWindow(suggestCtReviewWindows(series).primary);
        setAdditionalWindow(suggestCtReviewWindows(series).additional);
        setExecutionBatches(null);
        setOpusSpent(0);
        setStopReason('');
        setClinicalContext('');
        setSelection('all');
        setSelectionText('1');
        setVisualMode('selected');
        setPhysicianSlices('');
        setMeasureSource(null);
        setAcceptedMeasurements([]);
        setStage('idle');
        setSingleSliceTest(false);
        setReceipts([]);
        setReport('');
    }, [series, files]);
    useEffect(() => {
        const c = new AbortController();
        void fetch('/api/ai/deidentified-openrouter-review', {
            cache: 'no-store', credentials: 'same-origin', signal: c.signal
        }).then(async (r) => r.ok ? r.json() : null)
            .then(d => {
            if (!c.signal.aborted) {
                setConnected(d?.enabled === true && d?.workstationConnected === true);
                const diagnostic = reviewedConnectionNotice(d);
                setConnectionDiagnostic(diagnostic);
                setNotice(diagnostic);
            }
        })
            .catch(() => {
            if (!c.signal.aborted)
                setConnectionDiagnostic('Локальный сервер подключения недоступен. Снимки остаются локально.');
                setNotice('Локальный сервер подключения недоступен.');
        });
        return () => { c.abort(); ctl.current?.abort(); };
    }, [connectionAttempt]);
    const ledger = plan ? volumeLedger(plan.budget, plan.batches, receipts) : null;
    async function prepare(index: number, signal: AbortSignal) {
        if (!plan)
            throw Error('Исходная серия не подтверждена.');
        const next: string[] = [];
        const batch = plan.batches[index];
        const paired = windowPlan.delivery === 'paired' && additionalWindow !== 'NONE' && batch.pass !== 'targeted';
        const active: CtReviewWindow = batch.pass === 'targeted' && additionalWindow !== 'NONE' ? additionalWindow : reviewWindow;
        for (const n of batch.indices) {
            signal.throwIfAborted();
            const file = files.get(series.members[n].id);
            if (!file || file.size > 6 * 1024 * 1024)
                throw Error('Не удалось подготовить исходный срез ' + (n + 1) + '. Серия не будет помечена полностью просмотренной.');
            let url: string;
            try {
                url = (await decodeDicomPreview(file, { maxPixels: MAX_PRIVACY_PIXELS, reviewWindow: active, additionalWindow: paired ? additionalWindow : undefined })).url;
            }
            catch {
                const { decodeCornerstoneVisionPreview } = await import('../lib/cornerstone-vision-preview');
                url = await decodeCornerstoneVisionPreview(file, MAX_PRIVACY_PIXELS, signal, active, paired ? additionalWindow : undefined);
            }
            signal.throwIfAborted();
            next.push(url);
        }
        return next;
    }
    function inspect(id: string) {
        const preset = series.modality === 'CT' ? CT_REVIEW_WINDOWS[reviewWindow] : null;
        const window = preset && preset.center !== null && preset.width !== null ? { width: preset.width, center: preset.center } : null;
        if (onInspectFinding)
            onInspectFinding(id, window);
        else
            onOpenSlice(id);
    }
    function interrupted(e: unknown) {
        setStage('interrupted');
        setNotice(ctl.current?.signal.aborted ?
            'Анализ остановлен. Уже полученные наблюдения сохранены в этой вкладке.' : e instanceof Error ? e.message : 'Анализ не завершён.');
    }
    async function start() {
        if (!plan || selectionResult.error || (visualEnabled && physicianSelection.error) || sending.current || stage !== 'idle')
            return;
        if (singleSliceTest && !singleFramePilotAllowed(selectionResult.indices, plan.batches))
            return;
        const c = new AbortController();
        ctl.current = c;
        setStage('review');
    }
    async function finalize(done: LocalVolumeReceipt[], signal: AbortSignal, executionPlan = plan) {
        const plan = executionPlan;
        if (!plan)
            throw Error('План серии потерян.');
        const completedBatches = plan.batches.slice(0, done.length);
        const completedIndices = completedBatches.filter(b => b.pass === 'overview').flatMap(b => b.indices);
        const completedBudget = { ...plan.budget, overviewIndices: completedIndices, targetedIndices: [] };
        setStage('opus');
        setNotice('Argon составляет заключение по ' + completedIndices.length + ' из ' + series.members.length + ' исходных срезов. Остальные не оцениваются.');
        const pendingCln = () => !locationsRef.current.error && !locationsRef.current.anchors.length && detector.current.evidence?.facts.some(f => f.task === 'lung_tumor' && f.status === 'completed' && (f.candidateCount ?? 0) > 0);
        const began = Date.now();
        while ((detector.current.stage === 'running' || pendingCln()) && Date.now() - began < 30000) {
            signal.throwIfAborted();
            await new Promise(r => setTimeout(r, 250));
        }
        signal.throwIfAborted();
        const d = detector.current;
        attemptedDetectorKeys.current = new Set(locationsRef.current.anchors.map(detectorKey));
        const previousVisual = targetedVisual.current;
        const overviewSlots = completedBatches.flatMap((b, i) => b.pass === 'overview' ? [i] : []);
        const overviewPackets = overviewSlots.map(i => approvedPackets.current[i]);
        targetedVisual.current = overviewPackets.length === overviewSlots.length && overviewPackets.every(Boolean) ? selectArgonVisualInput(overviewPackets, overviewSlots.map(i => done[i]), locationsRef.current.anchors, completedIndices, physicianSelection.indices) : null;
        // Keep identical reviewed packets stable so explicit retries reuse the server checkpoint.
        targetedVisual.current?.packets.forEach((packet, i) => {
            const previous = previousVisual?.packets[i];
            if (previous && JSON.stringify(previous.frames) === JSON.stringify(packet.frames))
                packet.packetId = previous.packetId;
        });
        const separateRan = completedBatches.some(b => b.pass === 'targeted');
        const pairedWindows = windowPlan.delivery === 'paired' && additionalWindow !== 'NONE';
        if (targetedVisual.current)
            targetedVisual.current.windows = { primary: reviewWindow, ...(pairedWindows ? { additional: additionalWindow } : {}) };
        const input = makeSafeVolumeOpusInput(series.modality as 'CT' | 'MR', completedBudget, completedBatches, done, d.evidence, d.stage === 'running' ? 'timeout' : d.evidence?.facts.some(f => f.status === 'completed') ? 'completed' : 'unavailable');
        input.reviewWindows = { primary: reviewWindow, ...(additionalWindow !== 'NONE' && (pairedWindows || separateRan) ? { additional: additionalWindow } : {}) };
        if (clinicalContext.trim())
            input.clinicalContext = clinicalContext.trim();
        input.sourceTotalFrames = series.members.length;
        input.sourceSliceNumbers = completedIndices.map(n => n + 1);
        input.limitations = [...input.limitations.slice(0, 28), 'Оценены только ' + completedIndices.length + ' из ' + series.members.length + ' исходных срезов. Остальные не оценены; это не исключает патологию вне выборки.'];
        if (series.modality === 'CT') {
            const windowText = separateRan ? 'Окна отдельными копиями одного среза: ' + CT_REVIEW_WINDOWS[reviewWindow].label + ' и ' + CT_REVIEW_WINDOWS[additionalWindow as CtReviewWindow].label + '. Это не два среза. Остальные окна не оценены.' : pairedWindows ? 'Окна обзора: ' + CT_REVIEW_WINDOWS[reviewWindow].label + '; справа ' + CT_REVIEW_WINDOWS[additionalWindow].label + '. Остальные окна не оценены.' : 'Окно обзора: ' + CT_REVIEW_WINDOWS[reviewWindow].label + '. Второе окно на копиях не готовилось. Остальные окна не оценены.';
            input.limitations = [...input.limitations.slice(0, 29), windowText];
        }
        const excludedBySize = visualMode === 'selected' && plan.budget.overviewIndices.length <= 16 ? completedIndices.filter(n => !targetedVisual.current?.sliceNumbers.includes(n + 1)) : [];
        const physicianNotReviewed = physicianSelection.indices.filter(n => !targetedVisual.current?.sliceNumbers.includes(n + 1));
        if (visualEnabled && physicianNotReviewed.length)
            input.limitations = [...input.limitations.slice(0, 28), 'Указанные врачом срезы не просмотрены Opus: ' + physicianNotReviewed.map(n => n + 1).join(', ') + '. Они могли не пройти обзор Gemini или не поместиться в передачу.'];
        if (visualEnabled && excludedBySize.length)
            input.limitations = [...input.limitations.slice(0, 29), 'В независимый просмотр Opus не поместились срезы ' + excludedBySize.map(n => n + 1).join(', ') + '. Они требуют проверки врачом; ограничение размера передачи сохранено.'];
        if (done.some(r => r.recheckIndices === undefined))
            input.limitations = [...input.limitations.slice(0, 29), 'Для части групп Gemini не вернул структурированный список спорных/очаговых кадров. Отсутствие списка не является отсутствием патологии.'];
        if (visualEnabled) {
            const eligible = new Set([...done.flatMap(r => r.recheckIndices ?? []), ...locationsRef.current.anchors.map(a => a.sourceIndex)]).size;
            if (eligible > 16)
                input.limitations = [...input.limitations.slice(0, 29), 'Для визуальной перепроверки отмечено ' + eligible + ' срезов. Из-за потолка 16 остальные ' + (eligible - 16) + ' требуют проверки врачом.'];
        }
        if (!locationsRef.current.anchors.length && d.evidence?.facts.some(f => f.status === 'completed' && (f.candidateCount ?? 0) > 0))
            input.limitations = [...input.limitations.slice(0, 29), 'Положительные детекторные кандидаты переданы агрегированно, без координат. Автоматическая визуальная перепроверка именно детекторных расхождений не выполнена.'];
        const payload = targetedVisual.current ? { synthesis: input, visualReview: targetedVisual.current } : input;
        lastAnalysisPayload.current=payload;
        const response = await fetch('/api/ai/complete-volume-opus', { method: 'POST', credentials: 'same-origin', signal,
            headers: { 'Content-Type': 'application/json', 'X-Opus-Reviewed-Volume': '1' }, body: JSON.stringify(payload) });
        if (!response.ok) {
            const detail = await response.json().catch(() => null);
            throw Error((response.status === 429 ? 'Opus занят или достигнут лимит итоговых запросов (2 за 20 минут). Повторите позже.' : detail?.message ?? ('Итоговое заключение не получено (' + response.status + ').')) + ' Наблюдения Gemini сохранены; повторного запуска Gemini не требуется.' + (detail?.visualReviewPreserved ? ' Визуальная перепроверка Opus сохранена на сервере на 10 минут: при повторе того же запроса она не оплачивается заново.' : ''));
        }
        const output = await response.json() as import('../lib/argon-volume-analysis').ArgonVolumeResult;
        setAnalysisResult(output);
        signal.throwIfAborted();
        if (output.schema !== 'opus-full-volume-radiologist/v1' || output.modality !== series.modality ||
            output.overviewReviewed !== completedIndices.length || output.plannedFrames !== completedIndices.length ||
            typeof output.finalReport !== 'string' || !output.physicianSignatureRequired)
            throw Error('Сервер не подтвердил охват итогового заключения.');
        setVisualResult(output.visualReview);
        setOpusUsage(output.receipt);
        setOpusSpent(argonUsageEstimate(output.receipt) + (output.visualReview?.status === 'completed' ? opusUsageEstimate(output.visualReview.receipt) : 0));
        setReport(output.finalReport);
        setStage('completed');
        setNotice('Заключение готово. Проверьте его по исходным изображениям.');
    }
    async function submitAll(packets: VisionPrivacyPacket[], resume = false) {
        if (!plan || !connected || sending.current || (!resume && stage !== 'review') || packets.length !== plan.batches.length)
            return;
        let execution: {
            packets: VisionPrivacyPacket[];
            batches: VisionBatch[];
        };
        try {
            execution = resume ? { packets, batches: plan.batches } : splitReviewedTransport(packets, plan.batches);
        }
        catch (e) {
            interrupted(e);
            return;
        }
        packets = execution.packets;
        if (singleSliceTest && (!singleFramePilotAllowed(selectionResult.indices, execution.batches) || packets.length !== 1)) {
            interrupted(Error('Тест допускает только один проверенный срез и один запрос Gemini.'));
            return;
        }
        const batchPlan = { ...plan, batches: execution.batches };
        setExecutionBatches(execution.batches);
        approvedPackets.current = packets;
        let current = receipts;
        if (!canPayForNextBatch(plan.budget, batchPlan.batches, current)) {
            interrupted(Error('Достигнут лимит расходов Gemini. Частичный результат сохранён.'));
            return;
        }
        const signal = ctl.current!.signal;
        sending.current = true;
        setStage('gemini');
        setStopReason('');
        let synthesizing = false;
        try {
            for (let batchIndex = current.length; batchIndex < batchPlan.batches.length; batchIndex++) {
                signal.throwIfAborted();
                if (!canPayForNextBatch(plan.budget, batchPlan.batches, current))
                    throw Error('Достигнут лимит расходов Gemini. Частичный результат сохранён.');
                const packet = packets[batchIndex], batch = batchPlan.batches[batchIndex];
                if (packet.frames.length !== batch.indices.length)
                    throw Error('Проверенная группа не совпадает с планом серии.');
                const response = await fetch('/api/ai/approved-volume-gemini-batch', { method: 'POST', credentials: 'same-origin', signal,
                    headers: { 'Content-Type': 'application/json', 'X-Opus-Reviewed-Volume': '1' },
                    body: JSON.stringify({ packet, acknowledgeClinicianLawfulDisclosure: true, acknowledgeProviderHealthDataTerms: true,
                        acknowledgePixelIdentityReviewed: true, acknowledgeOnePaidGeminiBatch: true,
                        frameContext: { totalFrames: series.members.length, sliceNumbers: batch.indices.map(n => n + 1), technical: { ...volumeTechnicalContext(series), window: batch.pass === 'targeted' && additionalWindow !== 'NONE' ? additionalWindow : reviewWindow, ...(windowPlan.delivery === 'paired' && additionalWindow !== 'NONE' && batch.pass !== 'targeted' ? { additionalWindow } : {}) } } }) });
                if (!response.ok) {
                    const detail = await response.json().catch(() => null);
                    const done = batchPlan.batches.slice(0, current.length).flatMap(b => b.indices).map(n => n + 1);
                    const next = batch.indices[0] + 1;
                    throw Error((done.length ? 'Подтверждено ' + done.length + ' срезов, последний — ' + done[done.length - 1] + '. ' : 'Ни один срез ещё не подтверждён. ') + 'Следующий запрос — со среза ' + next + '. Уже полученные ответы повторно не отправляются. ' + (detail?.message ?? ('Ответ сервера ' + response.status)) + '.');
                }
                const answer = await response.json() as VolumeGeminiBatchResult;
                signal.throwIfAborted();
                if (answer.modality !== series.modality)
                    throw Error('Ответ относится к другой модальности.');
                const done = appendGeminiVolumeReceipt(current, batchPlan.batches, batchIndex, answer);
                setReceipts(done);
                current = done;
            }
            approvedPackets.current = packets;
            if (singleSliceTest) {
                setStage('completed');
                setNotice('Тест завершён: наблюдения Gemini по одному срезу получены. Argon/Opus не вызывались. Остальная серия не оценена.');
                return;
            }
            synthesizing = true;
            await finalize(current, signal, batchPlan);
        }
        catch (e) {
            if (ctl.current?.signal === signal) {
                if (!singleSliceTest && !synthesizing && current.length > 0 && !signal.aborted) {
                    setStopReason(e instanceof Error ? e.message : 'Обзор Gemini прервался.');
                    // One authorized final synthesis from actual completed receipts; never retry
                    // the failed Gemini call or a failed Opus request automatically.
                    try {
                        await finalize(current, signal, batchPlan);
                    }
                    catch (finalError) {
                        if (ctl.current?.signal === signal)
                            interrupted(finalError);
                    }
                }
                else
                    interrupted(e);
            }
        }
        finally {
            if (ctl.current?.signal === signal)
                sending.current = false;
        }
    }
    function save() {
        const count = ledger?.processedOverviewFrames ?? 0;
        const text = report || ['НЕПОЛНЫЙ АНАЛИЗ. Оценено ' + count + ' из ' + series.members.length + ' срезов.',
            'Ниже — наблюдения Gemini, не итоговое заключение врача.',
            ...receipts.flatMap(r => r.findings.map(f => 'Срез ' + (f.sourceIndex + 1) + ': ' + f.anatomy + ' — диагноз: ' + f.sign + (f.morphology ? '. Основание: ' + f.morphology : '') + '.')),
            ...receipts.flatMap(r => r.limitations)].join('\n');
        const url = URL.createObjectURL(new Blob([text.trim() + (visualResult?.status==='completed'?'\n\nНЕЗАВИСИМОЕ ВТОРОЕ МНЕНИЕ OPUS (для сопоставления врачом):\n'+visualResult.observations.map(o=>'Срез '+o.sliceNumber+': '+o.anatomy+' — '+o.sign+'. '+o.uncertainty).join('\n'):'') + '\n'], { type: 'text/plain;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = report ? 'opus-study-report.txt' : 'opus-partial-observations.txt';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    if (!plan)
        return <p role="alert"><LocalizedUi value={"Геометрия серии не подтверждена. Полный анализ не запускается; исходные снимки доступны для просмотра."}/></p>;
    const recheckCount = new Set([...receipts.flatMap(r => r.recheckIndices ?? []), ...detectorLocations.anchors.map(a => a.sourceIndex)]).size;
    const processed = ledger?.processedOverviewFrames ?? 0;
    const processedIndices = plan.batches.slice(0, receipts.length).flatMap(b => b.indices);
    const flagged = [...new Set([...receipts.flatMap(r => r.recheckIndices ?? []), ...detectorLocations.anchors.map(a => a.sourceIndex)])].filter(n => processedIndices.includes(n)).sort((a, b) => a - b);
    const estimate = estimateStudyCost(plan.budget.overviewIndices.length, plan.batches.length, receipts, processed, visualEnabled);
    const opusCost = opusUsage ? opusSpent : null;
    const busy = ['preparing', 'gemini', 'opus'].includes(stage);
    return <section className="reviewed-study" aria-label={__ui("Последовательный анализ выбранной серии")}>
  <MrSeriesComparison series={series} allSeries={allSeries} files={files} onOpenSlice={onOpenSlice}/>
  <LocalizedUi value={detectorLocations.error && <p role="alert"><LocalizedUi value={"Координаты детектора не соответствуют выбранным исходным срезам. Пространственная перепроверка не выполнена."}/></p>}/>
  <LocalizedUi value={detectorLocations.anchors.length > 0 && <section aria-label={__ui("Координаты детекторных находок для перепроверки")}>
   <p><LocalizedUi value={"CLN: исходные координаты привязаны к"}/><LocalizedUi value={detectorLocations.anchors.length}/><LocalizedUi value={"кандидатам. Их срезы входят в подборку Argon в пределах общего потолка 16. Фактический охват указан в результате."}/></p>
   <LocalizedUi value={detectorLocations.anchors.slice(0, 16).map(a => <p key={a.candidateId}><button type="button" onClick={() => onOpenSlice(series.members[a.sourceIndex].id)}><LocalizedUi value={"Кандидат"}/><LocalizedUi value={a.candidateId}/><LocalizedUi value={"· срез"}/><LocalizedUi value={a.sourceIndex + 1}/></button><LocalizedUi value={"· центр исходного кадра: X"}/><LocalizedUi value={(a.xFraction * 100).toFixed(1)}/>%, Y <LocalizedUi value={(a.yFraction * 100).toFixed(1)}/><LocalizedUi value={"%. Это координаты кандидата, не подтверждённый диагноз."}/></p>)}/>
  </section>}/>
  <p><LocalizedUi value={singleSliceTest ? 'Проверка одного среза: один платный запрос Gemini. Argon и Opus не вызываются. Это не заключение по исследованию.' : 'Flash просматривает выбранный объём. Argon получает значимые участки, соседние и контрольные срезы и составляет протокол. Opus — при существенном расхождении или по кнопке врача.'}/></p><h2><LocalizedUi value={"Анализ КТ/МРТ · в серии"}/><LocalizedUi value={series.members.length}/><LocalizedUi value={"срезов"}/></h2>
  <p role="status"><strong><LocalizedUi value={"Обработано"}/><LocalizedUi value={processed}/><LocalizedUi value={"из"}/><LocalizedUi value={plan.budget.overviewIndices.length}/><LocalizedUi value={"выбранных срезов."}/></strong><LocalizedUi value={"Всего в серии:"}/><LocalizedUi value={series.members.length}/><LocalizedUi value={". Не оценено в серии:"}/><LocalizedUi value={series.members.length - processed}/>.</p>
  <p role="status"><LocalizedUi value={stage === 'gemini' ? (singleSliceTest ? 'Gemini анализирует один проверенный срез; дополнительных платных моделей нет.' : 'Gemini просматривает снимки. Затем результаты автоматически поступят Opus для заключения.') : stage === 'opus' ? 'Результаты Gemini переданы Opus. Формируется заключение…' : stage === 'completed' ? (singleSliceTest ? 'Тест завершён: наблюдения по одному срезу, не заключение по исследованию.' : (processed < series.members.length ? 'Предварительное заключение готово по обработанной части исследования.' : 'Предварительное заключение готово.')) : stage === 'interrupted' ? 'Обработка приостановлена. Полученные результаты сохранены.' : 'Выберите снимки, проверьте подготовленные копии и запустите анализ.'}/></p>
  <LocalizedUi value={(report || receipts.length > 0) && <section aria-label={__ui("Диагноз по обработанным срезам")}>
   <LocalizedUi value={report && <label><LocalizedUi value={"Предварительное заключение · проверьте и отредактируйте"}/><textarea data-concilium-report="true" rows={18} style={{ width: '100%' }} value={report} onChange={e => setReport(e.target.value)}/></label>}/>
   <LocalizedUi value={receipts.length > 0 && <button type="button" onClick={save}><LocalizedUi value={report ? 'Сохранить заключение TXT' : 'Сохранить промежуточный результат'}/></button>}/>
   {analysisResult && <section aria-label="Читатели исследования"><p>Flash: {analysisResult.overviewReviewed} срезов. Argon: {analysisResult.argonSliceNumbers.length} изображений. Opus: {analysisResult.secondOpinion.status === 'completed' ? 'второе мнение получено' : analysisResult.secondOpinion.status === 'unavailable' ? 'второе мнение не получено' : 'не вызывался'}.</p>
    {flagged.some(n=>!analysisResult.argonSliceNumbers.includes(n+1))&&<p role="status">Часть отмеченных Flash/детектором срезов не поместилась в подборку Argon. Они остаются в исходном просмотре и требуют отдельной проверки.</p>}
    {analysisResult.materialConflicts.map((c,i)=><p key={i}><strong>{c.issue}</strong> Срезы: {c.sliceNumbers.join(', ') || 'не локализованы'}. Проверить: {c.verification}</p>)}
    <button type="button" disabled={secondOpinionBusy || analysisResult.secondOpinion.status === 'completed' || !lastAnalysisPayload.current} onClick={async()=>{
      const c=new AbortController();ctl.current=c;setSecondOpinionBusy(true);try{
       const original=lastAnalysisPayload.current as Record<string,unknown>;const payload='synthesis' in original?{...original,secondOpinion:true}:{synthesis:original,secondOpinion:true};
       const response=await fetch('/api/ai/complete-volume-opus',{method:'POST',credentials:'same-origin',signal:c.signal,headers:{'Content-Type':'application/json','X-Opus-Reviewed-Volume':'1'},body:JSON.stringify(payload)});
       if(!response.ok)throw Error('Второе мнение не получено. Основное заключение сохранено.');
       const next=await response.json() as import('../lib/argon-volume-analysis').ArgonVolumeResult;c.signal.throwIfAborted();if(next.readerModel!=='google/gemini-4-argon'||JSON.stringify(next.argonSliceNumbers)!==JSON.stringify(analysisResult.argonSliceNumbers))throw Error('Источник второго мнения изменился.');setAnalysisResult(next);setVisualResult(next.visualReview);if(next.visualReview?.status === 'completed' && analysisResult.secondOpinion.status !== 'completed')setOpusSpent(n=>n+opusUsageEstimate(next.visualReview!.status === 'completed'?next.visualReview!.receipt:{inputTokens:0,outputTokens:0}));setNotice(next.secondOpinion.status === 'completed'?'Второе мнение Opus получено. Сопоставьте его с основным заключением Argon.':'Opus недоступен; основной разбор сохранён.');
      }catch(error){if(!c.signal.aborted)setNotice(error instanceof Error?error.message:'Не удалось получить второе мнение');}finally{if(!c.signal.aborted)setSecondOpinionBusy(false);}
    }}>{secondOpinionBusy?'Opus проверяет изображения…':'Второе мнение Opus'}</button></section>}
   <LocalizedUi value={report && <StudyReportDiscussion report={report} coverage={(ledger?.processedOverviewFrames ?? 0) + ' из ' + series.members.length + ' срезов'}/>}/>
   <LocalizedUi value={visualResult && <section aria-label={__ui("Независимая визуальная перепроверка Opus")}>
    {visualResult.status==='completed'&&<textarea hidden readOnly data-concilium-report="true" value={'НЕЗАВИСИМОЕ ВТОРОЕ МНЕНИЕ OPUS (окончательное решение врача):\n'+visualResult.observations.map(o=>'Срез '+o.sliceNumber+': '+o.anatomy+' — '+o.sign+'. '+o.uncertainty).join('\n')}/>}
    <h3><LocalizedUi value={"Визуальная перепроверка Opus"}/></h3>
    <p><LocalizedUi value={visualResult.status === 'completed' ? 'Независимо просмотрены срезы: ' : 'Перепроверка не завершилась. Были выбраны срезы: '}/><LocalizedUi value={visualResult.sliceNumbers.join(', ')}/><LocalizedUi value={". Остальные срезы Opus визуально не проверял."}/></p>
    <LocalizedUi value={visualResult.status === 'completed' && <p><LocalizedUi value={"Расход визуальной перепроверки Opus:"}/><LocalizedUi value={visualResult.receipt.inputTokens}/><LocalizedUi value={"входных и"}/><LocalizedUi value={visualResult.receipt.outputTokens}/><LocalizedUi value={"выходных токенов."}/></p>}/>
    <LocalizedUi value={visualResult.status === 'completed' && visualResult.observations.map((f, i) => <p key={i}><button type="button" onClick={() => inspect(series.members[f.sliceNumber - 1].id)}><LocalizedUi value={"Срез"}/><LocalizedUi value={f.sliceNumber}/></button><LocalizedUi value={"Диагноз:"}/><LocalizedUi value={f.anatomy}/>: <LocalizedUi value={f.sign}/></p>)}/>
   </section>}/>
   <LocalizedUi value={receipts.length > 0 && <div><h3><LocalizedUi value={"Диагнозы по срезам"}/></h3><LocalizedUi value={receipts.flatMap((r, ri) => r.findings.map((f, i) => <p key={ri + ':' + i}>
    <button type="button" onClick={() => inspect(series.members[f.sourceIndex].id)}><LocalizedUi value={"Срез"}/><LocalizedUi value={f.sourceIndex + 1}/></button><LocalizedUi value={"Диагноз:"}/><LocalizedUi value={f.anatomy}/>: <LocalizedUi value={f.sign}/><LocalizedUi value={f.morphology ? ` Основание: ${f.morphology}` : ''}/> <button type="button" onClick={() => setMeasureSource({ sourceIndex: f.sourceIndex, findingKey: ri + ':' + i })}><LocalizedUi value={"Проверить на снимке / измерить при необходимости"}/></button>
   </p>))}/></div>}/>
  </section>}/>
  <LocalizedUi value={processed > 0 && <section aria-label={__ui("Срезы для проверки")}><h3><LocalizedUi value={"Срезы, требующие внимания:"}/><LocalizedUi value={flagged.length}/></h3>
   <p><LocalizedUi value={"Это отмеченные ИИ изменения или неясные участки, а не подтверждённые диагнозы."}/></p>
   <LocalizedUi value={flagged.map(n => <button type="button" key={n} onClick={() => inspect(series.members[n].id)}><LocalizedUi value={"Срез"}/><LocalizedUi value={n + 1}/></button>)}/>
   <LocalizedUi value={!flagged.length && <p><LocalizedUi value={"Пока нет отмеченных кадров. Это не исключает патологию."}/></p>}/>
  </section>}/>
  <p><LocalizedUi value={singleSliceTest ? "Gemini по полученной квитанции: около $" : "Примерная стоимость выбранного анализа с заключением: около $"}/><LocalizedUi value={(singleSliceTest ? Math.max(0,ledger?.totalUSD ?? 0) : estimate.total).toFixed(2)}/>. <LocalizedUi value={opusCost !== null ? 'По полученным токенам Flash + Argon + Opus: около $' + ((ledger?.totalUSD ?? 0) + opusCost).toFixed(2) + '.' : 'Gemini по полученным квитанциям: около $' + (ledger?.totalUSD ?? 0).toFixed(2) + '.'}/></p>
  <details><summary><LocalizedUi value={"Как рассчитана стоимость"}/></summary><p><LocalizedUi value={"Расчёт по тарифам OpenRouter от 03.11.2026 и квитанциям полученных ответов. Начальный ориентир использует предполагаемый объём токенов; по мере обработки уточняется. Не включает перевод, вопросы и запросы без квитанции. Точный счёт — у провайдера."}/></p></details>
  <LocalizedUi value={stopReason && <p role="status"><LocalizedUi value={stopReason}/><LocalizedUi value={"Opus получает только обработанные срезы; остальные остаются неоценёнными."}/></p>}/>
  <LocalizedUi value={notice && <p ref={noticeElement} role={stage === 'interrupted' ? 'alert' : 'status'}><LocalizedUi value={notice}/></p>}/>
  <LocalizedUi value={stage === 'interrupted' && receipts.length > 0 && <button type="button" onClick={() => {
                const c = new AbortController();
                ctl.current = c;
                void finalize(receipts, c.signal).catch(interrupted);
            }}><LocalizedUi value={"Получить заключение"}/></button>}/>
  <LocalizedUi value={!connected && !busy && <button type="button" onClick={() => setConnectionAttempt(n => n + 1)}><LocalizedUi value={"Восстановить подключение"}/></button>}/>
  <LocalizedUi value={stage === 'idle' && <>
   <label><input type="checkbox" checked={singleSliceTest} onChange={e => {
      setSingleSliceTest(e.target.checked);
      if (e.target.checked) {
        setSelection('custom');
        setSelectionText('1');
        setAdditionalWindow('NONE');
        setPhysicianSlices('');
      }
   }}/><LocalizedUi value={"Тест одного среза · один платный Gemini без Argon/Opus"}/></label>
   <LocalizedUi value={singleSliceTest && <p role="status"><LocalizedUi value={"Выберите один номер среза. После проверки подготовленного изображения отправится только один запрос Gemini. Остальная серия не оценивается, повторов нет."}/></p>}/>
   <label><LocalizedUi value={"Какие срезы анализировать"}/><select value={selection} onChange={e => setSelection(e.target.value)}><option value="all"><LocalizedUi value={"Вся серия"}/></option><option value="custom"><LocalizedUi value={"Отдельные срезы или диапазон"}/></option></select></label>
   <LocalizedUi value={selection === 'custom' && <label><LocalizedUi value={"Номера срезов"}/><input aria-label={__ui("Номера срезов")} value={selectionText} onChange={e => setSelectionText(e.target.value)} placeholder="5, 12, 20–35"/><small><LocalizedUi value={"Например: 5 — один срез; 5, 12 — два среза; 20–35 — диапазон. Номера соответствуют исходной серии."}/></small></label>}/>
   <LocalizedUi value={selectionResult.error && <p role="alert"><LocalizedUi value={selectionResult.error}/></p>}/>
   <label><LocalizedUi value={"Клинические данные для заключения (необязательно)"}/><textarea maxLength={4000} value={clinicalContext} onChange={e => setClinicalContext(e.target.value)} placeholder={__ui("Жалобы, длительность, значимый анамнез. Без ФИО, контактов и других идентификаторов.")}/></label>
   <p><LocalizedUi value={"Эти данные будут переданы Argon вместе с наблюдениями после вашего разрешения на отправку. Они не заменяют признаки на снимках."}/></p>
   <details><summary><LocalizedUi value={"Настройки изображения, перепроверки и расходов"}/></summary>
   <LocalizedUi value={series.modality === 'CT' && <p><LocalizedUi value={"Окна подобраны по подтверждённым заголовкам и шкале HU. При неизвестной области сохраняется исходное окно. Их можно изменить перед подготовкой."}/></p>}/>
   <LocalizedUi value={series.modality === 'CT' && windowPlan.delivery === 'separate' && additionalWindow !== 'NONE' && (separate ? <p><LocalizedUi value={"Матрица не позволяет два окна на одной копии. Каждый выбранный срез готовится дважды: основное окно и второе. Обе копии нужно проверить перед отправкой."}/></p> : <p><LocalizedUi value={"Матрица не позволяет два окна на одной копии. Второе окно добавляется само, если выбрано не больше 16 срезов. Сейчас на копиях только основное окно, средостение или кость в нём не разобраны."}/></p>)}/>
   <LocalizedUi value={series.modality === 'CT' && <label><LocalizedUi value={"Как показывать ткани на копиях для ИИ"}/><select value={reviewWindow} onChange={e => { setReviewWindow(e.target.value as CtReviewWindow); setAdditionalWindow('NONE'); }}>
    <LocalizedUi value={Object.entries(CT_REVIEW_WINDOWS).map(([id, w]) => <option key={id} value={id}><LocalizedUi value={w.label}/></option>)}/>
   </select></label>}/>
   <LocalizedUi value={series.modality === 'CT' && <label><LocalizedUi value={"Второй вид того же среза"}/><select value={additionalWindow} onChange={e => setAdditionalWindow(e.target.value as CtReviewWindow | 'NONE')}>
    <option value="NONE"><LocalizedUi value={"Без дополнительного окна"}/></option><LocalizedUi value={Object.entries(CT_REVIEW_WINDOWS).filter(([id]) => id !== reviewWindow).map(([id, w]) => <option key={id} value={id}><LocalizedUi value={w.label}/></option>)}/>
   </select></label>}/>
   <p>Argon непосредственно проверяет подборку до 16 кадров. Opus подключается при существенном расхождении или по кнопке «Второе мнение».</p>
   <LocalizedUi value={visualEnabled && <>
    <label><LocalizedUi value={"Дополнительно проверить по мнению врача"}/><input aria-label={__ui("Дополнительные срезы для Argon")} value={physicianSlices} onChange={e => setPhysicianSlices(e.target.value)} placeholder={__ui("Например: 64, 70–73")}/><small><LocalizedUi value={"Необязательно. Эти срезы идут первыми, затем автоматически отмеченные; общий предел — 16 кадров и размер передачи. Номера должны входить в выбранный для анализа набор."}/></small></label>
    <LocalizedUi value={physicianSelection.error && <p role="alert"><LocalizedUi value={physicianSelection.error}/></p>}/>
   </>}/>
   <label><LocalizedUi value={"Лимит расходов на обзор Gemini, USD"}/><select value={budget} onChange={e => setBudget(Number(e.target.value))}>
    <LocalizedUi value={[0.5, 1, 2, 3, 5].map(v => <option key={v} value={v}>$<LocalizedUi value={v.toFixed(2)}/></option>)}/>
   </select></label>
   <p><LocalizedUi value={"До"}/><LocalizedUi value={plan.budget.overviewIndices.length}/><LocalizedUi value={"запросов Gemini (по размеру подготовленных копий) и"}/><LocalizedUi value={visualEnabled ? 'один основной Argon и Opus при необходимости' : 'один основной Argon'}/><LocalizedUi value={". Подготовка выполняется локально; разрешение на отправку будет после просмотра копий."}/></p>
   <p><LocalizedUi value={"«Окно» — настройка яркости и контраста, не введение контрастного препарата. Лёгочное окно показывает лёгкие; мягкие ткани в нём выглядят почти белыми. Если пара помещается, второй вид стоит справа на той же копии. Если нет и срезов не больше 16, второе окно уходит отдельной копией того же среза. ИИ получает именно эти копии."}/></p>
   <p><LocalizedUi value={"Если обзор прервётся, Argon составит частичное заключение по уже обработанной части. Стоимость — расчётный ориентир по тарифам OpenRouter от 03.11.2026, не точный счёт; объём ответа и маршрутизация могут его изменить. Неудачные запросы могут отсутствовать в квитанциях. Повтор Gemini — только по команде продолжения."}/></p>
   </details>
   <p><LocalizedUi value={!visualEnabled ? 'Opus составит заключение по описаниям без отдельного просмотра изображений.' : visualMode === 'selected' && plan.budget.overviewIndices.length <= 16 ? 'Opus независимо просмотрит выбранные кадры в пределах размера передачи, даже если Gemini не отметил изменений.' : 'Для длинной серии Opus получит отмеченные кадры и соседние срезы вокруг каждой находки, максимум 16. Если отметок нет, Opus изображения не смотрит, и это не подтверждение вторым читателем.'}/></p>
   <p><LocalizedUi value={"Выбрано"}/><LocalizedUi value={plan.budget.overviewIndices.length}/><LocalizedUi value={"срезов,"}/><LocalizedUi value={basePlan?.batches.length}/><LocalizedUi value={"групп подготовки. В одном запросе — до 4 срезов, для крупных копий меньше. После обзора — предварительное заключение Opus. Перевод и обсуждение доступны по готовому заключению."}/></p>
   <LocalizedUi value={plan.budget.overviewIndices.length > 40 && <p role="status"><LocalizedUi value={"Выбрано"}/><LocalizedUi value={plan.budget.overviewIndices.length}/><LocalizedUi value={"срезов и"}/><LocalizedUi value={basePlan?.batches.length ?? plan.batches.length}/><LocalizedUi value={"групп локальной подготовки. Копии будут видны по мере готовности. Отправка начнётся только после просмотра всех групп."}/></p>}/>
   <LocalizedUi value={physicianSelection.error && <p role="alert"><LocalizedUi value={physicianSelection.error}/></p>}/>
   <button type="button" disabled={!!selectionResult.error || (visualEnabled && !!physicianSelection.error) || (singleSliceTest && !singleFramePilotAllowed(selectionResult.indices, plan.batches))} onClick={() => void start()}><LocalizedUi value={singleSliceTest ? 'Подготовить один срез для платного теста' : selection === 'custom' ? 'Подготовить указанные срезы' : 'Подготовить выбранные срезы к анализу'}/></button>
  </>}/>
  <LocalizedUi value={stage === 'review' && <button type="button" onClick={() => { ctl.current?.abort(); setSelection('custom'); setStage('idle'); setNotice('Подготовка папки остановлена. Укажите номера срезов и нажмите «Подготовить указанные срезы». Отправка не выполнялась.'); }}><LocalizedUi value={"Остановить и выбрать отдельные срезы"}/></button>}/>
  <LocalizedUi value={(stage === 'review' || stage === 'gemini' || stage === 'opus') && <StudyPrivacyReview count={plan.batches.length} modality={series.modality as 'CT' | 'MR'} load={prepare} onReady={submitAll} canRelease={connected} connectionNotice={connectionDiagnostic} releaseNotice={"Flash просматривает выбранные срезы; Argon составляет протокол по JSON и подборке изображений. Opus — при существенном расхождении или по кнопке. Лимит обзора Flash: $" + budget.toFixed(2) + "; Argon и второе мнение оплачиваются отдельно."} onOpenSlice={inspect} windows={series.modality === 'CT' ? { primary: CT_REVIEW_WINDOWS[reviewWindow].label, ...(additionalWindow !== 'NONE' && (windowPlan.delivery === 'paired' || separate) ? { additional: CT_REVIEW_WINDOWS[additionalWindow].label, ...(separate ? { separateAfter: plan.batches.filter(b => b.pass === 'overview').length } : {}) } : {}) } : undefined} clinicalContext={clinicalContext} sourceNumbers={plan.batches.map(b => b.indices.map(i => i + 1))} sourceIds={plan.batches.map(b => b.indices.map(i => series.members[i].id))}/>}/>
  <LocalizedUi value={busy && <button type="button" onClick={() => { ctl.current?.abort(); setStage('interrupted'); setNotice('Остановлено. Полученные наблюдения сохранены; весь ряд не объявляется оценённым.'); }}><LocalizedUi value={"Остановить анализ"}/></button>}/>
  <LocalizedUi value={stage === 'review' && <button type="button" onClick={() => { ctl.current?.abort(); setStage('idle'); setNotice('Подготовка отменена. Выберите срезы заново; отправка не выполнялась.'); }}><LocalizedUi value={"Вернуться к выбору срезов"}/></button>}/>
  <LocalizedUi value={(stage === 'interrupted' || stage === 'completed') && receipts.length < plan.batches.length && approvedPackets.current.length === plan.batches.length && <button type="button" disabled={!connected} onClick={() => { const c = new AbortController(); ctl.current = c; void submitAll(approvedPackets.current, true); }}><LocalizedUi value={"Продолжить обработку оставшихся срезов"}/></button>}/>
  <LocalizedUi value={stage === 'interrupted' && !canPayForNextBatch(plan.budget, plan.batches, receipts) && receipts.length < plan.batches.length && <details><summary><LocalizedUi value={"Настройки расходов"}/></summary><label><LocalizedUi value={"Лимит Gemini для продолжения"}/><select value={budget} onChange={e => setBudget(Number(e.target.value))}><LocalizedUi value={[0.5, 1, 2, 3, 5].map(v => <option key={v} value={v}>$<LocalizedUi value={v.toFixed(2)}/></option>)}/></select></label></details>}/>
  <LocalizedUi value={stage === 'interrupted' && !receipts.length && <button type="button" onClick={() => { setExecutionBatches(null); setStage('idle'); }}><LocalizedUi value={"Вернуться к выбору срезов"}/></button>}/>
  <LocalizedUi value={stage === 'completed' && <button type="button" onClick={() => { ctl.current?.abort(); approvedPackets.current = []; setExecutionBatches(null); setReceipts([]); setReport(''); setOpusSpent(0); setVisualResult(undefined); setOpusUsage(undefined);setAnalysisResult(undefined);setSecondOpinionBusy(false);lastAnalysisPayload.current=null; setAcceptedMeasurements([]); setMeasureSource(null); setStage('idle'); setNotice('Можно выбрать другие срезы. Сохраните предыдущий результат заранее: новый анализ оплачивается отдельно.'); }}><LocalizedUi value={"Новый анализ — выбрать другие срезы"}/></button>}/>
  <LocalizedUi value={stage === 'completed' && visualEnabled && (visualResult?.status === 'unavailable' || detectorLocations.anchors.some(a => !attemptedDetectorKeys.current.has(detectorKey(a)))) && <button type="button" onClick={() => {
                const c = new AbortController();
                ctl.current = c;
                void finalize(receipts, c.signal).catch(interrupted);
            }}><LocalizedUi value={"Перепроверить отмеченные срезы"}/></button>}/>
  <LocalizedUi value={opusUsage && <p><LocalizedUi value={"Токены основного заключения Argon:"}/><LocalizedUi value={opusUsage.inputTokens}/><LocalizedUi value={"входных и"}/><LocalizedUi value={opusUsage.outputTokens}/><LocalizedUi value={"выходных токенов."}/></p>}/>
  <LocalizedUi value={recheckCount > 16 && <p role="alert"><LocalizedUi value={"Для перепроверки отмечено"}/><LocalizedUi value={recheckCount}/><LocalizedUi value={"срезов; Argon получает максимум 16. Остальные отмеченные срезы требуют проверки врачом."}/></p>}/>
  <LocalizedUi value={measureSource !== null && <FindingMeasurementReview key={measureSource.findingKey} findingKey={measureSource.findingKey} member={series.members[measureSource.sourceIndex]} file={files.get(series.members[measureSource.sourceIndex].id) ?? null} sliceNumber={measureSource.sourceIndex + 1} onAccept={m => { setAcceptedMeasurements(previous => [...previous.filter(x => x.findingKey !== m.findingKey), m]); setMeasureSource(null); }}/>}/>
  <LocalizedUi value={acceptedMeasurements.length > 0 && <section aria-label={__ui("Принятые врачом измерения")}><h3><LocalizedUi value={"Измерения принятых находок"}/></h3>
   <LocalizedUi value={acceptedMeasurements.map(m => <p key={m.findingKey}><LocalizedUi value={"Срез"}/><LocalizedUi value={m.sliceNumber}/>: <LocalizedUi value={m.lengthMm.toFixed(2)}/><LocalizedUi value={"мм"}/><LocalizedUi value={m.meanHu !== null ? ', средняя плотность ' + m.meanHu.toFixed(2) + ' HU' : ''}/>.</p>)}/>
   <button type="button" disabled={!report} onClick={() => setReport(previous => previous + '\n\nИзмерения врача по исходным изображениям:\n' + acceptedMeasurements.map(m => 'Срез ' + m.sliceNumber + ': размер на срезе ' + m.lengthMm.toFixed(2) + ' мм' + (m.meanHu !== null ? ', средняя плотность выбранной области ' + m.meanHu.toFixed(2) + ' HU' : '') + '.').join('\n'))}><LocalizedUi value={"Добавить измерения в текст заключения"}/></button>
  </section>}/>
 </section>;
}
