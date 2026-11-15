"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useMemo, useRef, useState } from "react";
import type { DicomSeries } from "../lib/dicom-series";
import { sha256 } from "../lib/analysis-package";
import { evaluateLocalDiagnosticReview } from "../lib/patient-cloud-policy";
import { buildLocalDiagnosticDraft } from "../lib/local-diagnostic-review";
import { bindFindingsToLocalDicom, parseReviewableOrchestraResult, type ReviewableOrchestraResult } from "../lib/ai-review";
/**
 * Local review only: external model responses are NOT a diagnosis.
 * Selecting a source image never changes or writes the DICOM data.
 */
export default function AiEvidenceReview({ series, onNavigate, }: {
    series: readonly DicomSeries[];
    onNavigate: (memberId: string) => void;
}) {
    const __ui = useUiTranslator();
    const fileRef = useRef<HTMLInputElement>(null);
    const [result, setResult] = useState<ReviewableOrchestraResult | null>(null);
    const [filename, setFilename] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [decisions, setDecisions] = useState<Record<string, "recheck" | "dismiss">>({});
    const [aiSha, setAiSha] = useState("");
    const [clinicalQuestion, setClinicalQuestion] = useState("");
    const [clinicianSynthesis, setClinicianSynthesis] = useState("");
    const [differentials, setDifferentials] = useState<Record<string, string>>({});
    const [draftError, setDraftError] = useState("");
    const binding = useMemo(() => {
        if (!result)
            return { links: [], warning: "" };
        try {
            return { links: bindFindingsToLocalDicom(result, series), warning: "" };
        }
        catch (err) {
            return { links: [], warning: err instanceof Error ? err.message : "Привязка DICOM не подтверждена." };
        }
    }, [result, series]);
    const localAccess = evaluateLocalDiagnosticReview({
        modality: result?.modality ?? "CT",
        sourceBound: !!result && !binding.warning && !!aiSha,
        sourceChanged: !!binding.warning,
    });
    const exportLocalDraft = () => {
        if (!result || !localAccess.permitted) {
            setDraftError("Сначала подтвердите актуальные DICOM-срезы.");
            return;
        }
        let url: string | null = null;
        try {
            const draft = buildLocalDiagnosticDraft({
                modality: result.modality, sourceBound: localAccess.permitted,
                sourceChanged: !!binding.warning, aiResultSha256: aiSha,
                findings: binding.links, decisions, differentials, clinicalQuestion, clinicianSynthesis,
            });
            url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = "opus-local-diagnostic-draft.json";
            document.body.appendChild(a);
            a.click();
            a.remove();
            const completedUrl = url;
            setTimeout(() => URL.revokeObjectURL(completedUrl), 1000);
            url = null;
            setDraftError("");
        }
        catch (e) {
            setDraftError(e instanceof Error ? e.message : "Не удалось сформировать локальный черновик.");
        }
        finally {
            if (url)
                URL.revokeObjectURL(url);
        }
    };
    const importJson = async (file: File) => {
        setBusy(true);
        setError("");
        try {
            if (file.size > 512000)
                throw new Error("Файл AI превышает лимит 512 КБ.");
            const bytes = await file.arrayBuffer();
            const parsed = parseReviewableOrchestraResult(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
            bindFindingsToLocalDicom(parsed, series);
            const digest = await sha256(bytes);
            setResult(parsed);
            setFilename(file.name);
            setAiSha(digest);
            setDecisions({});
            setClinicalQuestion("");
            setClinicianSynthesis("");
            setDifferentials({});
            setDraftError("");
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Не удалось прочитать результат.");
            // A failed replacement does not silently clear a previously verified import.
        }
        finally {
            setBusy(false);
        }
    };
    return <section className="ora-evidence-panel" aria-label={__ui("\u0412\u0440\u0430\u0447\u0435\u0431\u043D\u0430\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 AI-\u043D\u0430\u0445\u043E\u0434\u043E\u043A")}>
    <header className="ora-evidence-heading">
      <div><h2><LocalizedUi value={"AI-\u043D\u0430\u0445\u043E\u0434\u043A\u0438 \u00B7 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043F\u043E \u0441\u0440\u0435\u0437\u0430\u043C"}/></h2>
        <p><LocalizedUi value={"\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u043D\u043E\u0433\u043E JSON-\u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430 \u2014 \u0442\u043E\u043B\u044C\u043A\u043E \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E"}/></p>
      </div>
      <span className="ora-evidence-experimental">RESEARCH</span>
    </header>
    <p className="ora-evidence-explainer"><LocalizedUi value={"\u0417\u0434\u0435\u0441\u044C \u043C\u043E\u0436\u043D\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C, \u0447\u0442\u043E \u043A\u0430\u0436\u0434\u0430\u044F \u043D\u0430\u0445\u043E\u0434\u043A\u0430 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u043A \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u043E\u0439 \u0441\u0435\u0440\u0438\u0438 \u0438 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E\u043C\u0443 DICOM-\u043A\u0430\u0434\u0440\u0443. \u041C\u043E\u0434\u0435\u043B\u044C \u043D\u0435 \u0441\u0442\u0430\u0432\u0438\u0442 \u0434\u0438\u0430\u0433\u043D\u043E\u0437. \u0421\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0435 UID \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 \u043B\u0438\u0447\u043D\u043E\u0441\u0442\u044C \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0430 \u0438\u043B\u0438 \u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u043D\u043E\u0441\u0442\u044C \u043D\u0430\u0431\u043B\u044E\u0434\u0435\u043D\u0438\u044F."}/></p>
    <div className="ora-evidence-actions">
      <button type="button" onClick={() => fileRef.current?.click()} disabled={busy || !series.length}>
        <LocalizedUi value={busy ? "Проверка JSON…" : result ? "Заменить результат .json" : "Импортировать результат AI .json"}/>
      </button>
      <LocalizedUi value={result && <button type="button" onClick={() => {
                setResult(null);
                setFilename("");
                setAiSha("");
                setDecisions({});
                setDifferentials({});
                setClinicianSynthesis("");
                setClinicalQuestion("");
                setDraftError("");
                setError("");
            }}><LocalizedUi value={"\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C AI-\u043D\u0430\u0445\u043E\u0434\u043A\u0438"}/></button>}/>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f)
                void importJson(f);
        }}/>
    </div>
    <LocalizedUi value={!series.length && <p className="ora-evidence-subtle"><LocalizedUi value={"\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u043F\u0430\u043F\u043A\u0443 DICOM \u0434\u043B\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0439 \u043F\u0440\u0438\u0432\u044F\u0437\u043A\u0438."}/></p>}/>
    <LocalizedUi value={error && <p role="alert" className="ora-evidence-error"><LocalizedUi value={error}/></p>}/>
    <LocalizedUi value={binding.warning && <p role="alert" className="ora-evidence-error"><LocalizedUi value={"\u0421\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u043E\u0442\u0435\u0440\u044F\u043B\u043E \u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u043E\u0441\u0442\u044C:"}/><LocalizedUi value={binding.warning}/><LocalizedUi value={"\u041D\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u0441\u0442\u0430\u0440\u044B\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0441 \u0434\u0440\u0443\u0433\u0438\u043C\u0438 \u0441\u043D\u0438\u043C\u043A\u0430\u043C\u0438."}/></p>}/>
    <LocalizedUi value={result && !binding.warning && <>
      <div className="ora-evidence-success"><strong><LocalizedUi value={"\u0421\u0441\u044B\u043B\u043A\u0438 \u043D\u0430 DICOM \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u044B"}/></strong>
        <span><LocalizedUi value={filename}/> · <LocalizedUi value={result.provider}/> · <LocalizedUi value={binding.links.length}/><LocalizedUi value={"\u043D\u0430\u0431\u043B\u044E\u0434\u0435\u043D\u0438\u0439"}/></span></div>
      <p className="ora-evidence-subtle"><LocalizedUi value={"\u041E\u0445\u0432\u0430\u0442:"}/><LocalizedUi value={result.evidence.coverage === "partially_assessed" ?
                "часть изображений" : result.evidence.coverage === "not_assessed" ? "не оценён" : "заявлен как оценённый"}/><LocalizedUi value={". \u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 AI-\u043D\u0430\u0445\u043E\u0434\u043E\u043A \u043D\u0435 \u043E\u0437\u043D\u0430\u0447\u0430\u0435\u0442 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0438."}/></p>
      <LocalizedUi value={binding.links.length ? <ul className="ora-evidence-list">
        <LocalizedUi value={binding.links.map(link => {
                    const finding = result.evidence.findings.find(f => f.findingId === link.findingId);
                    const decision = decisions[link.findingId];
                    return <li key={link.findingId}>
            <div className="ora-evidence-entry"><strong><LocalizedUi value={link.anatomy}/></strong>
              <span><LocalizedUi value={link.needsRecheck ? "Повторная проверка" : "Кандидат"}/></span></div>
            <p><LocalizedUi value={link.sign}/></p><small><LocalizedUi value={link.sourceLabel}/> · <LocalizedUi value={link.findingId}/></small>
            <LocalizedUi value={finding?.limitations.map((w, i) => <small key={i} className="ora-evidence-limit"><LocalizedUi value={w}/></small>)}/>
            <div className="ora-evidence-row">
              <button type="button" onClick={() => onNavigate(link.memberId)}><LocalizedUi value={"\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u0441\u0440\u0435\u0437"}/></button>
              <button type="button" aria-pressed={decision === "recheck"} onClick={() => setDecisions(prev => ({ ...prev, [link.findingId]: "recheck" }))}><LocalizedUi value={"\u041D\u0430 \u043F\u0435\u0440\u0435\u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443"}/></button>
              <button type="button" aria-pressed={decision === "dismiss"} onClick={() => setDecisions(prev => ({ ...prev, [link.findingId]: "dismiss" }))}><LocalizedUi value={"\u041E\u0442\u043A\u043B\u043E\u043D\u0438\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E"}/></button>
            </div>
          </li>;
                })}/>
      </ul> : <p className="ora-evidence-subtle"><LocalizedUi value={"\u0412 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0435 \u043D\u0435\u0442 \u043D\u0430\u0431\u043B\u044E\u0434\u0435\u043D\u0438\u0439. \u042D\u0442\u043E \u043D\u0435 \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043C\u0435\u0434\u0438\u0446\u0438\u043D\u0441\u043A\u043E\u0433\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F."}/></p>}/>
      <details className="ora-evidence-draft">
        <summary><LocalizedUi value={"\u0427\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u0441\u0438\u043D\u0442\u0435\u0437\u0430 \u00B7 \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u0432\u0440\u0430\u0447\u0430"}/></summary>
        <p><LocalizedUi value={result.clinicalDraft.summary}/></p>
        <LocalizedUi value={result.clinicalDraft.limitations.map((w, i) => <p key={i} className="ora-evidence-limit"><LocalizedUi value={w}/></p>)}/>
      </details>
      <section className="ora-reviewer-note" aria-label={__ui("\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0440\u0430\u0437\u0431\u043E\u0440")}>
        <h3><LocalizedUi value={"\u0414\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0440\u0430\u0437\u0431\u043E\u0440 \u00B7 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E"}/></h3>
        <p><LocalizedUi value={"\u0412\u0440\u0430\u0447 \u043C\u043E\u0436\u0435\u0442 \u0441\u0444\u043E\u0440\u043C\u0443\u043B\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0434\u0438\u0444\u0444\u0435\u0440\u0435\u043D\u0446\u0438\u0430\u043B\u044C\u043D\u044B\u0439 \u0440\u044F\u0434 \u0438 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0432\u043E\u043F\u0440\u043E\u0441 \u043F\u043E \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u043C \u0441\u0440\u0435\u0437\u0430\u043C. \u042D\u0442\u043E \u0440\u0430\u0431\u043E\u0442\u0430 \u0441 \u043D\u0430\u0445\u043E\u0434\u043A\u0430\u043C\u0438, \u0430 \u043D\u0435 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043F\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430 \u0434\u0438\u0430\u0433\u043D\u043E\u0437\u0430. \u0424\u0430\u0439\u043B\u044B \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u044E\u0442\u0441\u044F \u0432 \u043E\u0431\u043B\u0430\u043A\u043E."}/></p>
        <p role="status"><LocalizedUi value={localAccess.reason}/></p>
        <label><LocalizedUi value={"\u041A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0432\u043E\u043F\u0440\u043E\u0441"}/><textarea rows={2} maxLength={1000} value={clinicalQuestion} onChange={e => setClinicalQuestion(e.target.value)} disabled={!localAccess.permitted}/>
        </label>
        <LocalizedUi value={binding.links.map(link => <label key={link.findingId}><LocalizedUi value={"\u0412\u043E\u0437\u043C\u043E\u0436\u043D\u044B\u0435 \u043E\u0431\u044A\u044F\u0441\u043D\u0435\u043D\u0438\u044F / \u0447\u0442\u043E \u043F\u0435\u0440\u0435\u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C:"}/><LocalizedUi value={link.anatomy}/> · <LocalizedUi value={link.findingId}/>
          <textarea rows={2} maxLength={1200} value={differentials[link.findingId] ?? ""} onChange={e => setDifferentials(prev => ({ ...prev, [link.findingId]: e.target.value }))} disabled={!localAccess.permitted}/>
        </label>)}/>
        <label><LocalizedUi value={"\u0420\u0430\u0431\u043E\u0447\u0438\u0439 \u0432\u0440\u0430\u0447\u0435\u0431\u043D\u044B\u0439 \u0441\u0438\u043D\u0442\u0435\u0437 (\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0434\u043B\u044F \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A\u0430)"}/><textarea rows={5} maxLength={4000} value={clinicianSynthesis} onChange={e => setClinicianSynthesis(e.target.value)} disabled={!localAccess.permitted}/>
        </label>
        <div className="ora-evidence-actions">
          <button type="button" disabled={!localAccess.permitted || !clinicianSynthesis.trim()} onClick={exportLocalDraft}><LocalizedUi value={"\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A JSON"}/></button>
        </div>
        <LocalizedUi value={draftError && <p role="alert" className="ora-evidence-error"><LocalizedUi value={draftError}/></p>}/>
        <small><LocalizedUi value={"\u041D\u0435\u0442 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0438, \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F, \u044D\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u043E\u0439 \u043F\u043E\u0434\u043F\u0438\u0441\u0438 \u0438\u043B\u0438 \u0432\u043D\u0435\u0448\u043D\u0435\u0439 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438. \u0410\u0432\u0442\u043E\u0440 \u0442\u0435\u043A\u0441\u0442\u0430 \u043D\u0435 \u0443\u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u0435\u043D."}/></small>
      </section>
      <p className="ora-evidence-subtle"><LocalizedUi value={"\u041E\u0442\u043C\u0435\u0442\u043A\u0438 \u043F\u0435\u0440\u0435\u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438/\u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u044F \u0438 \u0442\u0435\u043A\u0441\u0442 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A\u0430 \u0436\u0438\u0432\u0443\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0432 \u043F\u0430\u043C\u044F\u0442\u0438 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B. \u042D\u043A\u0441\u043F\u043E\u0440\u0442\u0438\u0440\u0443\u0439\u0442\u0435 \u0438\u0445 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E, \u0435\u0441\u043B\u0438 \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C. \u041D\u0435 \u043F\u0443\u0431\u043B\u0438\u043A\u0443\u0439\u0442\u0435 \u0444\u0430\u0439\u043B\u044B, \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0449\u0438\u0435 \u0441\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u043E \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0430\u0445."}/></p>
    </>}/>
  </section>;
}
