/** Task-specific operational choices, not claims of validated clinical superiority. */
export const IMAGE_MODELS={argon:'google/gemini-4-argon',opus:'anthropic/claude-opus-5.5',terra:'openai/gpt-6.1-terra'} as const;
export function imageReviewRoute(profile?:string,modality?:string){
 const kind=profile&&profile!=='auto'?profile:modality==='ultrasound'?'ultrasound':modality==='dermatology'?'dermatoscopy':modality==='histology'?'histology':modality==='ecg'?'ecg':'auto';
 const primary=kind==='ultrasound'||kind==='blood-smear'?IMAGE_MODELS.terra:kind==='retinal'?IMAGE_MODELS.opus:IMAGE_MODELS.argon;
 const secondary=primary===IMAGE_MODELS.opus?IMAGE_MODELS.argon:IMAGE_MODELS.opus;
 // Existing ECG/radiology route remains blind. Other specialties use the owner's
 // requested image + first-reader JSON review, explicitly labelled as informed.
 const mode=['ultrasound','blood-smear','histology','dermatoscopy','wound','retinal','endoscopy','mammography'].includes(kind)?'informed':'independent';
 return {profile:kind,primary,secondary,mode:mode as 'informed'|'independent'};
}
export function imageModelLabel(model:string){return model===IMAGE_MODELS.terra?'GPT-6.1 Terra':model===IMAGE_MODELS.opus?'Claude Opus 5.5':model===IMAGE_MODELS.argon?'Gemini 4 Argon':model;}
