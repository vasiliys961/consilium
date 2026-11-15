"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useState } from "react";
import { sha256 } from "@noble/hashes/sha2.js";
import { parseRealPlethoraHumanReference, type PlethoraHumanReference } from "../lib/plethora-real-reference";
import type { EffusionResearchReport } from "../lib/chest-effusion-research";
import { parseImportedTask315, type ImportedTask315 } from "../lib/chest-effusion-execution";
/** Pure browser import of independently generated original model evidence.
 * This does not run AI, deidentify DICOM or prove clinical pathology.
 */
export default function ChestEffusionResearchResults({ isChestCT }: {
    isChestCT: boolean;
}) {
    const __ui = useUiTranslator();
    const [report, setReport] = useState<EffusionResearchReport | null>(null);
    const [execution, setExecution] = useState<ImportedTask315["execution"] | null>(null);
    const [error, setError] = useState("");
    const [humanReference, setHumanReference] = useState<PlethoraHumanReference | null>(null);
    const [humanBusy, setHumanBusy] = useState(false);
    const [humanError, setHumanError] = useState("");
    const [selectedClass, setSelectedClass] = useState<2 | 3>(2);
    const candidate = report?.fluidCandidates.find(c => c.labelId === selectedClass);
    return <section className="cs-geometry" aria-label={__ui("\u041F\u043B\u0435\u0432\u0440\u0430\u043B\u044C\u043D\u044B\u0439 \u0438 \u043F\u0435\u0440\u0438\u043A\u0430\u0440\u0434\u0438\u0430\u043B\u044C\u043D\u044B\u0439 \u0432\u044B\u043F\u043E\u0442 \u00B7 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u0440\u0430\u0437\u0431\u043E\u0440")}>
    <h3><LocalizedUi value={"\u041F\u043B\u0435\u0432\u0440\u0430\u043B\u044C\u043D\u044B\u0439 \u0438 \u043F\u0435\u0440\u0438\u043A\u0430\u0440\u0434\u0438\u0430\u043B\u044C\u043D\u044B\u0439 \u0432\u044B\u043F\u043E\u0442 \u00B7 TotalSegmentator"}/></h3>
    <p><LocalizedUi value={"\u041E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u0434\u0435\u0442\u0435\u043A\u0442\u043E\u0440 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0438 \u0433\u0440\u0443\u0434\u043D\u043E\u0439 \u043A\u043B\u0435\u0442\u043A\u0438, task 315. \u041F\u0440\u0438\u043D\u0438\u043C\u0430\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u043F\u0440\u0435\u0434\u043E\u0431\u0443\u0447\u0435\u043D\u043D\u043E\u0439 \u043C\u043E\u0434\u0435\u043B\u0438 \u0441 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043D\u043E\u0439 NIfTI-\u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u0435\u0439. \u0410\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043C\u0435\u0442\u043A\u0430 \u21161 \u043D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0436\u0438\u0434\u043A\u043E\u0441\u0442\u044C\u044E \u0438 \u0438\u0441\u043A\u043B\u044E\u0447\u0430\u0435\u0442\u0441\u044F \u0438\u0437 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0445 \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u0435\u0439."}/></p>
    <LocalizedUi value={!isChestCT && <p role="note"><LocalizedUi value={"\u0414\u043B\u044F \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0439 \u0433\u0440\u0443\u0434\u043D\u043E\u0439 \u043A\u043B\u0435\u0442\u043A\u0438 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u041A\u0422 \u0433\u0440\u0443\u0434\u043D\u043E\u0439 \u043A\u043B\u0435\u0442\u043A\u0438. \u0418\u043C\u043F\u043E\u0440\u0442 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0433\u043E \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u043E\u0433\u043E NIfTI-\u043E\u0442\u0447\u0451\u0442\u0430 \u043D\u0435 \u043E\u0437\u043D\u0430\u0447\u0430\u0435\u0442 \u043F\u0440\u0438\u0432\u044F\u0437\u043A\u0443 \u043D\u0430\u0445\u043E\u0434\u043A\u0438 \u043A \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u043C\u0443 DICOM-\u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044E."}/></p>}/>
    <div style={{ border: "1px solid #91a7a2", padding: 12, borderRadius: 8, margin: "12px 0" }}>
      <strong><LocalizedUi value={"\u041D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u044B\u0439 \u0432\u0440\u0430\u0447\u0435\u0431\u043D\u044B\u0439 \u044D\u0442\u0430\u043B\u043E\u043D \u043F\u043B\u0435\u0432\u0440\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0432\u044B\u043F\u043E\u0442\u0430 \u00B7 TCIA PleThora"}/></strong>
      <p><LocalizedUi value={"\u0412 \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u043C \u043D\u0430\u0431\u043E\u0440\u0435 78 \u043F\u0430\u0440 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0445 \u043F\u0435\u0440\u0435\u0441\u043C\u043E\u0442\u0440\u043E\u0432. \u041C\u043E\u0436\u043D\u043E \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u043E\u0435 \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u0435 \u0441\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u0435 \u0434\u0432\u0443\u0445 \u0432\u0440\u0430\u0447\u0435\u0431\u043D\u044B\u0445 \u043C\u0430\u0441\u043E\u043A \u043D\u0430 \u043E\u0434\u043D\u043E\u043C \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0438, \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u044F \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440 \u0438 \u043D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u044F \u043D\u0435\u0439\u0440\u043E\u0441\u0435\u0442\u044C."}/></p>
      <button type="button" disabled={humanBusy} onClick={async () => {
            setHumanBusy(true);
            setHumanError("");
            setHumanReference(null);
            try {
                const response = await fetch("/examples/plethora-real-two-human-effusion-reference-run-38750003799.json", { cache: "no-store" });
                if (!response.ok)
                    throw Error("Эталонные числовые данные TCIA сейчас недоступны.");
                const bytes = new Uint8Array(await response.arrayBuffer());
                const digest = Array.from(sha256(bytes), n => n.toString(16).padStart(2, "0")).join("");
                const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
                setHumanReference(parseRealPlethoraHumanReference(content, digest));
            }
            catch (e) {
                setHumanError(e instanceof Error ? e.message : "Ошибка загрузки эталона.");
            }
            finally {
                setHumanBusy(false);
            }
        }}><LocalizedUi value={humanBusy ? "Проверка оригинального результата TCIA…" :
            "Показать реальное согласие двух экспертных разметок"}/></button>
      <LocalizedUi value={humanError && <p role="alert"><LocalizedUi value={humanError}/></p>}/>
      <LocalizedUi value={humanReference && <div>
        <p role="status"><strong>Human–human Dice:
          <LocalizedUi value={" "}/><LocalizedUi value={humanReference.humanExpertInterreaderDice.toFixed(3)}/></strong>
          <LocalizedUi value={" "}/><LocalizedUi value={"\u2014 \u0438\u0437\u043C\u0435\u0440\u0435\u043D\u043D\u043E\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0435 \u0434\u0432\u0443\u0445 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0445 \u0441\u0435\u0433\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u0439 \u043F\u043B\u0435\u0432\u0440\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0432\u044B\u043F\u043E\u0442\u0430, \u041D\u0415 \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u044C TotalSegmentator."}/></p>
        <p><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u0440\u0430\u0437\u043C\u0435\u0442\u043A\u0430 1:"}/><LocalizedUi value={" "}/><LocalizedUi value={humanReference.originalReviewerAMaskVolumeMl.toFixed(2)}/><LocalizedUi value={"\u043C\u043B"}/><LocalizedUi value={" "}/>(<LocalizedUi value={humanReference.originalReviewerAMaskVoxels.toLocaleString("ru-RU")}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439). \u0420\u0430\u0437\u043C\u0435\u0442\u043A\u0430 2:"}/><LocalizedUi value={" "}/><LocalizedUi value={humanReference.originalReviewerBMaskVolumeMl.toFixed(2)}/><LocalizedUi value={"\u043C\u043B"}/><LocalizedUi value={" "}/>(<LocalizedUi value={humanReference.originalReviewerBMaskVoxels.toLocaleString("ru-RU")}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439). \u0421\u043E\u0432\u043F\u0430\u0434\u0430\u044E\u0449\u0438\u0445 \u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439"}/><LocalizedUi value={humanReference.originalExpertIntersectionVoxels.toLocaleString("ru-RU")}/>.</p>
        <p><LocalizedUi value={"\u0420\u0430\u0437\u043B\u0438\u0447\u0438\u044F \u043F\u043E"}/><LocalizedUi value={humanReference.humanExpertDiscordantSliceCount}/><LocalizedUi value={"\u0438\u0441\u0445\u043E\u0434\u043D\u044B\u043C \u0438\u043D\u0434\u0435\u043A\u0441\u043D\u044B\u043C \u0441\u0440\u0435\u0437\u0430\u043C \u0438\u0437"}/><LocalizedUi value={humanReference.originalShapeXYZ[2]}/><LocalizedUi value={". \u041C\u0430\u0441\u043A\u0438 \u0438\u043C\u0435\u044E\u0442 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u0443\u044E \u043E\u0431\u0449\u0443\u044E \u0444\u0438\u0437\u0438\u0447\u0435\u0441\u043A\u0443\u044E NIfTI-\u0441\u0435\u0442\u043A\u0443, \u043D\u043E \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u0430\u044F DICOM \u041A\u0422 \u0434\u043B\u044F \u044D\u0442\u0438\u0445 \u0440\u0430\u0437\u043C\u0435\u0442\u043E\u043A \u0435\u0449\u0451 \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u0430."}/></p>
        <p role="note"><LocalizedUi value={"\u0427\u0438\u0441\u043B\u043E\u0432\u043E\u0435 \u0441\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0441 \u043D\u0435\u0439\u0440\u043E\u0441\u0435\u0442\u044C\u044E \u043D\u0435\u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E \u0434\u043E \u0437\u0430\u043F\u0443\u0441\u043A\u0430 \u0438\u043C\u0435\u043D\u043D\u043E \u043D\u0430 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0435\u0439 CT: \u044D\u0442\u043E\u0442 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0439 \u0441\u043B\u0443\u0447\u0430\u0439 \u043D\u0435 \u0440\u0430\u0432\u0435\u043D \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0442\u0435\u043A\u0443\u0449\u0435\u043C\u0443 JSON \u0432\u044B\u043F\u043E\u0442\u0430 \u0438\u043B\u0438 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u0441\u0435\u0440\u0438\u0438 DICOM. \u0413\u0440\u0430\u043D\u0438\u0446\u044B \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E DICOM RAI \u0438 NIfTI RPI \u0442\u0440\u0435\u0431\u0443\u044E\u0442 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438."}/></p>
        <p><small><a href="https://github.com/vasiliys961/opus-radiology-ai/actions/runs/38750003799" target="_blank" rel="noopener noreferrer"><LocalizedUi value={"\u041F\u043E\u0434\u043B\u0438\u043D\u043D\u044B\u0439 CPU-\u0440\u0430\u0441\u0447\u0451\u0442 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u044D\u043A\u0441\u043F\u0435\u0440\u0442\u043D\u044B\u0445 \u043C\u0430\u0441\u043E\u043A \u00B7 GitHub Actions"}/></a><LocalizedUi value={". \u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A TCIA DOI 10.7937/tcia.2020.6c7y-gq39, CC BY 3.0."}/></small></p>
      </div>}/>
    </div>
    <label><LocalizedUi value={"\u0427\u0438\u0441\u043B\u043E\u0432\u043E\u0439 \u043E\u0442\u0447\u0451\u0442 \u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C\u043D\u043E\u0439 CT-\u043C\u0430\u0441\u043A\u0438 task 315 (.json)"}/><input type="file" accept=".json,application/json" onChange={async (e) => {
            const f = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            setError("");
            setReport(null);
            setExecution(null);
            if (!f)
                return;
            try {
                if (f.size < 64 || f.size > 512 * 1024)
                    throw Error("Отчёт должен быть не больше 512 КиБ.");
                const checked = parseImportedTask315(await f.text());
                setReport(checked.evidence);
                setExecution(checked.execution);
                setSelectedClass(2);
            }
            catch (err) {
                setError(err instanceof Error ? err.message : "Ошибка импорта КТ-отчёта.");
            }
        }}/>
    </label>
    <LocalizedUi value={error && <p role="alert"><LocalizedUi value={error}/></p>}/>
    <LocalizedUi value={!report ? <p><small><LocalizedUi value={"\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u043E\u0433\u043E \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0432\u044B\u0432\u043E\u0434\u0430 task 315 \u0434\u043B\u044F \u043F\u0443\u0431\u043B\u0438\u0447\u043D\u043E\u0439 \u041A\u0422 \u0433\u0440\u0443\u0434\u043D\u043E\u0439 \u043A\u043B\u0435\u0442\u043A\u0438 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442. \u0418\u0437 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0435\u0439 \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u043C\u0430\u0441\u043A\u0438 \u0438\u043B\u0438 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u0430 \u0434\u0440\u0443\u0433\u043E\u0439 \u043C\u043E\u0434\u0435\u043B\u0438 \u043D\u0435\u043B\u044C\u0437\u044F \u043F\u043E\u0441\u0442\u0440\u043E\u0438\u0442\u044C \u0444\u0438\u043A\u0442\u0438\u0432\u043D\u044B\u0439 \u043E\u0442\u0447\u0451\u0442 \u043E \u0432\u044B\u043F\u043E\u0442\u0435."}/></small></p> : <>
      <LocalizedUi value={execution === "reported-pretrained-execution" && <p role="status"><strong><LocalizedUi value={"\u0415\u0441\u0442\u044C \u043E\u0442\u0447\u0451\u0442 \u043E \u0432\u044B\u0437\u043E\u0432\u0435 \u043F\u0440\u0435\u0434\u043E\u0431\u0443\u0447\u0435\u043D\u043D\u043E\u0439 task315."}/></strong><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u044B\u0439 NIfTI, \u0432\u044B\u0445\u043E\u0434\u043D\u0430\u044F \u043C\u0430\u0441\u043A\u0430 \u0438 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0435 \u0447\u0438\u0441\u043B\u0430 \u0441\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u044B \u043F\u043E SHA. \u0421\u0430\u043C \u0444\u0430\u0439\u043B checkpoint \u0445\u0435\u0448\u0438\u0440\u043E\u0432\u0430\u043D, \u043D\u043E \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0433\u043E \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F \u0444\u0430\u043A\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u0445 \u0432\u0435\u0441\u043E\u0432 \u0438 \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u0438 \u043C\u043E\u0434\u0435\u043B\u0438 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442."}/></p>}/>
      <LocalizedUi value={execution === "source-mask-only" && <p role="note"><LocalizedUi value={"\u0418\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u043C\u0430\u0441\u043A\u0430/\u0447\u0438\u0441\u043B\u043E\u0432\u043E\u0439 \u043F\u0430\u0441\u043F\u043E\u0440\u0442. \u041E\u043D \u0441\u0430\u043C \u043F\u043E \u0441\u0435\u0431\u0435 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u0435\u0442, \u0447\u0442\u043E \u043D\u0435\u0439\u0440\u043E\u0441\u0435\u0442\u044C \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u043B\u0430\u0441\u044C."}/></p>}/>
      <p><strong><LocalizedUi value={"\u0418\u0441\u0445\u043E\u0434\u043D\u0430\u044F \u041A\u0422:"}/></strong> <LocalizedUi value={report.originalCTDimensionsXYZ.join(" × ")}/>
        <LocalizedUi value={" "}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439. \u041C\u0430\u0441\u043A\u0430 \u0441\u0432\u044F\u0437\u0430\u043D\u0430 SHA-256 \u0438 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u043E\u0439 \u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u0445 \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0442 (0,05 \u043C\u043C), \u043D\u043E \u043F\u0440\u043E\u0438\u0441\u0445\u043E\u0436\u0434\u0435\u043D\u0438\u0435 \u043F\u0440\u0435\u0434\u043E\u0431\u0443\u0447\u0435\u043D\u043D\u044B\u0445 \u0432\u0435\u0441\u043E\u0432 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E \u043E\u0442 \u044D\u0442\u043E\u0433\u043E \u043E\u0442\u0447\u0451\u0442\u0430 \u0435\u0449\u0451 \u043D\u0435 \u0434\u043E\u043A\u0430\u0437\u0430\u043D\u043E."}/></p>
      <p><LocalizedUi value={"\u041E\u0431\u044A\u0451\u043C \u043E\u0434\u043D\u043E\u0433\u043E \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0433\u043E \u0432\u043E\u043A\u0441\u0435\u043B\u044F:"}/><LocalizedUi value={report.voxelVolumeMl.toFixed(5)}/><LocalizedUi value={"\u043C\u043B. \u041C\u0435\u0442\u043A\u0430 1 \u2014"}/><LocalizedUi value={report.anatomicalClassLungPleuralVoxelCountNotFluid}/><LocalizedUi value={"\u0432\u043E\u043A\u0441\u0435\u043B\u0435\u0439 \u043F\u043B\u0435\u0432\u0440\u0430\u043B\u044C\u043D\u043E\u0439 \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u043E\u0431\u043B\u0430\u0441\u0442\u0438;"}/><strong><LocalizedUi value={"\u043D\u0435 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u044B"}/></strong><LocalizedUi value={"\u0432 \u043E\u0431\u044A\u0451\u043C\u044B \u0436\u0438\u0434\u043A\u043E\u0441\u0442\u0438."}/></p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        <button type="button" aria-pressed={selectedClass === 2} onClick={() => setSelectedClass(2)}><LocalizedUi value={"\u041F\u043B\u0435\u0432\u0440\u0430\u043B\u044C\u043D\u0430\u044F \u0436\u0438\u0434\u043A\u043E\u0441\u0442\u044C \u00B7 \u043C\u0435\u0442\u043A\u0430 2"}/></button>
        <button type="button" aria-pressed={selectedClass === 3} onClick={() => setSelectedClass(3)}><LocalizedUi value={"\u041F\u0435\u0440\u0438\u043A\u0430\u0440\u0434\u0438\u0430\u043B\u044C\u043D\u0430\u044F \u0436\u0438\u0434\u043A\u043E\u0441\u0442\u044C \u00B7 \u043C\u0435\u0442\u043A\u0430 3"}/></button>
      </div>
      <LocalizedUi value={candidate && <div style={{ padding: 12, border: "1px solid #8a9a9a", borderRadius: 10 }}>
        <strong><LocalizedUi value={candidate.pathologyClass === "pleural_effusion" ?
                    "Плевральный выпот · модельная гипотеза" :
                    "Перикардиальный выпот · модельная гипотеза"}/></strong>
        <p><LocalizedUi value={candidate.modelPositiveNativeVoxelCount === 0 ?
                    "Модель не выделила воксели этого класса. Отсутствие выпота не установлено." :
                    `Положительных вокселей исходной маски: ${candidate.modelPositiveNativeVoxelCount}.
          Исследовательский объём модельной маски: ${candidate.modelUnvalidatedFluidLabelVolumeMl.toFixed(2)} мл.`}/></p>
        <LocalizedUi value={candidate.nativeIndexBoundsXYZMin && candidate.nativeIndexBoundsXYZMax && <>
          <p><LocalizedUi value={"\u0414\u0438\u0430\u043F\u0430\u0437\u043E\u043D \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0445 \u0441\u0440\u0435\u0437\u043E\u0432 NIfTI (\u043D\u0443\u043C\u0435\u0440\u0430\u0446\u0438\u044F \u043E\u0442 1):"}/><LocalizedUi value={" "}/><LocalizedUi value={candidate.nativeSourceSliceIndicesK[0] + 1}/>–
            <LocalizedUi value={candidate.nativeSourceSliceIndicesK.at(-1)! + 1}/><LocalizedUi value={". \u0418\u043D\u0434\u0435\u043A\u0441\u043D\u0430\u044F \u0440\u0430\u043C\u043A\u0430 XYZ:"}/><LocalizedUi value={candidate.nativeIndexBoundsXYZMin.join(", ")}/>
            <LocalizedUi value={" "}/>→ <LocalizedUi value={candidate.nativeIndexBoundsXYZMax.join(", ")}/>.</p>
          <p><LocalizedUi value={"RAS \u043C\u043C:"}/><LocalizedUi value={candidate.worldRasBoundsMmMin?.map(n => n.toFixed(2)).join(", ")}/>
            <LocalizedUi value={" "}/>→ <LocalizedUi value={candidate.worldRasBoundsMmMax?.map(n => n.toFixed(2)).join(", ")}/>.</p>
        </>}/>
      </div>}/>
      <p role="alert"><strong><LocalizedUi value={"\u041D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u0438."}/></strong><LocalizedUi value={"\u0427\u0438\u0441\u043B\u043E\u0432\u043E\u0439 \u043F\u0430\u0441\u043F\u043E\u0440\u0442 \u043D\u0435 \u0443\u0434\u043E\u0441\u0442\u043E\u0432\u0435\u0440\u044F\u0435\u0442 \u0440\u0435\u0430\u043B\u044C\u043D\u044B\u0439 \u0437\u0430\u043F\u0443\u0441\u043A \u0432\u0435\u0441\u043E\u0432, \u0442\u043E\u0447\u043D\u043E\u0441\u0442\u044C \u0441\u0435\u0433\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u0438, \u0434\u0438\u0430\u0433\u043D\u043E\u0437 \u0438\u043B\u0438 \u043D\u0430\u043B\u0438\u0447\u0438\u0435/\u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435 \u0432\u044B\u043F\u043E\u0442\u0430. \u041D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F DICOM SOP-\u043F\u0440\u0438\u0432\u044F\u0437\u043A\u0430; \u0434\u0430\u043D\u043D\u044B\u0435 \u043E\u0442\u043D\u043E\u0441\u044F\u0442\u0441\u044F \u043A \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u043C\u0443 NIfTI \u0438 \u043D\u0435 \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u044F\u0442\u0441\u044F \u043D\u0430 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0430."}/></p>
      <button type="button" onClick={() => { setReport(null); setExecution(null); setError(""); }}><LocalizedUi value={"\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u043E\u0442\u0447\u0451\u0442 \u0438\u0437 \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430"}/></button>
    </>}/>
  </section>;
}
