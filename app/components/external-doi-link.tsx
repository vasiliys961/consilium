'use client';

import { useState } from 'react';
import { useWorkspaceLanguage } from './workspace-language';
import { externalArticleUrl, externalDoiBase } from '@/lib/external-doi';
import styles from './external-doi-link.module.css';

// Keep addresses saved by previous versions of the app.
const ADDRESS_KEY = 'concilium-sci-hub-address';

export function ExternalDoiLink({ doi }: { doi: string }) {
  const { t } = useWorkspaceLanguage();
  const [address, setAddress] = useState('');
  const [saved, setSaved] = useState('');
  const [error, setError] = useState(false);
  const href = externalArticleUrl(saved, doi);

  function load() {
    const previous = localStorage.getItem(ADDRESS_KEY) ?? '';
    setAddress(previous);
    setSaved(previous);
    setError(false);
  }

  function save() {
    const next = address.trim() ? externalDoiBase(address) : '';
    if (next === null) { setError(true); return; }
    if (next) localStorage.setItem(ADDRESS_KEY, next);
    else localStorage.removeItem(ADDRESS_KEY);
    setAddress(next);
    setSaved(next);
    setError(false);
  }

  return (
    <details className={styles.panel} onToggle={event => { if (event.currentTarget.open) load(); }}>
      <summary>{t('Внешняя ссылка по DOI')}</summary>
      <p>{t('Адрес сохраняется в этом браузере. При открытии отправляется только DOI публикации.')}</p>
      <div className={styles.controls}>
        <label>{t('HTTPS-адрес сервиса')}
          <input type="url" value={address} placeholder="https://…" spellCheck={false} autoComplete="off" dir="ltr"
            aria-invalid={error} onChange={event => { setAddress(event.target.value); setError(false); }} />
        </label>
        <button type="button" onClick={save} disabled={address === saved}>{t('Сохранить адрес')}</button>
        {href && address === saved && <a href={href} target="_blank" rel="noopener noreferrer">
          {t('Открыть публикацию')} · <bdi>{new URL(href).host}</bdi> ↗
        </a>}
      </div>
      {error && <p role="alert">{t('Введите HTTPS-адрес без логина и параметров.')}</p>}
    </details>
  );
}
