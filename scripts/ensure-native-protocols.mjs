#!/usr/bin/env node
/**
 * Install dependencies for the two independent original protocol apps ONLY
 * inside integrations/protocol/{ru,en}. Never writes to the owner's Desktop,
 * global npm install, primary Consilium directory or personal credentials.
 * Runs once per missing child. Repeated Preview starts are a no-op.
 */
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
for(const edition of ['ru','en']){
 const dir=resolve(root,'integrations','protocol',edition);
 const nextBin=resolve(dir,'node_modules','next','dist','bin','next');
 if(existsSync(nextBin)){console.log('[protocol-'+edition+'] Original module already installed');continue;}
 if(!existsSync(resolve(dir,'package-lock.json'))||!existsSync(resolve(dir,'app','protocol','page.tsx'))){
  console.error('[protocol-'+edition+'] Source or lockfile absent. Cannot start original module.');
  process.exit(1);
 }
 console.log('[protocol-'+edition+'] Installing original module dependencies in '+dir);
 const result=spawnSync('npm',['ci','--no-audit','--no-fund','--prefer-offline'],{
  cwd:dir,stdio:'inherit',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}
 });
 if(result.status!==0||!existsSync(nextBin)){
  console.error('[protocol-'+edition+'] Local npm install did not complete. The original module remains unmodified.');
  process.exit(result.status||1);
 }
}
console.log('[protocols] Original RU/EN modules ready, started on demand by Consilium.');
