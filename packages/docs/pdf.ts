interface Piece {
  kind: "str" | "num" | "word" | "name";
  value: string;
  closed?: boolean;
}

function latin1(bytes: Uint8Array) {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return text;
}

async function inflate(bytes: Uint8Array) {
  const source = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(source).arrayBuffer());
}

function encrypted(text: string) {
  return /\/Encrypt\b/.test(text.replace(/stream[\s\S]*?endstream/g, ""));
}

function skipDict(dict: string) {
  return /\/(?:Subtype|Type)\s*\/(?:Image|Metadata|ObjStm|XRef)\b/.test(dict)
    || /\/FontFile\d?\b/.test(dict)
    || /\/(?:DCTDecode|JPXDecode|CCITTFaxDecode|JBIG2Decode|Crypt)\b/.test(dict);
}

async function decodeStream(dict: string, data: Uint8Array) {
  const filters = [...dict.matchAll(/\/(FlateDecode|ASCII85Decode|LZWDecode|ASCIIHexDecode|RunLengthDecode|DCTDecode)\b/g)].map((match) => match[1] ?? "");
  if (filters.some((filter) => filter !== "FlateDecode") || filters.length > 1) return null;
  if (filters[0] !== "FlateDecode") return data;
  try {
    return await inflate(data);
  } catch {
    return null;
  }
}

async function streamsOf(bytes: Uint8Array) {
  const text = latin1(bytes);
  const found: Uint8Array[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const at = text.indexOf("stream", cursor);
    if (at < 0) break;
    if (text.slice(at - 3, at) === "end") {
      cursor = at + 6;
      continue;
    }
    const before = text.slice(Math.max(0, at - 500), at);
    const dictAt = before.lastIndexOf("<<");
    const dict = dictAt >= 0 ? before.slice(dictAt) : "";
    let start = at + 6;
    if (text[start] === "\r" && text[start + 1] === "\n") start += 2;
    else if (text[start] === "\n" || text[start] === "\r") start += 1;
    const length = Number(/\/Length\s+(\d+)/.exec(dict)?.[1] ?? -1);
    let data: Uint8Array;
    let next: number;
    if (length >= 0 && start + length <= bytes.length) {
      data = bytes.slice(start, start + length);
      next = start + length;
    } else {
      const end = text.indexOf("endstream", start);
      if (end < 0) break;
      data = bytes.slice(start, end);
      next = end + 9;
    }
    cursor = next;
    if (skipDict(dict)) continue;
    const decoded = await decodeStream(dict, data);
    if (decoded) found.push(decoded);
  }
  return found;
}

function readLiteral(text: string, start: number) {
  let value = "";
  let closed = false;
  let depth = 1;
  let index = start + 1;
  while (index < text.length && depth > 0) {
    const char = text[index] ?? "";
    if (char === "\\") {
      const next = text[index + 1] ?? "";
      if (/[0-7]/.test(next)) {
        let octal = next;
        index += 2;
        for (let extra = 0; extra < 2 && /[0-7]/.test(text[index] ?? ""); extra += 1) {
          octal += text[index];
          index += 1;
        }
        value += String.fromCharCode(parseInt(octal, 8));
        continue;
      }
      const marks: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
      value += marks[next] ?? next;
      index += 2;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) break;
    }
    value += char;
    index += 1;
  }
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 && char !== "\n" && char !== "\r" && char !== "\t") closed = true;
    if (code > 126) closed = true;
  }
  return { value: closed ? "" : value, closed, next: Math.min(text.length, index + 1) };
}

function decodeHex(hex: string) {
  const clean = hex.replace(/[^0-9A-Fa-f]/g, "");
  const padded = clean.length % 2 ? `${clean}0` : clean;
  const bytes = new Uint8Array(padded.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = parseInt(padded.slice(index * 2, index * 2 + 2), 16);
  const utf16 = bytes.length >= 2 && ((bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes[0] === 0xff && bytes[1] === 0xfe));
  const highZeros = bytes.length >= 4 && bytes.length % 2 === 0
    && [...bytes].filter((byte, index) => index % 2 === 0 && byte === 0).length > bytes.length / 4;
  if (utf16 || highZeros) {
    const little = bytes[0] === 0xff && bytes[1] === 0xfe;
    const start = utf16 ? 2 : 0;
    let text = "";
    for (let index = start; index + 1 < bytes.length; index += 2) {
      const code = little ? bytes[index] + (bytes[index + 1] << 8) : (bytes[index] << 8) + bytes[index + 1];
      text += String.fromCharCode(code);
    }
    const closed = [...text].some((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code < 32 && char !== "\n" && char !== "\t";
    });
    return { value: closed ? "" : text, closed };
  }
  const ascii = bytes.every((byte) => byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126));
  if (!ascii) return { value: "", closed: true };
  return { value: latin1(bytes), closed: false };
}

