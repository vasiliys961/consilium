"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useRef, useState } from "react";
import { readNativeIchKSlice } from "../lib/ich-native-slice";
import { automaticCtWindow, grayscaleCt } from "../lib/ich-ct-window";
import type { IchResearchReport } from "../lib/ich-research";
const WINDOWS = {
    auto: { center: 0, width: 1, label: "Авто · любой масштаб NIfTI" },
    brain: { center: 40, width: 80, label: "Мозговое (предполагаемые HU)" },
    subdural: { center: 80, width: 200, label: "Широкое" },
    bone: { center: 400, width: 1800, label: "Костное" },
} as const;
type WindowKey = keyof typeof WINDOWS;
/** Only source/mask bytes already SHA-confirmed by the parent component.
 * Native k-index view, NOT a claimed anatomical axial DICOM view.
 */
export default function IchNativeOverlay({ source, mask, report }: {
    source: File;
    mask: File;
    report: IchResearchReport;
}) {
    const __ui = useUiTranslator();
    const { dimensions, affineRas } = report.source.geometry;
    const largest = report.prediction.largestComponents[0];
    const initial = largest ?
        (largest.peakSliceIndexK ?? Math.floor((largest.boundsVoxelMin[2] + largest.boundsVoxelMax[2]) / 2)) :
        Math.floor(dimensions[2] / 2);
    const [slice, setSlice] = useState(initial);
    const [windowKey, setWindowKey] = useState<WindowKey>("auto");
    const [showMask, setShowMask] = useState(true);
    const [error, setError] = useState("");
    const [reading, setReading] = useState(false);
    const canvas = useRef<HTMLCanvasElement | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        setReading(true);
        setError("");
        Promise.all([
            readNativeIchKSlice(source, "ct", slice, dimensions, affineRas, controller.signal),
            readNativeIchKSlice(mask, "mask", slice, dimensions, affineRas, controller.signal),
        ]).then(([ct, seg]) => {
            if (!active || controller.signal.aborted)
                return;
            const target = canvas.current, ctx = target?.getContext("2d", { alpha: false });
            if (!ctx)
                throw Error("Canvas 2D недоступен.");
            const w = dimensions[0], h = dimensions[1];
            target!.width = w;
            target!.height = h;
            const rgba = ctx.createImageData(w, h);
            const win = windowKey === "auto" ? automaticCtWindow(ct.pixels as Float32Array) : WINDOWS[windowKey];
            for (let i = 0; i < w * h; i++) {
                const value = (ct.pixels as Float32Array)[i];
                const grey = grayscaleCt(value, win);
                const lesion = showMask && (seg.pixels as Uint8Array)[i] === 1;
                const at = i * 4;
                rgba.data[at] = lesion ? Math.round(0.65 * 245 + 0.35 * grey) : grey;
                rgba.data[at + 1] = lesion ? Math.round(0.35 * grey) : grey;
                rgba.data[at + 2] = lesion ? Math.round(0.35 * grey) : grey;
                rgba.data[at + 3] = 255;
            }
            ctx.putImageData(rgba, 0, 0);
            const components = report.prediction.largestComponents.slice(0, 12);
            ctx.save();
            ctx.strokeStyle = "#ffbf56";
            ctx.lineWidth = 1.5;
            for (const c of components) {
                if (slice < c.boundsVoxelMin[2] || slice > c.boundsVoxelMax[2])
                    continue;
                ctx.strokeRect(c.boundsVoxelMin[0], c.boundsVoxelMin[1], c.boundsVoxelMax[0] - c.boundsVoxelMin[0] + 1, c.boundsVoxelMax[1] - c.boundsVoxelMin[1] + 1);
            }
            ctx.restore();
            setReading(false);
        }).catch(e => {
            if (active && !controller.signal.aborted) {
                setError(e instanceof Error ? e.message : "Срез недоступен.");
                setReading(false);
            }
        });
        return () => { active = false; controller.abort(); };
    }, [source, mask, slice, windowKey, showMask, report, dimensions, affineRas]);
    return <section aria-label={__ui("\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0439 NIfTI \u0441 \u0431\u0438\u043D\u0430\u0440\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u043E\u0439 SAMIHS")} style={{ padding: 12, border: "1px solid #839b93", borderRadius: 8, margin: "14px 0" }}>
   <h4><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u041A\u0422 + \u043C\u0430\u0441\u043A\u0430 SAMIHS \u00B7 \u043D\u0430\u0442\u0438\u0432\u043D\u044B\u0435 \u0441\u0440\u0435\u0437\u044B"}/></h4>
   <p><LocalizedUi value={"\u041F\u0438\u043A\u0441\u0435\u043B\u0438 \u0432\u0437\u044F\u0442\u044B \u0438\u0437 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 3D-\u041A\u0422, \u0430 \u043A\u0440\u0430\u0441\u043D\u0430\u044F \u043E\u0431\u043B\u0430\u0441\u0442\u044C \u2014 \u0438\u0437 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u0444\u0430\u0439\u043B\u0430 \u0431\u0438\u043D\u0430\u0440\u043D\u043E\u0439 \u043C\u0430\u0441\u043A\u0438, \u0447\u044C\u0438 SHA-256 \u0441\u043E\u0432\u043F\u0430\u043B\u0438 \u0441 \u0438\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u043C \u043E\u0442\u0447\u0451\u0442\u043E\u043C. \u041D\u0435 \u0441\u0438\u043D\u0442\u0435\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043F\u0440\u0438\u043C\u0435\u0440 \u0438 \u043D\u0435 \u0432\u0438\u0437\u0443\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F \u0431\u0435\u0437 \u0434\u0430\u043D\u043D\u044B\u0445."}/></p>
   <label><LocalizedUi value={"\u0418\u043D\u0434\u0435\u043A\u0441 k:"}/><LocalizedUi value={slice + 1}/>/<LocalizedUi value={dimensions[2]}/>
     <input type="range" min="0" max={dimensions[2] - 1} step="1" value={slice} onChange={e => setSlice(Number(e.target.value))}/>
   </label>
   <label><LocalizedUi value={"\u041E\u043A\u043D\u043E \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F"}/><select value={windowKey} onChange={e => setWindowKey(e.target.value as WindowKey)}>
       <LocalizedUi value={Object.entries(WINDOWS).map(([key, item]) => <option value={key} key={key}><LocalizedUi value={item.label}/></option>)}/>
     </select>
   </label>
   <p><small><LocalizedUi value={"\u0410\u0432\u0442\u043E\u043E\u043A\u043D\u043E \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442 \u043A\u043E\u043D\u0442\u0440\u0430\u0441\u0442 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u043F\u0438\u043A\u0441\u0435\u043B\u0435\u0439 \u0434\u0430\u043D\u043D\u043E\u0433\u043E \u0441\u0440\u0435\u0437\u0430, \u0432 \u0442\u043E\u043C \u0447\u0438\u0441\u043B\u0435 \u043F\u0440\u0438 \u043D\u043E\u0440\u043C\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u0438; \u043D\u0435 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u0435\u0442 HU."}/></small></p>
   <label><input type="checkbox" checked={showMask} onChange={e => setShowMask(e.target.checked)}/><LocalizedUi value={"\u041E\u0442\u043E\u0431\u0440\u0430\u0436\u0430\u0442\u044C \u0431\u0438\u043D\u0430\u0440\u043D\u0443\u044E \u043C\u0430\u0441\u043A\u0443"}/></label>
   <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
     <LocalizedUi value={report.prediction.largestComponents.slice(0, 8).map(c => <button type="button" key={c.componentIndex} onClick={() => setSlice(c.peakSliceIndexK ?? Math.floor((c.boundsVoxelMin[2] + c.boundsVoxelMax[2]) / 2))}><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442"}/><LocalizedUi value={c.componentIndex + 1}/> · <LocalizedUi value={c.volumeMl.toFixed(1)}/><LocalizedUi value={"\u043C\u043B \u00B7 k"}/><LocalizedUi value={(c.peakSliceIndexK ?? Math.floor((c.boundsVoxelMin[2] + c.boundsVoxelMax[2]) / 2)) + 1}/>
       </button>)}/>
   </div>
   <LocalizedUi value={reading && <p role="status"><LocalizedUi value={"\u0427\u0442\u0435\u043D\u0438\u0435 \u043E\u0434\u043D\u043E\u0433\u043E \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E \u0441\u0440\u0435\u0437\u0430 \u0438 \u043C\u0430\u0441\u043A\u0438\u2026"}/></p>}/>
   <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
   <canvas ref={canvas} width={dimensions[0]} height={dimensions[1]} style={{ display: "block", width: "100%", maxWidth: 512,
            aspectRatio: dimensions[0] + "/" + dimensions[1],
            border: "1px solid #5f7470", marginTop: 10 }}/>
   <p><small><LocalizedUi value={"\u041E\u0440\u0430\u043D\u0436\u0435\u0432\u044B\u0435 \u043F\u0440\u044F\u043C\u043E\u0443\u0433\u043E\u043B\u044C\u043D\u0438\u043A\u0438 \u2014 \u043F\u0440\u043E\u0435\u043A\u0446\u0438\u0438 3D-\u0431\u043E\u043A\u0441\u043E\u0432 \u043F\u0440\u0435\u0434\u043F\u043E\u043B\u0430\u0433\u0430\u0435\u043C\u044B\u0445 \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u043E\u0432, \u0430 \u043D\u0435 \u0434\u043E\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0435 \u0433\u0440\u0430\u043D\u0438\u0446\u044B \u0433\u0435\u043C\u0430\u0442\u043E\u043C. \u041E\u0442\u043E\u0431\u0440\u0430\u0436\u0430\u0435\u0442\u0441\u044F \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u0438\u043D\u0434\u0435\u043A\u0441\u043D\u044B\u0439 \u0441\u0440\u0435\u0437 k, \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u043D\u0435\u043B\u044C\u0437\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043D\u0430\u0437\u044B\u0432\u0430\u0442\u044C \u0430\u043A\u0441\u0438\u0430\u043B\u044C\u043D\u044B\u043C DICOM-\u0441\u0440\u0435\u0437\u043E\u043C. \u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u0438, \u0442\u0438\u043F\u0430 \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u044F \u0438 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u044F \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u043C SOP UID \u0435\u0449\u0451 \u043D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u0430. \u041F\u0440\u0438 \u0441\u043C\u0435\u043D\u0435 \u0441\u0440\u0435\u0437\u0430 \u043F\u043E\u0442\u043E\u043A\u043E\u0432\u0430\u044F \u0440\u0430\u0441\u043F\u0430\u043A\u043E\u0432\u043A\u0430 \u043D\u0430\u0447\u0438\u043D\u0430\u0435\u0442\u0441\u044F \u0437\u0430\u043D\u043E\u0432\u043E; \u043F\u043E\u043B\u043D\u044B\u0439 3D-\u043E\u0431\u044A\u0451\u043C \u043D\u0430 Mac \u043D\u0435 \u0432\u044B\u0434\u0435\u043B\u044F\u0435\u0442\u0441\u044F."}/></small></p>
 </section>;
}
