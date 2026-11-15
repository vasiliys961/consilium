import test from 'node:test';import assert from 'node:assert/strict';
import {WORKSPACE_LANGUAGES,english,workspaceCatalogs,workspaceText} from './workspace-i18n.ts';
test('all ten interface languages have a complete nonempty catalog, not just model output language',()=>{
 assert.equal(WORKSPACE_LANGUAGES.length,10);
 for(const language of WORKSPACE_LANGUAGES){if(language.code==='ru'||language.code==='en')continue;const catalog=workspaceCatalogs[language.code] as Record<string,string>;for(const key of Object.keys(english))assert.ok(typeof catalog[key]==='string'&&catalog[key].trim(),`${language.code}: ${key}`);}
 for(const code of ['es','fr','ar','hi','pt-BR','id','tr','zh-CN'] as const)assert.notEqual(workspaceText(code,'Сохранить случай'),'Сохранить случай');
});
