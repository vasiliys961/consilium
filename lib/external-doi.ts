export function externalDoiBase(value: string): string | null {
  const input = value.trim();
  if (!/^https:\/\//i.test(input) || /[\s\p{C}\\?#]/u.test(input) || input.length > 400) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) return null;
    return url.origin + url.pathname.replace(/\/+$/, '');
  } catch { return null; }
}

export function articleDoi(value: string | undefined): string | null {
  const doi = value?.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\/|^doi:\s*/i, '');
  if (!doi || doi.length > 250 || !/^10\.\d{4,9}\/[^\s\p{C}\\]+$/u.test(doi)) return null;
  if (doi.split('/').some(segment => !segment || segment === '.' || segment === '..')) return null;
  return doi;
}

export function externalArticleUrl(address: string, identifier: string): string | null {
  const base = externalDoiBase(address);
  const doi = articleDoi(identifier);
  return base && doi ? `${base}/${doi.split('/').map(encodeURIComponent).join('/')}` : null;
}
