import {persistCaseAutosave,type ClinicalCase} from './casebook.ts';

export function workspaceEditorDraft(value:ClinicalCase|null):NonNullable<ClinicalCase['workspaceDraft']>{
 return value?.workspaceDraft??{question:'',note:'',decision:'',tab:'context'};
}

/** Navigation succeeds only after the entire visible case and editor are durable.
 * A rejected stale snapshot is a conflict, never a successful silent save.
 */
export async function preserveWorkspaceBeforeNavigation(
 value:ClinicalCase|null,
 save:(record:ClinicalCase)=>Promise<boolean>=persistCaseAutosave,
):Promise<void>{
 if(value&&!(await save(value)))throw Error('workspace_save_conflict');
}
