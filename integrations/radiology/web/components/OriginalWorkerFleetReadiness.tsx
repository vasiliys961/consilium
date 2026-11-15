"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
/** Read-only actual Linux worker/pretrained-weight health; no DICOM leaves browser. */
import { useEffect, useRef, useState } from "react";
const IDS = [
    ["chest_nodules", "КТ · узлы лёгких"],
    ["chest_effusion", "КТ · плевральный/перикардиальный выпот"],
    ["chest_pe", "КТ-ангиография · ТЭЛА"],
    ["chest_nodes", "КТ · лимфоузлы средостения"],
    ["abdomen", "КТ живота · кисты, очаги печени, поджелудочная"],
    ["brain_hemorrhage", "КТ головы · кровоизлияние"],
    ["brain_wmh", "МРТ · WMH"],
    ["brain_stroke", "МРТ · ишемические очаги"],
    ["brain_glioma", "МРТ · глиома"],
    ["chest_xray_six", "CR/DX · шесть NIH TorchXRayVision признаков"],
] as const;
const STATES = {
    ready: "Оригинальные веса проверены, worker отвечает",
    not_configured: "Не подключён к серверной проверке (не означает отсутствие весов)",
    unreachable: "Нет ответа локального worker",
    original_model_unverified: "Worker отвечает, но оригинальная модель не подтверждена",
    not_ready: "Исполнитель занят или не готов по ресурсам; задача не оценена",
} as const;
type State = keyof typeof STATES;
type Entry = {
    id: string;
    status: State;
    researchOnly: true;
    clinicalValidation: false;
};
export default function OriginalWorkerFleetReadiness() {
    const __ui = useUiTranslator();
    const [entries, setEntries] = useState<Entry[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const abort = useRef<AbortController | null>(null);
    async function refresh() {
        abort.current?.abort();
        const ctl = new AbortController();
        abort.current = ctl;
        setLoading(true);
        setError("");
        try {
            const response = await fetch("/api/local-model-readiness", {
                method: "GET", cache: "no-store", credentials: "same-origin",
                signal: AbortSignal.any([ctl.signal, AbortSignal.timeout(9500)]),
            });
            if (!response.ok)
                throw Error("Сервер проверки моделей недоступен в этом режиме.");
            const value: unknown = await response.json();
            if (!value || typeof value !== "object" || Array.isArray(value))
                throw Error("Неверный паспорт готовности моделей.");
            const x = value as Record<string, unknown>;
            if (x.schema !== "opus-original-worker-fleet/v1" ||
                x.patientMode !== false || x.clinicalValidation !== false ||
                !Array.isArray(x.entries) || x.entries.length !== IDS.length ||
                !x.entries.every((v: unknown, i: number) => {
                    if (!v || typeof v !== "object" || Array.isArray(v))
                        return false;
                    const s = v as Record<string, unknown>;
                    return s.id === IDS[i][0] &&
                        Object.prototype.hasOwnProperty.call(STATES, String(s.status)) &&
                        s.researchOnly === true && s.clinicalValidation === false;
                }))
                throw Error("В ответе нет подтверждения отдельных оригинальных моделей.");
            if (!ctl.signal.aborted)
                setEntries(x.entries as Entry[]);
        }
        catch (e) {
            if (!ctl.signal.aborted) {
                setEntries(null);
                setError(e instanceof Error ? e.message : "Не удалось проверить модели.");
            }
        }
        finally {
            if (!ctl.signal.aborted)
                setLoading(false);
        }
    }
    useEffect(() => {
        void refresh();
        return () => { abort.current?.abort(); };
    }, []);
    const ready = entries?.filter(x => x.status === "ready").length ?? 0;
    return <section aria-label={__ui("\u0413\u043E\u0442\u043E\u0432\u043D\u043E\u0441\u0442\u044C \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0445 \u043C\u043E\u0434\u0435\u043B\u0435\u0439 \u0434\u043B\u044F \u041A\u0422 \u041C\u0420\u0422 \u0438 \u0440\u0435\u043D\u0442\u0433\u0435\u043D\u043E\u0433\u0440\u0430\u0444\u0438\u0438")}>
  <details>
   <summary><LocalizedUi value={"\u041D\u0430\u0441\u0442\u043E\u044F\u0449\u0430\u044F \u0433\u043E\u0442\u043E\u0432\u043D\u043E\u0441\u0442\u044C Linux-\u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440\u043E\u0432:"}/><LocalizedUi value={loading ? "проверяем…" :
            entries ? __ui("{0} из {1} направлений").replace("{0}",String(ready)).replace("{1}",String(entries.length)) : "проверка недоступна"}/>
   </summary>
   <p><LocalizedUi value={"\u042D\u0442\u043E \u041F\u0420\u041E\u0412\u0415\u0420\u041A\u0410 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044B\u0445 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0445 \u043C\u043E\u0434\u0435\u043B\u0435\u0439 \u0438 \u043E\u0442\u0432\u0435\u0447\u0430\u044E\u0449\u0438\u0445 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u0439, \u0430 \u043D\u0435 \u0434\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u043E \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u0438. \u0421\u0435\u0440\u0432\u0435\u0440\u0443 \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u044E\u0442\u0441\u044F DICOM, \u0441\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0430 \u0438\u043B\u0438 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F."}/></p>
   <LocalizedUi value={entries && IDS.map(([id, label], i) => <p key={id}>
     <strong><LocalizedUi value={label}/></strong>: <LocalizedUi value={STATES[entries[i].status]}/>
   </p>)}/>
   <LocalizedUi value={error && <p role="status"><LocalizedUi value={error}/></p>}/>
   <button type="button" disabled={loading} onClick={() => void refresh()}>
     <LocalizedUi value={loading ? "Проверяем реальные модели…" : "Обновить состояние"}/>
   </button>
   <p><LocalizedUi value={"\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430 \u043F\u0440\u0430\u0432, \u0432\u0435\u0441\u043E\u0432 \u0438 \u0441\u0435\u0440\u0432\u0438\u0441\u043E\u0432 \u043F\u0440\u043E\u0432\u043E\u0434\u0438\u0442\u0441\u044F \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u043E\u043C \u043E\u0434\u0438\u043D \u0440\u0430\u0437 \u043D\u0430 \u043F\u0440\u0438\u0432\u0430\u0442\u043D\u043E\u043C Linux-\u0441\u0435\u0440\u0432\u0435\u0440\u0435. \u0412\u0440\u0430\u0447 \u043D\u0435 \u0432\u0432\u043E\u0434\u0438\u0442 worker-\u0442\u043E\u043A\u0435\u043D\u044B. \u0420\u0435\u0436\u0438\u043C \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u0438\u044F \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0441\u043A\u0438\u0445 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0439 \u043F\u043E\u043A\u0430 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D."}/></p>
  </details>
 </section>;
}
