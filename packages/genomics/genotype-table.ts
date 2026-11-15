export type GenotypeRow = { rsid: string; chromosome: string; position: number; genotype: string };

// Adapted from geno-clinician/parsers/genotype_table.py. These are observed calls, with no inferred reference allele.
export function parseGenotypeTable(text: string): { count: number; rows: GenotypeRow[] } | null {
  let header: string[] | undefined;
  let separator = '\t';
  let count = 0;
  const rows: GenotypeRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (!header) {
      const candidate = line.replace(/^#\s*/, '');
      separator = candidate.includes('\t') ? '\t' : ',';
      const columns = candidate.split(separator).map(value => value.trim().replace(/^"|"$/g, '').toLowerCase());
      if (columns.includes('rsid') && columns.includes('position') && (columns.includes('chromosome') || columns.includes('chrom')) &&
          (columns.includes('genotype') || columns.includes('result') || columns.includes('allele1'))) header = columns;
      else if (!line.startsWith('#')) return null;
      continue;
    }
    if (line.startsWith('#')) continue;
    const values = line.split(separator).map(value => value.trim().replace(/^"|"$/g, ''));
    const field = (key: string) => values[header!.indexOf(key)] ?? '';
    const rsid = field('rsid');
    const chromosome = (field('chromosome') || field('chrom')).replace(/^chr/i, '').toUpperCase();
    const position = Number(field('position'));
    const genotype = (field('genotype') || field('result') || field('allele1') + field('allele2')).toUpperCase();
    if (!/^rs\d+$/i.test(rsid) || !/^(?:\d{1,2}|X|Y|M|MT)$/.test(chromosome) ||
        !Number.isSafeInteger(position) || position <= 0 || !/^[ACGTIDN0./|-]{0,12}$/.test(genotype)) continue;
    count++;
    if (rows.length < 2000) rows.push({rsid,chromosome:chromosome === 'M' ? 'MT' : chromosome,position,genotype});
  }
  return header ? {count,rows} : null;
}
