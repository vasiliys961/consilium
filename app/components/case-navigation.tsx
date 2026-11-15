import type { RefObject } from 'react';
import { CASE_SECTIONS, type CaseSection } from '@/lib/physician-guide';
import { useWorkspaceLanguage } from './workspace-language';
import styles from '@/app/workspace.module.css';

type NavigationProps = {
  index: number;
  onNavigate: (section: CaseSection) => void;
};

export function CaseSectionControls({index,onNavigate}: NavigationProps) {
  const {t,language}=useWorkspaceLanguage();
  const previous=CASE_SECTIONS[index-1];
  const next=CASE_SECTIONS[index+1];
  const backward=language==='ar'?'→':'←';
  const forward=language==='ar'?'←':'→';
  return <div className={styles.caseNavControls}>
    <button type="button" disabled={!previous} onClick={()=>previous&&onNavigate(previous.id)}>
      <strong><span aria-hidden="true">{backward} </span>{t('Назад')}</strong>
      {previous&&<span>{t(previous.title)}</span>}
    </button>
    <button type="button" disabled={!next} onClick={()=>next&&onNavigate(next.id)}>
      <strong>{t('Далее')}<span aria-hidden="true"> {forward}</span></strong>
      {next&&<span>{t(next.title)}</span>}
    </button>
  </div>;
}

export function CaseNavigation({index,onNavigate,navRef,fileCount,busy}: NavigationProps & {
  navRef: RefObject<HTMLElement>;
  fileCount: number;
  busy: boolean;
}) {
  const {t}=useWorkspaceLanguage();
  return <nav ref={navRef} className={styles.caseNav} aria-label={t('Разделы случая')}>
    <div className={styles.caseNavPosition}>
      <span className={styles.caseNavCount}>{index+1} / {CASE_SECTIONS.length}</span>
      <strong>{t(CASE_SECTIONS[index].title)}</strong>
      <div role="status" aria-live="polite">
        {busy && <span className={styles.caseNavRunning}>{t('Выполняется разбор…')}</span>}
      </div>
    </div>
    <div className={styles.caseTabs}>
      {CASE_SECTIONS.map(({id,title},position)=><button
        key={id}
        type="button"
        className={styles.caseTab}
        data-case-section={id}
        aria-current={position===index?'step':undefined}
        aria-controls="case-section-content"
        onClick={()=>onNavigate(id)}
      >
        <span aria-hidden="true" className={styles.caseTabNumber}>{position+1}</span>
        <span>{t(title)}{id==='materials'&&fileCount>0&&` (${fileCount})`}</span>
      </button>)}
    </div>
    <CaseSectionControls index={index} onNavigate={onNavigate}/>
  </nav>;
}
