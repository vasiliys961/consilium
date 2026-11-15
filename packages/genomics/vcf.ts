const COMPRESSED_LIMIT = 1_500_000;
const TEXT_LIMIT = 2_000_000;

function looksLikeVcf(text: string): boolean {
  const line = text.replace(/^\uFEFF/, "").split(/\r?\n/).find((item) => item.trim());
  return Boolean(line && /^##fileformat=VCF/i.test(line));
}

export async function textFromVcfGzip(bytes: Uint8Array): Promise<string | null> {
  if (bytes.length < 2 || bytes.length > COMPRESSED_LIMIT || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return null;
  try {
    const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream("gzip"));
    const reader=stream.getReader();const chunks:Uint8Array[]=[];let length=0;
    try{for(;;){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>TEXT_LIMIT)return null;chunks.push(next.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    if(!length)return null;
    const inflated=new Uint8Array(length);let offset=0;for(const chunk of chunks){inflated.set(chunk,offset);offset+=chunk.length;}
    const text = new TextDecoder().decode(inflated);
    return looksLikeVcf(text) ? text : null;
  } catch {
    return null;
  }
}
