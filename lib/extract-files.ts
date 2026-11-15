import type {ConductInput} from './conductor.ts';
import {bytesFromBase64} from '../packages/ecg/open.ts';
import {labTextFromXlsx} from '../packages/labs/xlsx.ts';
import {textFromVcfGzip} from '../packages/genomics/vcf.ts';
import {isEcgSheet} from '../packages/ecg/inspect.ts';
import {extractPdfText} from '../packages/docs/pdf-pages.ts';
import {textFromPdf} from '../packages/docs/pdf.ts';
import {textFromDocx} from '../packages/docs/docx.ts';
export async function withSpreadsheets(files: ConductInput["files"]) {
  return Promise.all((files ?? []).map(async (file) => {
    if (!file.name.toLowerCase().endsWith(".xlsx") || file.text?.trim()) return file;
    const bytes = file.binary ? bytesFromBase64(file.binary) : null;
    if (!bytes) return file;
    const text = await labTextFromXlsx(bytes).catch(() => null);
    return text ? { ...file, text } : file;
  }));
}

export async function withVcf(files: ConductInput["files"]) {
  return Promise.all((files ?? []).map(async (file) => {
    if (!file.name.toLowerCase().endsWith(".vcf.gz") || file.text?.trim()) return file;
    const bytes = file.binary ? bytesFromBase64(file.binary) : null;
    if (!bytes) return file;
    const text = await textFromVcfGzip(bytes).catch(() => null);
    return text ? { ...file, text } : file;
  }));
}

export async function withDocuments(files: ConductInput["files"], includeEcgPdf = false) {
  return Promise.all((files ?? []).map(async (file) => {
    const lower = file.name.toLowerCase();
    const pdf = lower.endsWith(".pdf") && (includeEcgPdf || !isEcgSheet(file.name));
    if ((!lower.endsWith(".docx") && !pdf) || file.text?.trim()) return file;
    const bytes = file.binary ? bytesFromBase64(file.binary) : null;
    if (!bytes) return file;
    const text = pdf ? await extractPdfText(bytes).catch(()=>null) || await textFromPdf(bytes).catch(() => null) : await textFromDocx(bytes).catch(() => null);
    return text ? { ...file, text } : file;
  }));
}