function tokenize(content: string) {
  const pieces: Piece[] = [];
  let index = 0;
  while (index < content.length) {
    const char = content[index] ?? "";
    if (char === "%") {
      const end = content.indexOf("\n", index);
      index = end < 0 ? content.length : end + 1;
      continue;
    }
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "(") {
      const read = readLiteral(content, index);
      pieces.push({ kind: "str", value: read.value, closed: read.closed });
      index = read.next;
      continue;
    }
    if (char === "<" && content[index + 1] !== "<") {
      const end = content.indexOf(">", index + 1);
      if (end < 0) break;
      const decoded = decodeHex(content.slice(index + 1, end));
      pieces.push({ kind: "str", value: decoded.value, closed: decoded.closed });
      index = end + 1;
      continue;
    }
    if (char === "<") {
      const end = content.indexOf(">>", index);
      index = end < 0 ? content.length : end + 2;
      continue;
    }
    if (char === "[" || char === "]") {
      pieces.push({ kind: "word", value: char });
      index += 1;
      continue;
    }
    if (char === "/") {
      const name = /^\/[^\s[\]<>(){}/%]+/.exec(content.slice(index))?.[0] ?? "/";
      pieces.push({ kind: "name", value: name });
      index += name.length;
      continue;
    }
    const number = /^[+-]?(?:\d+\.\d*|\.\d+|\d+)/.exec(content.slice(index));
    if (number) {
      pieces.push({ kind: "num", value: number[0] });
      index += number[0].length;
      continue;
    }
    const word = /^[A-Za-z*'"]+/.exec(content.slice(index));
    if (word) {
      pieces.push({ kind: "word", value: word[0] });
      index += word[0].length;
      continue;
    }
    index += 1;
  }
  return pieces;
}

function withGap(current: string, next: string, adjust: number) {
  if (adjust > -120 || !current) return current;
  const left = current.slice(-1);
  const right = next[0] ?? "";
  if (/[0-9]/.test(left) && /[0-9.,]/.test(right)) return current;
  if (/[0-9.,]/.test(left) && /[0-9]/.test(right)) return current;
  return `${current} `;
}

function linesFromPieces(pieces: Piece[]) {
  const stack: Piece[] = [];
  const lines: string[] = [];
  let line = "";
  let saw = false;
  let closed = false;
  const finish = () => {
    const text = line.replace(/\s+/g, " ").trim();
    line = "";
    if (text) lines.push(text);
  };
  const takeString = () => {
    const piece = [...stack].reverse().find((item) => item.kind === "str");
    stack.length = 0;
    return piece?.kind === "str" ? piece : null;
  };
  const takeArray = () => {
    const items: Piece[] = [];
    while (stack.length) {
      const piece = stack.pop();
      if (!piece || piece.value === "[") break;
      items.unshift(piece);
    }
    return items;
  };
  for (const piece of pieces) {
    if (piece.kind !== "word" || piece.value === "[") {
      stack.push(piece);
      continue;
    }
    if (piece.value === "Tj" || piece.value === "'" || piece.value === "\"") {
      saw = true;
      if (piece.value !== "Tj") finish();
      const text = takeString();
      if (text?.closed) closed = true;
      else if (text?.value) line += text.value;
    } else if (piece.value === "TJ") {
      saw = true;
      let gap = 0;
      for (const item of takeArray()) {
        if (item.kind === "num") gap += Number(item.value);
        else if (item.kind === "str" && item.closed) closed = true;
        else if (item.kind === "str" && item.value) {
          line = withGap(line, item.value, gap);
          gap = 0;
          line += item.value;
        }
      }
    } else if (piece.value === "T*" || piece.value === "Td" || piece.value === "TD") {
      const vertical = piece.value === "T*" ? 1 : Number(stack.pop()?.value);
      if (piece.value !== "T*") stack.pop();
      if (piece.value === "T*" || (Number.isFinite(vertical) && vertical !== 0)) finish();
    } else stack.length = 0;
  }
  finish();
  return { lines, saw, closed };
}

export async function textFromPdf(bytes: Uint8Array): Promise<string | null> {
  const source = latin1(bytes);
  if (encrypted(source)) return "# doctor-opus-pdf-closed=encrypt\n";
  const lines: string[] = [];
  let saw = false;
  let closed = false;
  for (const stream of await streamsOf(bytes)) {
    const read = linesFromPieces(tokenize(latin1(stream)));
    saw = saw || read.saw;
    closed = closed || read.closed;
    lines.push(...read.lines);
  }
  if (!lines.length && (saw || closed)) return "# doctor-opus-pdf-closed=font\n";
  if (!lines.length) return null;
  return lines.join("\n");
}
