'use client';
import { useWorkspaceLanguage } from './workspace-language';

const sources: Record<string, Array<{ title: string; url: string }>> = {
  ecg: [
    { title: 'NCBI · Electrocardiography', url: 'https://www.ncbi.nlm.nih.gov/books/NBK354/' },
    { title: 'ESC · Supraventricular tachycardia', url: 'https://www.escardio.org/guidelines/clinical-practice-guidelines/all-esc-practice-guidelines/supraventricular-tachycardia/' },
  ],
  dermatology: [{ title: 'DermNet · Image Library', url: 'https://dermnetnz.org/images' }],
  dermatoscopy: [{ title: 'DermNet · Dermoscopy images', url: 'https://dermnetnz.org/image-catalogue/dermoscopy-course-images' }],
  wound: [{ title: 'DermNet · Image Library', url: 'https://dermnetnz.org/images' }],
  retinal: [{ title: 'AAO EyeWiki · Diabetic Retinopathy', url: 'https://eyewiki.org/Diabetic_Retinopathy' }],
  histology: [{ title: 'NCI SEER · Pathology reports', url: 'https://training.seer.cancer.gov/casefinding/sources/pathology.html' }],
  ultrasound: [{ title: 'AIUM · Practice parameters', url: 'https://www.aium.org/resources/practice-parameters' }],
  labs: [{ title: 'NLM MedlinePlus · Medical Tests', url: 'https://medlineplus.gov/lab-tests/' }],
};
const imaging = [{ title: 'ACR · Clinical tools and reporting systems', url: 'https://www.acr.org/Clinical-Resources/Clinical-Tools-and-Reference' },
  { title: 'ACR / RSNA · RadiologyInfo', url: 'https://www.radiologyinfo.org/en/info/article-chest-xray-report' }];

export function SourceSuggestions({ profile, onChoose }: { profile: string; onChoose: (source: { title: string; url: string }) => void }) {
  const { t } = useWorkspaceLanguage();
  const entries = sources[profile] ?? imaging;
  return <details className="station-extra"><summary>{t('Справочники по типу исследования')}</summary>
    <p>{t('Откройте источник для сверки. Кнопка рядом сохранит ссылку; текст источника можно добавить файлом.')}</p>
    <ul>{entries.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>{' '}
      <button type="button" onClick={() => onChoose(source)}>{t('Сохранить ссылку')}</button></li>)}</ul>
  </details>;
}
