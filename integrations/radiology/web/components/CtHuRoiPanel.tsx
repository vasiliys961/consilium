"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useMemo, useRef, useState } from "react";
import { measureCtDicomCircularRoi, parseDicomFrame, renderDicomPixels, type CtRoiMeasurement, type DicomFrame } from "../lib/dicom-lite";
import type { TechnicalDicomMetadata } from "../lib/dicom-series";
type Label = "liver" | "spleen" | "l1-trabecular" | "other";
const labels: Record<Label, string> = {
    liver: "Печень (отметка врача)",
    spleen: "Селезёнка (отметка врача)",
    "l1-trabecular": "L1 · трабекулярная ткань (отметка врача)",
    other: "Другой участок (отметка врача)",
};
type Saved = {
    label: Label;
    sourceSeriesUid: string;
    sourceSopUid: string;
    roi: CtRoiMeasurement;
};
type Props = {
    file: File | null;
    metadata: TechnicalDicomMetadata | null;
    seriesKey: string | null;
    onSave?: (measurement: CtRoiMeasurement) => void;
};
export default function CtHuRoiPanel({ file, metadata, seriesKey, onSave }: Props) {
    const __ui = useUiTranslator();
    const canvas = useRef<HTMLCanvasElement | null>(null);
    const frame = useRef<DicomFrame | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState("");
    const [location, setLocation] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const [radius, setRadius] = useState(8);
    const [label, setLabel] = useState<Label>("other");
    const [saved, setSaved] = useState<Saved[]>([]);
    const [note, setNote] = useState("");
    useEffect(() => { setSaved([]); setNote(""); }, [seriesKey]);
    useEffect(() => {
        let cancelled = false;
        frame.current = null;
        setLoaded(false);
        setError("");
        setLocation(null);
        if (!file || !metadata || metadata.modality !== "CT")
            return;
        if (file.size < 200 || file.size > 64 * 1024 ** 2) {
            setError("Размер DICOM не поддерживается локальным ROI-инструментом.");
            return;
        }
        void file.arrayBuffer().then(buffer => {
            if (cancelled)
                return;
            const next = parseDicomFrame(buffer);
            if (next.metadata.modality !== "CT")
                throw Error("ROI доступен только для КТ.");
            frame.current = next;
            setLoaded(true);
        }).catch(e => {
            if (!cancelled)
                setError(e instanceof Error ? e.message : "Не удалось декодировать исходный CT");
        });
        return () => { cancelled = true; frame.current = null; };
    }, [file, metadata]);
    const measurement = useMemo(() => {
        if (!loaded || !frame.current || !metadata || !location)
            return null;
        try {
            return measureCtDicomCircularRoi(frame.current, metadata, location.x, location.y, radius);
        }
        catch {
            return null;
        }
    }, [loaded, metadata, location, radius]);
    const roiError = useMemo(() => {
        if (!loaded || !frame.current || !metadata || !location || measurement)
            return "";
        try {
            measureCtDicomCircularRoi(frame.current, metadata, location.x, location.y, radius);
        }
        catch (e) {
            return e instanceof Error ? e.message : "Измерение недоступно";
        }
        return "";
    }, [loaded, metadata, location, radius, measurement]);
    useEffect(() => {
        if (!loaded || !frame.current || !canvas.current)
            return;
        const f = frame.current, element = canvas.current, ctx = element.getContext("2d");
        if (!ctx)
            return;
        element.width = f.metadata.width;
        element.height = f.metadata.height;
        const bitmap = ctx.createImageData(element.width, element.height);
        bitmap.data.set(renderDicomPixels(f));
        ctx.putImageData(bitmap, 0, 0);
        if (location) {
            ctx.beginPath();
            ctx.arc(location.x, location.y, radius, 0, Math.PI * 2);
            ctx.strokeStyle = "#facc15";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(location.x - 5, location.y);
            ctx.lineTo(location.x + 5, location.y);
            ctx.moveTo(location.x, location.y - 5);
            ctx.lineTo(location.x, location.y + 5);
            ctx.stroke();
        }
    }, [loaded, location, radius]);
    const pick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const f = frame.current;
        if (!f)
            return;
        const box = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - box.left) / box.width * f.metadata.width;
        const y = (e.clientY - box.top) / box.height * f.metadata.height;
        setLocation({ x: Math.round(x), y: Math.round(y) });
        setNote("");
    };
    const add = () => {
        if (!measurement || !metadata?.seriesUid || !metadata.sopInstanceUid || saved.length >= 16)
            return;
        onSave?.(measurement);
        setSaved(prev => [...prev, {
                label, sourceSeriesUid: metadata.seriesUid!, sourceSopUid: metadata.sopInstanceUid!,
                roi: measurement,
            }]);
        setNote("ROI добавлен к локальным измерениям.");
    };
    const liver = saved.filter(m => m.label === "liver");
    const spleen = saved.filter(m => m.label === "spleen");
    const average = (items: Saved[]) => items.reduce((sum, v) => sum + v.roi.meanHu, 0) / items.length;
    const difference = liver.length && spleen.length ?
        Math.round((average(liver) - average(spleen)) * 100) / 100 : null;
    const exportJson = () => {
        if (!saved.length)
            return;
        const report = {
            schema: "opus-ct-manual-original-hu-rois/v1", modality: "CT",
            status: "physician_selected_measurement_not_diagnosis",
            sourceSeriesKey: seriesKey, sourceIdsLocallyRetained: true,
            measures: saved, meanLiverMinusSpleenHu: difference,
            contrastPhaseUnverified: true, ctCalibrationPhantomUnverified: true,
            steatosisDiagnosis: null, osteoporosisDiagnosis: null, cloudSent: false,
        };
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        try {
            const a = document.createElement("a");
            a.href = url;
            a.download = "opus-ct-original-hu-rois.json";
            document.body.appendChild(a);
            a.click();
            a.remove();
        }
        finally {
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        setNote("Локальный отчёт сохранён. Содержит UID срезов: храните его конфиденциально.");
    };
    return <section className="ora-card" aria-label={__ui("\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u0430\u044F \u041A\u0422-\u0434\u0435\u043D\u0441\u0438\u0442\u043E\u043C\u0435\u0442\u0440\u0438\u044F ROI")} style={{ padding: 18, marginTop: 12 }}>
   <h3 style={{ margin: "0 0 8px" }}><LocalizedUi value={"\u041A\u0422 \u00B7 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u0435 \u043F\u043B\u043E\u0442\u043D\u043E\u0441\u0442\u0438 \u0442\u043A\u0430\u043D\u0435\u0439 (HU)"}/></h3>
   <p><LocalizedUi value={"\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0443\u0447\u0430\u0441\u0442\u043E\u043A \u043D\u0435\u043F\u043E\u0441\u0440\u0435\u0434\u0441\u0442\u0432\u0435\u043D\u043D\u043E \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u043C \u041A\u0422-\u0441\u0440\u0435\u0437\u0435. \u0418\u0437\u043C\u0435\u0440\u044F\u044E\u0442\u0441\u044F \u0440\u0435\u0430\u043B\u044C\u043D\u044B\u0435 \u043F\u0438\u043A\u0441\u0435\u043B\u0438 DICOM, \u0430 \u043D\u0435 \u043F\u0440\u043E\u0433\u043D\u043E\u0437 \u043D\u0435\u0439\u0440\u043E\u0441\u0435\u0442\u0438. \u041C\u043E\u0436\u043D\u043E \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E ROI \u043F\u0435\u0447\u0435\u043D\u0438, \u0441\u0435\u043B\u0435\u0437\u0451\u043D\u043A\u0438 \u0438\u043B\u0438 \u0442\u0435\u043B\u0430 L1."}/></p>
   <LocalizedUi value={!file || metadata?.modality !== "CT" ?
            <p role="status"><LocalizedUi value={"\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u041A\u0422-\u0441\u0440\u0435\u0437, \u0447\u0442\u043E\u0431\u044B \u0438\u0437\u043C\u0435\u0440\u0438\u0442\u044C \u043F\u043B\u043E\u0442\u043D\u043E\u0441\u0442\u044C \u0442\u043A\u0430\u043D\u0435\u0439."}/></p> :
            <>
       <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
       <LocalizedUi value={loaded && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 18 }}>
         <div>
           <canvas ref={canvas} onClick={pick} role="img" aria-label={__ui("\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u041A\u0422-\u0441\u0440\u0435\u0437, \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \u0432 \u0446\u0435\u043D\u0442\u0440\u0435 \u043E\u0431\u043B\u0430\u0441\u0442\u0438 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F")} style={{ width: "100%", maxWidth: 512, height: "auto", cursor: "crosshair", border: "1px solid #64748b", background: "#000" }}/>
           <p><small><LocalizedUi value={"\u0416\u0451\u043B\u0442\u044B\u0439 \u043A\u0440\u0443\u0433 \u2014 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u0430\u044F \u0432\u0440\u0430\u0447\u043E\u043C \u043E\u0431\u043B\u0430\u0441\u0442\u044C. \u0412\u0441\u0435 \u0432\u044B\u0447\u0438\u0441\u043B\u0435\u043D\u0438\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B."}/></small></p>
           <label><LocalizedUi value={"\u0420\u0430\u0434\u0438\u0443\u0441 ROI:"}/><LocalizedUi value={radius}/><LocalizedUi value={"\u043F\u0438\u043A\u0441."}/><input type="range" min={2} max={32} value={radius} onChange={e => setRadius(Number(e.target.value))} style={{ display: "block", width: "100%" }}/>
           </label>
           <label><LocalizedUi value={"\u0410\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043E\u0431\u043B\u0430\u0441\u0442\u044C (\u0432\u044B\u0431\u0438\u0440\u0430\u0435\u0442 \u0432\u0440\u0430\u0447)"}/><select value={label} onChange={e => setLabel(e.target.value as Label)} style={{ display: "block", width: "100%" }}>
               <LocalizedUi value={(Object.keys(labels) as Label[]).map(key => <option key={key} value={key}><LocalizedUi value={labels[key]}/></option>)}/>
             </select>
           </label>
         </div>
         <div>
           <LocalizedUi value={measurement ? <div aria-live="polite">
             <p><LocalizedUi value={"\u0418\u0437\u043C\u0435\u0440\u0435\u043D\u043E"}/><strong><LocalizedUi value={measurement.pixelCount}/></strong><LocalizedUi value={"\u043F\u0438\u043A\u0441\u0435\u043B\u0435\u0439, \u043F\u043B\u043E\u0449\u0430\u0434\u044C"}/><strong><LocalizedUi value={measurement.areaMm2.toFixed(2)}/><LocalizedUi value={"\u043C\u043C\u00B2"}/></strong>.</p>
             <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>
               <LocalizedUi value={([
                            ["Средняя плотность", measurement.meanHu],
                            ["Медиана", measurement.medianHu],
                            ["SD", measurement.stdDevHu],
                            ["P10", measurement.p10Hu],
                            ["P90", measurement.p90Hu],
                            ["Минимум", measurement.minHu],
                            ["Максимум", measurement.maxHu],
                        ] as const).map(([title, value]) => <div key={title}><small><LocalizedUi value={title}/></small><div><strong><LocalizedUi value={value.toFixed(2)}/> HU</strong></div></div>)}/>
             </div>
             <p><LocalizedUi value={"\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435 HU \u0432 ROI"}/></p>
             <div style={{ display: "flex", gap: 2, height: 65, alignItems: "end" }} role="img" aria-label={__ui("\u0413\u0438\u0441\u0442\u043E\u0433\u0440\u0430\u043C\u043C\u0430 \u043F\u043B\u043E\u0442\u043D\u043E\u0441\u0442\u0435\u0439 \u0432\u043D\u0443\u0442\u0440\u0438 ROI")}>
               <LocalizedUi value={measurement.histogram.map((bin, i) => <div key={i} title={`${bin.lowHu}–${bin.highHu} HU: ${bin.count}`} style={{ flex: 1, height: `${Math.max(1, 100 * bin.count / Math.max(...measurement.histogram.map(b => b.count)))}%`,
                                background: "#64748b" }}/>)}/>
             </div>
             <button type="button" onClick={add} disabled={saved.length >= 16}><LocalizedUi value={"\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u044D\u0442\u043E\u0442 ROI ("}/><LocalizedUi value={saved.length}/>/16)
             </button>
           </div> : <p role="status"><LocalizedUi value={roiError || "Нажмите на КТ-срез, чтобы выбрать область измерения."}/></p>}/>
         </div>
       </div>}/>
       <LocalizedUi value={saved.length > 0 && <div style={{ marginTop: 14 }}>
         <h4><LocalizedUi value={"\u0421\u043E\u0445\u0440\u0430\u043D\u0451\u043D\u043D\u044B\u0435 \u043E\u0431\u043B\u0430\u0441\u0442\u0438 \u00B7"}/><LocalizedUi value={saved.length}/></h4>
         <div style={{ overflowX: "auto" }}>
           <table style={{ width: "100%", textAlign: "left" }}>
             <thead><tr><th><LocalizedUi value={"\u0412\u044B\u0431\u0440\u0430\u043D\u043D\u0430\u044F \u043E\u0431\u043B\u0430\u0441\u0442\u044C"}/></th><th><LocalizedUi value={"\u0421\u0440\u0435\u0434\u043D\u0435\u0435 HU"}/></th><th><LocalizedUi value={"\u041C\u0435\u0434\u0438\u0430\u043D\u0430 HU"}/></th><th>SD HU</th><th><LocalizedUi value={"\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435"}/></th></tr></thead>
             <tbody><LocalizedUi value={saved.map((m, i) => <tr key={i}><td><LocalizedUi value={labels[m.label]}/></td><td><LocalizedUi value={m.roi.meanHu.toFixed(2)}/></td>
                 <td><LocalizedUi value={m.roi.medianHu.toFixed(2)}/></td><td><LocalizedUi value={m.roi.stdDevHu.toFixed(2)}/></td>
                 <td><button type="button" onClick={() => setSaved(items => items.filter((_, j) => j !== i))}><LocalizedUi value={"\u0423\u0434\u0430\u043B\u0438\u0442\u044C"}/></button></td></tr>)}/></tbody>
           </table>
         </div>
         <LocalizedUi value={difference !== null && <p><strong><LocalizedUi value={"\u0420\u0430\u0437\u043D\u0438\u0446\u0430 \u0441\u0440\u0435\u0434\u043D\u0438\u0445 \u043F\u043B\u043E\u0442\u043D\u043E\u0441\u0442\u0435\u0439 \u043F\u0435\u0447\u0435\u043D\u0438 \u0438 \u0441\u0435\u043B\u0435\u0437\u0451\u043D\u043A\u0438:"}/><LocalizedUi value={difference.toFixed(2)}/> HU.</strong><LocalizedUi value={"\u0421\u0440\u0430\u0432\u043D\u0438\u0432\u0430\u0439\u0442\u0435 \u043B\u0438\u0448\u044C \u043E\u0434\u043D\u043E\u0440\u043E\u0434\u043D\u044B\u0439 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B \u041A\u0422; \u044D\u0442\u043E \u043D\u0435 \u0434\u0438\u0430\u0433\u043D\u043E\u0437 \u0441\u0442\u0435\u0430\u0442\u043E\u0437\u0430."}/></p>}/>
         <button type="button" onClick={exportJson}><LocalizedUi value={"\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0432\u0441\u0435 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u044F \u0432 JSON"}/></button>
       </div>}/>
       <LocalizedUi value={note && <p role="status"><LocalizedUi value={note}/></p>}/>
       <p><small><LocalizedUi value={"\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0435 \u043E\u0434\u043D\u043E\u043A\u0430\u0434\u0440\u043E\u0432\u044B\u0435 \u043D\u0435\u0441\u0436\u0430\u0442\u044B\u0435 \u041A\u0422 \u0441 \u044F\u0432\u043D\u043E \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u043C Rescale Type=HU, Slope/Intercept \u0438 PixelSpacing. \u041A\u043E\u043D\u0442\u0440\u0430\u0441\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435, \u043A\u0430\u043B\u0438\u0431\u0440\u043E\u0432\u043A\u0430 \u0438 \u043B\u043E\u043A\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F \u043E\u0440\u0433\u0430\u043D\u0430 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043D\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u044E\u0442\u0441\u044F. \u041D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u043E\u0439 \u043E\u0441\u0442\u0435\u043E\u043F\u043E\u0440\u043E\u0437\u0430, \u0441\u0442\u0435\u0430\u0442\u043E\u0437\u0430, \u043E\u043F\u0443\u0445\u043E\u043B\u0438 \u0438\u043B\u0438 \u0444\u0438\u0431\u0440\u043E\u0437\u0430."}/></small></p>
     </>}/>
 </section>;
}
