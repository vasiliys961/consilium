import test from 'node:test';import assert from 'node:assert/strict';import {prepareServerFiles} from './intake-server.ts';
test('video preparation preserves frame timestamps and explicitly limits temporal coverage',async()=>{
 const files=await prepareServerFiles([{name:'exam.mp4',image:'old-best-frame',frames:[{time:1.2,image:'frame-1'},{time:3.2,image:'frame-2'},{time:5.2,image:'frame-3'}]}]);
 assert.equal(files.length,4);assert.equal(files[0].image,undefined);assert.match(files[0].intakeNote??'',/не анализ всей/);assert.match(files[1].name,/1.20s/);assert.equal(files[1].parent,'exam.mp4');assert.equal(files[3].image,'frame-3');
});
test('an unsupported TIFF retains its source and an explicit decoder failure',async()=>{
 const files=await prepareServerFiles([{name:'broken.tiff',binary:Buffer.from('not a TIFF').toString('base64')}]);
 assert.equal(files[0].name,'broken.tiff');assert.equal(files[0].image,undefined);assert.match(files[0].intakeNote??'',/не декодирован/);
});
