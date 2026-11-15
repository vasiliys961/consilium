import { useWorkspaceLanguage } from "@/app/components/workspace-language";
import type { Citation } from "@/lib/literature";
import { articleDoi } from "@/lib/external-doi";
import { ExternalDoiLink } from "./external-doi-link";

export function fullTextAnchor(key: string | null | undefined): string | undefined {
  return key && /^pmc:PMC\d+:\d+$/.test(key) ? key : undefined;
}

export function CitationContent({ citation, anchor = false }: { citation: Citation; anchor?: boolean }) {
  const { t } = useWorkspaceLanguage();
  const libraryId=citation.passageId?.match(/^library:([^:]+):/)?.[1];
  const libraryPage=citation.chapter?.match(/PDF\s+(\d+)/)?.[1];
  const content = citation.excerpt || citation.abstract;
  const doi = articleDoi(citation.doi);
  const label = citation.excerpt
    ? citation.paragraph ? "Фрагмент полного текста" : "Фрагмент источника"
    : citation.abstract ? "Аннотация" : "Библиографическая запись";

  return (
    <>{content ? <details id={anchor ? fullTextAnchor(citation.passageId) : undefined}>
      <summary>{t(label)}{citation.excerpt && citation.chapter ? ` · ${citation.chapter}` : ""}</summary>
      <blockquote dir="auto">{content}</blockquote>
      {citation.paragraph && citation.pmcid && /^PMC\d+$/.test(citation.pmcid) ? (
        <p>
          <a href={`https://europepmc.org/articles/${citation.pmcid}`} target="_blank" rel="noreferrer">{citation.pmcid} ↗</a>
          {" · "}{t("Абзац")}{` ${citation.paragraph}`}
          {citation.doi ? ` · DOI ${citation.doi}` : ""}
          {citation.licenseUrl && /^https?:\/\/creativecommons\.org\//i.test(citation.licenseUrl) ? (
            <>{" · "}<a href={citation.licenseUrl} target="_blank" rel="noreferrer">{t("Лицензия")}</a></>
          ) : null}
        </p>
      ) : null}
    </details> : <small>{t(label)}</small>}
    {libraryId&&<p><a href={`/library?book=${encodeURIComponent(libraryId)}${libraryPage?`&page=${libraryPage}`:''}`} target="_blank" rel="noreferrer">{t('Открыть оригинал на странице')} ↗</a></p>}
    {doi && <ExternalDoiLink doi={doi} />}</>
  );
}
