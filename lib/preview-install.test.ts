import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,symlinkSync,renameSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const gate=resolve(process.cwd(),'scripts','preview-preflight.mjs');
const updater=resolve(process.cwd(),'scripts','update-preview.mjs');
function git(root:string,args:string[]){
 const p=spawnSync('git',args,{cwd:root,encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
 return p.stdout.trim();
}
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'doctor-opus-preview-c10-'));
 mkdirSync(join(root,'node_modules','next','dist','bin'),{recursive:true});
 writeFileSync(join(root,'node_modules','next','dist','bin','next'),'// synthetic binary');
 writeFileSync(join(root,'package.json'),JSON.stringify({name:'doctor-opus-next',scripts:{}}));
 writeFileSync(join(root,'package-lock.json'),'{"lockfileVersion":3}');
 writeFileSync(join(root,'.gitignore'),'node_modules/\n');
 git(root,['init','--quiet','--initial-branch=chatgpt-dev']);
 git(root,['config','user.email','synthetic@example.invalid']);
 git(root,['config','user.name','Synthetic Tester']);
 git(root,['add','.']);
 git(root,['commit','--quiet','-m','synthetic clean Preview']);
 git(root,['remote','add','origin','https://github.com/vasiliys961/consilium.git']);
 return root;
}
function runPreflight(root:string,...flags:string[]){
 return spawnSync(process.execPath,[gate,`--root=${root}`,...flags],{cwd:root,encoding:'utf8',timeout:8000});
}

test('C10 clean standalone Preview starts without requiring protocol dependencies or touching local content',()=>{
 const root=fixture();
 try{
  const before=git(root,['rev-parse','HEAD']);
  const output=runPreflight(root);
  assert.equal(output.status,0,output.stderr);
  assert.match(output.stdout,/3207/);
  assert.match(output.stdout,/Protocol RU: не установлен/);
  assert.match(output.stdout,/setup:protocols/);
  assert.equal(git(root,['rev-parse','HEAD']),before);
  assert.equal(git(root,['status','--porcelain']),'');
  assert.equal(existsSync(join(root,'integrations','protocol','ru','node_modules')),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('C10 Preview refuses the main branch without changing it',()=>{
 const root=fixture();
 try{
  git(root,['switch','-q','-c','main']);
  const before=git(root,['rev-parse','HEAD']);
  const output=runPreflight(root);
  assert.equal(output.status,1);
  assert.match(output.stderr,/main\/Codex/);
  assert.equal(git(root,['branch','--show-current']),'main');
  assert.equal(git(root,['rev-parse','HEAD']),before);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('C10 preflight refuses external node_modules symlinks without deleting their target',()=>{
 const root=fixture(),external=mkdtempSync(join(tmpdir(),'doctor-opus-c10-keep-'));
 try{
  writeFileSync(join(external,'untouched.txt'),'Never delete');
  renameSync(join(root,'node_modules'),join(root,'original-dependencies'));
  symlinkSync(external,join(root,'node_modules'),'dir');
  const output=runPreflight(root);
  assert.equal(output.status,1);
  assert.match(output.stderr,/символическая ссылка/);
  assert.equal(readFileSync(join(external,'untouched.txt'),'utf8'),'Never delete');
 }finally{rmSync(root,{recursive:true,force:true});rmSync(external,{recursive:true,force:true});}
});

test('C10 updating with local edits is refused before any git fetch or npm install',()=>{
 const root=fixture();
 try{
  writeFileSync(join(root,'my-work.txt'),'uncommitted physician work (synthetic)');
  const output=runPreflight(root,'--update');
  assert.equal(output.status,1);
  assert.match(output.stderr,/несохранённые изменения/);
  assert.equal(readFileSync(join(root,'my-work.txt'),'utf8'),'uncommitted physician work (synthetic)');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('C10 updating from unknown remote is refused, with no network access',()=>{
 const root=fixture();
 try{
  git(root,['remote','set-url','origin','https://github.com/other/unknown.git']);
  const output=runPreflight(root,'--update');
  assert.equal(output.status,1);
  assert.match(output.stderr,/origin не является/);
  assert.equal(git(root,['status','--porcelain']),'');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('C10 npm Preview startup has no hidden protocol installs; update is deliberate and isolated',()=>{
 const pkg=JSON.parse(readFileSync(resolve('package.json'),'utf8'));
 assert.match(pkg.scripts['dev:preview'],/preview-preflight\.mjs/);
 assert.doesNotMatch(pkg.scripts['dev:preview'],/ensure-native-protocols|npm ci/);
 assert.equal(pkg.scripts['check:preview'],'node scripts/preview-preflight.mjs');
 assert.equal(pkg.scripts['update:preview'],'node scripts/update-preview.mjs');
 const script=readFileSync(updater,'utf8');
 assert.match(script,/--ff-only/);
 assert.match(script,/--ignore-scripts/);
 assert.doesNotMatch(script,/reset --hard|git clean|rm -rf|origin\/main/);
});
