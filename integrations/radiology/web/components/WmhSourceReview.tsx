"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useRef, useState } from "react";
import type { DicomSeries } from "../lib/dicom-series";
import { call, type WorkerSession } from "../lib/local-worker";
import { bindWmhToSelectedDicom, type BoundWmh } from "../lib/wmh-source-review";
export default function WmhSourceReview({ series, files, onNavigate }: {
    series: DicomSeries;
    files: ReadonlyMap<string, File>;
    onNavigate: (slice: number) => void;
}) {
    const __ui = useUiTranslator();
    const [workerEndpoint, setWorkerEndpoint] = useState("http://127.0.0.1:8772");
    const [token, setToken] = useState("");
    const [sourceUrl, setSourceUrl] = useState("");
    const [sourceLicense, setSourceLicense] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [result, setResult] = useState<BoundWmh | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [decisions, setDecisions] = useState<Record<number, "accepted" | "rejected">>({});
    const rev = useRef(0);
    useEffect(() => { rev.current++; setResult(null); setError(""); setBusy(false); setDecisions({}); }, [series, files]);
    if (series.modality !== "MR" || !series.members.every(m => m.metadata.bodyRegion === "HEAD"))
        return null;
    async function direct() {
        if (busy || !confirmed || !token || !sourceUrl.startsWith("https://") || !sourceLicense.trim())
            return;
        const version = ++rev.current;
        setBusy(true);
        setError("");
        setResult(null);
        setDecisions({});
        try {
            const session: WorkerSession = { endpoint: workerEndpoint, token };
            const capabilities = await call(session, "/v1/wmh/capabilities");
            const cap = await capabilities.json() as Record<string, unknown>;
            if (cap.schema !== "opus-direct-wmh-worker/v1" || cap.originalModelReady !== true || cap.patientMode !== false || cap.imageUpload !== true || cap.dataPolicy !== "approved-public-research-only" || cap.modelVersion !== "1.6.0")
                throw Error("WMH worker не подтвердил подлинную установленную модель.");
            const form = new FormData();
            form.set("confirmed", "yes");
            form.set("publicRights", "yes");
            form.set("sourceUrl", sourceUrl);
            form.set("sourceLicense", sourceLicense);
            for (const member of series.members) {
                const source = files.get(member.id);
                if (!source)
                    throw Error("Отсутствует исходный DICOM-срез.");
                form.append("dicom", source, "slice.dcm");
            }
            const response = await call(session, "/v1/wmh/analyze", { method: "POST", body: form });
            const data: unknown = await response.json();
            const verified = await bindWmhToSelectedDicom(data, series, files);
            if (version === rev.current)
                setResult(verified);
        }
        catch (e) {
            if (version === rev.current)
                setError(e instanceof Error ? e.message : "Невозможно выполнить настоящий WMH-инференс.");
        }
        finally {
            if (version === rev.current)
                setBusy(false);
        }
    }
    async function load(file: File | undefined) {
        if (!file)
            return;
        const v = ++rev.current;
        setBusy(true);
        setError("");
        setResult(null);
        try {
            if (file.size > 2 * 1024 * 1024)
                throw Error("WMH JSON превышает 2 МБ.");
            const report: unknown = JSON.parse(await file.text());
            const verified = await bindWmhToSelectedDicom(report, series, files);
            if (v === rev.current)
                setResult(verified);
        }
        catch (e) {
            if (v === rev.current)
                setError(e instanceof Error ? e.message : "Не удалось проверить отчёт.");
        }
        finally {
            if (v === rev.current)
                setBusy(false);
        }
    }
    return <section className="cs-geometry">
  <h3><LocalizedUi value={"WMH \u00B7 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F FLAIR-\u043C\u043E\u0434\u0435\u043B\u044C"}/></h3>
  <p><LocalizedUi value={"\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043E\u0442\u0447\u0451\u0442 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0435\u0433\u043E WMH fold 0, \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043D\u043E\u0433\u043E \u043D\u0430 \u0442\u0435\u043A\u0443\u0449\u0435\u0439 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0439 \u041C\u0420\u0422. \u041F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0442\u0441\u044F SHA-256 \u043A\u0430\u0436\u0434\u043E\u0433\u043E DICOM-\u0441\u0440\u0435\u0437\u0430 \u0438 \u043F\u043E\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0432\u0441\u0435\u0445 \u043E\u0447\u0430\u0433\u043E\u0432, \u0437\u0430\u0442\u0435\u043C \u043C\u043E\u0436\u043D\u043E \u043F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u043C\u0443 \u0441\u0440\u0435\u0437\u0443."}/></p>
  <label><LocalizedUi value={"\u041F\u0440\u0438\u0432\u0430\u0442\u043D\u044B\u0439 Linux WMH-worker"}/><input type="text" value={workerEndpoint} disabled={busy} onChange={e => setWorkerEndpoint(e.target.value)}/></label>
  <label><LocalizedUi value={"\u0422\u043E\u043A\u0435\u043D worker"}/><input type="password" autoComplete="off" value={token} disabled={busy} onChange={e => setToken(e.target.value)}/></label>
  <label><LocalizedUi value={"\u041F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0439 URL \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0430"}/><input type="url" value={sourceUrl} disabled={busy} onChange={e => setSourceUrl(e.target.value)}/></label>
  <label><LocalizedUi value={"\u041B\u0438\u0446\u0435\u043D\u0437\u0438\u044F \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0439 \u041C\u0420\u0422"}/><input type="text" value={sourceLicense} disabled={busy} onChange={e => setSourceLicense(e.target.value)}/></label>
  <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)}/><LocalizedUi value={"\u042F \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u043B FLAIR-\u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B, \u043E\u0431\u0435\u0437\u043B\u0438\u0447\u0438\u0432\u0430\u043D\u0438\u0435 \u0438 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u0438\u0435 \u043D\u0430 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u0430\u043D\u0430\u043B\u0438\u0437. \u041D\u0435 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0441\u043A\u043E\u0435 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435."}/></label>
  <button type="button" disabled={busy || !confirmed || !token || !sourceUrl.startsWith("https://") || !sourceLicense.trim()} onClick={() => void direct()}><LocalizedUi value={"\u0410\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u0443\u044E FLAIR-\u041C\u0420\u0422 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0435\u0439 \u043C\u043E\u0434\u0435\u043B\u044C\u044E WMH"}/></button>
  <label><LocalizedUi value={"\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C WMH JSON \u0434\u043B\u044F \u044D\u0442\u043E\u0439 \u0441\u0435\u0440\u0438\u0438"}/><input type="file" accept=".json,application/json" disabled={busy} onChange={e => void load(e.target.files?.[0])}/></label>
  <LocalizedUi value={busy && <p role="status"><LocalizedUi value={"\u0421\u0432\u0435\u0440\u043A\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 DICOM SHA-256\u2026"}/></p>}/>
  <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
  <LocalizedUi value={result && <div>
   <p><strong><LocalizedUi value={"\u041F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043E \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0435 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0430."}/></strong><LocalizedUi value={"\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0445 \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u043E\u0432:"}/><LocalizedUi value={result.components.length}/><LocalizedUi value={"; \u043E\u0431\u0449\u0438\u0439 \u043E\u0431\u044A\u0451\u043C \u0433\u0438\u043F\u0435\u0440\u0438\u043D\u0442\u0435\u043D\u0441\u0438\u0432\u043D\u043E\u0441\u0442\u0435\u0439:"}/><LocalizedUi value={result.totalMl.toFixed(2)}/><LocalizedUi value={"\u043C\u043B."}/></p>
   <LocalizedUi value={result.components.slice(0, 100).map((x, i) => <div key={x.component}>
    <button type="button" onClick={() => onNavigate(Math.floor((x.sourceVoxelBoundsInclusive[0][2] + x.sourceVoxelBoundsInclusive[1][2]) / 2))}><LocalizedUi value={"\u041E\u0447\u0430\u0433"}/><LocalizedUi value={i + 1}/><LocalizedUi value={"\u00B7 \u043F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A DICOM-\u0441\u0440\u0435\u0437\u0443"}/><LocalizedUi value={Math.floor((x.sourceVoxelBoundsInclusive[0][2] + x.sourceVoxelBoundsInclusive[1][2]) / 2) + 1}/>
    </button>
    <span> <LocalizedUi value={x.volumeMl.toFixed(3)}/><LocalizedUi value={"\u043C\u043B \u00B7"}/><LocalizedUi value={decisions[x.component] ?? "требует оценки"}/></span>
    <button type="button" onClick={() => setDecisions(d => ({ ...d, [x.component]: "accepted" }))}><LocalizedUi value={"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C"}/></button>
    <button type="button" onClick={() => setDecisions(d => ({ ...d, [x.component]: "rejected" }))}><LocalizedUi value={"\u041E\u0442\u043A\u043B\u043E\u043D\u0438\u0442\u044C"}/></button>
   </div>)}/>
   <LocalizedUi value={result.components.length > 100 && <p><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u043F\u0435\u0440\u0432\u044B\u0435 100 \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u043E\u0432 \u0438\u0437"}/><LocalizedUi value={result.components.length}/>.</p>}/>
   <p><LocalizedUi value={"\u0413\u0438\u043F\u0435\u0440\u0438\u043D\u0442\u0435\u043D\u0441\u0438\u0432\u043D\u043E\u0441\u0442\u0438 FLAIR \u043D\u0435\u0441\u043F\u0435\u0446\u0438\u0444\u0438\u0447\u043D\u044B: \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043D\u0435 \u0443\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u0435\u0442 \u0420\u0421, \u0441\u043E\u0441\u0443\u0434\u0438\u0441\u0442\u044B\u0439 \u0433\u0435\u043D\u0435\u0437 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u0438\u043D\u043E\u0439 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0438. \u0420\u0435\u0448\u0435\u043D\u0438\u044F \u0432\u0440\u0430\u0447\u0430 \u043E\u0441\u0442\u0430\u044E\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0432 \u0442\u0435\u043A\u0443\u0449\u0435\u0439 \u0432\u043A\u043B\u0430\u0434\u043A\u0435."}/></p>
  </div>}/>
 </section>;
}
