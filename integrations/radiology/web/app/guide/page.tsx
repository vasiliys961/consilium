"use client";
import { LocalizedUi, useUiTranslator } from '../../components/ConciliumBridge';
import WorkspaceNavigation from "../../components/WorkspaceNavigation";
import "./guide.css";
export default function GuidePage() {
    const __ui = useUiTranslator();
    return <main className="guide-page">
  <header className="guide-top">
   <a href="/viewer" className="guide-brand">OPUS RADIOLOGY AI</a>
   <WorkspaceNavigation active="guide"/>
  </header>
  <div className="guide-wrap">
   <header className="guide-hero">
    <p className="guide-eyebrow"><LocalizedUi value={"Документация в приложении"}/></p>
    <h1><LocalizedUi value={"Как пользоваться Opus Radiology AI"}/></h1>
    <p><LocalizedUi value={"Повседневная работа врача — страница «Исследование». На этом компьютере сейчас запускаются просмотр снимков и, после проверки копий, Gemini и Opus. Детекторы патологии ждут отдельный сервер с установленными весами."}/></p>
   </header>
   <nav className="guide-index" aria-label={__ui("Разделы руководства")}>
    <a href="#clinician"><LocalizedUi value={"Врачу"}/></a>
    <a href="#server"><LocalizedUi value={"Что запустится на сервере"}/></a>
    <a href="#administrator"><LocalizedUi value={"Настройка"}/></a>
    <a href="#architecture"><LocalizedUi value={"Как работает"}/></a>
    <a href="#troubleshooting"><LocalizedUi value={"Если не анализирует"}/></a>
    <a href="#restrictions"><LocalizedUi value={"Ограничения"}/></a>
   </nav>
   <section id="clinician" className="guide-section">
    <span className="guide-section-number"><LocalizedUi value={"01 / Врач"}/></span>
    <h2><LocalizedUi value={"Открыть снимки и получить заключение"}/></h2>
    <ol className="guide-steps">
     <li><strong><LocalizedUi value={"Откройте «Исследование»"}/></strong> — <a href="/viewer"><LocalizedUi value={"просмотрщик DICOM"}/></a><LocalizedUi value={". Корневой адрес переходит сюда же. Старая станция остаётся только по отдельной ссылке с технической панели."}/></li>
     <li><strong><LocalizedUi value={"Выберите папку или один DICOM-файл."}/></strong><>{" "}<LocalizedUi value={"Заголовки читаются на этом компьютере. Несколько серий выбираются слева. Один файл тоже можно анализировать: объёмные детекторы для него не назначаются."}/></></li>
     <li><strong><LocalizedUi value={"Смотрите снимок своими окнами."}/></strong><>{" "}<LocalizedUi value={"Колесо листает срезы. «Перемещение» сдвигает увеличенный кадр. «Окно мышью», поля WW и WC и кнопки «Для врача» — «Мозг», «Мягкие ткани», «Лёгкие», «Кости» — меняют только экран. «Сбросить вид» возвращает масштаб и окно, с которым файл открылся. Эти кнопки в анализ не уходят."}/></></li>
     <li><strong><LocalizedUi value={"«Три плоскости» и «3D»"}/></strong><>{" "}<LocalizedUi value={"включаются, только если у серии подтверждена геометрия и хватает памяти. На одном срезе они неактивны. «Плавная» интерполяция сглаживает стыки срезов в объёмном виде. «Без сглаживания» показывает ступени вокселей."}/></></li>
     <li><strong><LocalizedUi value={"Нажмите «Анализировать исследование»."}/></strong><>{" "}<LocalizedUi value={"Для длинной серии можно заранее выбрать отдельные срезы или диапазон. Если подготовка всей папки уже идёт, сверху есть «Остановить и выбрать отдельные срезы». Окна копий для ИИ задаются в настройках «Как показывать ткани на копиях для ИИ» и «Второй вид того же среза», до подготовки. Для грудной клетки с указанной областью и шкалой HU по умолчанию слева лёгочное окно, справа мягкие ткани. Кости и мозг в тот же запрос не входят."}/></></li>
     <li><strong><LocalizedUi value={"Проверьте копии один раз."}/></strong><>{" "}<LocalizedUi value={"Они готовятся локально, без DICOM-тегов. Кнопка отправки не нажимается, пока не готовы все выбранные группы. «Разобрать кадры с возможными надписями» открывает подозрительные группы. OCR не доказывает обезличивание: лицо и пропущенный текст остаются на проверке врача. Затем отметьте разрешение и нажмите «Отправить всю проверенную серию в анализ»."}/></></li>
     <li><strong><LocalizedUi value={"Дождитесь заключения."}/></strong><>{" "}<LocalizedUi value={"Gemini читает группы до 4 срезов. На серии до 16 срезов, включая один файл, Opus отдельно смотрит выбранные кадры, даже если Gemini ничего не отметил. На длинной серии в этот отдельный просмотр попадают отмеченные кадры и соседние, не больше 16; если отметок нет, отдельный просмотр пропускается. Затем Opus пишет протокол только по обработанным срезам. Сбой одной группы не отменяет уже полученные ответы. Кнопка сохранения — «Сохранить заключение TXT»."}/></></li>
     <li><strong><LocalizedUi value={"При необходимости переведите текст."}/></strong><>{" "}<LocalizedUi value={"«Перевести всё заключение на английский» отправляет весь предварительный протокол: описание, заключение и рекомендации. Перед этим нужна отметка, что в тексте нет идентификаторов. Снимки повторно не уходят."}/></></li>
    </ol>
    <p className="guide-note"><LocalizedUi value={"При смене страницы открытые через браузер файлы могут потребовать повторной загрузки. Во время чтения DICOM удобнее оставаться в разделе «Исследование»."}/></p>
    <h3><LocalizedUi value={"Маска и дополнительные карточки"}/></h3>
    <p><LocalizedUi value={"Маска — цвет поверх среза. Она не диагноз. Для заключения она не нужна. «Выделить правое и левое лёгкое» запускается отдельно, только если на этом компьютере уже отвечает локальная служба Lungmask. «Открыть готовую разметку» принимает файл .nii этой серии, не DICOM."}/></p>
    <p><><LocalizedUi value={"Карточки LUNA16, импорт JSON, ручные формы матового стекла, средостения и образований лежат в расширенном DICOM. Они не разбирают открытое исследование. Что из них пример, что ручная запись, а что ждёт сервер, показано на"}/>{" "}</><a href="/technical"><LocalizedUi value={"технической панели"}/></a>.</p>
   </section>
   <section id="server" className="guide-section">
    <span className="guide-section-number"><LocalizedUi value={"02 / Сервер"}/></span>
    <h2><LocalizedUi value={"Что запустится на сервере"}/></h2>
    <p><LocalizedUi value={"Проверка с этого Mac сейчас такая: Gemini и Opus подключены, все десять детекторов ниже — «не подключены». Открытие снимка их не запускает. Они появятся в анализе, когда на приватном Linux-сервере отвечают оригинальные веса и серия подходит. Иначе задача остаётся неоценённой. Это не «норма» и не клиническая проверка точности."}/></p>
    <ul>
     <li><strong><LocalizedUi value={"Узлы лёгких · MONAI."}/></strong><>{" "}<LocalizedUi value={"Серия КТ грудной клетки с геометрией. На этом Mac модель не считается."}/></></li>
     <li><strong><LocalizedUi value={"Выпот · одна модель task315."}/></strong><>{" "}<LocalizedUi value={"Плевральная и перикардиальная жидкость той же серии. Вторая модель на те же классы не запускается."}/></></li>
     <li><strong><LocalizedUi value={"ТЭЛА."}/></strong><>{" "}<LocalizedUi value={"Только после отметки врача, что серия — КТ-ангиография лёгочных артерий."}/></></li>
     <li><strong><LocalizedUi value={"Лимфоузлы средостения · Raidionics."}/></strong><>{" "}<LocalizedUi value={"После отметки, что это контрастная КТ грудной клетки. Метастаз по одной маске не ставится."}/></></li>
     <li><strong><LocalizedUi value={"Живот."}/></strong><>{" "}<LocalizedUi value={"Кисты почек, очаги печени, поджелудочная на серии живота. Трёхфазная модель опухоли почки ждёт три зарегистрированные фазы."}/></></li>
     <li><strong><LocalizedUi value={"Кровоизлияние."}/></strong><>{" "}<LocalizedUi value={"КТ головы из 8–64 срезов."}/></></li>
     <li><strong><LocalizedUi value={"МРТ головы."}/></strong><>{" "}<LocalizedUi value={"WMH, ишемические очаги или глиома — каждая по своей подтверждённой последовательности. Неподтверждённая последовательность в модель не отправляется."}/></></li>
     <li><strong><LocalizedUi value={"Рентген грудной клетки."}/></strong><>{" "}<LocalizedUi value={"Один снимок CR или DX и шесть признаков одной модели."}/></></li>
    </ul>
    <p><LocalizedUi value={"Lungmask на этот список не входит. Это отдельная локальная служба: она красит правое и левое лёгкое и не ищет узлы. Остеонекроз считается в лаборатории по PNG одной МРТ-серии и DICOM не принимает."}/></p>
   </section>
   <section id="administrator" className="guide-section">
    <span className="guide-section-number"><LocalizedUi value={"03 / Администратор"}/></span>
    <h2><LocalizedUi value={"Запуск на Mac и однократная настройка"}/></h2>
    <p><LocalizedUi value={"Это установка рабочего места, не шаг перед каждым исследованием. Нужны Node.js 22 или новее и каталог проекта."}/></p>
    <h3><LocalizedUi value={"1. Локальный запуск"}/></h3>
    <pre><code>cd ~/Desktop/opus-radiology-ai-github{"\n"}git status --short{"\n"}git pull --ff-only{"\n"}cd web{"\n"}npm ci{"\n"}npm run dev</code></pre>
    <p><><LocalizedUi value={"Откройте"}/>{" "}</><a href="/viewer">http://localhost:3000/viewer</a><><LocalizedUi value={". Команда"}/>{" "}</><code>git status --short</code><>{" "}<LocalizedUi value={"показывает несохранённые изменения до обновления."}/></></p>
    <h3><LocalizedUi value={"2. Gemini и Opus"}/></h3>
    <p><><LocalizedUi value={"На этом рабочем месте облачный сеанс уже отвечает: Gemini 3.8 Flash читает кадры, Claude Opus 5.5 пишет протокол. Подключение само по себе снимки не отправляет. Передача начинается после проверки копий и отметки врача. Для новой установки параметры сохраняют в"}/>{" "}</><code>web/.env.development.local</code><><LocalizedUi value={". Файл"}/>{" "}</><code>web/.env.local</code><>{" "}<LocalizedUi value={"не переписывают и не копируют в Git."}/></></p>
    <pre><code>RADIOLOGY_ENABLE_DEIDENTIFIED_OPENROUTER_PILOT=1{"\n"}RADIOLOGY_OPENROUTER_HEALTH_DATA_APPROVED=1{"\n"}RADIOLOGY_LOCAL_REVIEWED_FRAME_SESSION=1</code></pre>
    <p><><LocalizedUi value={"Для заранее согласованных публичных данных один раз, в каталоге"}/>{" "}</><code>web</code>: <code>npm run setup:analysis</code><><LocalizedUi value={", затем снова"}/>{" "}</><code>npm run dev</code><LocalizedUi value={". Скрипт подключает облачный текст. Веса MONAI, TotalSegmentator и nnU-Net он не скачивает."}/></p>
    <h3><LocalizedUi value={"3. Детекторы"}/></h3>
    <p><><LocalizedUi value={"Токены и пути к весам врач не вводит. Администратор один раз поднимает worker на приватном Linux-сервере."}/>{" "}</><a href="/technical"><LocalizedUi value={"Техническая панель"}/></a><>{" "}<LocalizedUi value={"показывает живой статус. Пока там «не подключён», в заключении этой модели не будет."}/></></p>
   </section>
   <section id="architecture" className="guide-section">
    <span className="guide-section-number"><LocalizedUi value={"04 / Устройство"}/></span>
    <h2><LocalizedUi value={"Как выполняется анализ"}/></h2>
    <div className="guide-flow" aria-label={__ui("Основные этапы анализа")}>
     <div><strong>DICOM</strong><span><LocalizedUi value={"Серия или один файл остаются на компьютере"}/></span></div>
     <div><strong><LocalizedUi value={"Копии"}/></strong><span><LocalizedUi value={"Локальные окна для ИИ, без тегов исходного файла"}/></span></div>
     <div><strong>Gemini</strong><span><LocalizedUi value={"Группы до 4 проверенных срезов"}/></span></div>
     <div><strong>Opus</strong><span><LocalizedUi value={"Отдельный просмотр части кадров и текст протокола"}/></span></div>
    </div>
    <p><LocalizedUi value={"Детектор идёт параллельно только если серия ему подходит и worker отвечает. Его отсутствие не подменяется догадкой модели. В протокол попадают обработанные срезы и названные окна. Остальные срезы и окна остаются неоценёнными."}/></p>
    <p><><LocalizedUi value={"Технические экраны:"}/>{" "}</><a href="/technical"><LocalizedUi value={"панель"}/></a>, <a href="/viewer?research=1"><LocalizedUi value={"расширенный DICOM"}/></a>, <a href="/?research=1"><LocalizedUi value={"прежняя станция"}/></a>, <a href="/clinical-lab"><LocalizedUi value={"лаборатория примеров"}/></a>.</p>
   </section>
   <section id="troubleshooting" className="guide-section">
    <span className="guide-section-number"><LocalizedUi value={"05 / Диагностика"}/></span>
    <h2><LocalizedUi value={"Почему не получается заключение"}/></h2>
    <dl className="guide-diagnostics">
     <dt><LocalizedUi value={"Кнопка отправки не нажимается"}/></dt>
     <dd><LocalizedUi value={"Пока готовится папка, отправка скрыта до последней группы. Для одного среза остановите подготовку и укажите номер. После подготовки нужна отметка, что копии просмотрены."}/></dd>
     <dt><LocalizedUi value={"Рабочее место не подключено к Gemini/Opus"}/></dt>
     <dd><><LocalizedUi value={"Снимки смотреть можно. Облачный разбор недоступен, пока"}/>{" "}</><a href="/technical"><LocalizedUi value={"техническая панель"}/></a><>{" "}<LocalizedUi value={"не покажет подключение. Повторный запуск после настройки может расходовать кредиты."}/></></dd>
     <dt><LocalizedUi value={"Детектор не появился"}/></dt>
     <dd><LocalizedUi value={"На этом Mac десять серверных моделей не подключены. Один файл их не запускает. Нужны серия с геометрией, подходящая область и ответ worker. Иначе задачи нет, и это не отрицательный результат."}/></dd>
     <dt><LocalizedUi value={"Окно на экране не совпало с разбором"}/></dt>
     <dd><LocalizedUi value={"Кнопки «Для врача» не выбирают копию для ИИ. Окно анализа задаётся перед подготовкой копий."}/></dd>
     <dt><LocalizedUi value={"Нет «Трёх плоскостей» или «3D»"}/></dt>
     <dd><LocalizedUi value={"У серии нет подтверждённой геометрии или не хватает памяти. Это не связано с Gemini и Opus. 2D-разбор выбранных срезов остаётся доступен."}/></dd>
     <dt><LocalizedUi value={"Заключение оборвалось"}/></dt>
     <dd><LocalizedUi value={"Готовым считается редактируемый текст. Уже полученные группы повторно не отправляются. Можно запросить заключение по ним или продолжить оставшиеся срезы."}/></dd>
    </dl>
   </section>
   <section id="restrictions" className="guide-section">
    <span className="guide-section-number"><LocalizedUi value={"06 / Ограничения"}/></span>
    <h2><LocalizedUi value={"Что означает результат"}/></h2>
    <p><LocalizedUi value={"Просмотр DICOM и ответ модели — не клиническая проверка точности. Предварительный протокол читает врач. Нет кандидата детектора — заболевание не исключено. Нет детектора на этом компьютере — исследование не оценено этой моделью."}/></p>
    <p><LocalizedUi value={"Облачная передача идёт только после проверки исходящих копий. OCR не делает исследование обезличенным. В пакете серии для внешней программы могут остаться идентификаторы; для обычного заключения этот пакет не нужен."}/></p>
   </section>
   <footer className="guide-footer"><a href="/viewer"><LocalizedUi value={"К исследованию"}/></a><a href="/technical"><LocalizedUi value={"К технической панели"}/></a></footer>
  </div>
 </main>;
}
