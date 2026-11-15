import test from 'node:test';import assert from 'node:assert/strict';import {validCaseInput} from './input-validation.ts';
test('case request rejects malformed patient files, references, media and task fields before any model call',()=>{
 for(const value of [null,[],{files:{}},{referenceFiles:'x'},{task:'invent'},{speech:{audio:5}},{files:[{name:'video.mp4',frames:[{time:'bad',image:'x'}]}]},{files:[{name:'img.png',masks:[{x:-1,y:0,width:1,height:1}]}]}])assert.equal(validCaseInput(value),false);
 assert.equal(validCaseInput({text:'Question',files:[{name:'ecg2.png',image:'data:image/png;base64,aaaa'}],referenceFiles:[{name:'guide.txt',text:'Evidence'}],task:'clinical'}),true);
});
