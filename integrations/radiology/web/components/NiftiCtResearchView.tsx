"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useRef, useState } from "react";
import { readNiftiMaskFile, type LabelMask } from "../lib/segmentation-mask";
import { sha256 } from "../lib/analysis-package";
import { parseResearchAnatomy, type AnatomyProof } from "../lib/totalseg-abdomen-import";
import { buildResearchAnatomyRegions, type LobeRegion } from "../lib/totalseg-lobe-navigation";
import { readNiftiCtHeader, loadNativeCtSlab, assertSameNativeIndexGrid, renderNativeCtPlane, type IndexPlane, type NativeCtSlab } from "../lib/nifti-ct-review";
type Opened = {
    slab: NativeCtSlab;
    mask: LabelMask;
    proof: AnatomyProof;
    regions: LobeRegion[];
};
const PLANES: [
    IndexPlane,
    string,
    number,
    number
][] = [
    ["k", "Ось k · индексный срез", 0, 1],
    ["j", "Ось j · индексный срез", 0, 2],
    ["i", "Ось i · индексный срез", 1, 2],
];
function canvasSize(slab: NativeCtSlab, a: number, b: number): [
    number,
    number
] {
    const dims = slab.dimensions;
    const mm = (axis: number) => Math.hypot(slab.affineLps[axis], slab.affineLps[4 + axis], slab.affineLps[8 + axis]);
    const x = dims[a] * mm(a), y = dims[b] * mm(b);
    const scale = 320 / Math.max(x, y);
    return [Math.max(1, Math.round(x * scale)), Math.max(1, Math.round(y * scale))];
}
function NativeSlice({ study, plane, coord, center, width, label, opacity }: {
    study: Opened;
    plane: IndexPlane;
    coord: number;
    center: number;
    width: number;
    label: number | null;
    opacity: number;
}) {
    const __ui = useUiTranslator();
    const ref = useRef<HTMLCanvasElement | null>(null);
    useEffect(() => {
        const canvas = ref.current;
        if (!canvas)
            return;
        const info = PLANES.find(([p]) => p === plane)!;
        const [w, h] = canvasSize(study.slab, info[2], info[3]);
        const rgba = renderNativeCtPlane(study.slab, plane, coord, w, h, center, width, study.mask, label, opacity);
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d", { alpha: false })?.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
    }, [study, plane, coord, center, width, label, opacity]);
    return <div className="cs-nifti-image">
    <canvas ref={ref} aria-label={PLANES.find(([p]) => p === plane)?.[1]} style={{ maxWidth: "100%", height: "auto", imageRendering: "pixelated" }}/>
  </div>;
}
/** Local-only source-image adapter hosted inside existing /viewer, reusing
 * segmentation-mask geometry / label parser rather than pretending CT is DICOM.
 */
