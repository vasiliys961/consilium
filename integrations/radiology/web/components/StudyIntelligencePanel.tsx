"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { useMemo, useState } from "react";
import type { DicomSeries } from "../lib/dicom-series";
import { analyzeDicomStudy } from "../lib/study-intelligence-v17";
import { planAnatomicalTasks, type RouteReason } from "../lib/anatomy-task-router";
const REASON_LABELS: Readonly<Record<RouteReason, string>> = {
    geometry_unverified: "Не подтверждена геометрия 3D-объёма",
    region_conflict: "Противоречивые анатомические коды внутри серии",
    protocol_role_unverified: "Не подтверждён статус исходных PRIMARY-срезов",
    multiple_studies: "Не подтверждена принадлежность к одному исследованию",
    source_incomplete_or_unknown: "Не все выбранные DICOM проиндексированы",
    ct_calibration_and_phase_unverified: "Требуется проверить HU и фазу КТ на исходных данных",
    mr_exact_sequences_unverified: "Требуются подтверждённые T1, T1c, T2, FLAIR",
    mr_4_series_not_confirmed: "Не обнаружены четыре самостоятельные серии единого протокола",
    clinical_coverage_unknown: "Полнота анатомического покрытия неизвестна",
    weights_not_connected: "Подходящая задача и веса не подключены для запуска из этого раздела",
    server_patient_use_blocked: "Работа с пациентом/облаком не разрешена",
};
export default function StudyIntelligencePanel({ series, unindexed, onSelectSeries, }: {
    series: readonly DicomSeries[];
    unindexed: number;
    onSelectSeries: (seriesKey: string) => void;
}) {
    const __ui = useUiTranslator();
    const [expanded, setExpanded] = useState(false);
    const [onlyProblems, setOnlyProblems] = useState(false);
    const report = useMemo(() => analyzeDicomStudy(series, unindexed), [series, unindexed]);
    const taskRoutes = useMemo(() => planAnatomicalTasks(series, unindexed), [series, unindexed]);
    const risky = report.series.filter(s => s.issues.some(x => x.level === "warning")).length;
    const shown = onlyProblems ? report.series.filter(s => s.issues.some(x => x.level === "warning")) : report.series;
    return <section className="ora-study-intel" aria-label={__ui("Study Intelligence \u2014 \u0442\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0440\u0430\u0437\u0431\u043E\u0440 DICOM-\u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u044F")}>
    <div className="ora-study-intel-head">
      <div><strong>Study Intelligence <span>v1.7</span></strong>
        <p><LocalizedUi value={"\u0422\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0430\u043D\u0430\u043B\u0438\u0437 \u0432\u0441\u0435\u0445 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u044B\u0445 DICOM-\u0441\u0435\u0440\u0438\u0439 \u00B7 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E"}/></p>
      </div>
      <button type="button" className="ora-study-intel-toggle" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}>
        <LocalizedUi value={expanded ? "Свернуть анализ" : "Все серии и протоколы"}/>
      </button>
    </div>
    <div className="ora-study-intel-stats">
      <div><strong><LocalizedUi value={report.indexedSeries}/></strong><small><LocalizedUi value={"\u0421\u0435\u0440\u0438\u0439"}/></small></div>
      <div><strong><LocalizedUi value={report.indexedDicomFiles}/></strong><small><LocalizedUi value={"\u041F\u0440\u043E\u0438\u043D\u0434\u0435\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u043E"}/></small></div>
      <div><strong><LocalizedUi value={risky}/></strong><small><LocalizedUi value={"\u0421\u0435\u0440\u0438\u0439 \u0441 \u043F\u0440\u0435\u0434\u0443\u043F\u0440\u0435\u0436\u0434\u0435\u043D\u0438\u044F\u043C\u0438"}/></small></div>
      <div><strong><LocalizedUi value={report.unindexedDicomFiles}/></strong><small><LocalizedUi value={"\u0411\u0435\u0437 \u0438\u043D\u0434\u0435\u043A\u0441\u0430"}/></small></div>
    </div>
    <p className="ora-study-intel-boundary"><LocalizedUi value={"\u041F\u043E\u043B\u043D\u043E\u0442\u0430 \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u043E\u0433\u043E \u043E\u0445\u0432\u0430\u0442\u0430 \u0438 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u0430"}/><strong><LocalizedUi value={"\u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0430"}/></strong><LocalizedUi value={". \u041F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430\u044F \u0442\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F DICOM."}/></p>
    <LocalizedUi value={expanded && <>
      <div className="ora-study-intel-filter">
        <label><input type="checkbox" checked={onlyProblems} onChange={e => setOnlyProblems(e.target.checked)}/><LocalizedUi value={"\u0422\u043E\u043B\u044C\u043A\u043E \u0441\u0435\u0440\u0438\u0438 \u0441 \u043F\u0440\u0435\u0434\u0443\u043F\u0440\u0435\u0436\u0434\u0435\u043D\u0438\u044F\u043C\u0438"}/></label>
        <span><LocalizedUi value={report.studyCount}/> StudyInstanceUID</span>
      </div>
      <LocalizedUi value={report.issues.filter(x => x.seriesKey === null).map((problem, index) => (<p key={problem.code + index} className={problem.level === "warning" ?
                    "ora-study-intel-warning" : "ora-study-intel-info"}><LocalizedUi value={problem.message}/></p>))}/>
      <div className="ora-study-intel-series">
        <LocalizedUi value={!shown.length && <p className="ora-study-intel-info"><LocalizedUi value={"\u0421\u0435\u0440\u0438\u0439 \u0434\u043B\u044F \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u0440\u0435\u0436\u0438\u043C\u0430 \u043D\u0435\u0442."}/></p>}/>
        <LocalizedUi value={shown.map((item, index) => <div className="ora-study-intel-series-item" key={item.key}>
          <div className="ora-study-intel-row">
            <strong><LocalizedUi value={"\u0421\u0435\u0440\u0438\u044F"}/><LocalizedUi value={index + 1}/> · <LocalizedUi value={item.modality || "DICOM"}/></strong>
            <span className={item.volumeReady ? "ora-study-intel-ready" : "ora-study-intel-review"}>
              <LocalizedUi value={item.volumeReady ? "Геометрия MPR подтверждена" : "Проверить геометрию"}/>
            </span>
          </div>
          <div className="ora-study-intel-description">
            <span><LocalizedUi value={"\u041A\u0430\u0434\u0440\u043E\u0432:"}/><LocalizedUi value={item.frames}/></span>
            <span><LocalizedUi value={"\u041E\u0431\u043B\u0430\u0441\u0442\u044C:"}/><LocalizedUi value={item.region}/></span>
            <span><LocalizedUi value={"\u0422\u0438\u043F:"}/><LocalizedUi value={item.imageRole}/></span>
            <LocalizedUi value={item.spatialExtentMm !== null && <span><LocalizedUi value={"\u0420\u0430\u0441\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u043A\u0440\u0430\u0439\u043D\u0438\u0445 \u0441\u0440\u0435\u0437\u043E\u0432:"}/><LocalizedUi value={item.spatialExtentMm}/><LocalizedUi value={"\u043C\u043C"}/></span>}/>
          </div>
          <p><LocalizedUi value={"\u041F\u0440\u043E\u0442\u043E\u043A\u043E\u043B:"}/><LocalizedUi value={item.protocolCandidate}/></p>
          <p><LocalizedUi value={"\u041A\u043E\u043D\u0442\u0440\u0430\u0441\u0442:"}/><LocalizedUi value={item.contrast === "declared" ?
                    "агент указан в DICOM; фаза не установлена" : "не подтверждён"}/></p>
          <p><LocalizedUi value={"\u041F\u0440\u0438\u0437\u043D\u0430\u043A\u0438 DICOM: \u043D\u0430\u0434\u043F\u0438\u0441\u0438"}/><LocalizedUi value={item.privacyFlags.burnedInAnnotation}/><LocalizedUi value={", \u0443\u0437\u043D\u0430\u0432\u0430\u0435\u043C\u044B\u0435 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u044F"}/><LocalizedUi value={item.privacyFlags.recognizableVisualFeatures}/>,
            PatientIdentityRemoved <LocalizedUi value={item.privacyFlags.patientIdentityRemoved}/>.</p>
          <p><LocalizedUi value={"\u0414\u0430\u0436\u0435 \u0442\u0435\u0433\u0438 NO \u0438 YES \u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E\u0442 \u0444\u0430\u043A\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0435 \u043E\u0431\u0435\u0437\u043B\u0438\u0447\u0438\u0432\u0430\u043D\u0438\u0435."}/></p>
          <LocalizedUi value={item.issues.map((warning, j) => <p className={warning.level === "warning" ?
                        "ora-study-intel-warning" : "ora-study-intel-info"} key={warning.code + j}>
              <LocalizedUi value={warning.message}/>
            </p>)}/>
          <button type="button" onClick={() => onSelectSeries(item.key)}><LocalizedUi value={"\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u044D\u0442\u0443 \u0441\u0435\u0440\u0438\u044E"}/></button>
        </div>)}/>
      </div>
      <section className="ora-study-intel-series" aria-label={__ui("\u041C\u0430\u0440\u0448\u0440\u0443\u0442\u044B \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0438\u0445 AI-\u0437\u0430\u0434\u0430\u0447")}>
        <h3><LocalizedUi value={"\u0410\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0438\u0435 AI-\u0437\u0430\u0434\u0430\u0447\u0438 \u00B7 \u0432\u044B\u0431\u043E\u0440 \u043F\u043E \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u0443"}/></h3>
        <p className="ora-study-intel-boundary"><LocalizedUi value={"\u0422\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 \u0437\u0430\u0434\u0430\u043D\u0438\u044F \u043F\u043E \u0442\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u043C DICOM-\u043C\u0435\u0442\u0430\u0434\u0430\u043D\u043D\u044B\u043C. \u041D\u0430 \u0442\u0435\u043A\u0443\u0449\u0435\u043C \u044D\u0442\u0430\u043F\u0435 \u0437\u0430\u043F\u0443\u0441\u043A \u043C\u043E\u0434\u0435\u043B\u0435\u0439 \u0437\u0434\u0435\u0441\u044C"}/><strong><LocalizedUi value={"\u043D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D"}/></strong><LocalizedUi value={". \u0410\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u043C\u0430\u0441\u043A\u0438 \u043D\u0435 \u044F\u0432\u043B\u044F\u044E\u0442\u0441\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u043E\u0439 \u043D\u0430 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u044E."}/></p>
        <LocalizedUi value={!taskRoutes.length && <p className="ora-study-intel-info"><LocalizedUi value={"\u0414\u043B\u044F \u044D\u0442\u0438\u0445 \u0441\u0435\u0440\u0438\u0439 \u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0449\u0438\u0439 \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043C\u0430\u0440\u0448\u0440\u0443\u0442 \u043D\u0435 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0451\u043D. \u042D\u0442\u043E \u043D\u0435 \u043E\u0437\u043D\u0430\u0447\u0430\u0435\u0442, \u0447\u0442\u043E \u043D\u0430 \u0441\u043D\u0438\u043C\u043A\u0430\u0445 \u043D\u0435\u0442 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439."}/></p>}/>
        <LocalizedUi value={taskRoutes.map((route, index) => <div key={route.id + "-" + index} className="ora-study-intel-series-item">
          <div className="ora-study-intel-row">
            <strong><LocalizedUi value={route.title}/></strong>
            <span className="ora-study-intel-review"><LocalizedUi value={"\u041C\u041E\u0414\u0415\u041B\u042C \u041D\u0415 \u041F\u041E\u0414\u041A\u041B\u042E\u0427\u0415\u041D\u0410"}/></span>
          </div>
          <div className="ora-study-intel-description">
            <span><LocalizedUi value={route.modality}/> · <LocalizedUi value={route.bodyRegion}/></span>
            <span><LocalizedUi value={"\u0421\u0435\u0440\u0438\u0439-\u043A\u0430\u043D\u0434\u0438\u0434\u0430\u0442\u043E\u0432:"}/><LocalizedUi value={route.inputSeriesKeys.length}/></span>
          </div>
          <p><LocalizedUi value={"\u041A\u0430\u043D\u0434\u0438\u0434\u0430\u0442:"}/><LocalizedUi value={route.modelCandidate}/></p>
          <LocalizedUi value={route.technicalHints.map((hint, i) => <p key={i} className="ora-study-intel-info"><LocalizedUi value={hint}/></p>)}/>
          <LocalizedUi value={route.reasons.map(reason => <p key={reason} className="ora-study-intel-warning">
            <LocalizedUi value={REASON_LABELS[reason]}/>
          </p>)}/>
          <button type="button" onClick={() => onSelectSeries(route.inputSeriesKeys[0])}><LocalizedUi value={"\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0441\u0435\u0440\u0438\u044E \u0434\u043B\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438"}/></button>
        </div>)}/>
      </section>
      <p className="ora-study-intel-footnote"><LocalizedUi value={"\u0420\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u0430 \u043F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0435: \u0442\u043E\u043B\u044C\u043A\u043E \u0441\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u044B\u0435 \u0442\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0442\u0435\u0433\u0438, \u0431\u0435\u0437 \u0441\u0432\u043E\u0431\u043E\u0434\u043D\u043E\u0433\u043E \u0442\u0435\u043A\u0441\u0442\u0430 SeriesDescription / ProtocolName, \u0430\u043D\u0430\u043B\u0438\u0437\u0430 \u043F\u0438\u043A\u0441\u0435\u043B\u0435\u0439 \u0438 \u0432\u043D\u0435\u0448\u043D\u0435\u0439 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438. \u041F\u0440\u043E\u0432\u0435\u0440\u043A\u0438 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0439 \u0437\u0434\u0435\u0441\u044C \u043D\u0435\u0442."}/></p>
    </>}/>
  </section>;
}
