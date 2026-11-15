"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useMemo, useRef, useState } from "react";
import type { DicomSeries } from "../lib/dicom-series";
import { fullCtGeometry, prepareFullCtStream } from "../lib/full-ct-stream";
import { createFullCtReader } from "../lib/full-ct-decoder";
import { saveExactNativeCt, publicNoduleAdmission, type LocalFileWriter, type NativeCtExportProof } from "../lib/native-ct-research-export";
import { acquireBrowserCompute } from "../lib/browser-compute-slot";
import { prepareDicomMonaiFile } from "../lib/dicom-monai-direct";
import type { WorkerSession } from "../lib/local-worker";
type LocalFileHandle = {
    createWritable(): Promise<LocalFileWriter>;
    getFile?: () => Promise<File>;
};
type LocalSavePicker = {
    showSaveFilePicker(options: {
        suggestedName: string;
        types: {
            description: string;
            accept: Record<string, string[]>;
        }[];
    }): Promise<LocalFileHandle>;
};
/** Converts one full original public CHEST DICOM series directly to a native
 * exact NIfTI on the user's own disk. NO server, provider or model egress.
 * Requires a browser supporting streaming file-write (Chromium).
 */
export default function NativeCtResearchExport({ series, files, onPreparedSource, }: {
    series: DicomSeries;
    files: File[];
    onPreparedSource?: (file: File, autoSession?: WorkerSession) => void;
}) {
    const __ui = useUiTranslator();
    const [supported, setSupported] = useState(false);
    const [authorized, setAuthorized] = useState(false);
    const [workerEndpoint, setWorkerEndpoint] = useState("http://127.0.0.1:8768");
    const [workerToken, setWorkerToken] = useState("");
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [proof, setProof] = useState<NativeCtExportProof | null>(null);
    const active = useRef<AbortController | null>(null), generation = useRef(0);
    useEffect(() => { setSupported(typeof (window as Window & Partial<LocalSavePicker>).showSaveFilePicker === "function"); }, []);
    useEffect(() => {
        generation.current++;
        active.current?.abort();
        setProof(null);
        setAuthorized(false);
        setError("");
        setStatus("");
        return () => { generation.current++; active.current?.abort(); };
    }, [series]);
    const unsupported = useMemo(() => {
        if (series.modality !== "CT" || !series.members.every(m => m.metadata.bodyRegion === "CHEST"))
            return "Экспорт детектора узлов разрешён только для серии КТ грудной клетки с подтверждённой анатомией.";
        if (files.length !== series.members.length)
            return "Часть исходных DICOM-файлов недоступна.";
        try {
            fullCtGeometry(series);
            return "";
        }
        catch (e) {
            return e instanceof Error ? e.message : "Неподдерживаемая исходная геометрия КТ.";
        }
    }, [series, files]);
    if (series.modality !== "CT")
        return null;
    async function run() {
        if (busy || !supported || !authorized || !!unsupported || proof)
            return;
        const revision = ++generation.current, controller = new AbortController();
        active.current = controller;
        setBusy(true);
        setError("");
        setStatus("Выберите локальный файл для исходной NIfTI КТ…");
        let release: (() => void) | undefined;
        try {
            // Call the native file picker directly from this user click before any
            // await that could lose browser activation.
            const picker = (window as Window & Partial<LocalSavePicker>).showSaveFilePicker;
            if (!picker)
                throw Error("Браузер не поддерживает потоковую запись. Откройте локальный Opus в Chromium.");
            const handle = await picker.call(window, {
                suggestedName: "opus-original-public-chest.nii",
                types: [{ description: "Оригинальная КТ NIfTI-1 (HU)", accept: { "application/octet-stream": [".nii"] } }],
            });
            if (revision !== generation.current || controller.signal.aborted)
                return;
            release = acquireBrowserCompute("native-ct-export");
            setStatus("Проверка исходных DICOM и SHA-256 без сборки всего объёма…");
            const read = await createFullCtReader(files);
            const packet = await prepareFullCtStream(series, read, controller.signal, n => {
                if (revision === generation.current)
                    setStatus("Проверка скалярной КТ: " + n + "/" + series.members.length + " срезов");
            });
            if (revision !== generation.current || controller.signal.aborted)
                return;
            const writer = await handle.createWritable();
            const result = await saveExactNativeCt(packet, writer, controller.signal, (written, total) => {
                if (revision === generation.current)
                    setStatus("Запись исходной КТ: " + Math.floor(written / total * 100) + "%");
            });
            if (revision !== generation.current)
                return;
            setProof(result);
            setStatus("Исходная КТ NIfTI сохранена, двойной SHA-256 подтверждён.");
            // The local file remains disk-backed; no entire 3D CT is loaded into JS
            // or uploaded. Pass the same saved source directly to the actual MONAI viewer.
            if (onPreparedSource && handle.getFile) {
                try {
                    const saved = await handle.getFile();
                    if (revision === generation.current && !controller.signal.aborted && saved.size === result.writtenBytes) {
                        onPreparedSource(saved);
                        setStatus("Открываем эту исходную КТ в реальном детекторе узлов MONAI…");
                    }
                }
                catch {
                    setStatus("КТ NIfTI сохранена; автоматическое открытие невозможно. Выберите её во вкладке MONAI.");
                }
            }
        }
        catch (e) {
            if (revision === generation.current) {
                if (e instanceof DOMException && e.name === "AbortError")
                    setStatus("Выбор файла или экспорт отменён; диагностического результата нет.");
                else
                    setError(e instanceof Error ? e.message : "Исходная КТ не экспортирована.");
            }
        }
        finally {
            release?.();
            if (active.current === controller)
                active.current = null;
            if (revision === generation.current)
                setBusy(false);
        }
    }
    async function runDirect() {
        if (busy || !authorized || !!unsupported || !workerToken)
            return;
        const revision = ++generation.current, controller = new AbortController();
        active.current = controller;
        setBusy(true);
        setError("");
        setProof(null);
        let release: (() => void) | undefined;
        try {
            release = acquireBrowserCompute("native-ct-export");
            const file = await prepareDicomMonaiFile(series, files, controller.signal, message => {
                if (revision === generation.current)
                    setStatus(message);
            });
            if (controller.signal.aborted || revision !== generation.current)
                return;
            if (!onPreparedSource)
                throw Error("Вкладка MONAI не подключена к открытому DICOM.");
            onPreparedSource(file, { endpoint: workerEndpoint, token: workerToken });
        }
        catch (e) {
            if (revision === generation.current)
                setError(e instanceof Error ? e.message : "Не удалось подготовить текущую КТ для MONAI.");
        }
        finally {
            release?.();
            if (active.current === controller)
                active.current = null;
            if (revision === generation.current)
                setBusy(false);
        }
    }
    function manifest() {
        if (!proof)
            return;
        const data = publicNoduleAdmission(proof);
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = "opus-public-chest-monai-admission.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 400);
    }
    return <details className="cs-nodule-export">
   <summary><LocalizedUi value={"\u0410\u043D\u0430\u043B\u0438\u0437 \u043E\u0442\u043A\u0440\u044B\u0442\u043E\u0439 DICOM-\u041A\u0422 \u00B7 MONAI RetinaNet"}/></summary>
   <p><LocalizedUi value={"\u041E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439 DICOM \u2192 \u0442\u043E\u0447\u043D\u044B\u0439 NIfTI (float32 HU). \u0411\u0435\u0437 \u043E\u0431\u043B\u0430\u043A\u0430 \u0438 \u0431\u0435\u0437 \u043D\u0430\u043A\u043E\u043F\u043B\u0435\u043D\u0438\u044F \u0432\u0441\u0435\u0439 \u041A\u0422 \u0432 RAM. \u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A \u043E\u0441\u0442\u0430\u0451\u0442\u0441\u044F \u043D\u0430 \u0432\u0430\u0448\u0435\u043C \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440\u0435; \u043F\u043E\u0441\u043B\u0435 \u0437\u0430\u043F\u0438\u0441\u0438 \u0441\u0440\u0430\u0437\u0443 \u043E\u0442\u043A\u0440\u043E\u0435\u0442\u0441\u044F MONAI \u0434\u043B\u044F \u0437\u0430\u043F\u0443\u0441\u043A\u0430 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0435\u0433\u043E \u0438\u043D\u0444\u0435\u0440\u0435\u043D\u0441\u0430 \u043D\u0430 \u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0449\u0435\u043C Linux CPU."}/></p>
   <label><LocalizedUi value={"\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 Linux MONAI worker"}/><input type="text" value={workerEndpoint} disabled={busy} onChange={e => setWorkerEndpoint(e.target.value)}/></label>
   <label><LocalizedUi value={"\u0422\u043E\u043A\u0435\u043D worker (\u0442\u043E\u043B\u044C\u043A\u043E \u0432 \u043F\u0430\u043C\u044F\u0442\u0438 \u0432\u043A\u043B\u0430\u0434\u043A\u0438)"}/><input type="password" autoComplete="off" value={workerToken} disabled={busy} onChange={e => setWorkerToken(e.target.value)}/></label>
   <button type="button" disabled={!!unsupported || !authorized || !workerToken || busy || !onPreparedSource} onClick={() => void runDirect()}><LocalizedUi value={"\u0410\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0442\u0435\u043A\u0443\u0449\u0443\u044E DICOM-\u041A\u0422 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0438\u043C MONAI"}/></button>
   <p><LocalizedUi value={"\u041F\u0440\u044F\u043C\u043E\u0439 \u043F\u0443\u0442\u044C \u0433\u043E\u0442\u043E\u0432\u0438\u0442 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0439 HU-\u043E\u0431\u044A\u0451\u043C \u0432\u043E \u0432\u043D\u0443\u0442\u0440\u0435\u043D\u043D\u0435\u043C \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430 \u0438 \u043F\u0435\u0440\u0435\u0434\u0430\u0451\u0442 \u0435\u0433\u043E \u043F\u0430\u043D\u0435\u043B\u0438 MONAI. \u041F\u043E\u0441\u043B\u0435 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0438 \u043C\u043E\u0434\u0435\u043B\u044C \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043D\u0430 \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u043E\u043C \u043F\u0440\u0438\u0432\u0430\u0442\u043D\u043E\u043C Linux-worker; \u0434\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u043A\u043D\u043E\u043F\u043A\u0430 MONAI \u043D\u0435 \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F."}/></p>
   <LocalizedUi value={!supported && <p role="status"><LocalizedUi value={"\u0414\u043B\u044F \u0431\u043E\u043B\u044C\u0448\u0438\u0445 \u0444\u0430\u0439\u043B\u043E\u0432 \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F Chromium/Chrome \u0441 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u043F\u043E\u0442\u043E\u043A\u043E\u0432\u043E\u0439 \u0437\u0430\u043F\u0438\u0441\u044C\u044E \u043D\u0430 \u0434\u0438\u0441\u043A. Safari \u0432 \u044D\u0442\u043E\u043C \u0440\u0435\u0436\u0438\u043C\u0435 \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F; \u043B\u0438\u043C\u0438\u0442 \u043F\u0430\u043C\u044F\u0442\u0438 \u043D\u0435 \u0443\u0432\u0435\u043B\u0438\u0447\u0438\u0432\u0430\u0435\u043C."}/></p>}/>
   <LocalizedUi value={unsupported && <p role="status"><LocalizedUi value={"\u042D\u043A\u0441\u043F\u043E\u0440\u0442 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D:"}/><LocalizedUi value={unsupported}/></p>}/>
   <label><input type="checkbox" checked={authorized} disabled={busy || !!proof} onChange={e => setAuthorized(e.target.checked)}/><LocalizedUi value={"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E: \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u0430\u044F, \u043E\u0431\u0435\u0437\u043B\u0438\u0447\u0435\u043D\u043D\u0430\u044F \u041A\u0422 \u0433\u0440\u0443\u0434\u043D\u043E\u0439 \u043A\u043B\u0435\u0442\u043A\u0438 \u0441 \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D\u043D\u044B\u043C \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u0438\u0435\u043C. \u042D\u0442\u043E \u0432\u0435\u0441\u044C \u043F\u0440\u0435\u0434\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043D\u044B\u0439 \u043D\u0430\u0431\u043E\u0440 \u0441\u0440\u0435\u0437\u043E\u0432, \u043D\u043E \u043F\u043E\u043B\u043D\u043E\u0442\u0430 \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0438 \u043D\u0435 \u0434\u043E\u043A\u0430\u0437\u0430\u043D\u0430."}/></label>
   <button type="button" disabled={!supported || !!unsupported || !authorized || busy || !!proof} onClick={() => void run()}><LocalizedUi value={"\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u00B7 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C NIfTI \u043D\u0430 \u0434\u0438\u0441\u043A"}/></button>
   <LocalizedUi value={busy && <button type="button" onClick={() => active.current?.abort()}><LocalizedUi value={"\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u044D\u043A\u0441\u043F\u043E\u0440\u0442"}/></button>}/>
   <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
   <LocalizedUi value={status && <p role="status"><LocalizedUi value={status}/></p>}/>
   <LocalizedUi value={proof && <>
     <p><LocalizedUi value={"\u0421\u0440\u0435\u0437\u043E\u0432"}/><LocalizedUi value={proof.suppliedFrameCount}/><LocalizedUi value={"; \u0431\u0430\u0439\u0442"}/><LocalizedUi value={proof.writtenBytes.toLocaleString("ru-RU")}/>;
     SHA-256: <code><LocalizedUi value={proof.sourceNiftiSha256}/></code>.</p>
     <button type="button" onClick={manifest}><LocalizedUi value={"\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u043F\u0430\u0441\u043F\u043E\u0440\u0442 \u0434\u043B\u044F \u0437\u0430\u043F\u0443\u0441\u043A\u0430 MONAI"}/></button>
     <p><LocalizedUi value={"\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u0448\u0430\u0433 \u2014 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 Linux-\u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C: \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439 .nii \u0432\u043C\u0435\u0441\u0442\u0435 \u0441 \u043F\u0430\u0441\u043F\u043E\u0440\u0442\u043E\u043C; \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0438\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u0443\u0435\u0442\u0441\u044F \u0447\u0435\u0440\u0435\u0437 \u0432\u043A\u043B\u0430\u0434\u043A\u0443 \u00ABMONAI \u00B7 \u0443\u0437\u043B\u044B \u041A\u0422\u00BB. \u041F\u0435\u0440\u0435\u043D\u043E\u0441 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0430 \u0432 \u043E\u0431\u043B\u0430\u043A\u043E \u043D\u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D."}/></p>
     <p><LocalizedUi value={"\u0412\u043A\u043B\u0430\u0434\u043A\u0430 MONAI \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0432 \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0430\u0442\u0435\u043B\u0435 \u0444\u043E\u0440\u043C\u0430\u0442\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F \u0432\u0432\u0435\u0440\u0445\u0443 \u044D\u0442\u043E\u0433\u043E \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0449\u0438\u043A\u0430."}/></p>
   </>}/>
 </details>;
}
