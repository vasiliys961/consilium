'use client';
import { useRef, useState } from 'react';
import { useWorkspaceLanguage } from './workspace-language';
import type { VisualEcgMeasurement } from '@/packages/ecg/visual-measure';

export function EcgGridRuler({ src, onApply }: { src: string; onApply: (measurements: VisualEcgMeasurement[]) => void }) {
  const { t } = useWorkspaceLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [speed, setSpeed] = useState('');
  const [gridMm, setGridMm] = useState(5);
  const [pixelsPerMm, setPixelsPerMm] = useState<number>();
  const [first, setFirst] = useState<{ x: number; y: number }>();
  const [metric, setMetric] = useState<'RR' | 'PR' | 'QRS' | 'QT'>('RR');
  const [lead, setLead] = useState('');
  const [measured, setMeasured] = useState<VisualEcgMeasurement[]>([]);
  const [error, setError] = useState(false);

  function point(event: React.PointerEvent<HTMLImageElement>) {
    const element = image.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const next = { x: (event.clientX - rect.left) / rect.width * element.naturalWidth, y: (event.clientY - rect.top) / rect.height * element.naturalHeight };
    setError(false);
    if (!first) { setFirst(next); return; }
    const distance = Math.abs(next.x - first.x);
    setFirst(undefined);
    if (distance < 2) { setError(true); return; }
    if (!pixelsPerMm) { setPixelsPerMm(distance / gridMm); return; }
    if (!speed || !lead) { setError(true); return; }
    const milliseconds = Math.round(distance / pixelsPerMm / Number(speed) * 1000);
    if (milliseconds < (metric === 'RR' ? 150 : 20) || milliseconds > (metric === 'RR' ? 4000 : 1500)) { setError(true); return; }
    const basis = `Physician-confirmed image measurement: ${Math.round(distance)} px, ${pixelsPerMm.toFixed(3)} px/mm, ${speed} mm/s; lead ${lead}`;
    const values: VisualEcgMeasurement[] = [{ metric, value: milliseconds, unit: 'ms', lead, basis }];
    if (metric === 'RR') values.push({ metric: 'HR', value: Math.round(60000 / milliseconds), unit: 'bpm', lead, basis });
    setMeasured(previous => [...previous.filter(item => !values.some(value => value.metric === item.metric)), ...values]);
  }

  return <>
    <button type="button" className="open" onClick={() => dialog.current?.showModal()}>{t('Измерить ЭКГ по сетке')}</button>
    <dialog ref={dialog} className="ecg-ruler-dialog" onClose={() => setFirst(undefined)}>
      <h2>{t('Измерение ЭКГ по сетке')}</h2>
      <p>{t('Сначала отметьте двумя щелчками горизонтальный отрезок сетки известной длины. Затем выберите интервал и отметьте его начало и конец.')}</p>
      <div className="ecg-ruler-controls">
        <label>{t('Скорость бумаги, мм/с')}<select value={speed} onChange={event => {setSpeed(event.target.value);setMeasured([]);setFirst(undefined);}}>
          <option value="">{t('Выберите')}</option>{[12.5,25,50,100].map(value => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <label>{t('Отрезок сетки, мм')}<select value={gridMm} disabled={Boolean(pixelsPerMm)} onChange={event => {setGridMm(Number(event.target.value));setFirst(undefined);}}>{[1,5,10,20].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>{t('Отведение')}<select value={lead} onChange={event => {setLead(event.target.value);setFirst(undefined);}}><option value="">{t('Выберите')}</option>{['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>{t('Интервал')}<select value={metric} onChange={event => {setMetric(event.target.value as typeof metric);setFirst(undefined);}}>{['RR','PR','QRS','QT'].map(value => <option key={value}>{value}</option>)}</select></label>
        <button type="button" onClick={() => {setPixelsPerMm(undefined);setFirst(undefined);setMeasured([]);}}>{t('Калибровать заново')}</button>
      </div>
      <p role="status">{t(pixelsPerMm ? 'Калибровка задана. Отметьте начало и конец интервала.' : 'Отметьте две точки на сетке.')}{first ? ` · ${t('Первая точка отмечена')}` : ''}</p>
      <div className="ecg-measure-image"><img ref={image} src={src} alt={t('ЭКГ для измерения')} onPointerDown={point} draggable={false}/>
        {first && image.current && <span className="ecg-point" style={{left:100*first.x/image.current.naturalWidth+'%',top:100*first.y/image.current.naturalHeight+'%'}}/>}
      </div>
      {error && <p role="alert">{t('Проверьте скорость, отведение и точки измерения.')}</p>}
      <ul>{measured.map(item => <li key={item.metric}>{item.metric} · {item.value} {item.unit} · {item.lead}</li>)}</ul>
      <p>{t('ЧСС по одному RR подходит для регулярного ритма. При нерегулярном ритме нужна оценка более длинной записи.')}</p>
      <button type="button" disabled={!measured.length} onClick={() => {onApply(measured);dialog.current?.close();}}>{t('Добавить измерения в разбор')}</button>{' '}
      <button type="button" onClick={() => dialog.current?.close()}>{t('Закрыть')}</button>
    </dialog>
  </>;
}
