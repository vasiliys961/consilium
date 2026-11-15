"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useRef, useState, type ChangeEvent } from "react";
import { validateMorphometryReport, type NumericReview } from "../lib/morphometry-evidence";
import { hashLocalNifti } from "../lib/local-research-nifti-sha";
const MAX_REPORT_BYTES = 128 * 1024;
/** Numeric-only public research outputs. This control NEVER uploads selected files. */
export default function MorphometryEvidenceReview() {
    const __ui = useUiTranslator();
    const [report, setReport] = useState<NumericReview | null>(null);
    const [sourceConfirm, setSourceConfirm] = useState("");
    const [otherConfirm, setOtherConfirm] = useState<Record<string, string>>({});
    const [sourceError, setSourceError] = useState("");
    const [sourceProgress, setSourceProgress] = useState("");
    const [verifying, setVerifying] = useState(false);
    const activeVerification = useRef<AbortController | null>(null);
    const verificationVersion = useRef(0);
    const [error, setError] = useState("");
    const [name, setName] = useState("");
    async function onPick(e: ChangeEvent<HTMLInputElement>) {
        ++verificationVersion.current;
        activeVerification.current?.abort();
        setReport(null);
        setSourceConfirm("");
        setOtherConfirm({});
        setName("");
        setError("");
        setSourceError("");
        setSourceProgress("");
        setVerifying(false);
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file)
            return;
        if (file.size === 0 || file.size > MAX_REPORT_BYTES || !file.name.toLowerCase().endsWith(".json")) {
            setError("Выберите небольшой числовой исследовательский JSON до 128 КБ.");
            return;
        }
        try {
            const raw = await file.text();
            if (raw.length > MAX_REPORT_BYTES)
                throw Error("Числовой JSON превышает ограничение.");
            const imported = validateMorphometryReport(JSON.parse(raw) as unknown);
            setReport(imported);
            setName(file.name);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Невозможно проверить результат.");
        }
    }
    async function onOriginalSourcePick(e: ChangeEvent<HTMLInputElement>) {
        ++verificationVersion.current;
        const version = verificationVersion.current;
        activeVerification.current?.abort();
        setSourceConfirm("");
        setSourceError("");
        setSourceProgress("");
        setVerifying(false);
        const source = e.target.files?.[0];
        e.target.value = "";
        if (!source || !report)
            return;
        if (!/\.nii(\.gz)?$/i.test(source.name)) {
            setSourceError("Выберите оригинальный NIfTI .nii или .nii.gz (не DICOM, PNG или ZIP).");
            return;
        }
        const controller = new AbortController();
        activeVerification.current = controller;
        setVerifying(true);
        try {
            const actual = await hashLocalNifti(source, controller.signal, (n, total) => {
                if (version === verificationVersion.current)
                    setSourceProgress("Чтение локального изображения: " + Math.round(100 * n / total) + "%");
            });
            if (version !== verificationVersion.current || controller.signal.aborted)
                return;
            if (actual !== report.sourceSha256)
                throw Error("SHA-256 файла КТ/МРТ не совпадает с исходным исследованием отчёта. Числа скрыты.");
            setSourceConfirm(actual);
            setSourceProgress("Точное совпадение локального изображения и исследовательского отчёта.");
        }
        catch (err) {
            if (version === verificationVersion.current && !controller.signal.aborted)
                setSourceError(err instanceof Error ? err.message : "Ошибка проверки SHA-256 NIfTI.");
        }
        finally {
            if (version === verificationVersion.current) {
                setVerifying(false);
                activeVerification.current = null;
            }
        }
    }
    async function onAdditionalSourcePick(e: ChangeEvent<HTMLInputElement>, role: "ADC" | "FLAIR") {
        ++verificationVersion.current;
        const version = verificationVersion.current;
        activeVerification.current?.abort();
        setVerifying(false);
        setOtherConfirm(prev => ({ ...prev, [role]: "" }));
        setSourceError("");
        setSourceProgress("");
        const source = e.target.files?.[0];
        e.target.value = "";
        if (!source || !report)
            return;
        const expected = report.additionalSources?.find(x => x.role === role)?.sha256;
        if (!expected)
            return;
        if (!/\.nii(\.gz)?$/i.test(source.name)) {
            setSourceError(role + ": выберите исходный NIfTI.");
            return;
        }
        const controller = new AbortController();
        activeVerification.current = controller;
        setVerifying(true);
        try {
            const observed = await hashLocalNifti(source, controller.signal, (n, total) => {
                if (version === verificationVersion.current)
                    setSourceProgress(role + ": " + Math.round(100 * n / total) + "%");
            });
            if (version !== verificationVersion.current || controller.signal.aborted)
                return;
            if (observed !== expected)
                throw Error(role + ": SHA-256 не совпадает с оригиналом.");
            setOtherConfirm(prev => ({ ...prev, [role]: observed }));
        }
        catch (err) {
            if (version === verificationVersion.current && !controller.signal.aborted)
                setSourceError(err instanceof Error ? err.message : role + ": ошибка SHA.");
        }
        finally {
            if (version === verificationVersion.current) {
                setVerifying(false);
                activeVerification.current = null;
            }
        }
    }
    const confirmed = !!report && sourceConfirm === report.sourceSha256 &&
        (report.additionalSources ?? []).every(x => otherConfirm[x.role] === x.sha256);
    return <section className="cs-geometry" aria-label={__ui("\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0435 \u043D\u0430\u0445\u043E\u0434\u043A\u0438 \u041A\u0422 \u0438 \u041C\u0420\u0422")}>
  <h2><LocalizedUi value={"\u041C\u043E\u0440\u0444\u043E\u043C\u0435\u0442\u0440\u0438\u044F \u00B7 \u0447\u0438\u0441\u043B\u043E\u0432\u044B\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B"}/></h2>
  <p><LocalizedUi value={"\u041E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0435 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0435 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F \u0441\u0435\u0440\u0434\u0446\u0430 \u0438 \u0441\u043E\u0441\u0443\u0434\u043E\u0432, \u043F\u043E\u0437\u0432\u043E\u043D\u043E\u0447\u043D\u0438\u043A\u0430, \u043F\u0435\u0447\u0435\u043D\u0438, \u0431\u0435\u043B\u043E\u0433\u043E \u0432\u0435\u0449\u0435\u0441\u0442\u0432\u0430 \u043C\u043E\u0437\u0433\u0430, \u0436\u0435\u043B\u0447\u043D\u043E\u0433\u043E \u043F\u0443\u0437\u044B\u0440\u044F \u0438 \u0442\u0430\u0437\u043E\u0431\u0435\u0434\u0440\u0435\u043D\u043D\u044B\u0445 \u0441\u0443\u0441\u0442\u0430\u0432\u043E\u0432 \u0438 \u043F\u0435\u0440\u043F\u0435\u043D\u0434\u0438\u043A\u0443\u043B\u044F\u0440\u043D\u044B\u0445 \u0441\u0435\u0447\u0435\u043D\u0438\u0439 \u0430\u043E\u0440\u0442\u044B \u0438 \u0434\u0438\u0441\u043A\u043E\u0432 \u043F\u043E\u0437\u0432\u043E\u043D\u043E\u0447\u043D\u0438\u043A\u0430 \u043D\u0430 \u041C\u0420\u0422."}/></p>
  <p><strong><LocalizedUi value={"\u0422\u043E\u043B\u044C\u043A\u043E \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 JSON."}/></strong><LocalizedUi value={"\u0418\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F, DICOM \u0438 \u043C\u0430\u0441\u043A\u0438 \u0441\u044E\u0434\u0430 \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u044E\u0442\u0441\u044F \u0438 \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u044E\u0442\u0441\u044F \u0432 \u043E\u0431\u043B\u0430\u043A\u043E. \u0421\u0430\u043C JSON \u043D\u0435 \u0434\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u0442 \u043F\u043E\u0434\u043B\u0438\u043D\u043D\u043E\u0441\u0442\u044C \u043C\u043E\u0434\u0435\u043B\u0438 \u0438\u043B\u0438 \u043F\u0440\u0438\u043D\u0430\u0434\u043B\u0435\u0436\u043D\u043E\u0441\u0442\u044C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u043E\u0432 \u043E\u0442\u043A\u0440\u044B\u0442\u043E\u0439 \u0441\u0435\u0440\u0438\u0438."}/></p>
  <label><LocalizedUi value={"\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u0447\u0438\u0441\u043B\u043E\u0432\u043E\u0439 \u043E\u0442\u0447\u0451\u0442"}/><LocalizedUi value={" "}/>
   <input type="file" accept=".json,application/json" onChange={e => { void onPick(e); }}/>
  </label>
  <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
  <LocalizedUi value={report && <div>
   <h3><LocalizedUi value={report.title}/></h3>
   <p><LocalizedUi value={"\u0424\u0430\u0439\u043B:"}/><LocalizedUi value={name}/></p>
   <p><LocalizedUi value={"SHA-256 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u0441\u0435\u0440\u0438\u0438:"}/><code style={{ overflowWrap: "anywhere" }}><LocalizedUi value={report.sourceSha256}/></code></p>
   <label><LocalizedUi value={"\u0414\u043B\u044F \u0441\u0432\u0435\u0440\u043A\u0438 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0439 NIfTI \u041A\u0422/\u041C\u0420\u0422 (.nii \u0438\u043B\u0438 .nii.gz). SHA-256 \u0432\u044B\u0447\u0438\u0441\u043B\u044F\u0435\u0442\u0441\u044F \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435 \u0431\u043B\u043E\u043A\u0430\u043C\u0438 \u0434\u043E 2 \u041C\u0438\u0411, \u0431\u0435\u0437 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0439:"}/><LocalizedUi value={" "}/>
    <input type="file" accept=".nii,.nii.gz,application/octet-stream" disabled={verifying} onChange={e => { void onOriginalSourcePick(e); }}/>
   </label>
   <LocalizedUi value={report.additionalSources?.map(x => <label key={x.role}><LocalizedUi value={"\u0414\u043B\u044F \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430 \u0438\u043D\u0441\u0443\u043B\u044C\u0442\u0430 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B"}/><LocalizedUi value={x.role}/><LocalizedUi value={"(.nii/.nii.gz) \u0431\u0435\u0437 \u043F\u0435\u0440\u0435\u0434\u0430\u0447\u0438 \u0434\u0430\u043D\u043D\u044B\u0445:"}/><input type="file" accept=".nii,.nii.gz,application/octet-stream" disabled={verifying} onChange={e => { void onAdditionalSourcePick(e, x.role); }}/>
     <LocalizedUi value={otherConfirm[x.role] === x.sha256 ? <span><LocalizedUi value={"\u00B7 SHA-256 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D"}/></span> : <span><LocalizedUi value={"\u00B7 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D"}/></span>}/>
    </label>)}/>
   <LocalizedUi value={sourceProgress && <p role="status"><LocalizedUi value={sourceProgress}/></p>}/>
   <LocalizedUi value={sourceError && <p role="alert"><LocalizedUi value={sourceError}/></p>}/>
   <LocalizedUi value={!confirmed ? <p role="status"><LocalizedUi value={"\u0418\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F \u0441\u043A\u0440\u044B\u0442\u044B, \u043F\u043E\u043A\u0430 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D SHA-256 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F."}/></p> : <>
    <div role="table" aria-label={__ui("\u0427\u0438\u0441\u043B\u043E\u0432\u044B\u0435 \u043C\u043E\u0440\u0444\u043E\u043C\u0435\u0442\u0440\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F")}>
     <LocalizedUi value={report.fields.map(x => <div role="row" key={x.label} style={{ display: "flex", gap: 12, justifyContent: "space-between" }}>
      <span role="cell"><LocalizedUi value={x.label}/></span><strong role="cell"><LocalizedUi value={x.value}/></strong>
     </div>)}/>
    </div>
    <LocalizedUi value={report.warnings.map(w => <p key={w}><small><LocalizedUi value={w}/></small></p>)}/>
   </>}/>
   <p><strong><LocalizedUi value={"\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u0440\u0435\u0436\u0438\u043C \u00B7 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u044C \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0430."}/></strong></p>
   <button type="button" onClick={() => { ++verificationVersion.current; activeVerification.current?.abort(); setReport(null); setSourceConfirm(""); setOtherConfirm({}); setSourceProgress(""); setSourceError(""); setVerifying(false); setName(""); setError(""); }}><LocalizedUi value={"\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435"}/></button>
  </div>}/>
 </section>;
}
