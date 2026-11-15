"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useState } from "react";
import { parseIchSliceEvidence, type IchSliceEvidence } from "../lib/ich-slice-evidence";
import { contiguousIchErrorRuns } from "../lib/ich-error-runs";
import type { IchReferenceComparison } from "../lib/ich-reference-comparison";
import type { IchResearchReport } from "../lib/ich-research";
export default function IchSliceEvidencePanel({ comparison, model, onGoToSlice }: {
    comparison: IchReferenceComparison;
    model: IchResearchReport;
    onGoToSlice?: (nativeSliceIndex: number) => void;
}) {
    const __ui = useUiTranslator();
    const [audit, setAudit] = useState<IchSliceEvidence | null>(null);
    const [error, setError] = useState("");
    async function open(file: File) {
        setAudit(null);
        setError("");
        try {
            if (!file.size || file.size > 2 * 1024 * 1024)
                throw Error("Неверный размер JSON.");
            setAudit(parseIchSliceEvidence(await file.text(), comparison, model));
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Срезовые данные не приняты.");
        }
    }
    const a = audit?.sliceAudit;
    const canNavigate = a?.sourceBoundSliceAxis === 2 && model.source.geometry.sliceAxis === 2;
    const [missedSort, setMissedSort] = useState<"count" | "fraction">("count");
    const missed = a?.sliceEvidence.filter(x => x.falseNegativeVoxels > 0)
        .sort((x, y) => missedSort === "count"
        ? y.falseNegativeVoxels - x.falseNegativeVoxels || x.nativeSliceIndex - y.nativeSliceIndex
        : y.falseNegativeVoxels / y.expertVoxels - x.falseNegativeVoxels / x.expertVoxels ||
            y.falseNegativeVoxels - x.falseNegativeVoxels)
        .slice(0, 12);
    const extra = a?.sliceEvidence.filter(x => x.falsePositiveVoxels > 0)
        .sort((x, y) => y.falsePositiveVoxels - x.falsePositiveVoxels ||
        x.nativeSliceIndex - y.nativeSliceIndex).slice(0, 12);
    const incomplete = a?.sliceEvidence.filter(x => x.falseNegativeVoxels > 0).length ?? 0;
    const fpSlices = a?.sliceEvidence.filter(x => x.falsePositiveVoxels > 0).length ?? 0;
    const fnRuns = a ? contiguousIchErrorRuns(a.sliceEvidence, "fn") : [];
    const fpRuns = a ? contiguousIchErrorRuns(a.sliceEvidence, "fp") : [];
    return <section aria-label={__ui("\u041B\u043E\u043A\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043D\u043E\u0439 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0438 \u043F\u043E \u0441\u0440\u0435\u0437\u0430\u043C")} style={{ border: "1px solid #a8bbb4", borderRadius: 8, padding: 12, margin: "14px 0" }}>
    <h5><LocalizedUi value={"\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043B\u043E\u043A\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u0438 \u043E\u0448\u0438\u0431\u043E\u043A SAMIHS \u043F\u043E \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u043C \u0441\u0440\u0435\u0437\u0430\u043C"}/></h5>
    <p><LocalizedUi value={"\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 JSON \u0438\u0437"}/><code>ich-native-slice-evidence.py</code><LocalizedUi value={". \u0421\u0440\u0435\u0437\u044B \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D\u044B \u043A \u0432\u043E\u043A\u0441\u0435\u043B\u044C\u043D\u043E\u0439 \u043E\u0441\u0438 NIfTI, \u043D\u0435 \u043A \u043D\u043E\u043C\u0435\u0440\u0430\u043C DICOM. \u041E\u0442\u0447\u0451\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442\u0441\u044F \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u041A\u0422, \u043F\u0440\u0435\u0434\u0441\u043A\u0430\u0437\u0430\u043D\u0438\u044F \u0438 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u0438."}/></p>
    <label><LocalizedUi value={"\u041E\u0442\u0447\u0451\u0442 \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u044F \u043E\u0448\u0438\u0431\u043E\u043A \u043F\u043E \u0441\u0440\u0435\u0437\u0430\u043C"}/><input type="file" accept=".json,application/json" onChange={e => {
            const f = e.target.files?.[0];
            e.currentTarget.value = "";
            if (f)
                void open(f);
        }}/>
    </label>
    <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
    <LocalizedUi value={a && <>
      <p role="status"><LocalizedUi value={"\u0421\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0442\u0440\u0451\u0445 \u0444\u0430\u0439\u043B\u043E\u0432 \u043F\u043E SHA-256 \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0441 3D-\u043C\u0435\u0442\u0440\u0438\u043A\u0430\u043C\u0438 \u043F\u0440\u043E\u0439\u0434\u0435\u043D\u044B."}/></p>
      <p><strong><LocalizedUi value={a.expertPositiveSlices}/></strong><LocalizedUi value={"\u0441\u0440\u0435\u0437\u043E\u0432 \u0441 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u0432\u0448\u0435\u0439\u0441\u044F \u043E\u0431\u043B\u0430\u0441\u0442\u044C\u044E;"}/><strong> <LocalizedUi value={a.expertPositiveSlicesWithVoxelOverlap}/></strong><LocalizedUi value={"\u0441\u0440\u0435\u0437\u043E\u0432 \u0441 \u0445\u043E\u0442\u044F \u0431\u044B \u043E\u0434\u043D\u0438\u043C \u0441\u043E\u0432\u043F\u0430\u0432\u0448\u0438\u043C \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u043C;"}/><strong><LocalizedUi value={a.expertPositiveSlicesWithoutOverlap.length}/></strong><LocalizedUi value={"\u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E \u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u043E\u0432 \u0431\u0435\u0437 \u0441\u043E\u0432\u043F\u0430\u0432\u0448\u0438\u0445 \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439. \u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u044B \u0432\u043D\u0435 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E \u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u043E\u0432:"}/><strong> <LocalizedUi value={a.modelOnlyCandidateSlices.length}/></strong>.</p>
      <p role="status"><strong><LocalizedUi value={incomplete}/></strong><LocalizedUi value={"\u0441\u0440\u0435\u0437\u043E\u0432 \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442 \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043D\u044B\u0435 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0435 \u0432\u043E\u043A\u0441\u0435\u043B\u0438, \u0432\u043A\u043B\u044E\u0447\u0430\u044F \u0447\u0430\u0441\u0442\u0438\u0447\u043D\u044B\u0435 \u043E\u0448\u0438\u0431\u043A\u0438;"}/><strong> <LocalizedUi value={fpSlices}/></strong><LocalizedUi value={"\u0441\u0440\u0435\u0437\u043E\u0432 \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442 \u043B\u0438\u0448\u043D\u0438\u0435 \u0432\u043E\u043A\u0441\u0435\u043B\u0438 \u043C\u043E\u0434\u0435\u043B\u0438. \u042D\u0442\u043E \u043E\u0447\u0435\u0440\u0435\u0434\u044C \u0434\u043B\u044F \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430 \u0432\u0440\u0430\u0447\u043E\u043C, \u043D\u0435 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0435 FP/FN \u043F\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F\u043C."}/></p>
      <label><LocalizedUi value={"\u0421\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u043A\u0430 \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u043E\u0432"}/><select value={missedSort} onChange={e => setMissedSort(e.target.value as "count" | "fraction")}>
          <option value="count"><LocalizedUi value={"\u041F\u043E \u0447\u0438\u0441\u043B\u0443 \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043D\u044B\u0445 \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439"}/></option>
          <option value="fraction"><LocalizedUi value={"\u041F\u043E \u0434\u043E\u043B\u0435 \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043D\u043E\u0439 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u043E\u0431\u043B\u0430\u0441\u0442\u0438"}/></option>
        </select>
      </label>
      <h5><LocalizedUi value={"\u041D\u0435\u043F\u0440\u0435\u0440\u044B\u0432\u043D\u044B\u0435 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u044B \u043E\u0448\u0438\u0431\u043E\u043A \u043F\u043E \u0438\u043D\u0434\u0435\u043A\u0441\u043D\u043E\u0439 \u043E\u0441\u0438 NIfTI"}/></h5>
      <p><LocalizedUi value={"\u0413\u0440\u0443\u043F\u043F\u0438\u0440\u043E\u0432\u043A\u0430 \u0441\u043E\u0441\u0435\u0434\u043D\u0438\u0445 \u0441\u0440\u0435\u0437\u043E\u0432 \u0441 FN \u0438\u043B\u0438 FP. \u0414\u0438\u0430\u043F\u0430\u0437\u043E\u043D \u043D\u0435 \u0440\u0430\u0432\u0435\u043D \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0439 \u0433\u0435\u043C\u0430\u0442\u043E\u043C\u0435 \u0438 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u0435\u0451 \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0443\u044E \u043F\u0440\u043E\u0442\u044F\u0436\u0451\u043D\u043D\u043E\u0441\u0442\u044C."}/></p>
      <LocalizedUi value={([["FN · пропущенная экспертная область", fnRuns],
                ["FP · лишняя маска модели", fpRuns]] as const).map(([heading, runs]) => <div key={heading}>
          <h6><LocalizedUi value={heading}/><LocalizedUi value={"\u00B7 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u043E\u0432"}/><LocalizedUi value={runs.length}/></h6>
          <LocalizedUi value={!runs.length ? <p><LocalizedUi value={"\u0412\u043E\u043A\u0441\u0435\u043B\u044C\u043D\u044B\u0445 \u043E\u0448\u0438\u0431\u043E\u043A \u044D\u0442\u043E\u0433\u043E \u0442\u0438\u043F\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E."}/></p> :
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <LocalizedUi value={runs.slice(0, 12).map(run => <button type="button" key={run.firstSliceIndex} disabled={!canNavigate || !onGoToSlice} onClick={() => onGoToSlice?.(run.peakSliceIndex)} title={__ui("\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0441\u0440\u0435\u0437 \u0441 \u043C\u0430\u043A\u0441\u0438\u043C\u0430\u043B\u044C\u043D\u044B\u043C \u0447\u0438\u0441\u043B\u043E\u043C \u043D\u0435\u0441\u043E\u0432\u043F\u0430\u0434\u0430\u044E\u0449\u0438\u0445 \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439")}>
                k <LocalizedUi value={run.firstSliceIndex + 1}/>–<LocalizedUi value={run.lastSliceIndex + 1}/>
                <LocalizedUi value={" · "}/><LocalizedUi value={run.sliceCount}/><LocalizedUi value={"\u0441\u0440\u0435\u0437."}/><LocalizedUi value={" · "}/><LocalizedUi value={run.totalUnmatchedVoxels}/><LocalizedUi value={"\u0432\u043E\u043A\u0441."}/><LocalizedUi value={" · пик k "}/><LocalizedUi value={run.peakSliceIndex + 1}/>
              </button>)}/>
            </div>}/>
        </div>)}/>
      <LocalizedUi value={!canNavigate && <p role="alert"><LocalizedUi value={"\u041F\u0440\u044F\u043C\u043E\u0439 \u043F\u0435\u0440\u0435\u0445\u043E\u0434 \u043E\u0442\u043A\u043B\u044E\u0447\u0451\u043D: \u0438\u043D\u0434\u0435\u043A\u0441\u043D\u044B\u0439 \u0441\u0440\u0435\u0437 \u043C\u043E\u0434\u0435\u043B\u0438 \u0438\u043C\u0435\u0435\u0442 \u043E\u0441\u044C"}/><LocalizedUi value={a.sourceBoundSliceAxis}/><LocalizedUi value={", \u0430 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E NIfTI \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u043E\u0441\u044C k (2). \u042D\u0442\u043E \u0440\u0430\u0437\u043D\u044B\u0435 \u043F\u043B\u043E\u0441\u043A\u043E\u0441\u0442\u0438."}/></p>}/>
      <p><small><LocalizedUi value={"\u041D\u0430\u043B\u0438\u0447\u0438\u0435 \u043E\u0434\u043D\u043E\u0433\u043E \u0441\u043E\u0432\u043F\u0430\u0432\u0448\u0435\u0433\u043E \u0432\u043E\u043A\u0441\u0435\u043B\u044F \u043D\u0435 \u043E\u0437\u043D\u0430\u0447\u0430\u0435\u0442 \u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u043E \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u043D\u043D\u043E\u0435 \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u0435. \u042D\u0442\u043E \u043D\u0435 \u0447\u0443\u0432\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u043C\u043E\u0434\u0435\u043B\u0438 \u043A \u043E\u0447\u0430\u0433\u0430\u043C \u0438\u043B\u0438 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0430\u043C."}/></small></p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <caption style={{ textAlign: "left", marginBottom: 6 }}><LocalizedUi value={"\u041F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442\u043D\u044B\u0435 12 \u0441\u0440\u0435\u0437\u043E\u0432 \u0441 \u043F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E \u0438\u043B\u0438 \u0447\u0430\u0441\u0442\u0438\u0447\u043D\u043E \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043D\u043E\u0439 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u043E\u0439"}/></caption>
          <thead><tr><th><LocalizedUi value={"\u0418\u043D\u0434\u0435\u043A\u0441 \u0441\u0440\u0435\u0437\u0430"}/></th><th><LocalizedUi value={"\u042D\u043A\u0441\u043F\u0435\u0440\u0442, \u0432\u043E\u043A\u0441."}/></th>
            <th><LocalizedUi value={"\u041F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E, \u0432\u043E\u043A\u0441."}/></th><th><LocalizedUi value={"\u0414\u043E\u043B\u044F \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u0430"}/></th><th><LocalizedUi value={"Dice \u0441\u0440\u0435\u0437\u0430"}/></th><th><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u041A\u0422"}/></th></tr></thead>
          <tbody><LocalizedUi value={missed?.map(x => <tr key={x.nativeSliceIndex}>
            <td><LocalizedUi value={x.nativeSliceIndex}/></td><td><LocalizedUi value={x.expertVoxels}/></td>
            <td><LocalizedUi value={x.falseNegativeVoxels}/></td>
            <td><LocalizedUi value={(100 * x.falseNegativeVoxels / x.expertVoxels).toFixed(1)}/>%</td>
            <td><LocalizedUi value={x.sliceDice === null ? "—" : x.sliceDice.toFixed(3)}/></td>
            <td><button type="button" disabled={!canNavigate || !onGoToSlice} aria-label={`Открыть исходный срез k ${x.nativeSliceIndex + 1}`} onClick={() => onGoToSlice?.(x.nativeSliceIndex)}><LocalizedUi value={"\u041A\u0422 \u00B7 \u0441\u0440\u0435\u0437"}/></button></td>
          </tr>)}/></tbody>
        </table>
      </div>
      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <caption style={{ textAlign: "left", marginBottom: 6 }}><LocalizedUi value={"\u041D\u0430\u0438\u0431\u043E\u043B\u044C\u0448\u0438\u0439 \u043E\u0431\u044A\u0451\u043C \u043B\u0438\u0448\u043D\u0435\u0439 \u043F\u0440\u0435\u0434\u0441\u043A\u0430\u0437\u0430\u043D\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u0438 \u2014 \u043F\u0435\u0440\u0432\u044B\u0435 12 \u0441\u0440\u0435\u0437\u043E\u0432"}/></caption>
          <thead><tr><th><LocalizedUi value={"\u0418\u043D\u0434\u0435\u043A\u0441 \u0441\u0440\u0435\u0437\u0430"}/></th><th><LocalizedUi value={"\u041F\u0440\u0435\u0434\u0441\u043A\u0430\u0437\u0430\u043D\u043E, \u0432\u043E\u043A\u0441."}/></th>
            <th><LocalizedUi value={"\u041B\u0438\u0448\u043D\u0438\u0435, \u0432\u043E\u043A\u0441."}/></th><th><LocalizedUi value={"Dice \u0441\u0440\u0435\u0437\u0430"}/></th><th><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u041A\u0422"}/></th></tr></thead>
          <tbody><LocalizedUi value={extra?.map(x => <tr key={x.nativeSliceIndex}>
            <td><LocalizedUi value={x.nativeSliceIndex}/></td><td><LocalizedUi value={x.predictedVoxels}/></td>
            <td><LocalizedUi value={x.falsePositiveVoxels}/></td>
            <td><LocalizedUi value={x.sliceDice === null ? "—" : x.sliceDice.toFixed(3)}/></td>
            <td><button type="button" disabled={!canNavigate || !onGoToSlice} aria-label={`Открыть исходный срез k ${x.nativeSliceIndex + 1}`} onClick={() => onGoToSlice?.(x.nativeSliceIndex)}><LocalizedUi value={"\u041A\u0422 \u00B7 \u0441\u0440\u0435\u0437"}/></button></td>
          </tr>)}/></tbody>
        </table>
      </div>
      <p><small><LocalizedUi value={"\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0430\u044F \u0441\u0435\u0433\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u044F. \u042D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u0430\u044F \u043C\u0430\u0441\u043A\u0430 \u043D\u0435 \u0443\u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u0435\u043D\u0430 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u044B\u043C \u0430\u0443\u0434\u0438\u0442\u043E\u043C; \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043F\u0440\u0435\u0434\u0441\u043A\u0430\u0437\u0430\u043D\u0438\u044F \u043D\u0435 \u0438\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u0435."}/></small></p>
      <button type="button" onClick={() => setAudit(null)}><LocalizedUi value={"\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0441\u0440\u0435\u0437\u043E\u0432\u044B\u0439 \u043E\u0442\u0447\u0451\u0442"}/></button>
    </>}/>
  </section>;
}
