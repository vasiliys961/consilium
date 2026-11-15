"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useEffect, useState } from "react";
import { AI_CATALOG, modelsForRole, type ProviderId, type SegmentationId } from "../lib/v17-models";
import { PILOT_CASES, PILOT_NOTES } from "../lib/v17-pilot";
import { deriveStudyReadiness } from "../lib/study-intelligence";
import { PATIENT_CLOUD_REQUIREMENTS } from "../lib/patient-cloud-policy";
import type { DicomSeries } from "../lib/dicom-series";
import { useAnalysisSound } from "./AnalysisSoundProvider";
import ProviderReadinessPanel from "./ProviderReadinessPanel";
import HeadHemorrhageVolumePanel from "./HeadHemorrhageVolumePanel";
const PREF_KEY = "opus-radiology-v17-ui-preferences";
type Preferences = {
    provider: ProviderId;
    vision: string;
    clinical: string;
    anatomy: SegmentationId;
};
const DEFAULTS: Preferences = {
    provider: "openrouter",
    vision: "google/gemini-3.8-flash",
    clinical: "anthropic/claude-sonnet-5.5",
    anatomy: "totalsegmentator",
};
function restorePrefs(raw: string | null): Preferences {
    if (!raw)
        return DEFAULTS;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object")
            return DEFAULTS;
        const value = parsed as Partial<Preferences>;
        const byRole = (role: "vision" | "clinical", requested: unknown, fallback: string) => modelsForRole(role).some(m => m.id === requested) ? String(requested) : fallback;
        return {
            provider: "openrouter",
            vision: byRole("vision", value.vision, DEFAULTS.vision),
            clinical: byRole("clinical", value.clinical, DEFAULTS.clinical),
            anatomy: value.anatomy === "nv-segment-ctmr" || value.anatomy === "totalsegmentator" ? value.anatomy : DEFAULTS.anatomy,
        };
    }
    catch {
        return DEFAULTS;
    }
}
const dice = (v: number) => v.toFixed(3).replace(".", ",");
export default function AiWorkflowPanel({ series }: {
    series: readonly DicomSeries[];
}) {
    const __ui = useUiTranslator();
    const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);
    const [mounted, setMounted] = useState(false);
    const [compare, setCompare] = useState(false);
    const { enabled: chimeEnabled, setSoundEnabled, previewChime } = useAnalysisSound();
    const [soundFeedback, setSoundFeedback] = useState("");
    useEffect(() => {
        setPrefs(restorePrefs(window.localStorage.getItem(PREF_KEY)));
        setMounted(true);
    }, []);
    useEffect(() => {
        if (mounted)
            window.localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    }, [prefs, mounted]);
    const readiness = deriveStudyReadiness(series);
    const headCtSeriesKeys = series.filter(s => s.modality.toUpperCase() === "CT" &&
        s.members.length > 0 && s.members.every(m => m.metadata.bodyRegion === "HEAD")).map(s => s.key);
    const selected = AI_CATALOG.find(model => model.id === prefs.anatomy);
    const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setPrefs(previous => ({ ...previous, [key]: value }));
    return <div className="ora-v17-panel">
    <div className="ora-v17-heading">
      <strong><LocalizedUi value={"AI-\u043E\u0440\u043A\u0435\u0441\u0442\u0440 \u00B7 v1.7"}/></strong>
      <span><LocalizedUi value={"\u042D\u0442\u0430\u043F \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F"}/></span>
    </div>
    <p className="ora-v17-muted"><LocalizedUi value={"\u0412\u044B\u0431\u043E\u0440 \u043C\u043E\u0434\u0435\u043B\u0435\u0439 \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442. Lungmask R231 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E \u0438\u0437 MPR \u043F\u0440\u0438 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u043E\u043C worker. \u0414\u043B\u044F \u0431\u0443\u0434\u0443\u0449\u0435\u0433\u043E \u043E\u0431\u043B\u0430\u0447\u043D\u043E\u0433\u043E \u0430\u043D\u0430\u043B\u0438\u0437\u0430 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 \u043A\u043E\u043F\u0438\u0439 \u0431\u0435\u0437 \u043C\u0435\u0442\u0430\u0434\u0430\u043D\u043D\u044B\u0445 \u0438 \u0441\u043A\u0440\u044B\u0442\u0438\u0435 \u043D\u0430\u0434\u043F\u0438\u0441\u0435\u0439 \u043D\u0438\u0436\u0435; \u0440\u0435\u0430\u043B\u044C\u043D\u044B\u0435 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u044B \u043F\u043E\u043A\u0430 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u044E\u0442\u0441\u044F."}/></p>
    <div className="ora-v17-grid">
      <label htmlFor="ora-provider-choice"><LocalizedUi value={"AI-\u0448\u043B\u044E\u0437"}/><select id="ora-provider-choice" value={prefs.provider} onChange={e => set("provider", e.target.value as ProviderId)}>
          
          <option value="openrouter"><LocalizedUi value={"OpenRouter \u00B7 \u0432\u043D\u0435 \u0420\u0424"}/></option>
        </select>
      </label>
      <label htmlFor="ora-vision-choice"><LocalizedUi value={"Vision \u00B7 \u0433\u043B\u0430\u0437\u0430"}/><select id="ora-vision-choice" value={prefs.vision} onChange={e => set("vision", e.target.value)}>
          <LocalizedUi value={modelsForRole("vision").map(m => <option key={m.id} value={m.id}><LocalizedUi value={m.label}/></option>)}/>
        </select>
      </label>
      <label htmlFor="ora-clinical-choice"><LocalizedUi value={"\u041E\u0446\u0435\u043D\u0449\u0438\u043A \u00B7 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u0438 \u0441\u0438\u043D\u0442\u0435\u0437"}/><select id="ora-clinical-choice" value={prefs.clinical} onChange={e => set("clinical", e.target.value)}>
          <LocalizedUi value={modelsForRole("clinical").map(m => <option key={m.id} value={m.id}><LocalizedUi value={m.label}/></option>)}/>
        </select>
      </label>
      <label htmlFor="ora-anatomy-choice"><LocalizedUi value={"\u0410\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u043C\u043E\u0434\u0435\u043B\u044C"}/><select id="ora-anatomy-choice" value={prefs.anatomy} onChange={e => set("anatomy", e.target.value as SegmentationId)}>
          <option value="totalsegmentator"><LocalizedUi value={"TotalSegmentator \u00B7 \u043E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442"}/></option>
          <option value="nv-segment-ctmr"><LocalizedUi value={"NV-Segment-CTMR \u00B7 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0430\u044F"}/></option>
        </select>
      </label>
    </div>
    <section className="ora-ai-compute-modes" aria-label={__ui("\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u0438 \u043E\u0431\u043B\u0430\u0447\u043D\u044B\u0439 \u0430\u043D\u0430\u043B\u0438\u0437")}>
      <strong><LocalizedUi value={"\u0414\u0432\u0430 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u044B\u0445 \u0432\u044B\u0447\u0438\u0441\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0445 \u0440\u0435\u0436\u0438\u043C\u0430"}/></strong>
      <div className="ora-ai-compute-options">
        <div>
          <b><LocalizedUi value={"\u041D\u0430 Mac \u00B7 ONNX CPU"}/></b>
          <p><LocalizedUi value={"\u041F\u043E\u043B\u043D\u0430\u044F DICOM-\u0441\u0435\u0440\u0438\u044F \u2192 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0430\u044F 2D-\u043C\u043E\u0434\u0435\u043B\u044C \u2192 \u043C\u0430\u0441\u043A\u0430 \u0432 MPR. \u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0432 \u0438\u043D\u0442\u0435\u0440\u043D\u0435\u0442. \u041D\u0443\u0436\u043D\u044B \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044B\u0435, \u0441\u043E\u0432\u043C\u0435\u0441\u0442\u0438\u043C\u044B\u0435 \u0441 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E\u0439 \u0437\u0430\u0434\u0430\u0447\u0435\u0439 \u0432\u0435\u0441\u0430."}/></p>
          <small><LocalizedUi value={"\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u043A\u0430\u043A \u043E\u0444\u043B\u0430\u0439\u043D-\u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C \u0447\u0435\u0440\u0435\u0437 \u044D\u043A\u0441\u043F\u043E\u0440\u0442 \u0438\u0437 MPR. \u041D\u0435\u0442 \u0432\u0441\u0442\u0440\u043E\u0435\u043D\u043D\u043E\u0433\u043E \u043C\u0435\u0434\u0438\u0446\u0438\u043D\u0441\u043A\u043E\u0433\u043E \u0447\u0435\u043A\u043F\u043E\u0439\u043D\u0442\u0430."}/></small>
        </div>
        <div>
          <b><LocalizedUi value={"\u041E\u0431\u043B\u0430\u043A\u043E \u00B7 OpenRouter"}/></b>
          <p><LocalizedUi value={"\u0412\u043D\u0435\u0448\u043D\u0438\u0435 Gemini / GPT / Claude. \u041F\u043E\u043A\u0430 \u0440\u0435\u0430\u043B\u044C\u043D\u044B\u0435 \u0432\u044B\u0437\u043E\u0432\u044B \u0440\u0430\u0431\u043E\u0442\u0430\u044E\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0441 \u0438\u0441\u043A\u0443\u0441\u0441\u0442\u0432\u0435\u043D\u043D\u044B\u043C\u0438 PNG-\u0444\u0430\u043D\u0442\u043E\u043C\u0430\u043C\u0438 \u0434\u043B\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u043E\u0440\u043A\u0435\u0441\u0442\u0440\u0430."}/></p>
          <small><LocalizedUi value={"\u041F\u0435\u0440\u0435\u0434\u0430\u0447\u0430 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0438\u0445 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0441\u043A\u0438\u0445 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0439 \u0432 \u043E\u0431\u043B\u0430\u043A\u043E \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u0430."}/></small>
        </div>
      </div>
    </section>
    <LocalizedUi value={headCtSeriesKeys.length > 0 && <HeadHemorrhageVolumePanel seriesKeys={headCtSeriesKeys}/>}/>
    <ProviderReadinessPanel provider={prefs.provider} selectedVision={prefs.vision} selectedClinical={prefs.clinical}/>
    <div className="ora-v17-guidance">
      <strong><LocalizedUi value={selected?.label}/><LocalizedUi value={"\u00B7 \u043D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0430"}/></strong>
      <span><LocalizedUi value={selected?.notes}/></span>
      <small><LocalizedUi value={selected?.weightsLicence}/></small>
    </div>
    <div className="ora-v17-readiness">
      <div className="ora-v17-heading"><strong><LocalizedUi value={"\u041F\u0430\u0441\u043F\u043E\u0440\u0442 \u0442\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0433\u043E\u0442\u043E\u0432\u043D\u043E\u0441\u0442\u0438"}/></strong><span><LocalizedUi value={readiness.modality}/></span></div>
      <div className="ora-v17-stats">
        <div><strong><LocalizedUi value={readiness.seriesCount}/></strong><small><LocalizedUi value={"\u0421\u0435\u0440\u0438\u0439 DICOM"}/></small></div>
        <div><strong><LocalizedUi value={readiness.volumeEligible}/></strong><small><LocalizedUi value={"\u0413\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u044F \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0430"}/></small></div>
        <div><strong><LocalizedUi value={readiness.unsafeGeometry}/></strong><small><LocalizedUi value={"\u0422\u0440\u0435\u0431\u0443\u044E\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438"}/></small></div>
      </div>
      <LocalizedUi value={readiness.warnings.map((warning, i) => <p key={i} className="ora-v17-caution"><LocalizedUi value={warning}/></p>)}/>
    </div>
    <div className="ora-v17-models">
      <strong><LocalizedUi value={"\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u044B"}/></strong>
      <div><LocalizedUi value={"MedSAM2 / Efficient MedSAM2 \u2014 \u043E\u0442\u043B\u043E\u0436\u0435\u043D\u043D\u044B\u0439 \u044D\u043A\u0441\u043F\u0435\u0440\u0438\u043C\u0435\u043D\u0442 \u0434\u043B\u044F ROI, \u0431\u0435\u0437 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438 \u0432\u0435\u0441\u043E\u0432. MedGemma \u0438\u0441\u043A\u043B\u044E\u0447\u0435\u043D\u0430 \u0438\u0437 \u043F\u043B\u0430\u043D\u0430: \u0440\u0435\u0433\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u0430\u044F \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E\u0441\u0442\u044C \u043D\u0435 \u0433\u0430\u0440\u0430\u043D\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0430."}/></div>
    </div>
    <button className="ora-v17-compare" type="button" aria-expanded={compare} onClick={() => setCompare(v => !v)}>
      <LocalizedUi value={compare ? "Скрыть пилот 6 исследований" : "Показать сравнительный пилот Total / NV"}/>
    </button>
    <LocalizedUi value={compare && <div className="ora-v17-table-wrap">
      <table className="ora-v17-table">
        <caption><LocalizedUi value={"\u0421\u0440\u0435\u0434\u043D\u0438\u0439 Dice \u043F\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u043C \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0438\u043C \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0430\u043C; 12 \u0437\u0430\u043F\u0443\u0441\u043A\u043E\u0432, \u0431\u0435\u0437 \u043E\u0446\u0435\u043D\u043A\u0438 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0439"}/></caption>
        <thead><tr><th><LocalizedUi value={"\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435"}/></th><th><LocalizedUi value={"\u0421\u0442\u0440\u0443\u043A\u0442\u0443\u0440"}/></th><th>Total</th><th>NV</th></tr></thead>
        <tbody><LocalizedUi value={PILOT_CASES.map(c => <tr key={c.id}>
          <td><LocalizedUi value={c.modality === "CT" ? "КТ" : "МРТ"}/> · <LocalizedUi value={c.region}/></td>
          <td><LocalizedUi value={c.structures}/></td><td><LocalizedUi value={dice(c.totalDice)}/></td><td><LocalizedUi value={dice(c.nvDice)}/></td>
        </tr>)}/></tbody>
      </table>
      <p className="ora-v17-caution"><LocalizedUi value={"\u0420\u0435\u0436\u0438\u043C\u044B \u0440\u0430\u0437\u043B\u0438\u0447\u0430\u043B\u0438\u0441\u044C \u043F\u043E \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u0438\u044E (3 \u043C\u043C / 1,5 \u043C\u043C). \u0421\u043B\u0430\u0431\u0430\u044F \u0441\u0435\u0433\u043C\u0435\u043D\u0442\u0430\u0446\u0438\u044F \u043F\u043E\u0434\u0436\u0435\u043B\u0443\u0434\u043E\u0447\u043D\u043E\u0439 \u0436\u0435\u043B\u0435\u0437\u044B \u043D\u0430 \u041C\u0420\u0422: Dice"}/><LocalizedUi value={dice(PILOT_NOTES.weakMRPancreasTotalDice)}/> / <LocalizedUi value={dice(PILOT_NOTES.weakMRPancreasNvDice)}/><LocalizedUi value={". \u041D\u0435\u0442 \u0432\u043D\u0435\u0448\u043D\u0435\u0439 \u043A\u043B\u0438\u043D\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0432\u0430\u043B\u0438\u0434\u0430\u0446\u0438\u0438; Mac M1 \u043D\u0435 \u0442\u0435\u0441\u0442\u0438\u0440\u043E\u0432\u0430\u043B\u0441\u044F."}/></p>
    </div>}/>
    <p className="ora-v17-muted"><LocalizedUi value={"\u0412\u044B\u0431\u043E\u0440 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u00AB\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C\u00BB \u0432\u044B\u0448\u0435 \u0434\u043B\u044F \u0441\u0432\u0435\u0440\u043A\u0438 \u0441\u0435\u0440\u0432\u0435\u0440\u043D\u043E\u0439 \u043A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u0438 \u0441 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u043E\u043C; \u043D\u0430\u043B\u0438\u0447\u0438\u0435 \u043C\u043E\u0434\u0435\u043B\u0438 \u0432 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0435 \u043D\u0435 \u0433\u0430\u0440\u0430\u043D\u0442\u0438\u0440\u0443\u0435\u0442 \u0432\u044B\u0437\u043E\u0432 \u0438\u0437 \u0432\u0430\u0448\u0435\u0433\u043E \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430."}/></p>
    <div className="ora-completion-audio" aria-label={__ui("\u0417\u0432\u0443\u043A \u043F\u043E\u0441\u043B\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0439")}>
      <div className="ora-v17-heading"><strong><LocalizedUi value={"\u0417\u0432\u0443\u043A\u043E\u0432\u044B\u0435 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F"}/></strong><span><LocalizedUi value={"\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u043E \u00B7 WebAudio"}/></span></div>
      <label className="ora-completion-toggle">
        <input type="checkbox" checked={chimeEnabled} onChange={e => {
            setSoundEnabled(e.target.checked);
            setSoundFeedback(e.target.checked ? "Звук включён. Проверьте динамики кнопкой ниже." : "Звук выключен.");
        }}/><LocalizedUi value={"\u00AB\u0414\u0437\u0438\u043D\u044C\u00BB \u043F\u043E\u0441\u043B\u0435 \u0443\u0441\u043F\u0435\u0448\u043D\u043E\u0433\u043E \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u0438"}/></label>
      <button type="button" className="ora-vision-plan-audio-test" onClick={() => {
            void previewChime().then(ok => setSoundFeedback(ok ?
                "Тестовый сигнал воспроизведён. Если не слышно — проверьте громкость Mac." :
                "Браузер не разрешил воспроизвести звук. Проверьте разрешения и повторите нажатие."));
        }}><LocalizedUi value={"\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0437\u0432\u0443\u043A \u00B7 \u0434\u0437\u0438\u043D\u044C"}/></button>
      <LocalizedUi value={soundFeedback && <p className="ora-v17-muted" role="status"><LocalizedUi value={soundFeedback}/></p>}/>
      <p className="ora-v17-muted"><LocalizedUi value={"\u0421\u0435\u0439\u0447\u0430\u0441 \u0437\u0432\u043E\u043D\u043E\u043A \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u0434\u043B\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0438 Vision-\u043A\u0430\u0434\u0440\u043E\u0432. \u041F\u043E\u0441\u043B\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0435\u0433\u043E AI-\u0438\u043D\u0444\u0435\u0440\u0435\u043D\u0441\u0430 \u044D\u0442\u043E\u0442 \u0436\u0435 \u0441\u0438\u0433\u043D\u0430\u043B \u0431\u0443\u0434\u0435\u0442 \u0432\u044B\u0437\u044B\u0432\u0430\u0442\u044C\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u0438 \u0443\u0441\u043F\u0435\u0448\u043D\u043E\u043C \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u0438 \u0430\u043D\u0430\u043B\u0438\u0437\u0430."}/></p>
    </div>
    <details className="ora-cloud-safety">
      <summary><LocalizedUi value={"\u0417\u0430\u0449\u0438\u0442\u0430 \u043C\u0435\u0434\u0438\u0446\u0438\u043D\u0441\u043A\u0438\u0445 \u0434\u0430\u043D\u043D\u044B\u0445 \u00B7 \u0432\u043D\u0435\u0448\u043D\u044F\u044F \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0430 \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u0430"}/></summary>
      <p><LocalizedUi value={"\u041E\u0431\u0449\u0438\u0439 API \u0434\u043B\u044F \u043F\u0440\u043E\u0438\u0437\u0432\u043E\u043B\u044C\u043D\u044B\u0445 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0439 \u043E\u0442\u043A\u043B\u044E\u0447\u0451\u043D. \u0414\u043B\u044F \u0431\u0443\u0434\u0443\u0449\u0435\u0439 \u0440\u0430\u0431\u043E\u0442\u044B \u0441 \u043F\u0430\u0446\u0438\u0435\u043D\u0442\u0430\u043C\u0438 \u043D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u044B:"}/></p>
      <ul><LocalizedUi value={PATIENT_CLOUD_REQUIREMENTS.map(requirement => <li key={requirement.id}><LocalizedUi value={requirement.label}/><LocalizedUi value={"\u00B7 \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E"}/></li>)}/></ul>
      <small><LocalizedUi value={"\u041F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 Polza / OpenRouter \u043D\u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0430\u0435\u0442 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0443 \u0434\u0430\u043D\u043D\u044B\u0445 \u0438 \u043D\u0435 \u0437\u0430\u043C\u0435\u043D\u044F\u0435\u0442 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u044E."}/></small>
    </details>
    <button className="ora-analyze-button" type="button" disabled aria-label={__ui("\u0413\u0438\u0431\u0440\u0438\u0434\u043D\u044B\u0439 AI-\u0430\u043D\u0430\u043B\u0438\u0437 \u0435\u0449\u0451 \u043D\u0435 \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D")}><LocalizedUi value={"\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0433\u0438\u0431\u0440\u0438\u0434\u043D\u044B\u0439 \u0430\u043D\u0430\u043B\u0438\u0437 \u00B7 \u0441\u043A\u043E\u0440\u043E"}/></button>
  </div>;
}
