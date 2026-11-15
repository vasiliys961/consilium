export interface VisualEcgMeasurement {
  metric: 'RR' | 'PR' | 'QRS' | 'QT' | 'HR';
  value: number;
  unit: 'ms' | 'bpm';
  lead: string;
  basis: string;
}

/** Arithmetic on explicitly reported grid counts. Results remain visual estimates. */
export function readGridMeasurements(raw: unknown): VisualEcgMeasurement[] {
  if (!raw || typeof raw !== 'object') return [];
  const grid = raw as Record<string, unknown>;
  const speed = grid.speedMmPerSec;
  if (grid.gridVisible !== true || typeof speed !== 'number' || ![12.5, 25, 50, 100].includes(speed)) return [];
  const speedText = String(speed).replace('.', '\\.');
  if (typeof grid.speedEvidence !== 'string' || !new RegExp(`(?<![\\d.])${speedText}(?![\\d.])\\s*(?:mm\\s*[/·]\\s*s|мм\\s*[/·]\\s*с)`, 'i').test(grid.speedEvidence)) return [];
  if (!Array.isArray(grid.spans)) return [];
  const measured: VisualEcgMeasurement[] = [];
  for (const row of grid.spans.slice(0, 8)) {
    if (!row || typeof row !== 'object' || !['RR', 'PR', 'QRS', 'QT'].includes(row.metric)) continue;
    if (typeof row.smallSquares !== 'number' || !Number.isFinite(row.smallSquares) || row.smallSquares < 1 || row.smallSquares > 150) continue;
    if (typeof row.lead !== 'string' || !/^(?:I{1,3}|aV[RLF]|V[1-6])$/i.test(row.lead)) continue;
    if (typeof row.basis !== 'string' || row.basis.trim().length < 8) continue;
    const milliseconds = Math.round(row.smallSquares / speed * 1000);
    const limits = row.metric === 'RR' ? [170, 3000] : row.metric === 'PR' ? [50, 600] : row.metric === 'QRS' ? [30, 400] : [150, 900];
    if (milliseconds < limits[0] || milliseconds > limits[1] || measured.some(item => item.metric === row.metric)) continue;
    const basis = `${row.smallSquares} mm / ${speed} mm/s; ${row.basis.trim().slice(0, 240)}`;
    measured.push({ metric: row.metric, value: milliseconds, unit: 'ms', lead: row.lead, basis });
    if (row.metric === 'RR') measured.push({ metric: 'HR', value: Math.round(60000 / milliseconds), unit: 'bpm', lead: row.lead, basis });
  }
  return measured;
}
