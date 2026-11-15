"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useRef, useState } from "react";
import { measureDicomInPlaneCaliper, parseDicomFrame, renderDicomPixels, type DicomFrame, type DicomCaliperMeasurement } from "../lib/dicom-lite";
import type { TechnicalDicomMetadata } from "../lib/dicom-series";
type Point = {
    x: number;
    y: number;
};
type Saved = {
    sourceSopInstanceUid: string;
    sourceSeriesInstanceUid: string;
    measurement: DicomCaliperMeasurement;
};
type Props = {
    file: File | null;
    metadata: TechnicalDicomMetadata | null;
    seriesKey: string | null;
    onSave?: (measurement: DicomCaliperMeasurement) => void;
};
export default function DicomCaliperPanel({ file, metadata, seriesKey, onSave }: Props) {
    const __ui = useUiTranslator();
    const canvas = useRef<HTMLCanvasElement | null>(null);
    const frame = useRef<DicomFrame | null>(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState("");
    const [start, setStart] = useState<Point | null>(null);
    const [end, setEnd] = useState<Point | null>(null);
    const [saved, setSaved] = useState<Saved[]>([]);
    const [hint, setHint] = useState("");
    useEffect(() => { setSaved([]); setHint(""); }, [seriesKey]);
    useEffect(() => {
        let cancelled = false;
        frame.current = null;
        setReady(false);
        setStart(null);
        setEnd(null);
        setError("");
        if (!file || !metadata || !["CT", "MR"].includes(metadata.modality))
            return;
        if (file.size > 64 * 1024 ** 2 || file.size < 160) {
            setError("Слишком большой или неподдерживаемый DICOM для локальных измерений.");
            return;
        }
        void file.arrayBuffer().then(bytes => {
            if (cancelled)
                return;
            const parsed = parseDicomFrame(bytes);
            if (parsed.metadata.modality !== metadata.modality ||
                parsed.metadata.width !== metadata.columns ||
                parsed.metadata.height !== metadata.rows)
                throw Error("Метаданные размера и модальности исходного среза не совпадают.");
            frame.current = parsed;
            setReady(true);
        }).catch(e => {
            if (!cancelled)
                setError(e instanceof Error ? e.message : "Не удалось прочитать исходный срез.");
        });
        return () => { cancelled = true; frame.current = null; };
    }, [file, metadata]);
    let current: DicomCaliperMeasurement | null = null, measureError = "";
    if (start && end && metadata) {
        try {
            current = measureDicomInPlaneCaliper(metadata, start, end);
        }
        catch (e) {
            measureError = e instanceof Error ? e.message : "Измерение недоступно.";
        }
    }
    useEffect(() => {
        const f = frame.current, c = canvas.current;
        if (!ready || !f || !c)
            return;
        const context = c.getContext("2d");
        if (!context)
            return;
        c.width = f.metadata.width;
        c.height = f.metadata.height;
        const image = context.createImageData(c.width, c.height);
        image.data.set(renderDicomPixels(f));
        context.putImageData(image, 0, 0);
        if (start) {
            context.strokeStyle = "#facc15";
            context.fillStyle = "#facc15";
            context.lineWidth = 2;
            context.beginPath();
            context.arc(start.x, start.y, 3, 0, 2 * Math.PI);
            context.fill();
            if (end) {
                context.beginPath();
                context.moveTo(start.x, start.y);
                context.lineTo(end.x, end.y);
                context.stroke();
                context.beginPath();
                context.arc(end.x, end.y, 3, 0, 2 * Math.PI);
                context.fill();
            }
        }
    }, [ready, start, end]);
    const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const f = frame.current;
        if (!f)
            return;
        const rect = e.currentTarget.getBoundingClientRect();
        const point = {
            x: Math.min(f.metadata.width - 1, Math.max(0, Math.round((e.clientX - rect.left) / rect.width * f.metadata.width))),
            y: Math.min(f.metadata.height - 1, Math.max(0, Math.round((e.clientY - rect.top) / rect.height * f.metadata.height))),
        };
        if (!start || end) {
            setStart(point);
            setEnd(null);
        }
        else
            setEnd(point);
        setHint("");
    };
    const add = () => {
        if (!current || !metadata?.seriesUid || !metadata.sopInstanceUid || saved.length >= 16)
            return;
        onSave?.(current);
        setSaved(items => [...items, {
                sourceSeriesInstanceUid: metadata.seriesUid!, sourceSopInstanceUid: metadata.sopInstanceUid!,
                measurement: current,
            }]);
        setHint("Длина добавлена к локальным измерениям.");
    };
    const save = () => {
        if (!saved.length)
            return;
        const doc = {
            schema: "opus-dicom-physician-manual-calipers/v1", modality: metadata?.modality,
            status: "manually_selected_unsigned_research_measurements",
            imagePlaneOnly: true, seriesKey, sourceUIDsLocallyRetained: true,
            measurements: saved, wholeLesionSizeVerified: false, clinicalDiagnosis: null,
            cloudTransfer: false,
        };
        const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
        try {
            const link = document.createElement("a");
            link.href = url;
            link.download = "opus-dicom-calipers.json";
            document.body.appendChild(link);
            link.click();
            link.remove();
        }
        finally {
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        setHint("Измерения сохранены локально с UID исходных срезов.");
    };
    return <section className="ora-card" aria-label={__ui("\u041B\u0438\u043D\u0435\u0439\u043A\u0430 \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u043C \u0441\u0440\u0435\u0437\u0435 \u041A\u0422 \u0438\u043B\u0438 \u041C\u0420\u0422")} style={{ padding: 18, marginTop: 12 }}>
    <h3 style={{ margin: "0 0 8px" }}><LocalizedUi value={"\u041A\u0422/\u041C\u0420\u0422 \u00B7 \u043B\u0438\u043D\u0435\u0439\u043A\u0430 \u0432 \u043C\u0438\u043B\u043B\u0438\u043C\u0435\u0442\u0440\u0430\u0445"}/></h3>
    <p><LocalizedUi value={"\u0414\u0432\u0430 \u043A\u043B\u0438\u043A\u0430 \u043F\u043E \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u043C\u0443 \u0441\u0440\u0435\u0437\u0443 \u2014 \u0440\u0430\u0441\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0432 \u043C\u043C. \u041C\u043E\u0436\u043D\u043E \u0438\u0437\u043C\u0435\u0440\u044F\u0442\u044C \u0440\u0430\u0437\u043C\u0435\u0440\u044B \u0432\u0438\u0434\u0438\u043C\u044B\u0445 \u043E\u0431\u0440\u0430\u0437\u043E\u0432\u0430\u043D\u0438\u0439 \u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0442\u044C \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u043B\u0438\u043D\u0438\u0439 \u0441 \u043F\u0440\u0438\u0432\u044F\u0437\u043A\u043E\u0439 \u043A \u0441\u0440\u0435\u0437\u0443."}/></p>
    <LocalizedUi value={!file || !["CT", "MR"].includes(metadata?.modality ?? "") ?
            <p role="status"><LocalizedUi value={"\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u041A\u0422 \u0438\u043B\u0438 \u041C\u0420\u0422-\u0441\u0440\u0435\u0437 \u0434\u043B\u044F \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F."}/></p> :
            <>
        <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
        <LocalizedUi value={ready && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
          <div>
            <canvas ref={canvas} onClick={click} role="img" aria-label={__ui("\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u043F\u0435\u0440\u0432\u0443\u044E \u0438 \u0432\u0442\u043E\u0440\u0443\u044E \u0442\u043E\u0447\u043A\u0443 \u0440\u0430\u0441\u0441\u0442\u043E\u044F\u043D\u0438\u044F \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u043C DICOM-\u0441\u0440\u0435\u0437\u0435")} style={{ width: "100%", maxWidth: 512, height: "auto", border: "1px solid #64748b",
                        background: "#000", cursor: "crosshair" }}/>
            <p><small><LocalizedUi value={"\u0416\u0451\u043B\u0442\u0430\u044F \u043B\u0438\u043D\u0438\u044F \u2014 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u0435 \u0432 \u043F\u043B\u043E\u0441\u043A\u043E\u0441\u0442\u0438 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E \u043A\u0430\u0434\u0440\u0430."}/></small></p>
          </div>
          <div>
            <LocalizedUi value={current ? <div aria-live="polite">
              <p><strong style={{ fontSize: "1.6rem" }}><LocalizedUi value={current.lengthMm.toFixed(2)}/><LocalizedUi value={"\u043C\u043C"}/></strong></p>
              <p><LocalizedUi value={"\u0420\u0430\u0441\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043F\u043E \u0441\u0442\u043E\u043B\u0431\u0446\u0430\u043C:"}/><LocalizedUi value={Math.abs(current.deltaPixels.x * current.spacingMm[1]).toFixed(2)}/><LocalizedUi value={"\u043C\u043C; \u043F\u043E \u0441\u0442\u0440\u043E\u043A\u0430\u043C:"}/><LocalizedUi value={Math.abs(current.deltaPixels.y * current.spacingMm[0]).toFixed(2)}/><LocalizedUi value={"\u043C\u043C."}/></p>
              <button type="button" disabled={saved.length >= 16} onClick={add}><LocalizedUi value={"\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u0435 ("}/><LocalizedUi value={saved.length}/>/16)
              </button>
              <button type="button" onClick={() => { setStart(null); setEnd(null); }}><LocalizedUi value={"\u041D\u043E\u0432\u0430\u044F \u043B\u0438\u043D\u0438\u044F"}/></button>
            </div> :
                        <p role="status"><LocalizedUi value={measureError || (!start ?
                                "Укажите первую точку на изображении." : "Укажите вторую точку для измерения.")}/></p>}/>
          </div>
        </div>}/>
        <LocalizedUi value={saved.length > 0 && <div>
          <h4><LocalizedUi value={"\u0421\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F ("}/><LocalizedUi value={saved.length}/>)</h4>
          <ol><LocalizedUi value={saved.map((s, i) => <li key={i}><LocalizedUi value={s.measurement.lengthMm.toFixed(2)}/><LocalizedUi value={"\u043C\u043C \u00B7 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u0441\u0440\u0435\u0437"}/><button type="button" onClick={() => setSaved(rows => rows.filter((_, j) => j !== i))}><LocalizedUi value={"\u0423\u0434\u0430\u043B\u0438\u0442\u044C"}/></button>
            </li>)}/></ol>
          <button type="button" onClick={save}><LocalizedUi value={"\u042D\u043A\u0441\u043F\u043E\u0440\u0442 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0445 \u0440\u0430\u0437\u043C\u0435\u0440\u043E\u0432"}/></button>
        </div>}/>
        <LocalizedUi value={hint && <p role="status"><LocalizedUi value={hint}/></p>}/>
        <p><small><LocalizedUi value={"\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F \u0444\u0438\u0437\u0438\u0447\u0435\u0441\u043A\u0438\u0439 PixelSpacing \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E DICOM, \u0430 \u043D\u0435 \u043C\u0430\u0441\u0448\u0442\u0430\u0431 \u043E\u043A\u043D\u0430. \u0418\u0437\u043C\u0435\u0440\u044F\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0440\u0430\u0441\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0432 \u043F\u043B\u043E\u0441\u043A\u043E\u0441\u0442\u0438 \u043A\u0430\u0434\u0440\u0430. \u041E\u0440\u0438\u0435\u043D\u0442\u0430\u0446\u0438\u044F, \u043A\u043E\u043D\u0442\u0440\u0430\u0441\u0442 \u0438 \u043F\u0440\u0435\u0434\u0435\u043B\u044B \u043E\u0447\u0430\u0433\u0430 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u044F\u044E\u0442\u0441\u044F \u0432\u0440\u0430\u0447\u043E\u043C; \u044D\u0442\u043E \u043D\u0435 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440 \u0438 \u043D\u0435 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u0435 \u043F\u043E\u043B\u043D\u043E\u0433\u043E \u043E\u0431\u044A\u0451\u043C\u0430 \u043E\u043F\u0443\u0445\u043E\u043B\u0438. \u041D\u0435\u0441\u0436\u0430\u0442\u044B\u0435 \u043E\u0434\u043D\u043E\u043A\u0430\u0434\u0440\u043E\u0432\u044B\u0435 CT/MR."}/></small></p>
      </>}/>
  </section>;
}
