import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {newCase,persistCase,readCases} from './casebook.ts';
import {workspaceEditorDraft,preserveWorkspaceBeforeNavigation} from './workspace-navigation.ts';

test('workspace navigation saves question, note, decision and case edits; reopening restores every editor',async()=>{
 const value=newCase();
 await persistCase(value);
 const draft={question:'Synthetic question not yet sent',note:'Synthetic observation',decision:'Unapproved physician draft',tab:'decision'};
 const edited={...value,context:'New synthetic clinical facts',updated:new Date(Date.now()+1).toISOString(),workspaceDraft:draft};
 await preserveWorkspaceBeforeNavigation(edited);
 const reopened=(await readCases()).find(c=>c.id===value.id)!;
 assert.equal(reopened.context,edited.context);
 assert.deepEqual(workspaceEditorDraft(reopened),draft);
 assert.equal(reopened.events.length,0,'Navigation must not approve a decision or submit a question');
 assert.equal(reopened.analyses.length,0,'Navigation must not perform an analysis');
 assert.deepEqual(workspaceEditorDraft(newCase()),{question:'',note:'',decision:'',tab:'context'});
});

test('workspace navigation refuses stale snapshots and retains newer clinical work',async()=>{
 const stale=newCase();
 await persistCase(stale);
 const fresh={...stale,context:'Newer physician observation',updated:new Date(Date.now()+10).toISOString()};
 await persistCase(fresh);
 await assert.rejects(preserveWorkspaceBeforeNavigation({...stale,workspaceDraft:{question:'Still visible locally',note:'',decision:'',tab:'analysis'}}),/workspace_save_conflict/);
 assert.equal((await readCases()).find(c=>c.id===stale.id)?.context,fresh.context);
});

test('workspace navigation propagates storage failure; caller must stay on the current case',async()=>{
 const value=newCase();
 value.workspaceDraft={question:'Retain on screen',note:'',decision:'',tab:'analysis'};
 await assert.rejects(preserveWorkspaceBeforeNavigation(value,async()=>{throw Error('synthetic quota failure');}),/synthetic quota failure/);
 assert.equal(value.workspaceDraft.question,'Retain on screen');
 await preserveWorkspaceBeforeNavigation(null,async()=>{throw Error('No selected case must not write');});
});
