'use client';
import {useWorkspaceLanguage} from './workspace-language';
import styles from './physician-help.module.css';

export function ReferenceInstructions({expanded=false,station=false}:{expanded?:boolean;station?:boolean}){
 const {t}=useWorkspaceLanguage();
 const steps=<><ol className={styles.referenceSteps}>
  <li>{station?t('Нажмите «Добавить руководство или статью» ниже и выберите документ с компьютера.'):t('В клиническом случае откройте «Материалы» → «Рекомендации и статьи» и нажмите «Добавить руководство или статью».')}</li>
  <li>{t('Выберите PDF, DOCX, TXT или MD. Можно добавить книгу, главу, руководство или статью.')}</li>
  <li>{t('В вопросе укажите, что нужно проверить по этому документу, и нажмите «Разобрать случай». После ответа откройте «Источники для проверки».')}</li>
 </ol><p className={styles.example}>{t('Пример вопроса: «Какие обследования рекомендует загруженный документ для этого случая?»')}</p><p>{t('К случаю можно прикрепить источник до 8 МБ. Большие книги до 250 МБ добавляйте в «Личную библиотеку»; приложение подберёт относящиеся к вопросу страницы.')}</p><p>{t('При внешнем поиске приоритет имеют международные руководства и индексируемые исследования. Локальные рекомендации дополняют подборку. Язык ответа не ограничивает язык источников.')}</p></>;
 return <div className={styles.referenceCopy}><p>{t('Это дополнительные источники для ответа по текущему случаю. Вы сами добавляете нужные документы; заранее загруженной подборки книг здесь нет. Можно работать без них.')}</p>{expanded?steps:<details className={styles.details}><summary>{t('Как добавить источник и задать вопрос')}</summary>{steps}</details>}</div>;
}

export function ProductGuide({onStart}:{onStart:()=>void}){
 const {t}=useWorkspaceLanguage();
 return <details className={styles.productGuide} aria-label={t('Возможности приложения')}>
  <summary>{t('Как работать с Doctor Opus')}</summary>
  <p>{t('Copilot принимает задачу, предлагает последовательность и обращается к готовым инструментам. Клинический разбор выполняют профильные модели; результаты сохраняются в случае.')}</p>
  <button type="button" onClick={onStart}>{t('＋ Новый случай')}</button>
  <ReferenceInstructions/>
 </details>;
}
