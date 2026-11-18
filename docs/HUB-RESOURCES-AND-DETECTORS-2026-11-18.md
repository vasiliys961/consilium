# Память проекта: ресурсы и ранее подобранные детекторы

Записано 18 ноября 2026 по просьбе владельца. **Только исследование исходников и документация: ничего не устанавливалось, модели не запускались, облака не подключались.** Hub остаётся самостоятельным следующим проектом после станции и решения владельца.

## Что хочет владелец

Hub — единое место подключения API, MCP, файлов, видео, камер, USB/приборов и внешних детекторов, включая модели MONAI. Общий интерфейс объединяет отдельные адаптеры. Детектор возвращает привязанные к исходному исследованию измерения, кандидаты или маски в тот же клинический случай для проверки врачом. Технические сведения размещать в настройках, не перегружать основной экран врача.

## Уже имеющиеся ресурсы

Сведения ниже сообщил владелец; непосредственно к этим серверам в этой задаче не подключались.

| Ресурс | Что известно | Предлагаемое использование позже |
|---|---|---|
| Timeweb | Небольшой сервер, уже размещает приложения Opus; CPU/RAM/план не уточнялись | Сохранить работающие приложения. Новые детекторы только после оценки запаса ресурсов |
| Grok Bot, облачный компьютер | Debian 13 trixie, ядро 6.12.113, x86_64 VM, Intel Xeon, 8 ядер/8 потоков. RAM всего около 15 ГБ, занято около 11 ГБ, доступно около 3,6 ГБ, swap нет. GPU не обнаружен | Кандидат для изолированных пробных CPU-запусков; постоянный внешний сервис ещё не проверен |
| Диски Grok Bot | Системный 128 ГБ, свободно около 123 ГБ; /workspace 125 ГБ, свободно около 119 ГБ | Данных по диску достаточно для планирования, но место не заменяет RAM. Не считать оба тома единым диском |
| Яндекс Диск | Подписка, 1 ТБ | Книги, разрешённые файлы моделей, зашифрованные резервные копии; вычисления выполняются отдельно |
| Vercel | Оплаченная подписка, точный план не уточнён | Возможный отдельный интерфейс Hub, API и координация. Подписка не означает уже выполненный перенос приложения или GPU-ресурсы |

3,6 ГБ — снимок доступной памяти, а не постоянный предел VM. Сначала read-only проверить занятость и точные байты MemTotal/MemAvailable; не завершать чужие процессы и не менять swap. В существующем установщике требуется Linux, **16 ГиБ общей RAM и 30 ГиБ свободного диска**. Округлённые «15 ГБ» не доказывают прохождение этого порога. Порог не снижать ради установки. У отдельных worker есть дополнительные требования к свободной памяти.

