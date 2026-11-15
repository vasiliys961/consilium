"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useRef, useState } from "react";
import { readNativeIchKSlice } from "../lib/ich-native-slice";
import { automaticCtWindow, grayscaleCt } from "../lib/ich-ct-window";
import type { IchResearchReport } from "../lib/ich-research";
const windows = {
    auto: { center: 0, width: 1, label: "Авто · нормализованная КТ" },
    brain: { center: 40, width: 80, label: "Мозговое" },
    wide: { center: 80, width: 200, label: "Широкое" },
} as const;
type W = keyof typeof windows;
type ReviewLayer = "errors" | "prediction" | "expert" | "ct" | "subtype";
type NativeSlice = Awaited<ReturnType<typeof readNativeIchKSlice>>;
/** An actual source-pixel comparison of a trained ICH mask and expert labels.
 * Source/algorithm/expert files must all have been SHA verified by parents.
 * TP/FP/FN are pixel-wise overlap classes, not a diagnosis or clinical FP rate.
 */
export default function IchExpertErrorOverlay({ source, mask, expert, referenceLabel, modelReport, jumpTo, subtypeFocus }: {
    source: File;
    mask: File;
    expert: File;
    referenceLabel: number;
    modelReport: IchResearchReport;
    jumpTo?: {
        sliceIndex: number;
        requestId: number;
    } | null;
    subtypeFocus?: {
        file: File;
        label: number;
        subtype: string;
        requestId: number;
    } | null;
}) {
    const __ui = useUiTranslator();
    const { dimensions, affineRas } = modelReport.source.geometry;
    const largest = modelReport.prediction.largestComponents[0];
    const initial = largest ? Math.floor((largest.boundsVoxelMin[2] + largest.boundsVoxelMax[2]) / 2) :
        Math.floor(dimensions[2] / 2);
    const section = useRef<HTMLElement | null>(null);
    const [slice, setSlice] = useState(initial);
    // A new requestId makes repeat visits work after the radiologist has moved the slider.
    // This viewer decodes ONLY the native third array dimension (k).
    useEffect(() => {
        if (jumpTo && Number.isSafeInteger(jumpTo.sliceIndex) &&
            jumpTo.sliceIndex >= 0 && jumpTo.sliceIndex < dimensions[2]) {
            setSlice(jumpTo.sliceIndex);
            section.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, [jumpTo?.requestId, jumpTo?.sliceIndex, dimensions]);
    const [window, setWindow] = useState<W>("auto");
    const [reviewLayer, setReviewLayer] = useState<ReviewLayer>("errors");
    useEffect(() => {
        setReviewLayer(subtypeFocus ? "subtype" : "errors");
    }, [subtypeFocus?.file, subtypeFocus?.label, subtypeFocus?.requestId]);
    const [opacity, setOpacity] = useState(65);
    // Cache exactly one verified native k-slice per file trio. Toggling window,
    // view or opacity must NOT decompress three 3D NIfTI files again on M1/8GB.
    const decoded = useRef<{
        source: File;
        mask: File;
        expert: File;
        modelReport: IchResearchReport;
        referenceLabel: number;
        slice: number;
        ct: NativeSlice;
        predicted: NativeSlice;
        annotated: NativeSlice;
        subtypeFile: File | null;
        subtypeLabel: number | null;
        subtypeSlice: NativeSlice | null;
    } | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [counts, setCounts] = useState<[
        number,
        number,
        number
    ] | null>(null);
    const [subtypeCounts, setSubtypeCounts] = useState<[
        number,
        number
    ] | null>(null);
    const canvas = useRef<HTMLCanvasElement | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        setLoading(true);
        setError("");
        setCounts(null);
        setSubtypeCounts(null);
        const focus = reviewLayer === "subtype" ? subtypeFocus : null;
        const prev = decoded.current;
        const cached = prev?.source === source && prev.mask === mask && prev.expert === expert &&
            prev.modelReport === modelReport && prev.referenceLabel === referenceLabel &&
            prev.slice === slice && prev.subtypeFile === (focus?.file ?? null) &&
            prev.subtypeLabel === (focus?.label ?? null);
        const pixels = cached && prev ?
            Promise.resolve([prev.ct, prev.predicted, prev.annotated, prev.subtypeSlice] as const) :
            Promise.all([
                readNativeIchKSlice(source, "ct", slice, dimensions, affineRas, controller.signal),
                readNativeIchKSlice(mask, "mask", slice, dimensions, affineRas, controller.signal),
                readNativeIchKSlice(expert, "expert", slice, dimensions, affineRas, controller.signal, referenceLabel),
                ...(focus ? [readNativeIchKSlice(focus.file, "expert", slice, dimensions, affineRas, controller.signal, focus.label)] : []),
            ]);
        pixels.then(([ct, predicted, annotated, focused]) => {
            if (!active || controller.signal.aborted)
                return;
            const subtypeSlice = focused ?? null;
            if (!cached)
                decoded.current = { source, mask, expert, modelReport, referenceLabel, slice,
                    ct, predicted, annotated, subtypeFile: focus?.file ?? null,
                    subtypeLabel: focus?.label ?? null, subtypeSlice };
            const context = canvas.current?.getContext("2d", { alpha: false });
            if (!context)
                throw Error("Невозможно отрисовать исходный срез.");
            const [width, height] = ct.dimensions;
            const img = context.createImageData(width, height);
            const win = window === "auto" ? automaticCtWindow(ct.pixels as Float32Array) : windows[window];
            let tp = 0, fp = 0, fn = 0, subtypeHit = 0, subtypeMiss = 0;
            for (let i = 0; i < width * height; i++) {
                const value = (ct.pixels as Float32Array)[i];
                const g = grayscaleCt(value, win);
                const p = (predicted.pixels as Uint8Array)[i] === 1;
                const e = (annotated.pixels as Uint8Array)[i] === 1;
                if (p && e)
                    tp++;
                else if (p)
                    fp++;
                else if (e)
                    fn++;
                const classVoxel = (subtypeSlice?.pixels as Uint8Array | undefined)?.[i] === 1;
                if (classVoxel) {
                    if (p)
                        subtypeHit++;
                    else
                        subtypeMiss++;
                }
                let tint: [
                    number,
                    number,
                    number
                ] | null = null;
                if (reviewLayer === "errors") {
                    if (p && e)
                        tint = [40, 225, 130];
                    else if (p)
                        tint = [250, 75, 70];
                    else if (e)
                        tint = [245, 220, 65];
                }
                else if (reviewLayer === "subtype" && classVoxel) {
                    // The binary model does not distinguish subtypes: model positives
                    // outside THIS expert subtype must not be called subtype FPs.
                    tint = p ? [40, 225, 130] : [245, 220, 65];
                }
                else if (reviewLayer === "prediction" && p)
                    tint = [250, 75, 70];
                else if (reviewLayer === "expert" && e)
                    tint = [245, 220, 65];
                const alpha = opacity / 100;
                const rgb: [
                    number,
                    number,
                    number
                ] = tint ?
                    [0, 1, 2].map(k => Math.round(g * (1 - alpha) + tint[k] * alpha)) as [
                        number,
                        number,
                        number
                    ] :
                    [g, g, g];
                const at = i * 4;
                img.data[at] = rgb[0];
                img.data[at + 1] = rgb[1];
                img.data[at + 2] = rgb[2];
                img.data[at + 3] = 255;
            }
            context.putImageData(img, 0, 0);
            setCounts([tp, fp, fn]);
            setSubtypeCounts(focus ? [subtypeHit, subtypeMiss] : null);
            setLoading(false);
        }).catch(e => {
            if (active && !controller.signal.aborted) {
                setError(e instanceof Error ? e.message : "Не удалось сопоставить изображения.");
                setLoading(false);
            }
        });
        return () => { active = false; controller.abort(); };
    }, [source, mask, expert, referenceLabel, modelReport, dimensions, affineRas, slice, window, reviewLayer, opacity, subtypeFocus]);
    return <section ref={section} aria-label={__ui("\u041E\u0448\u0438\u0431\u043A\u0438 \u0441\u0435\u0433\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u0438 \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u044F \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u041A\u0422")} style={{ border: "1px solid #8fa6a0", borderRadius: 8, padding: 12, marginTop: 14 }}>
   <h4><LocalizedUi value={"\u041A\u0422 \u00B7 \u0433\u0434\u0435 \u043C\u043E\u0434\u0435\u043B\u044C \u0441\u043E\u0432\u043F\u0430\u043B\u0430 \u0441 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u043E\u0439"}/></h4>
   <p><LocalizedUi value={"\u041F\u0438\u043A\u0441\u0435\u043B\u0438 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u041A\u0422 \u0438 \u043E\u0431\u0435 \u043C\u0430\u0441\u043A\u0438 \u0447\u0438\u0442\u0430\u044E\u0442\u0441\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E \u043F\u043E \u043E\u0434\u043D\u043E\u0439 \u0438\u043D\u0434\u0435\u043A\u0441\u043D\u043E\u0439 \u043F\u043B\u043E\u0441\u043A\u043E\u0441\u0442\u0438. \u041D\u0438 \u043E\u0434\u0438\u043D \u0438\u0437 \u0444\u0430\u0439\u043B\u043E\u0432 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440."}/></p>
   <label><LocalizedUi value={"\u0421\u0440\u0435\u0437 k"}/><LocalizedUi value={slice + 1}/><LocalizedUi value={"\u0438\u0437"}/><LocalizedUi value={dimensions[2]}/>
     <input type="range" min="0" max={dimensions[2] - 1} step="1" value={slice} onChange={e => setSlice(Number(e.target.value))}/>
   </label>
   <label><LocalizedUi value={"\u041E\u043A\u043D\u043E \u041A\u0422"}/><select value={window} onChange={e => setWindow(e.target.value as W)}>
       <LocalizedUi value={Object.entries(windows).map(([key, w]) => <option key={key} value={key}><LocalizedUi value={w.label}/></option>)}/>
     </select>
   </label>
   <label><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0442\u044C"}/><select value={reviewLayer} onChange={e => setReviewLayer(e.target.value as ReviewLayer)}>
       <option value="errors"><LocalizedUi value={"\u0421\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435 TP / FP / FN"}/></option>
       <option value="ct"><LocalizedUi value={"\u0422\u043E\u043B\u044C\u043A\u043E \u0438\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u041A\u0422 (\u0431\u0435\u0437 \u043C\u0430\u0441\u043E\u043A)"}/></option>
       <option value="prediction"><LocalizedUi value={"\u0422\u043E\u043B\u044C\u043A\u043E \u043C\u0430\u0441\u043A\u0430 SAMIHS \u043D\u0430 \u041A\u0422"}/></option>
       <option value="expert"><LocalizedUi value={"\u0422\u043E\u043B\u044C\u043A\u043E \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u0430\u044F \u043C\u0430\u0441\u043A\u0430 \u043D\u0430 \u041A\u0422"}/></option>
       <LocalizedUi value={subtypeFocus && <option value="subtype"><LocalizedUi value={"\u042D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0439"}/><LocalizedUi value={subtypeFocus.subtype}/><LocalizedUi value={"\u00B7 FN \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u0442\u0438\u043F\u0430"}/></option>}/>
     </select>
   </label>
   <label><LocalizedUi value={"\u041D\u0435\u043F\u0440\u043E\u0437\u0440\u0430\u0447\u043D\u043E\u0441\u0442\u044C \u043C\u0430\u0441\u043A\u0438:"}/><LocalizedUi value={opacity}/>%
     <input type="range" min="20" max="90" step="5" value={opacity} onChange={e => setOpacity(Number(e.target.value))}/>
   </label>
   <p><small><LocalizedUi value={"\u0410\u0432\u0442\u043E\u043A\u043E\u043D\u0442\u0440\u0430\u0441\u0442 \u0440\u0430\u0441\u0441\u0447\u0438\u0442\u0430\u043D \u0434\u043B\u044F \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E \u0441\u0440\u0435\u0437\u0430 \u0431\u0435\u0437 \u0434\u043E\u043F\u0443\u0449\u0435\u043D\u0438\u044F, \u0447\u0442\u043E \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F \u043F\u0438\u043A\u0441\u0435\u043B\u0435\u0439 \u0440\u0430\u0432\u043D\u044B HU. \u041F\u0440\u0435\u0434\u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044B\u0435 \u043E\u043A\u043D\u0430 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E\u0442 \u0435\u0434\u0438\u043D\u0438\u0446\u044B HU."}/></small></p>
   <p><span style={{ color: "#2fc58b" }}>■</span><LocalizedUi value={"\u0421\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0435 \u043E\u0431\u0435\u0438\u0445 \u043C\u0430\u0441\u043E\u043A (TP)"}/><LocalizedUi value={" · "}/><span style={{ color: "#ef6c62" }}>■</span><LocalizedUi value={"\u0422\u043E\u043B\u044C\u043A\u043E \u043C\u043E\u0434\u0435\u043B\u044C (FP)"}/><LocalizedUi value={" · "}/><span style={{ color: "#d7ad1c" }}>■</span><LocalizedUi value={"\u0422\u043E\u043B\u044C\u043A\u043E \u044D\u043A\u0441\u043F\u0435\u0440\u0442 (FN)"}/></p>
   <LocalizedUi value={reviewLayer === "subtype" && subtypeFocus && subtypeCounts &&
            <p role="status"><LocalizedUi value={"\u042D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0439"}/><LocalizedUi value={subtypeFocus.subtype}/><LocalizedUi value={"(\u043C\u0435\u0442\u043A\u0430"}/><LocalizedUi value={subtypeFocus.label}/><LocalizedUi value={"): \u043F\u0435\u0440\u0435\u043A\u0440\u044B\u0442\u043E \u0431\u0438\u043D\u0430\u0440\u043D\u043E\u0439 SAMIHS"}/><LocalizedUi value={subtypeCounts[0]}/><LocalizedUi value={"\u0432\u043E\u043A\u0441., \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E"}/><LocalizedUi value={subtypeCounts[1]}/><LocalizedUi value={"\u0432\u043E\u043A\u0441. \u043D\u0430 \u044D\u0442\u043E\u043C k-\u0441\u0440\u0435\u0437\u0435. \u0414\u0440\u0443\u0433\u0438\u0435 \u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0432\u043E\u043A\u0441\u0435\u043B\u0438 \u043C\u043E\u0434\u0435\u043B\u0438 \u043D\u0435 \u0441\u0447\u0438\u0442\u0430\u044E\u0442\u0441\u044F FP \u044D\u0442\u043E\u0433\u043E \u0442\u0438\u043F\u0430."}/></p>}/>
   <LocalizedUi value={reviewLayer !== "subtype" && counts && <p role="status"><LocalizedUi value={"\u041D\u0430 \u0442\u0435\u043A\u0443\u0449\u0435\u043C \u0441\u0440\u0435\u0437\u0435: TP"}/><LocalizedUi value={counts[0]}/>, FP <LocalizedUi value={counts[1]}/>,
     FN <LocalizedUi value={counts[2]}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439. \u042D\u0442\u043E \u043E\u0446\u0435\u043D\u043A\u0430 \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u044F \u043C\u0435\u0442\u043E\u043A, \u043D\u0435 \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0447\u0443\u0432\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C."}/></p>}/>
   <LocalizedUi value={loading && <p role="status"><LocalizedUi value={"\u0427\u0442\u0435\u043D\u0438\u0435 \u0438 \u0441\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E \u0441\u0440\u0435\u0437\u0430\u2026"}/></p>}/>
   <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
   <canvas ref={canvas} width={dimensions[0]} height={dimensions[1]} style={{ display: "block", width: "100%", maxWidth: 512,
            aspectRatio: dimensions[0] + "/" + dimensions[1], border: "1px solid #50665f" }}/>
   <LocalizedUi value={subtypeFocus && <p><small><LocalizedUi value={"\u042D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0439 \u0442\u0438\u043F \u043F\u043E\u043B\u0443\u0447\u0435\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u0438\u0437 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u043E\u0439 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u043E\u0439 \u043C\u043D\u043E\u0433\u043E\u043A\u043B\u0430\u0441\u0441\u043E\u0432\u043E\u0439 NIfTI-\u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0438. \u0411\u0438\u043D\u0430\u0440\u043D\u0430\u044F SAMIHS \u0441\u0430\u043C\u0430 \u043D\u0435 \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0451\u0442 IPH/IVH/SAH/SDH/EDH, \u0430 \u043D\u0430\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u043E\u0446\u0435\u043D\u0438\u0432\u0430\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0432\u043E\u043A\u0441\u0435\u043B\u044C\u043D\u043E\u0435 \u043F\u0435\u0440\u0435\u043A\u0440\u044B\u0442\u0438\u0435."}/></small></p>}/>
   <p><small><LocalizedUi value={"\u041F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0440\u0435\u0436\u0438\u043C\u0430 \u043E\u0442\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u0438 \u043E\u043A\u043D\u0430 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442 \u0443\u0436\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u044B\u0435 \u043F\u0438\u043A\u0441\u0435\u043B\u0438 \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E \u0441\u0440\u0435\u0437\u0430 \u0432 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u043F\u0430\u043C\u044F\u0442\u0438; \u0441\u043C\u0435\u043D\u0430 k \u0437\u0430\u043D\u043E\u0432\u043E \u0447\u0438\u0442\u0430\u0435\u0442 \u0444\u0430\u0439\u043B\u044B. \u041D\u0430\u0442\u0438\u0432\u043D\u0430\u044F \u043F\u043B\u043E\u0441\u043A\u043E\u0441\u0442\u044C k \u043D\u0435 \u0443\u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u0435\u043D\u0430 \u043A\u0430\u043A \u0440\u0430\u0434\u0438\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0430\u043A\u0441\u0438\u0430\u043B\u044C\u043D\u044B\u0439 \u0441\u0440\u0435\u0437. \u0412\u044B\u0432\u043E\u0434 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043A \u0432\u043E\u043A\u0441\u0435\u043B\u044C\u043D\u043E\u043C\u0443 \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u044E \u0434\u0432\u0443\u0445 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0445 \u043C\u0430\u0441\u043E\u043A; \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u0435 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u043C DICOM SOP UID, \u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u043D\u043E\u0441\u0442\u044C \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u043E\u0439 \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0438, \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043F\u0435\u0440\u0435\u0441\u0435\u0447\u0435\u043D\u0438\u044F \u0441 \u043E\u0431\u0443\u0447\u0435\u043D\u0438\u0435\u043C \u0438 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u043A\u0430\u0447\u0435\u0441\u0442\u0432\u043E \u043C\u043E\u0434\u0435\u043B\u0438 \u043D\u0435 \u0434\u043E\u043A\u0430\u0437\u0430\u043D\u044B."}/></small></p>
 </section>;
}
