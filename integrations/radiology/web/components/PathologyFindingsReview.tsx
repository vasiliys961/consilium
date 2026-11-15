"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useState } from "react";
import { buildPathologyResearchHtml } from "../lib/pathology-research-report";
import { startPathologyReview, recordPathologyAssessment, setPathologySynthesis, type MonaiResearchReport, type PathologyAssessment, type PathologyFinding, type PathologyReviewDraft, } from "../lib/pathology-findings";
const decisionLabels = {
    unreviewed: "Не оценён",
    needs_image_review: "Требуется проверка по исходным срезам",
    rejected_by_reviewer: "Отклонён рецензентом (без подтверждения изображения)",
} as const;
function updated(p: PathologyAssessment, change: Partial<PathologyAssessment>): PathologyAssessment {
    return { ...p, ...change };
}
function changed(a: PathologyAssessment, b: PathologyAssessment): boolean {
    return a.decision !== b.decision || a.note !== b.note ||
        a.reviewerMeasuredDiameterMm !== b.reviewerMeasuredDiameterMm;
}
function downloadDraft(draft: PathologyReviewDraft, format: "json" | "html") {
    const data = format === "json" ? JSON.stringify(draft, null, 2) : buildPathologyResearchHtml(draft, new Date().toISOString());
    const blob = new Blob([data], { type: format === "json" ? "application/json" : "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "opus-pathology-luna16-physician-research-draft." + format;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function ReviewRow({ finding, editing, onChange, onSave }: {
    finding: PathologyFinding;
    editing: PathologyAssessment;
    onChange: (p: PathologyAssessment) => void;
    onSave: () => void;
}) {
    const __ui = useUiTranslator();
    const isDirty = changed(editing, finding.assessment);
    return <fieldset style={{ padding: 12, border: "1px solid #80968c", borderRadius: 8, margin: "12px 0" }}>
    <legend><strong><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442"}/><LocalizedUi value={finding.candidateIndex + 1}/><LocalizedUi value={"\u2014 \u0432\u0440\u0430\u0447\u0435\u0431\u043D\u0430\u044F \u043E\u0446\u0435\u043D\u043A\u0430"}/></strong></legend>
    <p><LocalizedUi value={"\u041F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435 MONAI:"}/><LocalizedUi value={finding.localization.modelBoundingBoxMm.map(n => n.toFixed(1)).join(" × ")}/><LocalizedUi value={"\u043C\u043C"}/><LocalizedUi value={" · "}/>score <LocalizedUi value={finding.model.rawUncalibratedScore.toFixed(3)}/><LocalizedUi value={"(\u043D\u0435\u043A\u0430\u043B\u0438\u0431\u0440\u043E\u0432\u0430\u043D\u043D\u0430\u044F \u043E\u0446\u0435\u043D\u043A\u0430)."}/></p>
    <p><LocalizedUi value={"\u041A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u044B \u043C\u043E\u0434\u0435\u043B\u0438:"}/><LocalizedUi value={finding.localization.modelWorldCenterMm.map(n => n.toFixed(2)).join(" / ")}/><LocalizedUi value={"\u043C\u043C. \u041D\u0435\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0445 DICOM LPS \u0438 SOP UID."}/></p>
    <label><LocalizedUi value={"\u0421\u0442\u0430\u0442\u0443\u0441 \u0432\u0440\u0430\u0447\u0430"}/><select value={editing.decision} onChange={e => onChange(updated(editing, { decision: e.target.value as PathologyAssessment["decision"] }))}>
        <LocalizedUi value={Object.entries(decisionLabels).map(([key, label]) => <option key={key} value={key}><LocalizedUi value={label}/></option>)}/>
      </select>
    </label>
    <label style={{ display: "block", marginTop: 8 }}><LocalizedUi value={"\u0414\u0438\u0430\u043C\u0435\u0442\u0440, \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u043D\u044B\u0439 \u0432\u0440\u0430\u0447\u043E\u043C \u043F\u043E \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u043C\u0443 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044E (\u043C\u043C), \u0435\u0441\u043B\u0438 \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D"}/><input type="number" min="0.1" max="300" step="0.1" value={editing.reviewerMeasuredDiameterMm ?? ""} placeholder={__ui("\u041D\u0435 \u0438\u0437\u043C\u0435\u0440\u0435\u043D")} onChange={e => {
            const number = e.target.value === "" ? null : Number(e.target.value);
            onChange(updated(editing, { reviewerMeasuredDiameterMm: number }));
        }}/>
    </label>
    <p><small><LocalizedUi value={"\u0420\u0430\u0437\u043C\u0435\u0440\u044B \u0431\u043E\u043A\u0441\u0430 \u043C\u043E\u0434\u0435\u043B\u0438 \u043D\u0435\u043B\u044C\u0437\u044F \u0441\u0447\u0438\u0442\u0430\u0442\u044C \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u0435\u043C \u0432\u0440\u0430\u0447\u0430. \u0420\u0443\u0447\u043D\u043E\u0435 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438."}/></small></p>
    <label style={{ display: "block" }}><LocalizedUi value={"\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 / \u0434\u0438\u0444\u0444\u0435\u0440\u0435\u043D\u0446\u0438\u0430\u043B\u044C\u043D\u044B\u0435 \u0441\u043E\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u0432\u0440\u0430\u0447\u0430"}/><textarea maxLength={1500} rows={2} style={{ display: "block", width: "100%" }} value={editing.note} onChange={e => onChange(updated(editing, { note: e.target.value }))} placeholder={__ui("\u0427\u0442\u043E \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u0430\u0445; \u0431\u0435\u0437 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u043F\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 \u0434\u0438\u0430\u0433\u043D\u043E\u0437\u0430")}/>
    </label>
    <button type="button" disabled={!isDirty} onClick={onSave}>
      <LocalizedUi value={isDirty ? "Сохранить оценку в локальном журнале" : "Оценка сохранена"}/>
    </button>
    <p><small><LocalizedUi value={"\u0422\u0435\u043A\u0443\u0449\u0430\u044F \u0437\u0430\u043F\u0438\u0441\u044C:"}/><LocalizedUi value={decisionLabels[finding.assessment.decision]}/>.</small></p>
  </fieldset>;
}
/** Medical review is local and source-bound, intentionally separate from the MONAI model output. */
export default function PathologyFindingsReview({ report }: {
    report: MonaiResearchReport;
}) {
    const __ui = useUiTranslator();
    const [draft, setDraft] = useState(() => startPathologyReview(report));
    const [pending, setPending] = useState<Record<string, PathologyAssessment>>({});
    const [synthesis, setSynthesis] = useState("");
    const [error, setError] = useState("");
    const [exportMessage, setExportMessage] = useState("");
    const dirty = draft.findings.some(f => pending[f.findingId] && changed(pending[f.findingId], f.assessment));
    const reviewed = draft.findings.filter(f => f.assessment.decision !== "unreviewed").length;
    function save(f: PathologyFinding) {
        try {
            const proposal = pending[f.findingId];
            if (!proposal)
                return;
            const recorded = recordPathologyAssessment(draft, f.findingId, proposal, new Date().toISOString());
            setDraft(recorded);
            setPending(current => {
                const next = { ...current };
                delete next[f.findingId];
                return next;
            });
            setError("");
            setExportMessage("");
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Не удалось сохранить оценку.");
        }
    }
    function exportLocal(format: "json" | "html") {
        setError("");
        setExportMessage("");
        if (dirty) {
            setError("Сначала сохраните изменения в оценках каждого кандидата.");
            return;
        }
        try {
            const complete = setPathologySynthesis(draft, synthesis);
            downloadDraft(complete, format);
            setExportMessage("Исследовательский " + format.toUpperCase() + "-черновик сформирован локально. Он не подписан и не отправлен в облако.");
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Ошибка экспорта.");
        }
    }
    return <section aria-label={__ui("\u0412\u0440\u0430\u0447\u0435\u0431\u043D\u044B\u0439 \u0440\u0430\u0437\u0431\u043E\u0440 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0445 \u043D\u0430\u0445\u043E\u0434\u043E\u043A")} style={{ border: "1px solid #789085", borderRadius: 10, padding: 12, marginTop: 16 }}>
    <h4><LocalizedUi value={"\u0412\u0440\u0430\u0447\u0435\u0431\u043D\u044B\u0439 \u0440\u0430\u0437\u0431\u043E\u0440 \u00B7 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u044B"}/></h4>
    <p><LocalizedUi value={"\u041D\u0438 \u043E\u0434\u0438\u043D \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438. \u0421\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u0440\u0435\u0448\u0435\u043D\u0438\u044F \u043E\u0442\u043D\u043E\u0441\u044F\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043A \u0434\u0430\u043D\u043D\u043E\u043C\u0443 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u043C\u0443 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0443 MONAI, \u0430 \u043D\u0435 \u043A \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u043E\u0439 \u041A\u0422 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0430."}/></p>
    <p><strong><LocalizedUi value={"\u041F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u043D\u043E:"}/><LocalizedUi value={reviewed}/>/<LocalizedUi value={draft.findings.length}/></strong>
      <LocalizedUi value={" · "}/><LocalizedUi value={"\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 \u0432 \u0436\u0443\u0440\u043D\u0430\u043B\u0435:"}/><LocalizedUi value={draft.events.length}/>
      <LocalizedUi value={" · "}/><LocalizedUi value={"\u041F\u043E\u043A\u0440\u044B\u0442\u0438\u0435: \u0442\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u0434\u0430\u0447\u0430 \u043F\u043E\u0438\u0441\u043A\u0430 \u043B\u0451\u0433\u043E\u0447\u043D\u044B\u0445 \u0443\u0437\u043B\u043E\u0432."}/></p>
    <p role="alert"><LocalizedUi value={"\u041F\u043E\u043A\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u041A\u0422 \u043D\u0435 \u0441\u0432\u044F\u0437\u0430\u043D\u0430 \u0441 \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u0430\u043C\u0438 \u043C\u043E\u0434\u0435\u043B\u0438 \u0438 SOP UID, \u043D\u0435\u043B\u044C\u0437\u044F \u043E\u0442\u043C\u0435\u0442\u0438\u0442\u044C \u043D\u0430\u0445\u043E\u0434\u043A\u0443 \u043A\u0430\u043A \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u0443\u044E. \u0414\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u043D\u0443\u0436\u0435\u043D \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u043F\u0438\u043A\u0441\u0435\u043B\u0435\u0439."}/></p>
    <LocalizedUi value={draft.findings.map(f => <ReviewRow key={f.findingId} finding={f} editing={pending[f.findingId] ?? f.assessment} onChange={value => { setPending(current => ({ ...current, [f.findingId]: value })); setExportMessage(""); }} onSave={() => save(f)}/>)}/>
    <label style={{ display: "block" }}><LocalizedUi value={"\u041E\u0431\u0449\u0438\u0439 \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 \u0432\u0440\u0430\u0447\u0430 (\u043D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u043C \u0434\u0438\u0430\u0433\u043D\u043E\u0437\u043E\u043C)"}/><textarea value={synthesis} maxLength={4000} rows={3} style={{ display: "block", width: "100%" }} placeholder={__ui("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u044F \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F, \u043D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u044B\u0435 \u0434\u043E\u043E\u0431\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F \u0438 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442")} onChange={e => { setSynthesis(e.target.value); setExportMessage(""); }}/>
    </label>
    <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
    <LocalizedUi value={exportMessage && <p role="status"><LocalizedUi value={exportMessage}/></p>}/>
    <button type="button" disabled={dirty} onClick={() => exportLocal("json")}><LocalizedUi value={"\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A JSON"}/></button><LocalizedUi value={" "}/>
    <button type="button" disabled={dirty} onClick={() => exportLocal("html")}><LocalizedUi value={"\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0447\u0438\u0442\u0430\u0435\u043C\u044B\u0439 \u0432\u0440\u0430\u0447\u0435\u0431\u043D\u044B\u0439 \u043E\u0442\u0447\u0451\u0442 HTML / \u043F\u0435\u0447\u0430\u0442\u044C"}/></button>
    <p><small><LocalizedUi value={"\u042D\u043A\u0441\u043F\u043E\u0440\u0442 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 SHA-256 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0433\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F, \u0438\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u043E\u0440 \u0438 \u0432\u0435\u0440\u0441\u0438\u044E \u043C\u043E\u0434\u0435\u043B\u0438, \u0442\u0440\u0438 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F, \u0438\u0441\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F \u0438 \u0436\u0443\u0440\u043D\u0430\u043B \u0440\u0435\u0448\u0435\u043D\u0438\u0439. \u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043D\u043E\u0439 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0438 \u043D\u0435 \u0443\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u0435\u0442\u0441\u044F. \u0421\u0442\u0430\u0442\u0443\u0441: \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439, \u0431\u0435\u0437 \u044D\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u043E\u0439 \u043F\u043E\u0434\u043F\u0438\u0441\u0438."}/></small></p>
  </section>;
}