Grok Bot предоставляет облачный компьютер с консолью и файлами, однако доступ из Doctor Opus, жизненный цикл программ, CPU-время и условия постоянного размещения ещё не проверены. Обновления могут удалить установленные пакеты: [документация](https://docs.x.ai/grok-bot/computer-and-apps). Для Vercel обычные Functions имеют ограничения памяти/времени/размера входа, поэтому большие DICOM не планировать передавать через обычное тело функции: [лимиты](https://vercel.com/docs/functions/limitations). Работающие приложения на Timeweb и main/3107 не переносить по этой заметке. Автоматический Git deploy в текущем репозитории отключён; эту настройку не менять.

## Где найдены прежние наработки

- Встроенная копия Radiology: [README](../integrations/radiology/README.md), [профили Python](../integrations/radiology/services/imaging-ai/README.md).
- **Полный перечень: 51 запись клинических задач**, [clinical-pathology-coverage.json](../integrations/radiology/web/public/examples/clinical-pathology-coverage.json). Это не 51 отдельная модель: несколько задач обслуживает один checkpoint.
- [Каталог развёртывания](../integrations/radiology/web/lib/detector-deploy-plan.ts), [проверенные адреса/версии/хеши установщика](../integrations/radiology/scripts/deploy_pinned_detectors.py), [решение о допуске тяжёлых задач](../integrations/radiology/services/imaging-ai/heavy_detector_router.py).
- Проверен исходный проект только для чтения: `/Users/maxmobiles.ru/Desktop/opus-radiology-ai-github`, текущая локальная ветка `fix/local-study-reviewed-analysis`, HEAD `2745cc69d6b1209bad09af3efccb5b543f9d7eea`, локальный main `ae530f5` от 04.11.2026. Его `docs/clinical-detector-coverage.json` побайтно совпадает с встроенным перечнем.
- Там же: `docs/CPU_DETECTORS_GEMINI_OPUS_PRIVACY.md`, `docs/MONAI_BOUND_NODULE_CT.md`, `docs/CLINICAL_DETECTOR_EXPANSION_DIRECTIVE.md`, `docs/LOCAL_LUNGMASK_WORKER.md`. Исходники/ключи/конфигурации Desktop не изменять.
- Старый `docs/pathology-model-registry.json` содержит только первоначальную MONAI-карточку и устаревшие «не запускалось». Более поздние фактические публичные отчёты подтверждают CPU-запуск. Не принимать раннюю карточку за актуальный итог.

## Что было выбрано и как возвращаться

| Семейство / задача | Что уже есть | Ограничение и следующий шаг |
|---|---|---|
| TorchXRayVision NIH DenseNet121, 6 признаков на рентгене грудной клетки | Настоящий checkpoint, `cxr_xrv_direct_worker.py`, публичные одиночные запуски шести выходов | Одна модель, не шесть независимых детекторов. Только CR/DX, не срез КТ. Кандидат для первого отдельного CPU-замера |
| Lungmask R231 | Проверенный checkpoint, ограниченный CPU-worker, отдельный resource_guard | Сегментация лёгких, не детектор опухолей. Возможный первый малый эксперимент: допуск по фактической геометрии и запасу памяти, не по размеру файла весов |
| MONAI lung_nodule_ct_detection, RetinaNet 0.6.9 | Ревизия и SHA закреплены, `monai_nodule_upload_worker.py`, исходный CPU-прогон LUNA16 | Исторический запуск 1253,636 с (~20,9 мин), RSS процесса 5 185 228 800 B (~4,83 ГиБ). Нынешний worker требует **9 ГиБ свободной RAM**; при 3,6 ГБ не допускается. Независимый FROC не доказан |
| TotalSegmentator lung_nodules | Публичный запуск был | Дублирует задачу MONAI. Не запускать оба ради числа моделей |
| TotalSegmentator Task315 pleural_pericard_effusion | Один worker для двух истинных меток жидкости, публичный запуск | **10 ГиБ свободной RAM**; нулевая маска не исключает выпот; экспертное сравнение ограничено |
| TotalSegmentator kidney_cysts / liver_lesions | Публичные запуски; abdominal worker | Базовый допуск **10 ГиБ свободной RAM**. Для печени в исторической записи Dice ~0,23 на одном случае; ресурсами это не исправить. Требуется независимая проверка |
| IanPan / TotalSegmentator cerebral_bleed / старый SAMIHS | Разные исследовательские ICH-ветки и отчёты | IanPan worker **10 ГиБ свободной RAM**, исходные public-only ограничения. Есть слабые/нулевые старые результаты. Выбрать один пригодный исполнитель; не выдавать любой score за диагноз |
| ISLES22 nnU-Net: ишемический инсульт; MONAI BraTS SegResNet: глиома | Настоящие публичные многопоследовательностные прогоны и общий brain worker | **12 ГиБ свободной RAM**; ISLES DWI/ADC/FLAIR, BraTS четыре совмещённые последовательности. Один FLAIR-файл не заменяет нужные входы |
| MONAI pancreas_ct_dints_segmentation | Публичный CPU-прогон, отдельный исполнитель | **12 ГиБ свободной RAM**. Исторический Dice ~0,20, много пропусков, изменён CPU overlap. Нужна проверка качества, не просто новый сервер |
| MONAI renalStructures_CECT_segmentation | Настоящая специализированная модель и `renal_monai_triphasic_worker.py` | Требуются три совмещённые контрастные фазы и ROI почки; обычная однофазная КТ не подходит. Завершённость реального запуска не подтверждена |
| Raidionics CT_LymphNodes ONNX v13 | Настоящий CPU-forward на vendor CT, direct worker | **10 ГиБ свободной RAM**; узлы, не классификация метастазов. Старый Bouget baseline слабый, не подменять им новую модель |
| wmh_seg 1.6.0: очаги белого вещества FLAIR | Настоящий публичный forward, source-bound DICOM-worker | Watchdog RSS 6 ГиБ — это лимит процесса, не обещанный расход и не порог свободной RAM. Уточнить права исходных данных, различать WMH и рассеянный склероз |
| Mazurowski PE nnU-Net: ТЭЛА на КТ-ангиографии | Checkpoint/исполнитель и публичный эксперимент | **12 ГиБ свободной RAM**, некоммерческие веса, слабое историческое совпадение. Не использовать для исключения ТЭЛА |
| CLN / PanCancerSeg: опухоль лёгкого, однофазная опухоль почки | Оригинальные кандидаты, подготовленные исполнители | В прежнем плане **не менее 64 ГиБ общей RAM**; для нужных вариантов forward ещё не завершён. Текущую VM не считать подходящей |
| LungSCAPE191; NIH/VMI40 костные поражения | Профили/подготовка/отдельные исследовательские пути | Тяжёлый 3D-контур, по умолчанию не загружать; CPU/GPU-ресурс выбирается отдельно. Наличие scaffold не означает выполненный анализ |
| PI-CAI простата, FLAMeS РС, VISTA3D кишка, переломы, метастазы | Кандидаты/контракты, перечислены в полном каталоге | Веса, права, многосерийные входы и настоящий forward проверять по конкретной записи; не объявлять готовыми после добавления RAM |
| Надпочечник / расслоение аорты | Кандидаты с блоком прав | Прежний статус license_blocked. Новое оборудование не устраняет лицензионный барьер |
| OCT / WSI | MONAI-кандидаты для сетчатки/гистологии | Отдельные форматы и подготовка входа; не подключать как ещё один CT-detector |

Все пути worker в таблице относительно `integrations/radiology/services/imaging-ai/`. Размер checkpoint не равен пиковому расходу памяти. Публичные численные результаты — исследовательские свидетельства, не клиническая валидация и не факт установленной службы на Grok/Timeweb.

## Порядок будущего использования

1. После завершения станции и отдельного решения по Hub — выбрать **одну** задачу с реальной врачебной пользой. Первая проверка ресурсов: один рентген или ограниченный R231; MONAI nodules только при соблюдении 9 ГиБ свободной памяти.
2. Проверить нужные версии библиотек, право использования именно весов и данных, исходный SHA и настоящий вход. Существующие pinned версии — историческая воспроизводимость, не автоматическое разрешение установки сегодня.
3. Использовать отдельный worker, один job, лимиты памяти/времени, отмену и отчёт о неоценённом исследовании. Не запускать общий «установить всё», не менять существующие лимиты.
4. Измерить полный цикл на синтетике/разрешённом публичном примере: подготовка, фактический inference, память, время, геометрия результата, возврат и повторное открытие в том же случае. CI/архив результата не выдавать за новый запуск на открытом снимке.
5. Подключение worker из другого облака проектировать отдельно: текущие loopback/public-only/origin/token ограничения нельзя заменять публичным портом. Извне передавать только разрешённый подготовленный вход, сохранять источник и источник каждого утверждения. Обезличивание не обещать одной галочкой.
6. Маски, измерения, кандидаты и модель/версия возвращаются в клинический случай. Copilot координирует, профильные модели обсуждают результат, врач принимает решение. LLM в нынешнем приложении остаются OpenRouter-only.
7. Для тяжёлых задач после измерений определить потребность в отдельной RAM/GPU-машине. Платные аренды/API, новые внешние подключения и реальные пациентские данные требуют соответствующего отдельного разрешения; эта заметка их не предоставляет.

## Полный перечень для продолжения

Исторические статусы ниже переписаны без повышения готовности. `real_trial_running` — запись старого этапа, не запущенный сейчас процесс. `real_case_measured` — запись об отдельном исследовательском прогоне; несколько записей могут относиться к одной модели/одному запуску.

Исходный SHA-256: `7ea5eac65e6ec3b3829f3b4d493519e35423d1531157f8e3b3fe04f860f27ac6`. Счётчики: `real_case_measured` — 19, `real_trial_running` — 1, `real_checkpoint_candidate` — 22, `license_blocked` — 2, `weights_unverified` — 7.

| Задача | Статус в прежнем каталоге | Источник модели |
|---|---|---|
| `lung-nodule-retinanet` | `real_case_measured` | [Исходный источник](https://huggingface.co/MONAI/lung_nodule_ct_detection) |
| `lung-nodule-totalseg` | `real_case_measured` | [Исходный источник](https://github.com/wasserth/TotalSegmentator/tree/v2.18.0) |
| `pleural-effusion` | `real_case_measured` | [Исходный источник](https://github.com/wasserth/TotalSegmentator/tree/v2.18.0) |
| `pericardial-effusion` | `real_case_measured` | [Исходный источник](https://github.com/wasserth/TotalSegmentator/tree/v2.18.0) |
| `liver-lesions-ct` | `real_case_measured` | [Исходный источник](https://github.com/wasserth/TotalSegmentator/tree/v2.18.0) |
| `renal-cysts-ct` | `real_case_measured` | [Исходный источник](https://github.com/wasserth/TotalSegmentator/tree/v2.18.0) |
| `intracerebral-bleed-ct` | `real_case_measured` | [Исходный источник](https://github.com/wasserth/TotalSegmentator/tree/v2.18.0) |
| `aneurysm-tof-mra` | `real_trial_running` | [Исходный источник](https://github.com/wasserth/TotalSegmentator/tree/v2.18.0) |
| `pancreatic-tumor-ct` | `real_case_measured` | [Исходный источник](https://github.com/Project-MONAI/model-zoo/tree/dev/models/pancreas_ct_dints_segmentation) |
| `glioma-4sequences-mri` | `real_case_measured` | [Исходный источник](https://github.com/Project-MONAI/model-zoo/tree/dev/models/brats_mri_segmentation) |
| `renal-neoplasm-3phase-ct` | `real_checkpoint_candidate` | [Исходный источник](https://github.com/Project-MONAI/model-zoo/tree/dev/models/renalStructures_CECT_segmentation) |
| `brain-metastases-4seq` | `real_checkpoint_candidate` | [Исходный источник](https://brats.readthedocs.io/en/latest/guides/segmentation/) |
| `liver-focal-lesions-mr` | `real_checkpoint_candidate` | [Исходный источник](https://github.com/wasserth/TotalSegmentator/tree/v2.18.0) |
| `liver-tumor-ct-alt` | `real_checkpoint_candidate` | [Исходный источник](https://github.com/wasserth/TotalSegmentator/tree/v2.18.0) |
| `reticular-pseudodrusen-oct` | `real_checkpoint_candidate` | [Исходный источник](https://github.com/Project-MONAI/model-zoo/tree/dev/models/retinalOCT_RPD_segmentation) |
| `pathology-metastases-wsi` | `real_checkpoint_candidate` | [Исходный источник](https://github.com/Project-MONAI/model-zoo/tree/dev/models/pathology_tumor_detection) |
| `aortic-dissection-ct` | `license_blocked` | [Исходный источник](https://github.com/wasserth/TotalSegmentator/tree/v2.18.0) |
| `ischemic-stroke-dwi` | `real_case_measured` | [Исходный источник](https://huggingface.co/akifkaradag/isles22-nnunetv2-stroke-segmentation) |
| `pulmonary-embolism-ctpa` | `real_case_measured` | [Исходный источник](https://huggingface.co/yzluka/PulmonaryEmbolismSegmentation) |
| `interstitial-lung-disease-hrct` | `weights_unverified` | [Исходный источник](https://huggingface.co/models?search=ILD) |
| `vertebral-fracture-ct` | `real_checkpoint_candidate` | [Исходный источник](https://github.com/zxjasonhu/cspine-2022-challenge-inference-collection) |
| `spinal-metastases-mri` | `weights_unverified` | [Исходный источник](https://github.com/Project-MONAI/model-zoo) |
| `colon-cancer-ct` | `real_checkpoint_candidate` | [Исходный источник](https://huggingface.co/MONAI/vista3d) |
| `prostate-cancer-mpmri` | `real_checkpoint_candidate` | [Исходный источник](https://github.com/DIAGNijmegen/picai_nnunet_gc_algorithm) |
| `pelvic-fractures-ct` | `real_checkpoint_candidate` | [Исходный источник](https://github.com/YzzLiu/FracSegNet) |
| `pulmonary-pneumothorax-xray` | `real_case_measured` | [Исходный источник](https://github.com/mlmed/torchxrayvision/releases/tag/v1) |
| `cardiomegaly-xray` | `real_case_measured` | [Исходный источник](https://huggingface.co/torchxrayvision/densenet121-res224-nih) |
| `coronary-calcification-ct` | `real_checkpoint_candidate` | [Исходный источник](https://github.com/Raffi-Hagopian/AI-CAC/releases/tag/v1.0.0) |
| `breast-tumor-mammography` | `weights_unverified` | [Исходный источник](https://github.com/Project-MONAI/model-zoo/tree/dev/models/breast_density_classification) |
| `acute-pancreatitis-ct` | `weights_unverified` | [Исходный источник](https://github.com/Project-MONAI/model-zoo/tree/dev/models/pancreas_ct_dints_segmentation) |
| `renal-stones-noncontrast-ct` | `real_checkpoint_candidate` | [Исходный источник](https://github.com/wasserth/TotalSegmentator/tree/v2.18.0) |
| `osteonecrosis-hip-mri` | `weights_unverified` | [Исходный источник](https://github.com/Project-MONAI/model-zoo) |
| `spinal-myeloma-osteolytic-vmi40-ct` | `real_checkpoint_candidate` | [Исходный источник](https://zenodo.org/records/18598645) |
| `brain-metastases-t1ce-qtim` | `real_checkpoint_candidate` | [Исходный источник](https://github.com/QTIM-Lab/Brain-Mets-Seg) |
| `aortic-dilatation-ct-morphometry` | `real_checkpoint_candidate` | [Исходный источник](https://github.com/wasserth/TotalSegmentator/tree/v2.18.0) |
| `emphysema-laa950-inspiratory-ct` | `real_checkpoint_candidate` | [Исходный источник](https://github.com/JoHof/lungmask) |
| `pleural-effusion-cxr` | `real_case_measured` | [Исходный источник](https://huggingface.co/torchxrayvision/densenet121-res224-nih) |
| `pneumonia-cxr` | `real_case_measured` | [Исходный источник](https://github.com/mlmed/torchxrayvision/releases/tag/v1) |
| `pulmonary-edema-cxr` | `real_case_measured` | [Исходный источник](https://github.com/mlmed/torchxrayvision/releases/tag/v1) |
| `lung-mass-cxr` | `real_case_measured` | [Исходный источник](https://github.com/mlmed/torchxrayvision/releases/tag/v1) |
| `brain-ventriculomegaly-ct-evans` | `real_checkpoint_candidate` | [Исходный источник](https://github.com/wasserth/TotalSegmentator/tree/v2.18.0) |
| `mediastinal-lymph-node-contrast-ct` | `real_case_measured` | [Исходный источник](https://github.com/dbouget/ct_mediastinal_structures_segmentation) |
| `lung-tumor-segmentation-ct` | `real_checkpoint_candidate` | [Исходный источник](https://github.com/MonCarFa/PET-CT-Lung-Segmentation-Models) |
| `mediastinal-primary-mass-ct` | `weights_unverified` | [Исходный источник](https://github.com/dbouget/ct_mediastinal_structures_segmentation) |
| `pleural-chest-wall-mass-ct` | `weights_unverified` | [Исходный источник](https://github.com/wasserth/TotalSegmentator/tree/v2.18.0) |
| `white-matter-hyperintensities-flair` | `real_case_measured` | [Исходный источник](https://github.com/jinghangli98/wmh_seg) |
| `multiple-sclerosis-lesions-flair` | `real_checkpoint_candidate` | [Исходный источник](https://zenodo.org/records/17955359) |
| `renal-neoplasm-singlephase-ct` | `real_checkpoint_candidate` | [Исходный источник](https://huggingface.co/KS987/PanCancerSeg-Specialized-weights) |
| `cervical-spine-fracture-ct` | `real_checkpoint_candidate` | [Исходный источник](https://github.com/zxjasonhu/cspine-2022-challenge-inference-collection) |
| `adrenal-tumor-ct` | `license_blocked` | [Исходный источник](https://huggingface.co/yunnaa/Adrenal-Tumor-nnUNet) |
| `hepatic-steatosis-ncct-attenuation` | `real_checkpoint_candidate` | [Исходный источник](https://github.com/wasserth/TotalSegmentator/tree/v2.18.0) |
