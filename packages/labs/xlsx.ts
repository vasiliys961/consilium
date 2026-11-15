import { unpackZip } from "../intake/zip.ts";

function decode(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function sharedStrings(xml: string) {
  return xml.split(/<si\b/).slice(1).map((block) =>
    [...block.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decode(match[1] ?? "")).join(""),
  );
}

function columnIndex(cell: string) {
  const letters = /^[A-Z]+/.exec(cell.toUpperCase())?.[0] ?? "";
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

function rowIndex(cell: string) {
  return Number(/^[\dA-Z]+?(\d+)$/i.exec(cell)?.[1] ?? 0) - 1;
}

function sheetRows(xml: string, strings: string[]) {
  const grid = new Map<number, string[]>();
  for (const match of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const ref = /r="([^"]+)"/.exec(attrs)?.[1] ?? "";
    const column = columnIndex(ref);
    const row = rowIndex(ref);
    if (column < 0 || column > 40 || row < 0 || row > 120) continue;
    const kind = /t="([^"]+)"/.exec(attrs)?.[1] ?? "";
    const cached = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    const inline = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((item) => decode(item[1] ?? "")).join("");
    let text = "";
    if (kind === "s") {
      const index = Number(cached);
      text = Number.isInteger(index) ? strings[index] ?? "" : "";
    } else if (kind === "inlineStr" || inline) text = inline;
    else if (cached !== undefined) text = decode(cached);
    const line = grid.get(row) ?? [];
    line[column] = text;
    grid.set(row, line);
  }
  const last = Math.max(-1, ...grid.keys());
  const rows: string[][] = [];
  for (let index = 0; index <= last; index += 1) {
    const line = grid.get(index) ?? [];
    const width = line.length;
    rows.push(Array.from({ length: width }, (_, cell) => line[cell] ?? ""));
  }
  return rows.filter((row) => row.some((cell) => cell.trim()));
}

function csvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export async function labTextFromXlsx(bytes: Uint8Array): Promise<string | null> {
  const members = await unpackZip(bytes, "full");
  const stringsMember = members.find((member) => member.name.toLowerCase() === "xl/sharedstrings.xml");
  const sheets = members.filter((member) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(member.name) && member.data);
  sheets.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
  const first = sheets[0]?.data;
  if (!first) return null;
  const strings = stringsMember?.data ? sharedStrings(new TextDecoder().decode(stringsMember.data)) : [];
  const parsed = sheetRows(new TextDecoder().decode(first), strings);
  if (!parsed.length) return null;
  const width = Math.max(...parsed.map((row) => row.length));
  const rows = parsed.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ""));
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const extra = sheets.length - 1;
  return extra > 0 ? `# doctor-opus-extra-sheets=${extra}\n${csv}` : csv;
}