export default function NiftiCtResearchView() {
    const __ui = useUiTranslator();
    const [sourceFile, setSourceFile] = useState<File | null>(null);
    const [maskFiles, setMaskFiles] = useState<File[]>([]);
    const [opened, setOpened] = useState<Opened | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("Выберите исходную несжатую КТ .nii и пару маска .nii + паспорт .json.");
    const [pos, setPos] = useState<[
        number,
        number,
        number
    ]>([0, 0, 0]);
    const [label, setLabel] = useState<number | null>(null);
    const [ww, setWw] = useState(400);
    const [wc, setWc] = useState(50);
    const [opacity, setOpacity] = useState(0.4);
    const serial = useRef(0);
    const currentAbort = useRef<AbortController | null>(null);
    useEffect(() => () => { serial.current++; currentAbort.current?.abort(); }, []);
    const invalidate = () => {
        serial.current++;
        currentAbort.current?.abort();
        setOpened(null);
        setError("");
        setMessage("Серия изменена: предыдущая маска и изображение выгружены из просмотра.");
    };
    const open = async () => {
        if (!sourceFile || maskFiles.length !== 2) {
            setError("Нужно выбрать три файла: исходная КТ .nii, маска .nii и паспорт .json.");
            return;
        }
        const masks = maskFiles.filter(f => f.name.toLowerCase().endsWith(".nii"));
        const json = maskFiles.filter(f => f.name.toLowerCase().endsWith(".json"));
        if (masks.length !== 1 || json.length !== 1) {
            setError("Укажите ровно одну маску .nii и один JSON-паспорт.");
            return;
        }
        const version = ++serial.current;
        currentAbort.current?.abort();
        const controller = new AbortController();
        currentAbort.current = controller;
        setLoading(true);
        setError("");
        setOpened(null);
        try {
            const header = await readNiftiCtHeader(sourceFile);
            if (controller.signal.aborted)
                return;
            const mask = await readNiftiMaskFile(masks[0]);
            const digest = await sha256(await masks[0].arrayBuffer());
            const proof = parseResearchAnatomy(await json[0].text(), mask, digest);
            if (proof.anatomy !== "abdomen")
                throw Error("В этом режиме поддерживаются только четыре органа брюшной полости.");
            const slab = await loadNativeCtSlab(sourceFile, header, proof, controller.signal);
            assertSameNativeIndexGrid(slab, mask);
            const regions = await buildResearchAnatomyRegions(mask, proof, {
                cancelled: () => version !== serial.current || controller.signal.aborted,
            });
            if (version !== serial.current || controller.signal.aborted)
                return;
            setOpened({ slab, mask, proof, regions });
            setPos(slab.dimensions.map(d => Math.floor((d - 1) / 2)) as [
                number,
                number,
                number
            ]);
            setLabel(null);
            setWc(50);
            setWw(400);
            setMessage("SHA полного CT NIfTI подтверждена; маска и индексная геометрия совпадают. Это технический, не клинический контроль.");
        }
        catch (e) {
            if (version === serial.current && !controller.signal.aborted)
                setError(e instanceof Error ? e.message : "Ошибка чтения NIfTI.");
        }
        finally {
            if (version === serial.current)
                setLoading(false);
        }
    };
    const choose = (region: LobeRegion) => {
        setPos(region.anchorMaskIndex);
        setLabel(region.id);
    };
    return <section className="cs-nifti" aria-label={__ui("\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u041A\u0422 NIfTI")}>
    <div className="cs-intro"><div><div className="cs-kicker">IMAGING LAB / LOCAL NIFTI CT REVIEW</div>
      <h1><LocalizedUi value={"\u041A\u0422 NIfTI"}/><em><LocalizedUi value={"+ \u043C\u0430\u0441\u043A\u0438 \u043E\u0440\u0433\u0430\u043D\u043E\u0432"}/></em></h1>
      <p><LocalizedUi value={"\u0422\u043E\u0442 \u0436\u0435 \u043A\u043E\u043D\u0442\u0443\u0440 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u0438 \u0438 \u043C\u0430\u0441\u043E\u043A, \u0447\u0442\u043E \u0438 \u0432 MPR. \u0420\u0435\u0436\u0438\u043C \u0447\u0442\u0435\u043D\u0438\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0445 \u0444\u0430\u0439\u043B\u043E\u0432."}/></p>
      </div><span className="cs-watermark"><LocalizedUi value={"\u0418\u0421\u0421\u041B\u0415\u0414\u041E\u0412\u0410\u0422\u0415\u041B\u042C\u0421\u041A\u0418\u0419 \u0420\u0415\u0416\u0418\u041C \u00B7 \u041D\u0415 \u0414\u041B\u042F \u0414\u0418\u0410\u0413\u041D\u041E\u0421\u0422\u0418\u041A\u0418"}/></span>
    </div>
    <div className="cs-nifti-controls">
      <label><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u041A\u0422 NIfTI"}/><input type="file" accept=".nii" onChange={e => { invalidate(); setSourceFile(e.target.files?.[0] ?? null); e.target.value = ""; }}/></label>
      <label><LocalizedUi value={"\u041C\u0430\u0441\u043A\u0430 TotalSegmentator + JSON-\u043F\u0430\u0441\u043F\u043E\u0440\u0442"}/><input type="file" accept=".nii,.json" multiple onChange={e => { invalidate(); setMaskFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}/>
      </label>
      <button type="button" disabled={loading || !sourceFile || maskFiles.length !== 2} onClick={() => void open()}><LocalizedUi value={loading ? "Проверка CT и геометрии…" : "Проверить и открыть исследование"}/></button>
      <button type="button" disabled={!opened && !sourceFile && !maskFiles.length} onClick={() => { invalidate(); setSourceFile(null); setMaskFiles([]); }}><LocalizedUi value={"\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C"}/></button>
      <p role="status"><LocalizedUi value={message}/></p>
      <LocalizedUi value={error && <p role="alert" className="cs-nifti-error"><LocalizedUi value={error}/></p>}/>
      <small><LocalizedUi value={"\u041C\u0430\u043A\u0441\u0438\u043C\u0443\u043C 128 \u041C\u0438\u0411 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u043D\u0435\u0441\u0436\u0430\u0442\u043E\u0439 \u041A\u0422 \u0438 32 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u0430 \u0432 \u043F\u0430\u043C\u044F\u0442\u0438. \u0423\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u043E \u043D\u0435 \u043E\u0431\u0440\u0430\u0431\u0430\u0442\u044B\u0432\u0430\u0435\u0442 \u043C\u043E\u0434\u0435\u043B\u044C, \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u0442 \u0444\u0430\u0439\u043B\u044B \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440 \u0438 \u043D\u0435 \u043F\u0440\u0435\u043E\u0431\u0440\u0430\u0437\u0443\u0435\u0442 NIfTI \u0432 DICOM. \u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u0430\u044F \u0441\u0443\u043C\u043C\u0430 JSON \u0441\u0430\u043C\u0430 \u043F\u043E \u0441\u0435\u0431\u0435 \u043D\u0435 \u0443\u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u044F\u0435\u0442 \u043F\u0440\u043E\u0438\u0441\u0445\u043E\u0436\u0434\u0435\u043D\u0438\u0435 \u0444\u0430\u0439\u043B\u0430 \u0438\u043B\u0438 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0430."}/></small>
    </div>
    <LocalizedUi value={opened && <div className="cs-nifti-review">
      <h2><LocalizedUi value={"\u041E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u0432\u043E\u043A\u0441\u0435\u043B\u0438 CT \u00B7 \u0441\u0440\u0435\u0437\u044B"}/><LocalizedUi value={opened.proof.firstSlice}/>–<LocalizedUi value={opened.proof.lastSlice}/></h2>
      <p><LocalizedUi value={"\u0420\u0430\u0437\u043C\u0435\u0440 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E \u0442\u043E\u043C\u0430:"}/><LocalizedUi value={opened.proof.fullDimensions.join(" × ")}/><LocalizedUi value={". \u0412 \u043F\u0430\u043C\u044F\u0442\u0438:"}/><LocalizedUi value={opened.slab.dimensions.join(" × ")}/><LocalizedUi value={". \u0412\u0441\u0435 \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442\u044B \u2014 \u043F\u043E \u043E\u0441\u044F\u043C \u0444\u0430\u0439\u043B\u0430 NIfTI, **\u043D\u0435 \u0433\u0430\u0440\u0430\u043D\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u043F\u043B\u043E\u0441\u043A\u043E\u0441\u0442\u0438**."}/></p>
      <p><LocalizedUi value={"\u042D\u0442\u0430\u043B\u043E\u043D\u043D\u043E\u0435 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u0438\u0435 Dice 0,947923 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043A \u0438\u0441\u0442\u043E\u0440\u0438\u0447\u0435\u0441\u043A\u043E\u043C\u0443 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u043C\u0443 \u0441\u043B\u0443\u0447\u0430\u044E MSD spleen_2 \u0438 \u043D\u0435 \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u0438\u0442\u0441\u044F \u043D\u0430 \u0442\u0435\u043A\u0443\u0449\u0438\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u0435 \u0444\u0430\u0439\u043B\u044B."}/></p>
      <div className="cs-nifti-sliders">
        <label><LocalizedUi value={"\u041E\u043A\u043E\u043D\u043D\u044B\u0439 \u0446\u0435\u043D\u0442\u0440"}/><input type="number" min="-2000" max="3000" step="10" value={wc} onChange={e => setWc(Math.max(-2000, Math.min(3000, Number(e.target.value) || 0)))}/></label>
        <label><LocalizedUi value={"\u0428\u0438\u0440\u0438\u043D\u0430 \u043E\u043A\u043D\u0430"}/><input type="number" min="1" max="6000" step="10" value={ww} onChange={e => setWw(Math.max(1, Math.min(6000, Number(e.target.value) || 1)))}/></label>
        <label><LocalizedUi value={"\u041C\u0430\u0441\u043A\u0430, \u043D\u0435\u043F\u0440\u043E\u0437\u0440\u0430\u0447\u043D\u043E\u0441\u0442\u044C"}/><LocalizedUi value={Math.round(opacity * 100)}/>%
          <input type="range" min="0" max="80" value={Math.round(opacity * 100)} onChange={e => setOpacity(Number(e.target.value) / 100)}/></label>
        <label><LocalizedUi value={"\u0421\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0430"}/><select value={label ?? "all"} onChange={e => setLabel(e.target.value === "all" ? null : Number(e.target.value))}>
          <option value="all"><LocalizedUi value={"\u0412\u0441\u0435 \u043E\u0440\u0433\u0430\u043D\u044B"}/></option>
          <LocalizedUi value={opened.regions.map(r => <option key={r.id} value={r.id}><LocalizedUi value={r.name}/></option>)}/>
          </select></label>
      </div>
      <div className="cs-nifti-planes">
        <LocalizedUi value={PLANES.map(([plane, title]) => {
                const idx = plane === "i" ? 0 : plane === "j" ? 1 : 2;
                return <div className="cs-nifti-plane" key={plane}>
            <h3><LocalizedUi value={title}/></h3>
            <NativeSlice study={opened} plane={plane} coord={pos[idx]} center={wc} width={ww} label={label} opacity={opacity}/>
            <label><LocalizedUi value={"\u0418\u043D\u0434\u0435\u043A\u0441"}/><LocalizedUi value={pos[idx] + 1}/> / <LocalizedUi value={opened.slab.dimensions[idx]}/>
              <input type="range" min="0" max={opened.slab.dimensions[idx] - 1} value={pos[idx]} onChange={e => setPos(old => old.map((n, i) => i === idx ? Number(e.target.value) : n) as [
                        number,
                        number,
                        number
                    ])}/>
            </label>
          </div>;
            })}/>
      </div>
      <h3><LocalizedUi value={"\u0410\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u044B \u0432 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u043E\u043C \u0444\u0440\u0430\u0433\u043C\u0435\u043D\u0442\u0435"}/></h3>
      <div className="cs-nifti-organs">
        <LocalizedUi value={opened.regions.map(region => <button type="button" key={region.id} className={label === region.id ? "active" : ""} onClick={() => choose(region)}>
          <strong><LocalizedUi value={region.name}/></strong>
          <span><LocalizedUi value={region.voxels.toLocaleString("ru-RU")}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439 \u00B7"}/><LocalizedUi value={region.volumeMl.toFixed(2)}/><LocalizedUi value={"\u043C\u043B \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0438 \u00B7 \u043A \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u043C\u0443 \u0441\u0440\u0435\u0437\u0443"}/><LocalizedUi value={region.originalSliceRange[0]}/>–<LocalizedUi value={region.originalSliceRange[1]}/></span>
        </button>)}/>
      </div>
      <LocalizedUi value={opened.proof.missingLabels.length > 0 && <p role="alert"><LocalizedUi value={"\u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B \u043C\u0435\u0442\u043A\u0438:"}/><LocalizedUi value={opened.proof.missingLabels.map(id => opened.proof.labelNames[id]).join(", ")}/><LocalizedUi value={". \u042D\u0442\u043E \u043D\u0435 \u043E\u0437\u043D\u0430\u0447\u0430\u0435\u0442 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0438 \u0438\u043B\u0438 \u043E\u0440\u0433\u0430\u043D\u0430."}/></p>}/>
      <p className="cs-nifti-caution"><LocalizedUi value={"\u0418\u043D\u0434\u0435\u043A\u0441\u043D\u044B\u0439 \u043E\u0431\u0437\u043E\u0440, \u0430 \u043D\u0435 \u043C\u0435\u0434\u0438\u0446\u0438\u043D\u0441\u043A\u043E\u0435 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435. \u041F\u043E\u043B\u043D\u044B\u0439 \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043E\u0445\u0432\u0430\u0442 \u043E\u0440\u0433\u0430\u043D\u043E\u0432, \u043E\u0440\u0438\u0435\u043D\u0442\u0430\u0446\u0438\u044F \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0438\u0445 \u043F\u043B\u043E\u0441\u043A\u043E\u0441\u0442\u0435\u0439, \u043F\u0440\u043E\u0438\u0441\u0445\u043E\u0436\u0434\u0435\u043D\u0438\u0435 \u043C\u043E\u0434\u0435\u043B\u0438 \u0438 \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u044C \u0433\u0440\u0430\u043D\u0438\u0446 \u0432 \u044D\u0442\u043E\u043C \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0438 \u043D\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u044B."}/></p>
    </div>}/>
  </section>;
}
