'use client';

import Link from 'next/link';
import {DrugLabelPicker} from '@/app/components/drug-label-picker';
import {DrugInteractionChecker} from '@/app/components/drug-interaction-checker';
import {useWorkspaceLanguage} from '@/app/components/workspace-language';
import styles from '@/app/components/privacy.module.css';

export default function DrugLabelsPage(){
  const {t}=useWorkspaceLanguage();
  return <main className={styles.vault}>
    <Link href="/">← {t('Главная')}</Link>
    <p><Link href="/drug-checker">{t('Открыть самостоятельную проверку лекарств')} ↗</Link></p><DrugInteractionChecker/>
    <DrugLabelPicker/>
  </main>;
}
