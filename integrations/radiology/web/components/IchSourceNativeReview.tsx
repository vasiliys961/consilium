"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useRef, useState } from "react";
import type { IchAlternativeReport } from "../lib/ianpan-ich-report";
import { readNiftiCtHeader, verifyNiftiCtSource, renderNativeCtPlane, type NiftiCtSource, type NativeCtSlab } from "../lib/nifti-ct-review";
import { readVerifiedIchNativeSlice, validateIchSourceNativeGeometry, type SourceIchBox } from "../lib/ich-source-ct-visual";
type VerifiedSource = {
    file: File;
    source: NiftiCtSource;
    boxes: SourceIchBox[];
};
const WINDOWS = {
    brain: { label: "Мозговое окно · C 40 / W 80", center: 40, width: 80 },
    subdural: { label: "Широкое окно · C 80 / W 200", center: 80, width: 200 },
    bone: { label: "Костное окно · C 500 / W 2500", center: 500, width: 2500 },
} as const;
type Window = keyof typeof WINDOWS;
/** On-screen, original-voxel review of a separately authorized LOCAL NIfTI.
 * NO patient image transmission, no DICOM matching, no trained inference.
 */
export default function IchSourceNativeReview({ report }: {
    report: IchAlternativeReport;
}) {
    const __ui = useUiTranslator();
    const [verified, setVerified] = useState<VerifiedSource | null>(null);
    const [slab, setSlab] = useState<NativeCtSlab | null>(null);
    const [index, setIndex] = useState(0);
    const [windowKey, setWindowKey] = useState<Window>("brain");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [selectedPixel, setSelectedPixel] = useState<{
        x: number;
        y: number;
        value: number;
    } | null>(null);
    const serial = useRef(0);
    const inFlight = useRef<AbortController | null>(null);
    const canvas = useRef<HTMLCanvasElement | null>(null);
    const validatedSha = report.source.niftiSha256;
    useEffect(() => () => {
        serial.current++;
        inFlight.current?.abort();
    }, []);
    useEffect(() => {
        // The report may be replaced while the browser still holds old pixels.
        serial.current++;
        inFlight.current?.abort();
        setVerified(null);
        setSlab(null);
        setSelectedPixel(null);
        setError("");
    }, [report]);
    const openSource = async (file: File) => {
        const sequence = ++serial.current;
        inFlight.current?.abort();
        const controller = new AbortController();
        inFlight.current = controller;
        setVerified(null);
        setSlab(null);
        setSelectedPixel(null);
        setBusy(true);
        setError("");
        try {
            if (!file.name.toLowerCase().endsWith(".nii"))
                throw Error("Нужен исходный несжатый NIfTI-1 .nii, а не .nii.gz.");
            const source = await readNiftiCtHeader(file);
            await verifyNiftiCtSource(file, validatedSha, controller.signal);
            if (sequence !== serial.current || controller.signal.aborted)
                return;
            const boxes = validateIchSourceNativeGeometry(report, source);
            // Start at the highest-scoring source-bound specific-subtype box.
            const strongest = [...boxes].sort((a, b) => b.rawUncalibratedScore - a.rawUncalibratedScore)[0];
            setIndex(strongest?.modelSourceSliceIndex ?? Math.floor(source.dimensions[2] / 2));
            setVerified({ file, source, boxes });
        }
        catch (err) {
            if (sequence === serial.current && !controller.signal.aborted)
                setError(err instanceof Error ? err.message : "Исходная КТ не прошла проверку.");
        }
        finally {
            if (sequence === serial.current)
                setBusy(false);
        }
    };
    useEffect(() => {
        if (!verified) {
            setSlab(null);
            return;
        }
        const controller = new AbortController();
        setSlab(null);
        setSelectedPixel(null);
        void readVerifiedIchNativeSlice(verified.file, verified.source, validatedSha, index, controller.signal).then(s => {
            if (!controller.signal.aborted)
                setSlab(s);
        }).catch(err => {
            if (!controller.signal.aborted)
                setError(err instanceof Error ? err.message : "Не удалось открыть срез.");
        });
        return () => controller.abort();
    }, [verified, index, validatedSha]);
    useEffect(() => {
        if (!slab || !verified || !canvas.current)
            return;
        const canvasElement = canvas.current;
        const ctx = canvasElement.getContext("2d", { alpha: false });
        if (!ctx)
            return;
        const [nx, ny] = slab.dimensions;
        const scale = 384 / Math.max(nx, ny);
        const w = Math.max(1, Math.round(nx * scale));
        const h = Math.max(1, Math.round(ny * scale));
        const { center, width } = WINDOWS[windowKey];
        const rgba = renderNativeCtPlane(slab, "k", 0, w, h, center, width);
        canvasElement.width = w;
        canvasElement.height = h;
        ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
        const sameSlice = verified.boxes.filter(b => b.modelSourceSliceIndex === index);
        ctx.save();
        ctx.strokeStyle = "#df59a9";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]); // An unverified model proposal, NEVER a clinical contour.
        for (const b of sameSlice) {
            const [x0, y0, , x1, y1] = b.sourceVoxelBoundingBoxXYZ;
            ctx.strokeRect(x0 * w / nx, y0 * h / ny, (x1 - x0 + 1) * w / nx, (y1 - y0 + 1) * h / ny);
        }
        ctx.restore();
    }, [slab, verified, index, windowKey]);
    return <section style={{ marginTop: 12, padding: 12, border: "1px solid #83918d", borderRadius: 8 }} aria-label={__ui("\u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u041A\u0422 \u0438 \u043C\u043E\u0434\u0435\u043B\u044C\u043D\u044B\u0435 \u043E\u0431\u043B\u0430\u0441\u0442\u0438 \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u044F")}>
    <h4><LocalizedUi value={"\u041E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u041A\u0422-\u0432\u043E\u043A\u0441\u0435\u043B\u0438 \u00B7 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u044B\u0439 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440"}/></h4>
    <p><LocalizedUi value={"\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043C\u043E\u0436\u0435\u0442 \u043E\u0442\u043A\u0440\u044B\u0442\u044C"}/><strong><LocalizedUi value={"\u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0443\u044E \u043D\u0435\u0441\u0436\u0430\u0442\u0443\u044E NIfTI \u041A\u0422"}/></strong><LocalizedUi value={"\u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435. \u041F\u0435\u0440\u0435\u0434 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u043E\u043C \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442\u0441\u044F SHA-256 \u0432\u0441\u0435\u0433\u043E \u0444\u0430\u0439\u043B\u0430 \u0438 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u0435 \u0444\u0438\u0437\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u0438 \u043A\u0430\u0436\u0434\u043E\u0439 \u043C\u043E\u0434\u0435\u043B\u044C\u043D\u043E\u0439 \u043E\u0431\u043B\u0430\u0441\u0442\u0438 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u043C \u0432\u043E\u043A\u0441\u0435\u043B\u044F\u043C. \u041D\u0438\u043A\u0442\u043E \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u0442 \u041A\u0422 \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440; \u043D\u0435\u0439\u0440\u043E\u0441\u0435\u0442\u044C \u0437\u0434\u0435\u0441\u044C \u043D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F."}/></p>
    <label><LocalizedUi value={"\u041F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u0430\u044F \u0438\u0441\u0445\u043E\u0434\u043D\u0430\u044F CT NIfTI (.nii)"}/><input type="file" accept=".nii,application/octet-stream" disabled={busy} onChange={e => {
            const selected = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (selected)
                void openSource(selected);
        }}/>
    </label>
    <LocalizedUi value={busy && <p role="status"><LocalizedUi value={"\u0421\u0432\u0435\u0440\u043A\u0430 \u043F\u043E\u043B\u043D\u043E\u0433\u043E SHA-256 \u041A\u0422 \u0441 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0438\u043C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u043E\u043C \u043C\u043E\u0434\u0435\u043B\u0438\u2026"}/></p>}/>
    <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
    <LocalizedUi value={!verified ? <p><small><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u043E\u0435 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043E. \u0427\u0438\u0441\u043B\u043E\u0432\u044B\u0435 \u043D\u0430\u0445\u043E\u0434\u043A\u0438 \u0432\u044B\u0448\u0435 \u043D\u0435 \u043E\u0437\u043D\u0430\u0447\u0430\u044E\u0442 \u0434\u0438\u0430\u0433\u043D\u043E\u0437; \u043A\u0430\u0440\u0442\u0438\u043D\u043A\u0430 \u043D\u0435 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u0435\u0442\u0441\u044F \u0438\u0437 \u043E\u0434\u043D\u0438\u0445 \u043C\u043E\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u0440\u0430\u043C\u043E\u043A. \u041E\u0442\u043A\u0440\u044B\u0432\u0430\u0442\u044C \u0440\u0430\u0437\u0440\u0435\u0448\u0430\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435 \u0441 \u0442\u043E\u0447\u043D\u044B\u043C SHA-256 \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E \u043E\u0442\u0447\u0451\u0442\u0430."}/></small></p> : <div>
      <p role="status"><LocalizedUi value={"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0435 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 NIfTI \u041A\u0422 \u0438 \u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0439 \u043E\u0440\u0438\u0435\u043D\u0442\u0430\u0446\u0438\u0438"}/><LocalizedUi value={verified.boxes.length}/><LocalizedUi value={"\u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0445 \u043C\u043E\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u0440\u0430\u043C\u043E\u043A. \u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A:"}/><LocalizedUi value={verified.source.dimensions.join(" × ")}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439. DICOM SOP \u0438 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u044C \u043D\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u044B."}/></p>
      <label><LocalizedUi value={"\u041E\u043A\u043D\u043E \u041A\u0422"}/><select value={windowKey} onChange={e => setWindowKey(e.target.value as Window)}>
        <LocalizedUi value={Object.entries(WINDOWS).map(([k, w]) => <option key={k} value={k}><LocalizedUi value={w.label}/></option>)}/>
      </select></label>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0" }}>
        <button type="button" disabled={index <= 0} onClick={() => setIndex(v => v - 1)}><LocalizedUi value={"\u2190 \u0421\u0440\u0435\u0437"}/></button>
        <label><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u0441\u0440\u0435\u0437"}/><LocalizedUi value={index + 1}/>/<LocalizedUi value={verified.source.dimensions[2]}/>
          <input type="range" min={0} max={verified.source.dimensions[2] - 1} value={index} onChange={e => setIndex(Number(e.target.value))}/>
        </label>
        <button type="button" disabled={index >= verified.source.dimensions[2] - 1} onClick={() => setIndex(v => v + 1)}><LocalizedUi value={"\u0421\u0440\u0435\u0437 \u2192"}/></button>
      </div>
      <canvas ref={canvas} aria-label={__ui("\u041E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u043D\u0430\u0442\u0438\u0432\u043D\u044B\u0439 NIfTI \u0441\u0440\u0435\u0437 \u0441 \u043F\u0443\u043D\u043A\u0442\u0438\u0440\u043D\u044B\u043C\u0438 \u043E\u0431\u043B\u0430\u0441\u0442\u044F\u043C\u0438 \u043C\u043E\u0434\u0435\u043B\u0438")} onClick={e => {
                if (!slab)
                    return;
                const rect = e.currentTarget.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0)
                    return;
                const [nx, ny] = slab.dimensions;
                const x = Math.max(0, Math.min(nx - 1, Math.floor((e.clientX - rect.left) * nx / rect.width)));
                const y = Math.max(0, Math.min(ny - 1, Math.floor((e.clientY - rect.top) * ny / rect.height)));
                setSelectedPixel({ x, y, value: slab.pixels[x + y * nx] });
            }} style={{ display: "block", width: "100%", maxWidth: 384, height: "auto",
                aspectRatio: "1 / 1", imageRendering: "auto", border: "1px solid #777",
                margin: "10px 0", cursor: "crosshair" }}/>
      <LocalizedUi value={selectedPixel && <p role="status"><LocalizedUi value={"\u0412\u043E\u043A\u0441\u0435\u043B\u044C"}/><LocalizedUi value={" "}/><LocalizedUi value={selectedPixel.x}/>/<LocalizedUi value={selectedPixel.y}/>/<LocalizedUi value={index}/><LocalizedUi value={"\u00B7 \u0438\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u0438\u043D\u0442\u0435\u043D\u0441\u0438\u0432\u043D\u043E\u0441\u0442\u044C"}/><LocalizedUi value={selectedPixel.value.toFixed(1)}/><LocalizedUi value={"(HU-\u043F\u043E\u0434\u043E\u0431\u043D\u0430\u044F, \u0440\u0435\u0441\u043A\u0435\u0439\u043B \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u043E\u0433\u043E DICOM \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E \u043D\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D)."}/></p>}/>
      <p><small><LocalizedUi value={"\u041F\u0443\u0440\u043F\u0443\u0440\u043D\u044B\u0439 \u043F\u0443\u043D\u043A\u0442\u0438\u0440 \u2014 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0438\u0432\u0430\u044E\u0449\u0430\u044F \u043E\u0431\u043B\u0430\u0441\u0442\u044C \u043C\u043E\u0434\u0435\u043B\u0438 \u043D\u0430 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u043E\u043C \u0441\u0440\u0435\u0437\u0435, \u041D\u0415 \u043A\u043E\u043D\u0442\u0443\u0440 \u043A\u0440\u043E\u0432\u0438, \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0439 \u0434\u0438\u0430\u0433\u043D\u043E\u0437 \u0438 \u043D\u0435 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u0430\u044F \u043C\u0430\u0441\u043A\u0430. \u041E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u043C\u0430\u0441\u043A\u0438 \u043F\u0435\u0440\u0438\u0444\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u043E\u0442\u0451\u043A\u0430 \u043D\u0435\u043B\u044C\u0437\u044F \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u043A\u0430\u043A \u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u043D\u0443\u044E \u0441\u0435\u0433\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u044E \u043A\u0440\u043E\u0432\u043E\u0438\u0437\u043B\u0438\u044F\u043D\u0438\u044F. \u041D\u0430\u0442\u0438\u0432\u043D\u0430\u044F \u0438\u043D\u0434\u0435\u043A\u0441\u043D\u0430\u044F \u043E\u0440\u0438\u0435\u043D\u0442\u0430\u0446\u0438\u044F \u043D\u0435 \u0433\u0430\u0440\u0430\u043D\u0442\u0438\u0440\u0443\u0435\u0442 \u0440\u0430\u0434\u0438\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043F\u043E\u0440\u044F\u0434\u043E\u043A."}/></small></p>
      <button type="button" onClick={() => {
                serial.current++;
                inFlight.current?.abort();
                setVerified(null);
                setSlab(null);
                setSelectedPixel(null);
            }}><LocalizedUi value={"\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0443\u044E \u0438\u0441\u0445\u043E\u0434\u043D\u0443\u044E \u041A\u0422"}/></button>
    </div>}/>
  </section>;
}
