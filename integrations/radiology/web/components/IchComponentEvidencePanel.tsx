"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useState } from "react";
import type { IchResearchReport } from "../lib/ich-research";
import type { IchReferenceComparison } from "../lib/ich-reference-comparison";
import { buildSmallMissLocalReview, type SmallMissDecision } from "../lib/ich-small-miss-review";
import { parseIchComponentEvidence, type IchComponentEvidence, type IchMaskFragment } from "../lib/ich-component-evidence";
function FragmentList({ heading, fragments, onGoToSlice }: {
    heading: string;
    fragments: IchMaskFragment[];
    onGoToSlice: (k: number) => void;
}) {
    const __ui = useUiTranslator();
    return <div style={{ marginTop: 12, overflowX: "auto" }}>
  <h5><LocalizedUi value={heading}/></h5>
  <LocalizedUi value={!fragments.length ? <p><LocalizedUi value={"\u0421\u0440\u0435\u0434\u0438 \u043F\u043E\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0445 \u043A\u0440\u0443\u043F\u043D\u044B\u0445 \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442 \u0442\u0430\u043A\u0438\u0445 \u043E\u0431\u043B\u0430\u0441\u0442\u0435\u0439 \u043D\u0435\u0442."}/></p> :
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
    <thead><tr><th><LocalizedUi value={"\u041A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u0430"}/></th><th><LocalizedUi value={"\u041E\u0431\u044A\u0451\u043C"}/></th>
      <th><LocalizedUi value={"\u0413\u0440\u0430\u043D\u0438\u0446\u044B [i, j, k]"}/></th><th><LocalizedUi value={"\u041D\u0435 \u0441\u043E\u0432\u043F\u0430\u043B\u043E"}/></th><th><LocalizedUi value={"\u041F\u0435\u0440\u0435\u043A\u0440\u044B\u0442\u0438\u0435"}/></th><th><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u041A\u0422"}/></th></tr></thead>
    <tbody><LocalizedUi value={fragments.slice(0, 24).map(f => {
                    const k = f.reviewSliceIndexK ?? Math.floor((f.boundsVoxelMin[2] + f.boundsVoxelMax[2]) / 2);
                    const missing = f.voxelCount - f.overlapVoxels;
                    return <tr key={f.componentIndex}>
        <td><LocalizedUi value={f.componentIndex + 1}/></td>
        <td><LocalizedUi value={f.volumeMl.toFixed(3)}/><LocalizedUi value={"\u043C\u043B"}/></td>
        <td><LocalizedUi value={f.boundsVoxelMin.join(", ")}/> — <LocalizedUi value={f.boundsVoxelMax.join(", ")}/></td>
        <td><strong><LocalizedUi value={missing}/></strong><LocalizedUi value={"\u0432\u043E\u043A\u0441."}/><LocalizedUi value={f.reviewSliceUnmatchedVoxels !== undefined ?
                            <small><LocalizedUi value={"\u00B7 \u043D\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u043C k:"}/><LocalizedUi value={f.reviewSliceUnmatchedVoxels}/></small> : null}/></td>
        <td><LocalizedUi value={f.overlapVoxels}/><LocalizedUi value={"\u0432\u043E\u043A\u0441."}/></td>
        <td><button type="button" aria-label={`Открыть исходный КТ-срез k ${k + 1} для компоненты ${f.componentIndex + 1}`} onClick={() => onGoToSlice(k)}><LocalizedUi value={"\u041A\u0422 \u00B7 k"}/><LocalizedUi value={k + 1}/></button></td>
      </tr>;
                })}/></tbody>
   </table>}/>
 </div>;
}
export default function IchComponentEvidencePanel({ comparison, model, onGoToSlice }: {
    comparison: IchReferenceComparison;
    model: IchResearchReport;
    onGoToSlice: (nativeK: number) => void;
}) {
    const __ui = useUiTranslator();
    const [report, setReport] = useState<IchComponentEvidence | null>(null);
    const [error, setError] = useState("");
    const [smallReviews, setSmallReviews] = useState<Record<number, SmallMissDecision>>({});
    function saveSmallReviews() {
        if (!report)
            return;
        let url: string | null = null;
        try {
            const reviewData = buildSmallMissLocalReview(report, smallReviews);
            url = URL.createObjectURL(new Blob([JSON.stringify(reviewData, null, 2)], { type: "application/json" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = "opus-ich-small-miss-local-physician-review.json";
            document.body.appendChild(a);
            a.click();
            a.remove();
            const usedUrl = url;
            setTimeout(() => URL.revokeObjectURL(usedUrl), 1000);
            url = null;
            setError("");
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Экспорт пометок не выполнен.");
        }
        finally {
            if (url)
                URL.revokeObjectURL(url);
        }
    }
    async function read(file: File) {
        setError("");
        setReport(null);
        setSmallReviews({});
        try {
            if (!file.size || file.size > 2 * 1024 * 1024)
                throw Error("Некорректный размер файла.");
            setReport(parseIchComponentEvidence(await file.text(), comparison, model));
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "3D-паспорт не принят.");
        }
    }
    const c = report?.componentEvidence;
    const missed = (c?.largestExpertFragments ?? [])
        .filter(x => x.voxelCount > x.overlapVoxels)
        .sort((a, b) => (b.voxelCount - b.overlapVoxels) - (a.voxelCount - a.overlapVoxels));
    const extra = (c?.largestPredictedFragments ?? [])
        .filter(x => x.voxelCount > x.overlapVoxels)
        .sort((a, b) => (b.voxelCount - b.overlapVoxels) - (a.voxelCount - a.overlapVoxels));
    const ambiguous = c?.largestPredictedFragments.filter(x => x.ambiguousMultiComponentContact) ?? [];
    return <section aria-label={__ui("\u042D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 3D-\u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442 \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u044F")} style={{ border: "1px solid #9ab6a8", borderRadius: 8, padding: 12, margin: "14px 0" }}>
  <h5><LocalizedUi value={"3D \u00B7 \u043A\u0430\u043A\u0438\u0435 \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442\u044B \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0438 \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u044B \u043C\u043E\u0434\u0435\u043B\u044C\u044E"}/></h5>
  <p><LocalizedUi value={"\u0418\u043C\u043F\u043E\u0440\u0442 \u043E\u0442\u0447\u0451\u0442\u0430"}/><code>ich-expert-component-contact.py</code><LocalizedUi value={". \u0414\u043B\u044F \u043E\u0442\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u0434\u043E\u043B\u0436\u043D\u044B \u0443\u0436\u0435 \u0441\u043E\u0432\u043F\u0430\u0441\u0442\u044C SHA-256 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u041A\u0422, SAMIHS-\u043C\u0430\u0441\u043A\u0438 \u0438 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u0438. \u0418\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u0443\u0435\u043C\u044B\u0435 \u0447\u0438\u0441\u043B\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0442\u0441\u044F \u0441 3D Dice \u0438 \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u044B\u043C\u0438 \u043E\u0431\u044A\u0451\u043C\u0430\u043C\u0438."}/></p>
  <label><LocalizedUi value={"\u041E\u0442\u0447\u0451\u0442 \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u0430 3D-\u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442"}/><input type="file" accept=".json,application/json" onChange={e => {
            const file = e.target.files?.[0];
            e.currentTarget.value = "";
            if (file)
                void read(file);
        }}/>
  </label>
  <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
  <LocalizedUi value={c && <>
    <p role="status"><LocalizedUi value={"\u0424\u0440\u0430\u0433\u043C\u0435\u043D\u0442\u044B \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u0438:"}/><LocalizedUi value={c.expertFragmentsTotal}/><LocalizedUi value={"; \u0431\u0435\u0437 \u043F\u0435\u0440\u0435\u0441\u0435\u0447\u0435\u043D\u0438\u044F \u0441 SAMIHS:"}/><strong><LocalizedUi value={c.expertFragmentsWithZeroOverlap}/></strong><LocalizedUi value={". \u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u044B \u043C\u043E\u0434\u0435\u043B\u0438 \u0431\u0435\u0437 \u043F\u0435\u0440\u0435\u0441\u0435\u0447\u0435\u043D\u0438\u044F \u0441 \u044D\u0442\u0430\u043B\u043E\u043D\u043E\u043C:"}/><strong> <LocalizedUi value={c.predictedFragmentsWithZeroOverlap}/></strong>.
    </p>
    <p><LocalizedUi value={"\u041E\u0434\u0438\u043D \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442 \u043C\u043E\u0434\u0435\u043B\u0438 \u043F\u0435\u0440\u0435\u043A\u0440\u044B\u0432\u0430\u0435\u0442 \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0445 \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442:"}/><strong> <LocalizedUi value={c.predictedFragmentsContactingMultipleExpertFragments}/></strong><LocalizedUi value={". \u041E\u0434\u0438\u043D \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0439 \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442 \u043A\u0430\u0441\u0430\u0435\u0442\u0441\u044F \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u0438\u0445 \u043F\u0440\u0435\u0434\u0441\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0445:"}/><strong> <LocalizedUi value={c.expertFragmentsContactingMultiplePredictions}/></strong>.</p>
    <LocalizedUi value={c.expertFragmentVolumeStrata && <div style={{ overflowX: "auto", margin: "12px 0" }}>
      <h5><LocalizedUi value={"\u041F\u0440\u043E\u043F\u0443\u0441\u043A\u0438 \u043F\u043E \u0444\u0438\u0437\u0438\u0447\u0435\u0441\u043A\u043E\u043C\u0443 \u043E\u0431\u044A\u0451\u043C\u0443 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0445 \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442\u043E\u0432"}/></h5>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr><th><LocalizedUi value={"\u0420\u0430\u0437\u043C\u0435\u0440 \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442\u0430"}/></th><th><LocalizedUi value={"\u0412\u0441\u0435\u0433\u043E"}/></th>
          <th><LocalizedUi value={"\u0411\u0435\u0437 \u043F\u0435\u0440\u0435\u0441\u0435\u0447\u0435\u043D\u0438\u044F"}/></th><th><LocalizedUi value={"\u041F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043D\u044B\u0439 \u043E\u0431\u044A\u0451\u043C"}/></th>
          <th><LocalizedUi value={"\u041D\u0435\u043F\u043E\u043A\u0440\u044B\u0442\u044B\u0435 \u0432\u043E\u043A\u0441\u0435\u043B\u0438"}/></th></tr></thead>
        <tbody><LocalizedUi value={c.expertFragmentVolumeStrata.map((b, i) => <tr key={i}>
          <td><LocalizedUi value={b.maxVolumeMl === null ? "≥ 1 мл" :
                        i === 0 ? "менее 0,1 мл" : "0,1–<1 мл"}/></td>
          <td><LocalizedUi value={b.expertFragments}/></td>
          <td><strong><LocalizedUi value={b.withZeroOverlap}/></strong></td>
          <td><LocalizedUi value={b.missedVolumeMl.toFixed(3)}/><LocalizedUi value={"\u043C\u043B"}/></td>
          <td><LocalizedUi value={b.missedVoxels}/></td>
        </tr>)}/></tbody>
      </table>
      <p><small><LocalizedUi value={"\u0423\u0447\u0442\u0435\u043D\u044B \u0432\u0441\u0435 \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u044B \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u0431\u0438\u043D\u0430\u0440\u043D\u043E\u0439 \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0438, \u0432\u043A\u043B\u044E\u0447\u0430\u044F \u043D\u0435 \u043F\u043E\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0435 \u0432 \u0442\u0430\u0431\u043B\u0438\u0446\u0430\u0445. \u0427\u0430\u0441\u0442\u0438\u0447\u043D\u043E \u043D\u0435\u043F\u043E\u043A\u0440\u044B\u0442\u044B\u0435 \u043E\u0431\u044A\u0451\u043C\u044B \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u044B. \u042D\u0442\u043E \u043D\u0435 \u0447\u0443\u0432\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u043A \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u043C \u043E\u0447\u0430\u0433\u0430\u043C: \u043E\u0434\u0438\u043D \u0432\u043E\u043A\u0441\u0435\u043B\u044C \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u044F \u043A\u043B\u0430\u0441\u0441\u0438\u0444\u0438\u0446\u0438\u0440\u0443\u0435\u0442 \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442 \u043A\u0430\u043A \u0438\u043C\u0435\u044E\u0449\u0438\u0439 \u043F\u0435\u0440\u0435\u0441\u0435\u0447\u0435\u043D\u0438\u0435."}/></small></p>
    </div>}/>
    <p><small><LocalizedUi value={"\u0412 \u0441\u0443\u043C\u043C\u0430\u0445 \u0443\u0447\u0442\u0435\u043D\u044B \u0432\u0441\u0435 \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442\u044B; \u0442\u0430\u0431\u043B\u0438\u0446\u044B \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442 \u0442\u043E\u043B\u044C\u043A\u043E"}/><LocalizedUi value={c.reportedLargestPerMaskLimit}/><LocalizedUi value={"\u0441\u0430\u043C\u044B\u0445 \u043A\u0440\u0443\u043F\u043D\u044B\u0445 \u043D\u0430 \u043C\u0430\u0441\u043A\u0443. \u041F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u0438 \u0447\u0430\u0441\u0442\u0438\u0447\u043D\u044B\u0435 \u043E\u0448\u0438\u0431\u043A\u0438: \u0434\u0430\u0436\u0435 \u043E\u0434\u0438\u043D \u0432\u043E\u043A\u0441\u0435\u043B\u044C \u043F\u0435\u0440\u0435\u043A\u0440\u044B\u0442\u0438\u044F \u043D\u0435 \u0441\u043A\u0440\u044B\u0432\u0430\u0435\u0442 \u043E\u0441\u0442\u0430\u0432\u0448\u0443\u044E\u0441\u044F \u043D\u0435\u043F\u043E\u043A\u0440\u044B\u0442\u0443\u044E \u043E\u0431\u043B\u0430\u0441\u0442\u044C. \u0412 \u043D\u043E\u0432\u044B\u0445 \u043E\u0442\u0447\u0451\u0442\u0430\u0445 \u043A\u043D\u043E\u043F\u043A\u0430 \u0432\u0435\u0434\u0451\u0442 \u043A k-\u0441\u0440\u0435\u0437\u0443 \u0441 \u043C\u0430\u043A\u0441\u0438\u043C\u0430\u043B\u044C\u043D\u044B\u043C \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E\u043C \u043D\u0435\u0441\u043E\u0432\u043F\u0430\u0434\u0430\u044E\u0449\u0438\u0445 \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439 \u0434\u0430\u043D\u043D\u043E\u0433\u043E \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442\u0430, \u0432 \u0441\u0442\u0430\u0440\u044B\u0445 \u2014 \u043A \u0441\u0435\u0440\u0435\u0434\u0438\u043D\u0435 \u0435\u0433\u043E \u0433\u0440\u0430\u043D\u0438\u0446. \u042D\u0442\u043E \u043D\u0430\u0442\u0438\u0432\u043D\u044B\u0439 \u0438\u043D\u0434\u0435\u043A\u0441 NIfTI, \u043D\u0435 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u0430\u044F \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u0430."}/></small></p>
    <LocalizedUi value={c.submilliliterReviewCandidates && <>
      <p><strong><LocalizedUi value={"\u041F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u043C\u0430\u043B\u044B\u0445 \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u043E\u0432:"}/></strong>
        <LocalizedUi value={" "}/><LocalizedUi value={c.submilliliterReviewCandidatesTotal}/><LocalizedUi value={"\u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0445 \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442\u043E\u0432 \u043C\u0435\u043D\u0435\u0435 1 \u043C\u043B \u0441 \u043D\u0435\u043F\u043E\u043A\u0440\u044B\u0442\u044B\u043C\u0438 \u0432\u043E\u043A\u0441\u0435\u043B\u044F\u043C\u0438. \u0412 \u043F\u0435\u0440\u0432\u0443\u044E \u043E\u0447\u0435\u0440\u0435\u0434\u044C \u043F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u043F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043D\u044B\u0435 \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442\u044B, \u0437\u0430\u0442\u0435\u043C \u0447\u0430\u0441\u0442\u0438\u0447\u043D\u043E \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043D\u044B\u0435 \u0441 \u043D\u0430\u0438\u0431\u043E\u043B\u044C\u0448\u0438\u043C FN. \u041A\u043D\u043E\u043F\u043A\u0438 \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u044E\u0442 \u043D\u0430\u0442\u0438\u0432\u043D\u044B\u0439 \u0441\u0440\u0435\u0437 \u0441 \u043C\u0430\u043A\u0441\u0438\u043C\u0430\u043B\u044C\u043D\u044B\u043C FN."}/></p>
      <FragmentList heading="Малые экспертные фрагменты для прицельной проверки по КТ" fragments={c.submilliliterReviewCandidates} onGoToSlice={onGoToSlice}/>
      <details style={{ margin: "12px 0" }}>
        <summary><LocalizedUi value={"\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u0430\u044F \u0432\u0440\u0430\u0447\u0435\u0431\u043D\u0430\u044F \u043E\u0446\u0435\u043D\u043A\u0430 \u043D\u0435\u0431\u043E\u043B\u044C\u0448\u0438\u0445 \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u043E\u0432 \u00B7 \u0431\u0435\u0437 \u0446\u0438\u0444\u0440\u043E\u0432\u043E\u0439 \u043F\u043E\u0434\u043F\u0438\u0441\u0438"}/></summary>
        <LocalizedUi value={c.submilliliterReviewCandidates.map(f => {
                    const review = smallReviews[f.componentIndex];
                    return <fieldset key={f.componentIndex} style={{ margin: "10px 0", padding: 10 }}>
            <legend><LocalizedUi value={"\u042D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0439 \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442"}/><LocalizedUi value={f.componentIndex + 1}/> ·
              <LocalizedUi value={" "}/><LocalizedUi value={f.volumeMl.toFixed(3)}/><LocalizedUi value={"\u043C\u043B \u00B7 FN"}/><LocalizedUi value={f.voxelCount - f.overlapVoxels}/></legend>
            <label><LocalizedUi value={"\u0421\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0441 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u043E\u0439"}/><select value={review?.status ?? ""} onChange={e => {
                            const status = e.target.value as SmallMissDecision["status"];
                            setSmallReviews(prev => {
                                if (!status) {
                                    const next = { ...prev };
                                    delete next[f.componentIndex];
                                    return next;
                                }
                                return { ...prev, [f.componentIndex]: {
                                        status, note: prev[f.componentIndex]?.note ?? ""
                                    } };
                            });
                        }}>
                <option value=""><LocalizedUi value={"\u041D\u0435 \u043E\u0446\u0435\u043D\u0451\u043D"}/></option>
                <option value="recheck"><LocalizedUi value={"\u041D\u0443\u0436\u043D\u0430 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430"}/></option>
                <option value="supports_expert_mark"><LocalizedUi value={"\u0421\u043E\u0433\u043B\u0430\u0441\u0435\u043D \u0441 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u043E\u0439"}/></option>
                <option value="disputes_expert_mark"><LocalizedUi value={"\u042D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u0443\u044E \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0443 \u043E\u0441\u043F\u0430\u0440\u0438\u0432\u0430\u044E"}/></option>
              </select>
            </label>
            <label style={{ display: "block" }}><LocalizedUi value={"\u041F\u043E\u044F\u0441\u043D\u0435\u043D\u0438\u0435 (\u0431\u0435\u0437 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0445 \u0434\u0430\u043D\u043D\u044B\u0445)"}/><textarea rows={2} maxLength={1000} style={{ width: "100%", display: "block" }} value={review?.note ?? ""} onChange={e => setSmallReviews(prev => {
                            const entry = prev[f.componentIndex];
                            return entry ? { ...prev, [f.componentIndex]: { ...entry, note: e.target.value } } : prev;
                        })}/>
            </label>
            <button type="button" onClick={() => onGoToSlice(f.reviewSliceIndexK ?? Math.floor((f.boundsVoxelMin[2] + f.boundsVoxelMax[2]) / 2))}><LocalizedUi value={"\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u0434\u043B\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438"}/></button>
          </fieldset>;
                })}/>
        <button type="button" disabled={!Object.keys(smallReviews).length} onClick={saveSmallReviews}><LocalizedUi value={"\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0435 \u0432\u0440\u0430\u0447\u0435\u0431\u043D\u044B\u0435 \u043F\u043E\u043C\u0435\u0442\u043A\u0438 \u0441 SHA-256"}/></button>
        <p><small><LocalizedUi value={"\u042D\u043A\u0441\u043F\u043E\u0440\u0442 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0440\u0435\u0448\u0435\u043D\u0438\u044F, \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0438, \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u0438\u043D\u0434\u0435\u043A\u0441 k, \u043E\u0431\u044A\u0451\u043C \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442\u0430 \u0438 SHA-256 \u0442\u0440\u0451\u0445 \u0444\u0430\u0439\u043B\u043E\u0432. \u042D\u0442\u043E \u043D\u0435\u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043D\u044B\u0435 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0435 \u0437\u0430\u043C\u0435\u0442\u043A\u0438, \u0430 \u043D\u0435 \u0443\u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u0430\u044F \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044F. \u041D\u0438\u043A\u0430\u043A\u0438\u0435 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u044E\u0442\u0441\u044F \u043D\u0430\u0440\u0443\u0436\u0443."}/></small></p>
      </details>
    </>}/>
    <FragmentList heading="Экспертные фрагменты с пропущенными вокселями (FN)" fragments={missed} onGoToSlice={onGoToSlice}/>
    <FragmentList heading="Кандидаты SAMIHS с лишними вокселями (FP)" fragments={extra} onGoToSlice={onGoToSlice}/>
    <FragmentList heading="Неоднозначные объединения предсказанной маски" fragments={ambiguous} onGoToSlice={onGoToSlice}/>
    <p role="note"><strong><LocalizedUi value={"\u041D\u0435 \u0434\u0438\u0430\u0433\u043D\u043E\u0437."}/></strong><LocalizedUi value={"\u041A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u044B \u0441\u0432\u044F\u0437\u043D\u043E\u0441\u0442\u0438 \u043F\u0440\u0438 \u0442\u043E\u043B\u0441\u0442\u043E\u0439 \u041A\u0422 \u043D\u0435 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0435 \u0433\u0435\u043C\u0430\u0442\u043E\u043C\u044B. \u041E\u0434\u043D\u043E \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0435 \u0432\u043E\u043A\u0441\u0435\u043B\u044F \u043D\u0435 \u0434\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u0442 \u043E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u0438\u0435 \u043E\u0447\u0430\u0433\u0430; \u043D\u0435 \u0440\u0430\u0441\u0441\u0447\u0438\u0442\u0430\u043D\u0430 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0447\u0443\u0432\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0438\u043B\u0438 \u0441\u043F\u0435\u0446\u0438\u0444\u0438\u0447\u043D\u043E\u0441\u0442\u044C. \u041D\u0435\u0442 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u044F \u0442\u0438\u043F\u0430 \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u044F \u0438 DICOM SOP-\u0441\u0432\u044F\u0437\u0438."}/></p>
    <button type="button" onClick={() => { setReport(null); setSmallReviews({}); }}><LocalizedUi value={"\u0417\u0430\u043A\u0440\u044B\u0442\u044C 3D-\u043E\u0446\u0435\u043D\u043A\u0443"}/></button>
  </>}/>
 </section>;
}
