import test from 'node:test';import assert from 'node:assert/strict';import {gzipSync} from 'node:zlib';import {textFromVcfGzip} from './vcf.ts';
test('compressed VCF extraction preserves actual records and refuses an oversized inflated stream',async()=>{
 const source='##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n1\t10\t.\tA\tT\t.\tPASS\t.';
 assert.equal(await textFromVcfGzip(gzipSync(source)),source);assert.equal(await textFromVcfGzip(gzipSync(source+'\n'+'A'.repeat(2_000_000))),null);assert.equal(await textFromVcfGzip(gzipSync('not a VCF')),null);
});

const vcf = "##fileformat=VCFv4.2\n##doctor-opus-acmg=PM2\n##doctor-opus-gene=CYP2C19\n";

test("a gzipped VCF opens and a note in a gzip wrapper does not", async () => {
  assert.match(await textFromVcfGzip(gzipSync(vcf)) ?? "", /CYP2C19/);
  assert.equal(await textFromVcfGzip(gzipSync("Выписан домой.")), null);
  assert.equal(await textFromVcfGzip(new Uint8Array([1, 2, 3, 4])), null);
});
