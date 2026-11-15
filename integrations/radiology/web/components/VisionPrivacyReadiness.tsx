"use client";
import {LocalizedUi,useUiTranslator} from './ConciliumBridge';
import { assessPrivacyReadiness, type PrivacyReadinessInputs } from "../lib/privacy-readiness";
export default function VisionPrivacyReadiness(props: PrivacyReadinessInputs) {
    const __ui = useUiTranslator();
    const status = assessPrivacyReadiness(props);
    return <section aria-label={__ui("\u0413\u043E\u0442\u043E\u0432\u043D\u043E\u0441\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0445 \u043A\u043E\u043F\u0438\u0439 \u043A \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0435")}>
    <h4><LocalizedUi value={"\u0421\u0442\u0430\u0442\u0443\u0441 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0438 \u00B7"}/><LocalizedUi value={status.frames.filter(f => f.localReviewDone).length}/>/<LocalizedUi value={status.frames.length}/><LocalizedUi value={"\u043A\u0430\u0434\u0440\u043E\u0432 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043E \u0432\u0440\u0443\u0447\u043D\u0443\u044E"}/></h4>
    <p role="status"><LocalizedUi value={props.busy ? "Локальная операция выполняется; дождитесь завершения." : status.localReviewDone ?
            "Локальные отметки заполнены, но это не удостоверяет обезличивание. Отдельный пилот OpenRouter требует OCR, разрешённого провайдера и подтверждения врача." : "Подготовка не завершена: осмотрите каждую точную копию и поставьте обе ручные отметки."}/></p>
    <LocalizedUi value={status.frames.length > 0 && <div className="ora-v17-table-wrap"><table className="ora-v17-table">
      <caption><LocalizedUi value={"\u0412\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435 \u043A\u043E\u043F\u0438\u0438 \u00B7 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0435 \u043D\u0435\u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u044B\u0435 \u043E\u0442\u043C\u0435\u0442\u043A\u0438"}/></caption>
      <thead><tr><th><LocalizedUi value={"\u041A\u0430\u0434\u0440"}/></th><th><LocalizedUi value={"OCR \u00B7 \u043F\u043E\u043C\u043E\u0449\u044C, \u043D\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430"}/></th><th><LocalizedUi value={"\u041D\u0430\u0434\u043F\u0438\u0441\u0438"}/></th><th><LocalizedUi value={"\u0423\u0437\u043D\u0430\u0432\u0430\u0435\u043C\u044B\u0435 \u043F\u0440\u0438\u0437\u043D\u0430\u043A\u0438"}/></th><th><LocalizedUi value={"\u0421\u043A\u0440\u044B\u0442\u043E \u043E\u0431\u043B\u0430\u0441\u0442\u0435\u0439"}/></th></tr></thead>
      <tbody><LocalizedUi value={status.frames.map(f => <tr key={f.frameId}>
        <td><LocalizedUi value={"\u041A\u0430\u0434\u0440"}/><LocalizedUi value={f.frameId.slice(-1)}/></td><td><LocalizedUi value={f.ocrState === "not-run" ? "Не запускался" : f.ocrState === "stale" ? "Результат относится к старой копии" :
                    f.ocrState === "no-text-found" ? "Надписи не найдены · не подтверждает обезличивание" :
                        `Найдено ${f.regionCount} · ${f.textAcknowledged ? "оставлены по ручной отметке" : "нужно скрыть или осмотреть"}`}/></td>
        <td><LocalizedUi value={f.textReviewed ? "Ручная отметка поставлена" : "Нужна ручная проверка"}/></td>
        <td><LocalizedUi value={f.visualReviewed ? "Ручная отметка поставлена" : "Нужна ручная проверка"}/></td><td><LocalizedUi value={f.redactionCount}/></td>
      </tr>)}/></tbody>
    </table></div>}/>
    <details><summary><LocalizedUi value={"\u0427\u0442\u043E \u0435\u0449\u0451 \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0434\u043B\u044F \u0441\u0435\u0440\u0432\u0435\u0440\u043D\u043E\u0433\u043E \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u0438\u044F Cloud"}/></summary><ul>
      <LocalizedUi value={status.serverChecks.map(check => <li key={check.id}><LocalizedUi value={check.label}/><LocalizedUi value={"\u00B7 \u043D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043E"}/></li>)}/>
    </ul><p><LocalizedUi value={"\u041B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0435 \u043E\u0442\u043C\u0435\u0442\u043A\u0438, OCR \u0438 SHA \u043D\u0435 \u0437\u0430\u043C\u0435\u043D\u044F\u044E\u0442 \u043D\u0435\u0437\u0430\u0432\u0438\u0441\u0438\u043C\u0443\u044E \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443 \u0438 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u0441\u0435\u0440\u0432\u0435\u0440\u043D\u044B\u0439 \u043A\u043E\u043D\u0442\u0443\u0440."}/></p></details>
  </section>;
}
