"use client";
import { LocalizedUi, useUiTranslator } from '../../components/ConciliumBridge';
import DetectorAvailabilityGuide from "../../components/DetectorAvailabilityGuide";
import WorkspaceNavigation from "../../components/WorkspaceNavigation";
import DetectorDeployButton from "../../components/DetectorDeployButton";
import OriginalWorkerFleetReadiness from "../../components/OriginalWorkerFleetReadiness";
import TechnicalConnectionStatus from "./TechnicalConnectionStatus";
import "./technical.css";
export default function TechnicalPage() {
    const __ui = useUiTranslator();
    return <main className="hub-page">
  <header className="hub-top"><a className="hub-brand" href="/viewer">OPUS RADIOLOGY AI</a>
   <WorkspaceNavigation active="technical"/></header>
  <div className="hub-container">
   <p className="hub-eyebrow"><LocalizedUi value={"Для разработчика и администратора"}/></p>
   <h1><LocalizedUi value={"Техническая панель"}/></h1>
   <p className="hub-lead"><LocalizedUi value={"Статус подключения, оригинальные модели, исследовательские модули и настройки собраны здесь — отдельно от рабочего экрана рентгенолога."}/></p>
   <div className="hub-grid">
    <TechnicalConnectionStatus />
    <section className="hub-panel">
     <h2><LocalizedUi value={"Оригинальные модели"}/></h2>
     <p><LocalizedUi value={"Приложение автоматически определяет доступные локальные CPU/GPU-исполнители. Это реальная проверка работающих worker и весов, а не список обещанных диагнозов."}/></p>
     <DetectorDeployButton />
     <OriginalWorkerFleetReadiness />
     <a href="/guide#architecture"><LocalizedUi value={"Как выбираются модели"}/></a>
    </section>
   </div>
   <section className="hub-panel">
    <DetectorAvailabilityGuide />
   </section>
   <section className="hub-panel">
    <h2><LocalizedUi value={"Сохранённые исследовательские инструменты"}/></h2>
    <p><LocalizedUi value={"Все прежние технические панели оставлены в приложении. Для врача они не нужны, но доступны по отдельным ссылкам."}/></p>
    <div className="hub-links">
     <a href="/viewer?research=1"><strong><LocalizedUi value={"Расширенный DICOM-просмотрщик"}/></strong><span><LocalizedUi value={"MONAI, NIfTI, морфометрия, просмотр результатов детекторов, исследовательские настройки"}/></span></a>
     <a href="/?research=1"><strong><LocalizedUi value={"Исходная техническая рабочая станция"}/></strong><span><LocalizedUi value={"Дополнительная визуализация, MPR/3D, планирование обработки, старые исследовательские панели"}/></span></a>
     <a href="/clinical-lab"><strong><LocalizedUi value={"Лаборатория моделей и примеров"}/></strong><span><LocalizedUi value={"Результаты на публичных данных, состояние экспериментальных направлений и проверка свидетельств"}/></span></a>
    </div>
   </section>
   <section className="hub-panel">
    <h2><LocalizedUi value={"Проверка и наладка"}/></h2>
    <p><LocalizedUi value={"Один раз настройте доступ к разрешённым публичным данным и провайдеру. Оригинальные тяжёлые модели требуют отдельно запущенных worker; при их отсутствии приложение не должно выдавать фиктивные находки."}/></p>
    <pre><code>cd ~/Desktop/opus-radiology-ai-github/web{"\n"}npm run setup:analysis{"\n"}npm run dev</code></pre>
    <p className="hub-muted"><LocalizedUi value={"Команда настройки применяется только к локальному исследовательскому режиму. Не используйте её для отправки неразрешённых данных пациентов."}/></p>
    <a href="/guide#troubleshooting"><LocalizedUi value={"Диагностика неисправностей"}/></a>
   </section>
  </div>
 </main>;
}
