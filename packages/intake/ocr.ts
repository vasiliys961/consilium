import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTsv, type WordBox } from "./burned.ts";

const BINS = [process.env.TESSERACT_BIN, "tesseract", "/opt/homebrew/bin/tesseract", "/usr/local/bin/tesseract"].filter(
  (bin): bin is string => Boolean(bin),
);

function run(bin: string, args: string[], timeoutMs: number) {
  return new Promise<string | null>((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve(null);
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      out += String(chunk);
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? out : null);
    });
  });
}

export async function recognizeWords(bytes: Buffer, ext: "png" | "jpg"): Promise<WordBox[] | null> {
  const dir = await mkdtemp(join(tmpdir(), "opus-ocr-"));
  const file = join(dir, `frame.${ext}`);
  try {
    await writeFile(file, bytes);
    for (const bin of BINS) {
      const tsv = await run(bin, [file, "stdout", "-l", "rus+eng", "--psm", "11", "--oem", "1", "tsv"], 8_000);
      if (tsv === null) continue;
      return parseTsv(tsv);
    }
    return null;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
