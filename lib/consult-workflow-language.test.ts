import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {workspaceText,WORKSPACE_LANGUAGES} from './workspace-i18n.ts';

/** Extract actual visible copy, including ternary branches, so newly added controls cannot silently miss catalogs. */
test('specialist workflow and medication checker controls render in every supported UI language',()=>{
 for(const filename of ['app/consult/page.tsx','app/components/drug-interaction-checker.tsx']){
 const source=ts.createSourceFile('consult.tsx',readFileSync(filename,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const keys=new Set<string>();
 function labels(node:ts.Node){if(ts.isStringLiteral(node)&&/[а-яё]/i.test(node.text))keys.add(node.text);ts.forEachChild(node,labels);}
 function visit(node:ts.Node){if(ts.isCallExpression(node)&&node.expression.getText(source)==='t'&&node.arguments[0])labels(node.arguments[0]);ts.forEachChild(node,visit);}
 visit(source);assert.ok(keys.size>20);
 for(const language of WORKSPACE_LANGUAGES){if(language.code==='ru')continue;for(const key of keys){const value=workspaceText(language.code,key);assert.notEqual(value,key,language.code+': '+key);assert.doesNotMatch(value,/[а-яё]/i,language.code+': '+key);}}
 }
});
