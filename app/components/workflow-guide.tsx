import { useWorkspaceLanguage } from "@/app/components/workspace-language";
import styles from "./physician-help.module.css";
import type { WorkflowGuide, GuideAction } from '@/lib/workflow-guide';
export function WorkflowGuideView({ guide, onAction, onHelp, onRetry }: {
    guide: WorkflowGuide;
    onAction: (target: GuideAction['target']) => void;
    onHelp?:()=>void;
    onRetry?:()=>void;
}) {
 const {t}=useWorkspaceLanguage();
    return <section aria-label={t("Помощник-оркестратор")} style={{ border: '1px solid #cfded2', borderRadius: 9, padding: 18, marginBottom: 20, background: '#edf4e9' }}><small>{t("✳ ПОМОЩНИК СЛУЧАЯ")}</small><p className={styles.assistantIntro}>{t("Здесь показан ваш следующий шаг. Кнопки открывают нужный раздел; для анализа нажмите «Разобрать случай».")}</p><h3>{t(guide.title)}</h3><p style={{ fontSize: 16, whiteSpace: 'pre-wrap' }}>{t(guide.detail)}</p>{guide.questions.length > 0 && <details><summary>{t("Что уточнить у врача")}</summary><ul>{guide.questions.map((q, i) => <li key={i}>{q}</li>)}</ul></details>}<div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>{guide.actions.map(action => <button key={action.target} type="button" onClick={() => action.retry && onRetry ? onRetry() : onAction(action.target)}>{t(action.label)}</button>)}</div>{onHelp&&<button type="button" className={styles.assistantHelp} onClick={onHelp}>{t("Как пользоваться помощником?")}</button>}</section>;
}
