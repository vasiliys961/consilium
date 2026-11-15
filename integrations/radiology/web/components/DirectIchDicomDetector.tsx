"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useMemo, useRef, useState } from "react";
import type { DicomSeries } from "../lib/dicom-series";
import { runPublicIchWorker } from "../lib/public-ich-worker";
import type { EvidenceJson } from "../lib/evidence-json";
/** Actual pinned ianpan hemorrhage model on the CURRENT native DICOM CT.
 * No import of archived research JSON, no upload of patient images.
 */
export default function DirectIchDicomDetector({ series, files }: {
    series: DicomSeries;
    files: ReadonlyMap<string, File>;
}) {
    const __ui = useUiTranslator();
    const [token, setToken] = useState("");
    const [endpoint, setEndpoint] = useState("http://127.0.0.1:8766");
    const [authorized, setAuthorized] = useState(false);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [result, setResult] = useState<EvidenceJson | null>(null);
    const ctrl = useRef<AbortController | null>(null);
    const rev = useRef(0);
    const eligible = useMemo(() => series.modality === "CT" && series.volumeReady && series.spatiallySorted &&
        series.members.length >= 8 && series.members.length <= 64 &&
        series.members.every(m => m.metadata.bodyRegion === "HEAD" &&
            m.metadata.imageRole !== "LOCALIZER" && m.metadata.imageRole !== "DERIVED" &&
            !!m.metadata.sopInstanceUid && !!m.metadata.seriesUid &&
            (m.metadata.numberOfFrames === null || m.metadata.numberOfFrames === 1) && files.has(m.id)), [series, files]);
    useEffect(() => {
        rev.current++;
        ctrl.current?.abort();
        setResult(null);
        setStatus("");
        setError("");
        setBusy(false);
        setAuthorized(false);
        return () => { rev.current++; ctrl.current?.abort(); };
    }, [series, files]);
    if (series.modality !== "CT" || series.members.some(m => m.metadata.bodyRegion !== "HEAD"))
        return null;
    async function start() {
        if (!eligible || !authorized || !token || busy)
            return;
        const v = ++rev.current;
        ctrl.current?.abort();
        const next = new AbortController();
        ctrl.current = next;
        setBusy(true);
        setResult(null);
        setError("");
        setStatus("Проверка реальной модели кровоизлияний…");
        try {
            const evidence = await runPublicIchWorker({ endpoint, token }, series, files, next.signal, message => {
                if (v === rev.current && !next.signal.aborted)
                    setStatus(message);
            });
            if (v !== rev.current || next.signal.aborted)
                return;
            const uids = new Set(series.members.map(m => m.metadata.sopInstanceUid));
            const seriesIds = new Set(series.members.map(m => m.metadata.seriesUid));
            if (seriesIds.size !== 1 || evidence.seriesReviewed.some(uid => !seriesIds.has(uid)) ||
                evidence.findings.some(f => !uids.has(f.source.sopInstanceUid) ||
                    !seriesIds.has(f.source.seriesUid) || f.source.frameIndex !== 0))
                throw Error("Находки ICH не соответствуют открытым DICOM-срезам.");
            setResult(evidence);
            setStatus("Настоящий ICH-инференс завершён; находки требуют врачебной проверки.");
        }
        catch (e) {
            if (v === rev.current && !next.signal.aborted)
                setError(e instanceof Error ? e.message : "ICH не завершён.");
        }
        finally {
            if (v === rev.current)
                setBusy(false);
        }
    }
    return <section className="cs-geometry" aria-label={__ui("\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0434\u0435\u0442\u0435\u043A\u0446\u0438\u044F \u0432\u043D\u0443\u0442\u0440\u0438\u0447\u0435\u0440\u0435\u043F\u043D\u043E\u0433\u043E \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u044F")}>
  <h3><LocalizedUi value={"ICH \u00B7 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u0439"}/></h3>
  <p><LocalizedUi value={"\u041E\u0442\u043A\u0440\u044B\u0442\u0430\u044F \u041A\u0422 \u0433\u043E\u043B\u043E\u0432\u044B \u2192 SHA-256 \u043A\u0430\u0436\u0434\u043E\u0433\u043E \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E DICOM \u2192 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0439 \u0447\u0430\u0441\u0442\u043D\u044B\u0439 Linux-worker \u2192 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C ianpan. \u041C\u043E\u0434\u0435\u043B\u044C \u0430\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u0443\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u0440\u0430\u043D\u0435\u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u0443\u044E \u0442\u043E\u0447\u043D\u043E \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u044E\u0449\u0443\u044E \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u0443\u044E \u0441\u0435\u0440\u0438\u044E \u043D\u0430 worker."}/></p>
  <LocalizedUi value={!eligible && <p role="status"><LocalizedUi value={"\u041D\u0443\u0436\u043D\u0430 \u0435\u0434\u0438\u043D\u0430\u044F \u0438\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u0430\u043A\u0441\u0438\u0430\u043B\u044C\u043D\u0430\u044F \u041A\u0422 \u0433\u043E\u043B\u043E\u0432\u044B, 8\u201364 \u0441\u0440\u0435\u0437\u0430, \u0441 \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u043E\u0439 \u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u0435\u0439 \u0438 \u0432\u0441\u0435\u043C\u0438 \u0444\u0430\u0439\u043B\u0430\u043C\u0438."}/></p>}/>
  <label><LocalizedUi value={"\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 ICH-worker"}/><input type="text" value={endpoint} disabled={busy} onChange={e => setEndpoint(e.target.value)}/></label>
  <label><LocalizedUi value={"\u0422\u043E\u043A\u0435\u043D worker"}/><input type="password" autoComplete="off" value={token} disabled={busy} onChange={e => setToken(e.target.value)}/></label>
  <label><input type="checkbox" checked={authorized} disabled={busy} onChange={e => setAuthorized(e.target.checked)}/><LocalizedUi value={"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E: \u0442\u043E\u043B\u044C\u043A\u043E \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u0430\u044F \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u0430\u044F \u043E\u0431\u0435\u0437\u043B\u0438\u0447\u0435\u043D\u043D\u0430\u044F \u041A\u0422, \u043F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u0430\u044F \u043D\u0430 worker; \u043D\u0435 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0441\u043A\u043E\u0435 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435."}/></label>
  <button type="button" disabled={!eligible || !authorized || !token || busy} onClick={() => void start()}>
   <LocalizedUi value={busy ? "Настоящий ICH-инференс…" : "Анализировать эту КТ головы"}/>
  </button>
  <LocalizedUi value={busy && <button type="button" onClick={() => { rev.current++; ctrl.current?.abort(); setBusy(false); setStatus("Отменено."); }}><LocalizedUi value={"\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C"}/></button>}/>
  <LocalizedUi value={status && <p role="status"><LocalizedUi value={status}/></p>}/>
  <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
  <LocalizedUi value={result && <div>
   <p><strong><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430. \u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432:"}/><LocalizedUi value={result.findings.length}/>.</strong><LocalizedUi value={"\u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432 \u043D\u0435 \u0438\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u0435."}/></p>
   <ul><LocalizedUi value={result.findings.map((f, i) => <li key={i}>
    <b><LocalizedUi value={f.sign}/> · <LocalizedUi value={f.anatomy}/></b> · SOP <LocalizedUi value={series.members.findIndex(m => m.metadata.sopInstanceUid === f.source.sopInstanceUid) + 1}/><LocalizedUi value={"\u0438\u0437"}/><LocalizedUi value={series.members.length}/><LocalizedUi value={"; \u0441\u0442\u0430\u0442\u0443\u0441: \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F \u0432\u0440\u0430\u0447\u0430."}/></li>)}/></ul>
   <p><LocalizedUi value={"\u041C\u043E\u0434\u0435\u043B\u044C \u043D\u0435 \u043F\u0440\u043E\u0448\u043B\u0430 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u0443\u044E \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0443\u044E \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u044E \u0432 \u0434\u0430\u043D\u043D\u043E\u043C \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0438."}/></p>
  </div>}/>
 </section>;
}
