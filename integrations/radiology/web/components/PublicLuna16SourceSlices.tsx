"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useMemo, useRef, useState } from "react";
import { projectMonaiCandidateHypothesis, projectMonaiCandidateBoundingBox, type MonaiCandidate } from "../lib/monai-public-candidate-projection";
import { sha256 } from "@noble/hashes/sha2.js";
import { sourceClickToMetaImagePoint, type SourceClickPoint } from "../lib/metaimage-physician-point";
type Geometry = {
    dimensions: number[];
    spacingMm: number[];
    origin: number[];
    directionMatrix: number[][];
};
type Reference = {
    referenceNodules: Array<{
        centerMm: number[];
        diameterMm: number;
        nativeVoxelIndex: number[];
        sliceIndex0Based: number;
    }>;
    sourceGeometry: Geometry;
};
type Preset = "lung" | "soft_tissue" | "bone";
const windows: Record<Preset, {
    center: number;
    width: number;
    label: string;
}> = {
    lung: { center: -600, width: 1500, label: "Лёгочное" },
    soft_tissue: { center: 40, width: 400, label: "Мягкие ткани" },
    bone: { center: 400, width: 1800, label: "Костное" },
};
const RAW_URL = "https://huggingface.co/datasets/Yousra0x0/LUNA16_RAW/resolve/af8fdf04c27dcaa97ccfd755043d8096299d6a40/subset0/1.3.6.1.4.1.14519.5.2.1.6279.6001.395623571499047043765181005112.raw";
/** Displays ONLY hash-matched, browser-local, public LUNA16 native source pixels.
 * The fixed independently audited MONAI world-LPS→MetaImage transform is allowed
 * only after caller validates the separate genuine-centroid comparison artifact.
 * Research source overlay is NOT a DICOM SOP registration or clinical TP.
 */
