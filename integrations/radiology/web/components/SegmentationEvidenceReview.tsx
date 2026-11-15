"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useMemo, useRef, useState } from "react";
import { type EvidenceDecision, type SegmentationEvidence } from "../lib/segmentation-evidence";
import { changeEvidenceReview, MAX_REVIEW_JSON_BYTES, restoreEvidenceReview, startEvidenceReview } from "../lib/evidence-review-history";
import type { Point3 } from "../lib/segmentation-mask";
import EvidenceComparisonReview from "./EvidenceComparisonReview";
import LocalLungLlmReview from "./LocalLungLlmReview";
import EvidenceReportDownload from "./EvidenceReportDownload";
import { latestReviewerNote, MAX_NOTE_CHARS, MAX_NOTE_JSON_BYTES, restoreReviewerNote, reviewerNoteNeedsRecheck, saveReviewerNote, type EvidenceWithNote } from "../lib/evidence-reviewer-note";
const decisionLabel: Record<EvidenceDecision, string> = { unreviewed: "Не проверено врачом", requires_recheck: "На перепроверку", rejected: "Отклонено локально" };
/** Mount with a binding key so replacement/series changes discard old reviews. */
export default function SegmentationEvidenceReview({ evidence, onNavigate, onSampleMask }: {
    evidence: SegmentationEvidence;
    onNavigate: (point: Point3, labelId: number | null) => void;
    onSampleMask: (point: Point3) => number | null;
}) {
    const __ui = useUiTranslator();
    const [review, setReview] = useState<EvidenceWithNote>(() => startEvidenceReview(evidence));
    const [noteTarget, setNoteTarget] = useState<string | null>(null);
    const [noteDraft, setNoteDraft] = useState("");
    const [noteError, setNoteError] = useState("");
    const latestNote = latestReviewerNote(review.reviewerNote, noteTarget);
    const targetObservation = review.observations.find(o => o.observationId === noteTarget);
    const noteDirty = noteDraft !== (latestNote?.text ?? "");
    const noteStale = useMemo(() => reviewerNoteNeedsRecheck(review, noteTarget), [review, noteTarget]);
    const [error, setError] = useState("");
    const [historyError, setHistoryError] = useState("");
    const [imported, setImported] = useState(false);
    const importVersion = useRef(0);
    useEffect(() => () => { ++importVersion.current; }, []);
    const decide = (id: string, decision: EvidenceDecision) => {
        ++importVersion.current; // a pending import cannot replace a newer click
        try {
            setReview(changeEvidenceReview(review, id, decision, new Date().toISOString()));
            setHistoryError("");
            setImported(false);
        }
        catch (e) {
            setHistoryError(e instanceof Error ? e.message : "Не удалось изменить отметку.");
        }
    };
    const restore = async (file?: File) => {
        const version = ++importVersion.current;
        if (!file)
            return;
        try {
            if (file.size > MAX_REVIEW_JSON_BYTES)
                throw new Error("История превышает лимит 256 КБ.");
            const raw = await file.text();
            if (version !== importVersion.current)
                return;
            setReview(restoreEvidenceReview(review, raw));
            setHistoryError("");
            setImported(true);
        }
        catch (e) {
            if (version === importVersion.current)
                setHistoryError(e instanceof Error ? e.message : "Не удалось восстановить историю.");
        }
    };
    const download = (value: unknown, suffix: string) => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `opus-${review.source.requestId}.${suffix}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const saveNote = () => {
        ++importVersion.current;
        try {
            setReview(saveReviewerNote(review, noteDraft, new Date().toISOString(), noteTarget));
            setNoteError("");
        }
        catch (e) {
            setNoteError(e instanceof Error ? e.message : "Не удалось сохранить заметку.");
        }
    };
    const restoreNote = async (file?: File) => {
        const version = ++importVersion.current;
        if (!file)
            return;
        try {
            if (noteDirty)
                throw new Error("Сначала сохраните заметку или сбросьте несохранённые правки.");
            if (file.size > MAX_NOTE_JSON_BYTES)
                throw new Error("Файл заметки превышает 512 КБ.");
            const raw = await file.text();
            if (version !== importVersion.current)
                return;
            const next = restoreReviewerNote(review, raw);
            setReview(next);
            setNoteDraft(latestReviewerNote(next.reviewerNote, noteTarget)?.text ?? "");
            setNoteError("");
        }
        catch (e) {
            if (version === importVersion.current)
                setNoteError(e instanceof Error ? e.message : "Не удалось восстановить заметку.");
        }
    };
    return <section className="ora-evidence-panel ora-segmentation-evidence" aria-label={__ui("Evidence \u0441\u0435\u0433\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u0438")}>
    <header className="ora-evidence-heading"><div><h2><LocalizedUi value={"Evidence \u00B7 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0441\u0435\u0433\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u0438"}/></h2>
      <p><LocalizedUi value={review.producer.model.id}/> · <LocalizedUi value={review.producer.model.version}/> · <LocalizedUi value={review.source.frameCount}/><LocalizedUi value={"\u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u043E\u0432"}/></p></div>
      <span className="ora-evidence-experimental">RESEARCH</span></header>
    <p className="ora-evidence-explainer"><LocalizedUi value={"\u041E\u0431\u044A\u0451\u043C \u043C\u0435\u0442\u043A\u0438 \u0440\u0430\u0441\u0441\u0447\u0438\u0442\u0430\u043D \u043F\u043E \u043C\u0430\u0441\u043A\u0435 \u0438 \u0435\u0451 \u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u0438 \u0442\u043E\u043B\u044C\u043A\u043E \u0432 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u0430\u0445. \u041F\u043E\u043B\u043D\u043E\u0442\u0430 \u043E\u0440\u0433\u0430\u043D\u0430 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0430. \u042D\u0442\u043E \u043D\u0435 \u043F\u043E\u0438\u0441\u043A \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0439 \u0438 \u043D\u0435 \u0434\u0438\u0430\u0433\u043D\u043E\u0437."}/></p>
    <LocalizedUi value={error && <p role="alert" className="ora-evidence-error"><LocalizedUi value={error}/></p>}/>
    <ul className="ora-evidence-list"><LocalizedUi value={review.observations.map(o => <li key={o.observationId}>
      <div className="ora-evidence-entry"><strong><LocalizedUi value={o.labelName}/></strong><span><LocalizedUi value={decisionLabel[o.review]}/></span></div>
      <p><LocalizedUi value={o.volumeMl.toFixed(3)}/><LocalizedUi value={"\u043C\u043B \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0438 \u00B7"}/><LocalizedUi value={o.voxels.toLocaleString("ru-RU")}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439"}/></p>
      <div className="ora-evidence-row">
        <button type="button" onClick={() => {
                try {
                    onNavigate(o.anchorLpsMm, o.labelId);
                    setError("");
                }
                catch {
                    setError("Не удалось перейти к метке: проверьте активную серию MPR.");
                }
            }}><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043C\u0435\u0442\u043A\u0443 \u0432 MPR"}/></button>
        <button type="button" aria-pressed={o.review === "requires_recheck"} onClick={() => decide(o.observationId, "requires_recheck")}><LocalizedUi value={"\u041F\u0435\u0440\u0435\u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043C\u0435\u0442\u043A\u0443"}/></button>
        <button type="button" aria-pressed={o.review === "rejected"} onClick={() => decide(o.observationId, "rejected")}><LocalizedUi value={"\u041E\u0442\u043A\u043B\u043E\u043D\u0438\u0442\u044C \u043C\u0435\u0442\u043A\u0443"}/></button>
        <LocalizedUi value={o.review !== "unreviewed" && <button type="button" onClick={() => decide(o.observationId, "unreviewed")}><LocalizedUi value={"\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u043E\u0442\u043C\u0435\u0442\u043A\u0443"}/></button>}/>
      </div>
    </li>)}/></ul>
    <LocalizedUi value={!review.observations.length && <p><LocalizedUi value={"\u041D\u0435\u043D\u0443\u043B\u0435\u0432\u044B\u0445 \u043C\u0435\u0442\u043E\u043A \u043D\u0435\u0442. \u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0438 \u043D\u0435 \u043E\u0437\u043D\u0430\u0447\u0430\u0435\u0442 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0438."}/></p>}/>
    <section className="ora-reviewer-note" aria-label={__ui("\u0417\u0430\u043C\u0435\u0442\u043A\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0449\u0435\u0433\u043E")}>
      <h3><LocalizedUi value={"\u0417\u0430\u043C\u0435\u0442\u043A\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0449\u0435\u0433\u043E \u00B7 \u043D\u0435\u043F\u043E\u0434\u043F\u0438\u0441\u0430\u043D\u043D\u044B\u0439 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A"}/></h3>
      <p><LocalizedUi value={"\u0412\u0430\u0448 \u0442\u0435\u043A\u0441\u0442 \u043E\u0442\u0434\u0435\u043B\u0451\u043D \u043E\u0442 \u043C\u043E\u0434\u0435\u043B\u0435\u0439 \u0438 \u0432\u043A\u043B\u044E\u0447\u0430\u0435\u0442\u0441\u044F \u0432 \u043E\u0442\u0447\u0451\u0442 \u043F\u043E\u0441\u043B\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F. \u0410\u0432\u0442\u043E\u0440 \u043D\u0435 \u0443\u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u0435\u043D. \u0422\u0435\u043A\u0441\u0442 \u043C\u043E\u0436\u0435\u0442 \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u0447\u0443\u0432\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435: \u0445\u0440\u0430\u043D\u0438\u0442\u0435 \u0435\u0433\u043E \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E."}/></p>
      <label><LocalizedUi value={"\u041A \u0447\u0435\u043C\u0443 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u0437\u0430\u043C\u0435\u0442\u043A\u0430"}/><select value={noteTarget ?? ""} disabled={noteDirty} onChange={e => {
            const target = e.target.value || null;
            ++importVersion.current;
            setNoteTarget(target);
            setNoteDraft(latestReviewerNote(review.reviewerNote, target)?.text ?? "");
            setNoteError("");
        }}><option value=""><LocalizedUi value={"\u041E\u0431\u0449\u0430\u044F \u0437\u0430\u043C\u0435\u0442\u043A\u0430 \u043A \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0443"}/></option><LocalizedUi value={review.observations.map(o => <option key={o.observationId} value={o.observationId}><LocalizedUi value={o.labelId}/> · <LocalizedUi value={o.labelName}/></option>)}/></select></label>
      <LocalizedUi value={targetObservation && <p><LocalizedUi value={"\u0417\u0430\u043C\u0435\u0442\u043A\u0430 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u043A \u043C\u0435\u0442\u043A\u0435 \u043C\u0430\u0441\u043A\u0438 \u0432 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u0430\u0445, \u0430 \u043D\u0435 \u043A \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u043C\u0443 \u043E\u0447\u0430\u0433\u0443 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0438."}/></p>}/>
      <label><LocalizedUi value={"\u0422\u0435\u043A\u0441\u0442 \u0437\u0430\u043C\u0435\u0442\u043A\u0438"}/><textarea maxLength={MAX_NOTE_CHARS} autoComplete="off" value={noteDraft} onChange={e => { ++importVersion.current; setNoteDraft(e.target.value); setNoteError(""); }} rows={5}/></label>
      <p><LocalizedUi value={noteDraft.length}/> / <LocalizedUi value={MAX_NOTE_CHARS}/><LocalizedUi value={"\u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432 \u00B7 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0445 \u0432\u0435\u0440\u0441\u0438\u0439:"}/><LocalizedUi value={review.reviewerNote?.versions.length ?? 0}/></p>
      <LocalizedUi value={noteDirty && <p role="status"><LocalizedUi value={"\u0415\u0441\u0442\u044C \u043D\u0435\u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u043F\u0440\u0430\u0432\u043A\u0438. \u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0435 \u0438\u043B\u0438 \u0441\u0431\u0440\u043E\u0441\u044C\u0442\u0435 \u0438\u0445 \u043F\u0435\u0440\u0435\u0434 \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u043E\u043C \u043E\u0442\u0447\u0451\u0442\u0430/Evidence."}/></p>}/>
      <LocalizedUi value={noteStale && <p role="status"><LocalizedUi value={"\u041F\u043E\u0441\u043B\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F \u0437\u0430\u043C\u0435\u0442\u043A\u0438 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0438\u0441\u044C \u043E\u0442\u043C\u0435\u0442\u043A\u0438. \u0417\u0430\u043C\u0435\u0442\u043A\u0443 \u043D\u0443\u0436\u043D\u043E \u043F\u0435\u0440\u0435\u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043D\u043E\u0432\u0443\u044E \u0432\u0435\u0440\u0441\u0438\u044E."}/></p>}/>
      <LocalizedUi value={noteError && <p role="alert" className="ora-evidence-error"><LocalizedUi value={noteError}/><LocalizedUi value={"\u0422\u0435\u043A\u0443\u0449\u0438\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u0432\u0435\u0440\u0441\u0438\u0438 \u043D\u0435 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u044B."}/></p>}/>
      <div className="ora-evidence-actions">
        <button type="button" disabled={!noteDirty && !noteStale} onClick={saveNote}><LocalizedUi value={"\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0437\u0430\u043C\u0435\u0442\u043A\u0443"}/></button>
        <button type="button" disabled={!noteDirty} onClick={() => { ++importVersion.current; setNoteDraft(latestNote?.text ?? ""); setNoteError(""); }}><LocalizedUi value={"\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u043F\u0440\u0430\u0432\u043A\u0438 \u0437\u0430\u043C\u0435\u0442\u043A\u0438"}/></button>
        <button type="button" disabled={!review.reviewerNote || noteDirty} onClick={() => download(review.reviewerNote, "reviewer-note")}><LocalizedUi value={"\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0437\u0430\u043C\u0435\u0442\u043A\u0443 JSON"}/></button>
        <LocalizedUi value={targetObservation && <button type="button" onClick={() => {
                try {
                    onNavigate(targetObservation.anchorLpsMm, targetObservation.labelId);
                    setNoteError("");
                }
                catch {
                    setNoteError("Не удалось перейти к метке: проверьте активную серию MPR.");
                }
            }}><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043C\u0435\u0442\u043A\u0443 \u0437\u0430\u043C\u0435\u0442\u043A\u0438 \u0432 MPR"}/></button>}/>
      </div>
      <details><summary><LocalizedUi value={"\u0412\u0435\u0440\u0441\u0438\u0438 \u0437\u0430\u043C\u0435\u0442\u043A\u0438"}/></summary><ol><LocalizedUi value={review.reviewerNote?.versions.map(v => <li key={v.revision}><LocalizedUi value={"\u0412\u0435\u0440\u0441\u0438\u044F"}/><LocalizedUi value={v.revision}/> · <LocalizedUi value={v.observationId ? review.observations.find(o => o.observationId === v.observationId)?.labelName : "Общая заметка"}/><LocalizedUi value={"\u00B7 \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438"}/><LocalizedUi value={v.reviewRevision}/> · <time dateTime={v.at}><LocalizedUi value={new Date(v.at).toLocaleString("ru-RU")}/></time><p><LocalizedUi value={v.text || "Пустая заметка (текст очищен)."}/></p></li>)}/></ol></details>
      <label><LocalizedUi value={"\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0437\u0430\u043C\u0435\u0442\u043A\u0443 JSON"}/><input type="file" accept=".json,application/json" onChange={e => { void restoreNote(e.target.files?.[0]); e.target.value = ""; }}/></label>
    </section>
    <div className="ora-evidence-actions"><button type="button" disabled={noteDirty} onClick={() => download(review, "evidence")}><LocalizedUi value={"\u0421\u043A\u0430\u0447\u0430\u0442\u044C Evidence JSON"}/></button></div>
    <EvidenceReportDownload evidence={review} hasUnsavedReviewerNote={noteDirty}/>
    <section className="ora-review-history" aria-label={__ui("\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 Evidence")}>
      <h3><LocalizedUi value={"\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u00B7 \u0432\u0435\u0440\u0441\u0438\u044F"}/><LocalizedUi value={review.reviewHistory.events.length}/></h3>
      <p><LocalizedUi value={"\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F \u0432 \u043F\u0430\u043C\u044F\u0442\u0438 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B \u0438 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u043C JSON. \u0421\u0431\u0440\u043E\u0441 \u043E\u0442\u043C\u0435\u0442\u043A\u0438 \u0434\u043E\u0431\u0430\u0432\u043B\u044F\u0435\u0442 \u043D\u043E\u0432\u0443\u044E \u0437\u0430\u043F\u0438\u0441\u044C. \u0410\u0432\u0442\u043E\u0440 \u0438 \u0432\u0440\u0435\u043C\u044F \u043D\u0435 \u0443\u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u0435\u043D\u044B; \u044D\u0442\u043E \u043D\u0435 \u044D\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u0430\u044F \u043F\u043E\u0434\u043F\u0438\u0441\u044C."}/></p>
      <LocalizedUi value={historyError && <p role="alert" className="ora-evidence-error"><LocalizedUi value={historyError}/><LocalizedUi value={"\u0422\u0435\u043A\u0443\u0449\u0438\u0435 \u043E\u0442\u043C\u0435\u0442\u043A\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B."}/></p>}/>
      <LocalizedUi value={imported && <p role="status"><LocalizedUi value={"\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0430 \u0434\u043B\u044F \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0430 \u0438 \u043C\u0430\u0441\u043A\u0438. \u041F\u0440\u043E\u0438\u0441\u0445\u043E\u0436\u0434\u0435\u043D\u0438\u0435 \u0444\u0430\u0439\u043B\u0430 \u043D\u0435 \u0443\u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u0435\u043D\u043E."}/></p>}/>
      <details><summary><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F ("}/><LocalizedUi value={review.reviewHistory.events.length}/>)</summary>
        <ol><LocalizedUi value={review.reviewHistory.events.map(event => <li key={event.revision}>#<LocalizedUi value={event.revision}/> · <LocalizedUi value={review.observations.find(o => o.observationId === event.observationId)?.labelName}/> · <LocalizedUi value={decisionLabel[event.from]}/> → <LocalizedUi value={decisionLabel[event.to]}/> · <time dateTime={event.at}><LocalizedUi value={new Date(event.at).toLocaleString("ru-RU")}/></time></li>)}/></ol>
        <LocalizedUi value={!review.reviewHistory.events.length && <p><LocalizedUi value={"\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 \u0435\u0449\u0451 \u043D\u0435\u0442."}/></p>}/>
      </details>
      <div className="ora-evidence-actions"><button type="button" onClick={() => download(review.reviewHistory, "review")}><LocalizedUi value={"\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0438\u0441\u0442\u043E\u0440\u0438\u044E JSON"}/></button></div>
      <label><LocalizedUi value={"\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0438\u0441\u0442\u043E\u0440\u0438\u044E JSON"}/><input type="file" accept=".json,application/json" onChange={e => { void restore(e.target.files?.[0]); e.target.value = ""; }}/></label>
    </section>
    <details className="ora-evidence-draft"><summary><LocalizedUi value={"\u041F\u0440\u0438\u0432\u044F\u0437\u043A\u0430 \u043A \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0443 \u0438 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u044F"}/></summary>
      <p><LocalizedUi value={"SHA-256 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E \u043E\u0431\u044A\u0451\u043C\u0430:"}/><LocalizedUi value={review.source.inputSha256}/><br /><LocalizedUi value={"SHA-256 \u043C\u0430\u0441\u043A\u0438:"}/><LocalizedUi value={review.mask.sha256}/><br /><LocalizedUi value={"SHA-256 \u0432\u0435\u0441\u043E\u0432:"}/><LocalizedUi value={review.producer.model.weightsSha256}/></p>
      <ul><LocalizedUi value={review.limitations.map((s, i) => <li key={i}><LocalizedUi value={s}/></li>)}/></ul></details>
    <small><LocalizedUi value={"\u041E\u0442\u043C\u0435\u0442\u043A\u0438 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0442 \u0432 \u043F\u0430\u043C\u044F\u0442\u0438 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B \u0438 \u0432\u043A\u043B\u044E\u0447\u0430\u044E\u0442\u0441\u044F \u0432 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 JSON. \u041C\u0430\u0441\u043A\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u0442\u0441\u044F \u0434\u043B\u044F \u0441\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u044F \u0434\u0430\u0436\u0435 \u043F\u0440\u0438 \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u0438. \u042D\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u043E\u0439 \u043F\u043E\u0434\u043F\u0438\u0441\u0438 \u0438 \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u043E\u0433\u043E \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u043D\u0435\u0442. \u041F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u044B Gemini/Claude \u043D\u0435 \u0432\u044B\u0437\u044B\u0432\u0430\u044E\u0442\u0441\u044F."}/></small>
    <LocalLungLlmReview evidence={review}/>
    <EvidenceComparisonReview evidence={review} onNavigate={onNavigate} onSampleMask={onSampleMask} hasUnsavedReviewerNote={noteDirty}/>
  </section>;
}
