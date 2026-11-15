import type { CpicAllele, CpicSnapshot, CpicVariant } from "./cpic.ts";

const IUPAC: Record<string, string> = {
  A: "A",
  C: "C",
  G: "G",
  T: "T",
  R: "AG",
  Y: "CT",
  S: "CG",
  W: "AT",
  K: "GT",
  M: "AC",
  B: "CGT",
  D: "AGT",
  H: "ACT",
  V: "ACG",
  N: "ACGT",
};

function options(token: string): string[] {
  if (token.includes(" or ")) return token.split(" or ").flatMap((piece) => options(piece.trim()));
  if (token.length === 1 && IUPAC[token]) return IUPAC[token].split("");
  return [token];
}

function siteFits(left: string, right: string, sample: [string, string]) {
  const leftOptions = options(left);
  const rightOptions = options(right);
  const [first, second] = sample;
  const direct = leftOptions.includes(first) && rightOptions.includes(second);
  const swapped = rightOptions.includes(first) && leftOptions.includes(second);
  return direct || swapped;
}

export function matchDiplotype(alleles: CpicAllele[], observed: Array<[string, string]>) {
  const found: Array<[string, string]> = [];
  for (let index = 0; index < alleles.length; index += 1) {
    for (let other = index; other < alleles.length; other += 1) {
      const left = alleles[index];
      const right = alleles[other];
      if (!left || !right) continue;
      if (left.bases.length !== observed.length || right.bases.length !== observed.length) continue;
      const fits = observed.every((sample, site) => siteFits(left.bases[site] ?? "", right.bases[site] ?? "", sample));
      if (fits) found.push([left.name, right.name]);
    }
  }
  if (found.length !== 1) return null;
  const pair = found[0];
  if (!pair) return null;
  return [...pair].sort().join("/");
}

function chromOf(value: string) {
  return value.replace(/^chr/i, "");
}

function genotype(ref: string, alt: string, call: string): [string, string] | null {
  const alleles = [ref, ...alt.split(",")];
  const parts = call.split(/[|/]/);
  if (parts.length !== 2 || parts.some((part) => part === "." || part === "")) return null;
  const indexes = parts.map((part) => Number(part));
  if (indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= alleles.length)) return null;
  const first = alleles[indexes[0] ?? -1];
  const second = alleles[indexes[1] ?? -1];
  if (!first || !second) return null;
  return [first, second];
}

export function diplotypeFromBases(snapshot: CpicSnapshot | null, gene: string | null, text: string): string | null | undefined {
  if (!snapshot || !gene) return undefined;
  const table = snapshot.genes?.[gene];
  if (!table?.variants.length || !table.alleles.length) return undefined;
  const calls = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const cells = line.split("\t");
    if (cells.length < 10) continue;
    const format = cells[8]?.split(":") ?? [];
    const sample = cells[9]?.split(":") ?? [];
    const index = format.indexOf("GT");
    const call = sample[index] ?? "";
    if (!call) continue;
    calls.set(`${chromOf(cells[0] ?? "")}:${cells[1]}`, call);
  }
  const observed: Array<[string, string]> = [];
  for (const variant of table.variants) {
    const call = calls.get(`${chromOf(variant.chrom)}:${variant.pos}`);
    if (!call) return undefined;
    const bases = genotype(variant.ref, altOf(text, variant), call);
    if (!bases) return undefined;
    observed.push(bases);
  }
  return matchDiplotype(table.alleles, observed);
}

function altOf(text: string, variant: CpicVariant) {
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const cells = line.split("\t");
    if (chromOf(cells[0] ?? "") === chromOf(variant.chrom) && cells[1] === String(variant.pos)) return cells[4] ?? variant.ref;
  }
  return variant.ref;
}