export default function PublicLuna16SourceSlices({ reference, rawSha256, candidates = [], sourceGeometryVerified = false, }: {
    reference: Reference;
    rawSha256: string;
    candidates?: MonaiCandidate[];
    sourceGeometryVerified?: boolean;
}) {
    const __ui = useUiTranslator();
    const canvas = useRef<HTMLCanvasElement | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [validating, setValidating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [slice, setSlice] = useState(reference.referenceNodules[0].sliceIndex0Based);
    const [preset, setPreset] = useState<Preset>("lung");
    const [error, setError] = useState("");
    const [displayError, setDisplayError] = useState("");
    const [manualPoint, setManualPoint] = useState<SourceClickPoint | null>(null);
    const [selectedCandidateIndex, setSelectedCandidateIndex] = useState<number | null>(null);
    const [showHypotheses, setShowHypotheses] = useState(false);
    const [showModelBox, setShowModelBox] = useState(true);
    const g = reference.sourceGeometry;
    const [w, h, depth] = g.dimensions;
    const nodule = reference.referenceNodules[0];
    const expectedBytes = w * h * depth * 2;
    // Do not evaluate a model-to-source frame hypothesis as established geometry.
    // The projection is for an explicitly labelled research visual check only.
    const hypotheses = useMemo(() => candidates.flatMap(candidate => {
        const projected = projectMonaiCandidateHypothesis(g, candidate);
        return projected ? [projected] : [];
    }), [candidates, g]);
    const selectedHypothesis = hypotheses.find(c => c.candidateIndex === selectedCandidateIndex);
    const projected3dBoxes = useMemo(() => candidates.flatMap(candidate => {
        const box = projectMonaiCandidateBoundingBox(g, candidate);
        return box ? [box] : [];
    }), [candidates, g]);
    const selectedModelBox = projected3dBoxes.find(c => c.candidateIndex === selectedCandidateIndex);
    async function load(fileCandidate: File) {
        setFile(null);
        setManualPoint(null);
        setValidating(true);
        setError("");
        setProgress(0);
        setDisplayError("");
        try {
            if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 2 ||
                fileCandidate.size !== expectedBytes)
                throw Error("Размер RAW не соответствует исходному публичному объёму.");
            if (!/^[0-9a-f]{64}$/.test(rawSha256))
                throw Error("Нет проверенного SHA-256 публичных пикселей.");
            const digest = sha256.create();
            for (let offset = 0; offset < fileCandidate.size; offset += 2 * 1024 * 1024) {
                const block = new Uint8Array(await fileCandidate.slice(offset, Math.min(offset + 2 * 1024 * 1024, fileCandidate.size)).arrayBuffer());
                digest.update(block);
                setProgress(Math.round(100 * Math.min(offset + block.byteLength, fileCandidate.size) / fileCandidate.size));
            }
            const actual = Array.from(digest.digest(), v => v.toString(16).padStart(2, "0")).join("");
            if (actual !== rawSha256)
                throw Error("SHA-256 RAW не совпадает с публичным исходником. Пиксели не будут отображены.");
            setSlice(nodule.sliceIndex0Based);
            setFile(fileCandidate);
            if (sourceGeometryVerified && hypotheses.length) {
                // Candidate #0 is the highest-scoring real positive-case proposal;
                // display it on its true source slice alongside expert reference.
                const top = [...hypotheses].sort((a, b) => b.rawUncalibratedScore - a.rawUncalibratedScore)[0];
                setSelectedCandidateIndex(top.candidateIndex);
                setShowHypotheses(true);
                setSlice(top.sourceSliceIndexHypothesis);
            }
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Не удалось открыть публичную КТ.");
        }
        finally {
            setValidating(false);
        }
    }
    useEffect(() => {
        if (!file)
            return;
        const target = canvas.current;
        const context = target?.getContext("2d", { alpha: false });
        if (!context) {
            setDisplayError("Canvas 2D не поддерживается.");
            return;
        }
        let cancelled = false;
        const index = Math.max(0, Math.min(depth - 1, slice));
        const bytesPerSlice = w * h * 2;
        const start = bytesPerSlice * index;
        file.slice(start, start + bytesPerSlice).arrayBuffer().then(data => {
            if (cancelled)
                return;
            if (data.byteLength !== bytesPerSlice)
                throw Error("Неполный исходный срез.");
            const pixels = new DataView(data);
            const output = context.createImageData(w, h);
            const { center, width } = windows[preset], low = center - width / 2;
            for (let i = 0; i < w * h; i++) {
                const value = pixels.getInt16(i * 2, true);
                const grey = Math.round(Math.max(0, Math.min(255, (value - low) * 255 / width)));
                const offset = i * 4;
                output.data[offset] = grey;
                output.data[offset + 1] = grey;
                output.data[offset + 2] = grey;
                output.data[offset + 3] = 255;
            }
            context.putImageData(output, 0, 0);
            const dz = Math.abs(index - nodule.nativeVoxelIndex[2]) * g.spacingMm[2];
            if (dz <= nodule.diameterMm / 2) {
                const radiusMm = Math.sqrt(Math.max(0, (nodule.diameterMm / 2) ** 2 - dz ** 2));
                context.save();
                context.beginPath();
                context.strokeStyle = "#ffbe4a";
                context.lineWidth = 1.5;
                context.ellipse(nodule.nativeVoxelIndex[0], nodule.nativeVoxelIndex[1], Math.max(2, radiusMm / g.spacingMm[0]), Math.max(2, radiusMm / g.spacingMm[1]), 0, 0, 2 * Math.PI);
                context.stroke();
                context.restore();
            }
            if (showHypotheses && showModelBox && selectedModelBox &&
                index >= selectedModelBox.sourceSliceIndexRangeInclusive[0] &&
                index <= selectedModelBox.sourceSliceIndexRangeInclusive[1]) {
                const [x0, y0, , x1, y1] = selectedModelBox.nativeVoxelBoundingEnvelopeXYZ;
                context.save();
                context.strokeStyle = "#f36cce";
                context.lineWidth = 1.7;
                context.setLineDash(sourceGeometryVerified ? [] : [5, 3]);
                context.strokeRect(x0, y0, x1 - x0, y1 - y0);
                context.restore();
            }
            if (showHypotheses && selectedHypothesis && selectedHypothesis.sourceSliceIndexHypothesis === index) {
                const [px, py] = selectedHypothesis.nativeVoxelIndexHypothesis;
                context.save();
                context.strokeStyle = "#f36cce";
                context.lineWidth = 2;
                context.setLineDash(sourceGeometryVerified ? [] : [5, 3]);
                context.beginPath();
                context.moveTo(px - 12, py);
                context.lineTo(px + 12, py);
                context.moveTo(px, py - 12);
                context.lineTo(px, py + 12);
                context.stroke();
                context.restore();
            }
            if (manualPoint && manualPoint.index3d[2] === index) {
                const [x, y] = manualPoint.index3d;
                context.save();
                context.strokeStyle = "#17e4ce";
                context.lineWidth = 2;
                context.beginPath();
                context.moveTo(x - 9, y);
                context.lineTo(x + 9, y);
                context.moveTo(x, y - 9);
                context.lineTo(x, y + 9);
                context.stroke();
                context.restore();
            }
            setDisplayError("");
        }).catch(e => {
            if (!cancelled)
                setDisplayError(e instanceof Error ? e.message : "Срез не читается.");
        });
        return () => { cancelled = true; };
    }, [file, slice, preset, w, h, depth, nodule.nativeVoxelIndex, nodule.diameterMm, g.spacingMm, manualPoint, showHypotheses, selectedHypothesis, selectedModelBox, showModelBox, sourceGeometryVerified]);
    return <section aria-label={__ui("\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0435 \u043F\u0438\u043A\u0441\u0435\u043B\u0438 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0439 \u041A\u0422 LUNA16")} style={{ border: "1px solid #778c86", padding: 12, borderRadius: 8, margin: "12px 0" }}>
    <h4><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0435 \u043F\u0438\u043A\u0441\u0435\u043B\u0438 \u041A\u0422 \u00B7 LUNA16"}/></h4>
    <p><LocalizedUi value={"\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0435\u0433\u043E \u0441\u0440\u0435\u0437\u0430 MetaImage, \u0430 \u043D\u0435 \u043C\u043E\u0434\u0435\u043B\u0438 \u0438 \u043D\u0435 \u0441\u0438\u043D\u0442\u0435\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F. \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435"}/><a href={RAW_URL} target="_blank" rel="noopener noreferrer"><LocalizedUi value={"\u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u044B\u0439 .raw"}/></a>
      <LocalizedUi value={" "}/>(<LocalizedUi value={(expectedBytes / 1048576).toFixed(1)}/><LocalizedUi value={"\u041C\u0438\u0411). \u0422\u043E\u043B\u044C\u043A\u043E \u0442\u043E\u0447\u043D\u043E\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0435 SHA-256 \u0440\u0430\u0437\u0440\u0435\u0448\u0430\u0435\u0442 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440."}/></p>
    <label><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0439 \u0444\u0430\u0439\u043B .raw (\u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442\u0441\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E)"}/><input type="file" accept=".raw,application/octet-stream" disabled={validating} onChange={e => {
            const selected = e.target.files?.[0];
            e.currentTarget.value = "";
            if (selected)
                void load(selected);
        }}/>
    </label>
    <LocalizedUi value={validating && <p role="status"><LocalizedUi value={"\u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043F\u043E\u0434\u043B\u0438\u043D\u043D\u043E\u0441\u0442\u0438 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u043F\u0438\u043A\u0441\u0435\u043B\u0435\u0439:"}/><LocalizedUi value={progress}/>%</p>}/>
    <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
    <LocalizedUi value={file && <>
      <p role="status"><LocalizedUi value={"\u041F\u043E\u043B\u043D\u044B\u0439 SHA-256 \u0441\u043E\u0432\u043F\u0430\u043B. \u041F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u0442\u043E\u043B\u044C\u043A\u043E \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435; \u043F\u0438\u043A\u0441\u0435\u043B\u0438 \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u044E\u0442\u0441\u044F \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440."}/></p>
      <label><LocalizedUi value={"\u0421\u0440\u0435\u0437"}/><LocalizedUi value={slice + 1}/><LocalizedUi value={"\u0438\u0437"}/><LocalizedUi value={depth}/>
        <input type="range" min="0" max={depth - 1} step="1" value={slice} onChange={e => setSlice(Number(e.target.value))}/>
      </label>
      <button type="button" onClick={() => setSlice(nodule.sliceIndex0Based)}><LocalizedUi value={"\u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u044D\u0442\u0430\u043B\u043E\u043D\u043D\u043E\u043C\u0443 \u0443\u0437\u043B\u0443"}/></button>
      <div style={{ margin: "12px 0", padding: 10, border: "1px dashed #c17eac", borderRadius: 8 }}>
        <strong><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u044B \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0435\u0439 MONAI \u00B7 \u044D\u043A\u0441\u043F\u0435\u0440\u0438\u043C\u0435\u043D\u0442\u0430\u043B\u044C\u043D\u0430\u044F \u043B\u043E\u043A\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F"}/></strong>
        <LocalizedUi value={sourceGeometryVerified ?
                <p role="note"><strong><LocalizedUi value={"\u0421\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u0438 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E \u0434\u043B\u044F \u044D\u0442\u043E\u0439 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0439 \u041A\u0422."}/></strong><LocalizedUi value={"\u041F\u0443\u0440\u043F\u0443\u0440\u043D\u044B\u0439"}/><strong><LocalizedUi value={"\u0441\u043F\u043B\u043E\u0448\u043D\u043E\u0439"}/></strong><LocalizedUi value={"\u043A\u0440\u0435\u0441\u0442 \u2014 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0438\u0439 \u0446\u0435\u043D\u0442\u0440, \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u043D\u044B\u0439 MONAI \u0438 \u043F\u0435\u0440\u0435\u0441\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u0439 \u0438\u0437 world LPS \u0432 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0439 MetaImage. \u041F\u0443\u0440\u043F\u0443\u0440\u043D\u0430\u044F \u043F\u0440\u044F\u043C\u043E\u0443\u0433\u043E\u043B\u044C\u043D\u0430\u044F \u0440\u0430\u043C\u043A\u0430 \u2014 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u0435 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u043E\u0433\u043E 3D-\u0431\u043E\u043A\u0441\u0430 \u043C\u043E\u0434\u0435\u043B\u0438 \u043D\u0430 \u043A\u0430\u0436\u0434\u043E\u043C \u043F\u0435\u0440\u0435\u0441\u0435\u043A\u0430\u0435\u043C\u043E\u043C \u0441\u0440\u0435\u0437\u0435, \u043D\u043E \u041D\u0415 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u043D\u044B\u0439 \u043A\u043E\u043D\u0442\u0443\u0440 \u0443\u0437\u043B\u0430. \u041E\u0440\u0430\u043D\u0436\u0435\u0432\u043E\u0435 \u043A\u043E\u043B\u044C\u0446\u043E \u2014 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0439 \u0446\u0435\u043D\u0442\u0440 \u0438 \u0434\u0438\u0430\u043C\u0435\u0442\u0440. \u0421\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0435 \u0446\u0435\u043D\u0442\u0440\u043E\u0432 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043E \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u043C GitHub Actions \u043F\u043E SHA-256 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u043E\u0432 \u0438 \u043F\u043E\u0434\u043B\u0438\u043D\u043D\u043E\u043C\u0443 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0443 \u043C\u043E\u0434\u0435\u043B\u0438. \u042D\u0442\u043E \u043D\u0435 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0439 \u043A\u043E\u043D\u0442\u0443\u0440, \u043D\u0435 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u044B\u0439 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0442\u0435\u0441\u0442 \u0438 \u043D\u0435 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0441\u043A\u0438\u0439 \u0434\u0438\u0430\u0433\u043D\u043E\u0437."}/></p> :
                <p role="alert"><LocalizedUi value={"\u041F\u0443\u0440\u043F\u0443\u0440\u043D\u044B\u0439 \u043F\u0443\u043D\u043A\u0442\u0438\u0440 \u2014 \u0442\u043E\u043B\u044C\u043A\u043E"}/><strong><LocalizedUi value={"\u043D\u0435\u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u0430\u044F \u0433\u0438\u043F\u043E\u0442\u0435\u0437\u0430"}/></strong><LocalizedUi value={"\u043F\u043E\u043B\u043E\u0436\u0435\u043D\u0438\u044F MONAI world \u0432 \u0444\u0438\u0437\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0441\u0438\u0441\u0442\u0435\u043C\u0435 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 MetaImage. \u041E\u0440\u0430\u043D\u0436\u0435\u0432\u043E\u0435 \u043A\u043E\u043B\u044C\u0446\u043E \u2014 \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u043D\u0430\u044F \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u0430\u044F \u0430\u043D\u043D\u043E\u0442\u0430\u0446\u0438\u044F, \u043D\u0435 \u043F\u0440\u0435\u0434\u0441\u043A\u0430\u0437\u0430\u043D\u043D\u0430\u044F \u043C\u0430\u0441\u043A\u0430. \u0411\u043B\u0438\u0437\u043E\u0441\u0442\u044C \u043C\u0435\u0442\u043E\u043A \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442 TP."}/></p>}/>
        <LocalizedUi value={hypotheses.length === 0 ? <p><LocalizedUi value={"\u041D\u0438 \u043E\u0434\u0438\u043D \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442 \u043D\u0435 \u043F\u0440\u043E\u0435\u0446\u0438\u0440\u0443\u0435\u0442\u0441\u044F \u0432\u043D\u0443\u0442\u0440\u044C \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E \u043E\u0431\u044A\u0451\u043C\u0430; \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u043E."}/></p> :
                hypotheses.map(h => <button key={h.candidateIndex} type="button" style={{ margin: 4 }} onClick={() => { setSelectedCandidateIndex(h.candidateIndex); setShowHypotheses(true); setSlice(h.sourceSliceIndexHypothesis); }}><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442"}/><LocalizedUi value={h.candidateIndex + 1}/><LocalizedUi value={"\u00B7 \u0441\u0440\u0435\u0437"}/><LocalizedUi value={h.sourceSliceIndexHypothesis + 1}/> <LocalizedUi value={sourceGeometryVerified ? "(проверенная физическая геометрия)" : "(гипотеза)"}/> · score <LocalizedUi value={h.rawUncalibratedScore.toFixed(3)}/>
        </button>)}/>
        <LocalizedUi value={showHypotheses && <button type="button" onClick={() => { setShowHypotheses(false); setSelectedCandidateIndex(null); }}><LocalizedUi value={"\u0421\u043A\u0440\u044B\u0442\u044C \u0446\u0435\u043D\u0442\u0440 MONAI"}/></button>}/>
        <LocalizedUi value={showHypotheses && selectedModelBox && <label style={{ display: "block", marginTop: 8 }}>
          <input type="checkbox" checked={showModelBox} onChange={e => setShowModelBox(e.target.checked)}/>
          <LocalizedUi value={" "}/><LocalizedUi value={"\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043E\u0431\u044A\u0451\u043C\u043D\u0443\u044E \u0440\u0430\u043C\u043A\u0443 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0430 MONAI \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u0430\u0445"}/></label>}/>
        <LocalizedUi value={showHypotheses && selectedModelBox && <p><small><LocalizedUi value={"\u0418\u0441\u0442\u0438\u043D\u043D\u044B\u0439 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 3D-\u0431\u043E\u043A\u0441 \u043C\u043E\u0434\u0435\u043B\u0438 \u043F\u0440\u0435\u043E\u0431\u0440\u0430\u0437\u043E\u0432\u0430\u043D \u0438\u0437 world LPS \u0432 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0435 \u0432\u043E\u043A\u0441\u0435\u043B\u0438 CT; \u0438\u043D\u0442\u0435\u0440\u0432\u0430\u043B \u0441\u0440\u0435\u0437\u043E\u0432"}/><LocalizedUi value={" "}/>
          <LocalizedUi value={selectedModelBox.sourceSliceIndexRangeInclusive[0] + 1}/>–<LocalizedUi value={selectedModelBox.sourceSliceIndexRangeInclusive[1] + 1}/>.
          <LocalizedUi value={selectedModelBox.truncatedBySourceVolume ? " Часть области за пределами исходной КТ обрезана." : ""}/>
          <LocalizedUi value={" "}/><LocalizedUi value={"\u041F\u0440\u044F\u043C\u043E\u0443\u0433\u043E\u043B\u044C\u043D\u0438\u043A \u2014 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0438\u0432\u0430\u044E\u0449\u0430\u044F \u0440\u0430\u043C\u043A\u0430 \u043C\u043E\u0434\u0435\u043B\u044C\u043D\u043E\u0433\u043E \u0431\u043E\u043A\u0441\u0430, \u043D\u0435 \u0433\u0440\u0430\u043D\u0438\u0446\u044B \u0443\u0437\u043B\u0430 \u043F\u043E \u041A\u0422, \u043D\u0435 \u0434\u0438\u0430\u043C\u0435\u0442\u0440, \u043D\u0435 \u043C\u0430\u0441\u043A\u0430 \u0438 \u043D\u0435 \u0440\u0430\u0441\u0441\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u0439 \u043E\u0431\u044A\u0451\u043C."}/><LocalizedUi value={sourceGeometryVerified ?
                    " Для этой публичной КТ исходная физическая геометрия подтверждена." :
                    " Проекция пока гипотетическая; используется пунктир."}/>
        </small></p>}/>
        <p><small><LocalizedUi value={"\u0426\u0435\u043D\u0442\u0440 \u0438 \u043E\u0431\u044A\u0451\u043C\u043D\u0430\u044F \u0440\u0430\u043C\u043A\u0430 \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u044E\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u0430\u0445 \u043F\u043E\u0441\u043B\u0435 \u043F\u043E\u043B\u043D\u043E\u0439 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 SHA-256 \u043F\u0438\u043A\u0441\u0435\u043B\u0435\u0439."}/><LocalizedUi value={sourceGeometryVerified ?
                "Геометрия модели к публичной MetaImage проверена по оригинальному исходному коду MONAI и контрольной разметке. Клинические TP/FP/FN, Dice и диагностические заключения не вычислялись." :
                "Привязка к исходной системе MONAI не проверена; клиническая оценка невозможна."}/></small></p>
      </div>
      <label><LocalizedUi value={"\u041E\u043A\u043D\u043E \u041A\u0422"}/><select value={preset} onChange={e => setPreset(e.target.value as Preset)}>
          <LocalizedUi value={Object.entries(windows).map(([key, item]) => <option key={key} value={key}><LocalizedUi value={item.label}/></option>)}/>
        </select>
      </label>
      <p><strong><LocalizedUi value={"\u0420\u0443\u0447\u043D\u0430\u044F \u043B\u043E\u043A\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F \u043D\u0430 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u041A\u0422:"}/></strong><LocalizedUi value={"\u043D\u0430\u0436\u043C\u0438\u0442\u0435 \u043D\u0430 \u043F\u043E\u0434\u043E\u0437\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u0443\u044E \u043E\u0431\u043B\u0430\u0441\u0442\u044C \u043D\u0430 \u0441\u0440\u0435\u0437\u0435. \u0411\u0438\u0440\u044E\u0437\u043E\u0432\u044B\u0439 \u043A\u0440\u0435\u0441\u0442 \u043E\u0431\u043E\u0437\u043D\u0430\u0447\u0438\u0442 \u0442\u043E\u0447\u043A\u0443, \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u0443\u044E \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u043E\u043C, \u0430 \u043D\u0435 \u043D\u0435\u0439\u0440\u043E\u0441\u0435\u0442\u044C\u044E."}/></p>
      <canvas ref={canvas} width={w} height={h} onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0)
                    return;
                const x = Math.floor((e.clientX - rect.left) * w / rect.width);
                const y = Math.floor((e.clientY - rect.top) * h / rect.height);
                try {
                    setManualPoint(sourceClickToMetaImagePoint(rawSha256, g, [x, y, slice]));
                    setDisplayError("");
                }
                catch (err) {
                    setDisplayError(err instanceof Error ? err.message : "Неверная ручная точка.");
                }
            }} style={{ width: "100%", maxWidth: 512, aspectRatio: w + "/" + h,
                display: "block", margin: "10px 0", imageRendering: "auto", border: "1px solid #666", cursor: "crosshair" }}/>
      <LocalizedUi value={manualPoint && <div>
        <p><strong><LocalizedUi value={"\u0422\u043E\u0447\u043A\u0430 \u0432\u0440\u0430\u0447\u0430:"}/></strong><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u044C"}/><LocalizedUi value={manualPoint.index3d.join(" / ")}/><LocalizedUi value={"; \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u044B MetaImage"}/><LocalizedUi value={manualPoint.metaImagePhysicalMm.map(x => x.toFixed(2)).join(" / ")}/><LocalizedUi value={"\u043C\u043C."}/></p>
        <p role="note"><LocalizedUi value={"\u0424\u0438\u0437\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u044B MetaImage \u043D\u0435 \u0443\u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u0435\u043D\u044B \u043A\u0430\u043A DICOM LPS. \u0421\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0435 \u0441 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u043C MONAI \u043D\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E; \u0442\u043E\u0447\u043A\u0430 \u043D\u0435 \u043E\u0437\u043D\u0430\u0447\u0430\u0435\u0442 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F \u0434\u0438\u0430\u0433\u043D\u043E\u0437\u0430."}/></p>
        <button type="button" onClick={() => setSlice(manualPoint.index3d[2])}><LocalizedUi value={"\u0412\u0435\u0440\u043D\u0443\u0442\u044C\u0441\u044F \u043A \u043E\u0442\u043C\u0435\u0447\u0435\u043D\u043D\u043E\u043C\u0443 \u0441\u0440\u0435\u0437\u0443"}/></button><LocalizedUi value={" "}/>
        <button type="button" onClick={() => {
                    const payload = new Blob([JSON.stringify(manualPoint, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(payload);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "opus-luna16-manual-source-point.json";
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}><LocalizedUi value={"\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u0440\u0443\u0447\u043D\u0443\u044E \u0442\u043E\u0447\u043A\u0443 \u0441 SHA-256 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0430"}/></button><LocalizedUi value={" "}/>
        <button type="button" onClick={() => setManualPoint(null)}><LocalizedUi value={"\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0440\u0443\u0447\u043D\u0443\u044E \u0442\u043E\u0447\u043A\u0443"}/></button>
      </div>}/>
      <LocalizedUi value={displayError && <p role="alert"><LocalizedUi value={displayError}/></p>}/>
      <p><small><LocalizedUi value={"\u041E\u0440\u0430\u043D\u0436\u0435\u0432\u044B\u0439 \u044D\u043B\u043B\u0438\u043F\u0441 \u2014 \u0443\u0441\u043B\u043E\u0432\u043D\u0430\u044F \u0441\u0444\u0435\u0440\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0432\u0438\u0437\u0443\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F \u043F\u043E \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u043D\u044B\u043C \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u043C \u0446\u0435\u043D\u0442\u0440\u0443 \u0438 \u0434\u0438\u0430\u043C\u0435\u0442\u0440\u0443; \u044D\u0442\u043E \u043D\u0435 \u043D\u0430\u0440\u0438\u0441\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u0440\u0430\u0434\u0438\u043E\u043B\u043E\u0433\u043E\u043C \u043A\u043E\u043D\u0442\u0443\u0440 \u0438 \u043D\u0435 \u0441\u0435\u0433\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u044F, \u044D\u0442\u043E \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0439 \u043A\u043E\u043D\u0442\u0443\u0440 MONAI. \u041F\u0443\u0440\u043F\u0443\u0440\u043D\u044B\u0439 \u043A\u0440\u0435\u0441\u0442 \u2014 \u043B\u043E\u043A\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u0430 \u043D\u0435\u0439\u0440\u043E\u0441\u0435\u0442\u0438, \u043D\u0435 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0439 \u043A\u043E\u043D\u0442\u0443\u0440 \u0438 \u043D\u0435 \u0434\u0438\u0430\u0433\u043D\u043E\u0437. \u041E\u0440\u0438\u0435\u043D\u0442\u0430\u0446\u0438\u044F \u2014 \u043D\u0430\u0442\u0438\u0432\u043D\u044B\u0439 \u043F\u043E\u0440\u044F\u0434\u043E\u043A \u0441\u0442\u0440\u043E\u043A RAW, \u043D\u0435 \u0440\u0430\u0434\u0438\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0441\u0442\u0430\u043D\u0434\u0430\u0440\u0442."}/><LocalizedUi value={sourceGeometryVerified ?
                "MONAI→MetaImage world LPS геометрия подтверждена на этом публичном исследовании. Подлинные пациентские DICOM/SOP UID не установлены." :
                "Геометрия MONAI→исходная КТ и DICOM/SOP UID не подтверждена."}/></small></p>
    </>}/>
  </section>;
}
