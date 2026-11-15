import test from 'node:test';import assert from 'node:assert/strict';
import {interfaceLanguage,preferredInterfaceLanguage} from './interface-language.ts';
test('module interface inherits the saved language or negotiates the browser language',()=>{
 assert.equal(preferredInterfaceLanguage('fr',['ru-RU','en']),'fr');assert.equal(preferredInterfaceLanguage(null,['de-DE','es-MX','en-US']),'es');assert.equal(preferredInterfaceLanguage('bad',['pt-PT']),'pt-BR');assert.equal(preferredInterfaceLanguage(null,['zh-TW']),'zh-CN');assert.equal(preferredInterfaceLanguage(null,['de-DE']),'en');assert.equal(interfaceLanguage('en-US'),'en');assert.equal(interfaceLanguage('ms'),null);
});
