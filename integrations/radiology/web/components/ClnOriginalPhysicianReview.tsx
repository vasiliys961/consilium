"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
/** Physician review of TRUE original CLN components on the already opened DICOM.
 * No pixel or patient information is sent to Gemini/Opus from this component.
 */
import { useEffect, useState } from "react";
import type { DicomSeries } from "../lib/dicom-series";
import { fullCtGeometry } from "../lib/full-ct-stream";
import { readNoduleNiftiHeader, verifyNoduleSource } from "../lib/live-nodule-report";
import { transformPoint } from "../lib/segmentation-mask";
import type { ClnReport } from "../lib/cln-native-worker";
import { bindOriginalClnCandidates, type ClnSliceCandidate, type ClnVerifiedLocalEvidence } from "../lib/cln-physician-local-review";
import { restoreMissingClnSource } from "../lib/cln-original-source-recovery";
import { prepareDicomMonaiFile } from "../lib/dicom-monai-direct";
type Decision = "suspicious_on_review" | "dismissed_on_review" | "unreviewed";
export default function ClnOriginalPhysicianReview({ report, series, source, sourceFiles, onNavigate, onVerifiedCandidates }: {
    report: ClnReport;
    series: DicomSeries;
    source: File;
    sourceFiles: readonly File[];
    onNavigate: (slice: number) => void;
    onVerifiedCandidates?: (evidence: ClnVerifiedLocalEvidence) => void;
}) {
    const __ui = useUiTranslator();
    const [items, setItems] = useState<ClnSliceCandidate[] | null>(null);
    const [error, setError] = useState("");
    const [decisions, setDecisions] = useState<Record<number, Decision>>({});
    useEffect(() => {
        const controller = new AbortController();
        setItems(null);
        setError("");
        setDecisions({});
        void (async () => {
            try {
                // The original nnU-Net result is already final. Only reconstruct the
                // temporary HU-NIfTI if Chromium has evicted its OPFS-backed File, and
                // always verify the exact model-source SHA before binding coordinates.
                const verified = await restoreMissingClnSource(source, async (candidate) => {
                    await readNoduleNiftiHeader(candidate);
                    await verifyNoduleSource(candidate, report.sourceNiftiSha256, controller.signal);
                }, async () => {
                    if (sourceFiles.length !== series.members.length)
                        throw Error("Исходная DICOM-серия недоступна для восстановления HU.");
                    return prepareDicomMonaiFile(series, [...sourceFiles], controller.signal);
                });
                if (controller.signal.aborted)
                    return;
                const geometry = fullCtGeometry(series);
                const native = await readNoduleNiftiHeader(verified.source);
                if (native.dimensions.some((n, i) => n !== geometry.dimensions[i]))
                    throw Error("CLN native dimensions differ from original DICOM");
                // Check the physical position of all eight volume corners, not only spacing.
                for (let mask = 0; mask < 8; mask++) {
                    const p = geometry.dimensions.map((n, i) => mask & (1 << i) ? n - 1 : 0) as [
                        number,
                        number,
                        number
                    ];
                    const actual = transformPoint(native.affineLps, p), expected = transformPoint(geometry.affineLps, p);
                    if (Math.hypot(...actual.map((n, i) => n - expected[i])) > 0.05)
                        throw Error("CLN NIfTI/DICOM geometry mismatch");
                }
                // SHA-256 of the restored or original source was validated above.
                if (controller.signal.aborted)
                    return;
                const candidates = bindOriginalClnCandidates(report, native.dimensions, series.members.map(m => m.metadata.sopInstanceUid ?? ""));
                setItems(candidates);
                onVerifiedCandidates?.({ sourceNiftiSha256: report.sourceNiftiSha256,
                    dimensions: [...native.dimensions] as [
                        number,
                        number,
                        number
                    ], candidates });
            }
            catch (e) {
                if (!controller.signal.aborted)
                    setError(e instanceof Error ? e.message : "CLN candidate binding failed");
            }
        })();
        return () => controller.abort();
    }, [report, series, source, sourceFiles]);
    function exportReview() {
        if (!items)
            return;
        const payload = {
            schema: "opus-original-cln-physician-source-review/v1",
            sourceNiftiSha256: report.sourceNiftiSha256,
            originalCheckpointSha256: report.checkpointSha256,
            realOriginalModelForwardCompleted: true,
            originalDicomSopRegistrationVerified: false,
            researchOnly: true, clinicalValidation: false, negativeDiagnosisPermitted: false,
            physicianDecisions: items.map(c => ({
                modelComponentId: c.componentId, candidateVolumeMl: c.candidateVolumeMl,
                sourceVoxelCentroidIJK: c.sourceVoxelCentroidIJK,
                sourceSopInstanceUid: c.sopInstanceUid, sourceSliceIndex: c.sliceIndex,
                decision: decisions[c.componentId] ?? "unreviewed",
            })),
            physicianSigned: false, cloudUpload: false,
        };
        const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = "cln-local-physician-review.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return <section className="cs-geometry" aria-label="CLN original lung-tumor physician review">
  <h3><LocalizedUi value={"CLN \u00B7 \u043E\u043F\u0443\u0445\u043E\u043B\u0435\u0432\u044B\u0435 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u044B, \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0435 DICOM-\u0441\u0440\u0435\u0437\u044B"}/></h3>
  <p><LocalizedUi value={"\u041E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439 nnU-Net:"}/><LocalizedUi value={report.candidateCount}/><LocalizedUi value={"\u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u043E\u0432. \u041F\u0435\u0440\u0435\u0445\u043E\u0434 \u043A \u0441\u0440\u0435\u0437\u0443 \u0430\u043A\u0442\u0438\u0432\u0438\u0440\u0443\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u0441\u043B\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 SHA-256 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E HU-NIfTI \u0438 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u044F \u0444\u0438\u0437\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u0438 \u0442\u0435\u043A\u0443\u0449\u0435\u0439 DICOM-\u0441\u0435\u0440\u0438\u0438."}/></p>
  <LocalizedUi value={!items && !error && <p role="status"><LocalizedUi value={"\u0421\u0432\u0435\u0440\u044F\u0435\u043C \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0435 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435..."}/></p>}/>
  <LocalizedUi value={error && <p role="alert"><LocalizedUi value={"\u041F\u0435\u0440\u0435\u0445\u043E\u0434 \u043A \u0441\u0440\u0435\u0437\u0430\u043C \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D:"}/><LocalizedUi value={error}/></p>}/>
  <LocalizedUi value={items?.slice(0, 60).map(c => <div key={c.componentId}>
   <button type="button" onClick={() => onNavigate(c.sliceIndex)}><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442"}/><LocalizedUi value={c.componentId}/> · <LocalizedUi value={c.candidateVolumeMl.toFixed(3)}/><LocalizedUi value={"\u043C\u043B \u00B7 \u0441\u0440\u0435\u0437"}/><LocalizedUi value={c.sliceIndex + 1}/>
   </button>
   <span> <LocalizedUi value={decisions[c.componentId] ?? "не оценён"}/> </span>
   <button type="button" onClick={() => setDecisions(p => ({ ...p, [c.componentId]: "suspicious_on_review" }))}><LocalizedUi value={"\u041F\u043E\u0434\u043E\u0437\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439"}/></button>
   <button type="button" onClick={() => setDecisions(p => ({ ...p, [c.componentId]: "dismissed_on_review" }))}><LocalizedUi value={"\u041E\u0442\u043A\u043B\u043E\u043D\u0438\u0442\u044C"}/></button>
   <button type="button" onClick={() => setDecisions(p => ({ ...p, [c.componentId]: "unreviewed" }))}><LocalizedUi value={"\u041D\u0435 \u043E\u0446\u0435\u043D\u0435\u043D\u043E"}/></button>
  </div>)}/>
  <LocalizedUi value={items && items.length > 60 && <p><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u043F\u0435\u0440\u0432\u044B\u0435 60 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432 \u0438\u0437"}/><LocalizedUi value={items.length}/>.</p>}/>
  <LocalizedUi value={items?.length === 0 && <p><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u044B \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0442; \u044D\u0442\u043E \u043D\u0435 \u0438\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u043E\u043F\u0443\u0445\u043E\u043B\u044C."}/></p>}/>
  <LocalizedUi value={items && <button type="button" onClick={exportReview}><LocalizedUi value={"\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 JSON \u0440\u0435\u0448\u0435\u043D\u0438\u0439 \u0432\u0440\u0430\u0447\u0430"}/></button>}/>
  <p><LocalizedUi value={"\u041A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u044B \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0443\u044E\u0442 \u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u0438 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E NIfTI; \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u0430\u044F \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438 DICOM SOP \u043D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0430. \u0412\u0440\u0430\u0447 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442 \u043A\u0430\u0436\u0434\u044B\u0439 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442 \u043D\u0430 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0438. JSON \u0441 SOP UID \u0438 \u0445\u0435\u0448\u0435\u043C \u043E\u0441\u0442\u0430\u0451\u0442\u0441\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u043C."}/></p>
 </section>;
}
