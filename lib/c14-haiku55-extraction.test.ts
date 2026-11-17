import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=(edition:'ru'|'en')=>readFileSync('integrations/protocol/'+edition+'/app/api/protocol/dialogue-draft/route.ts','utf8');

test('C14: both RU and Global Ambient fact extractors use the affordable Haiku 5.5 by default, not the transcript speaker labeller',()=>{
 for(const edition of ['ru','en'] as const){
  const c=source(edition);
  assert.match(c,/PROTOCOL_DIALOGUE_DRAFT_MODEL\?\.trim\(\) \|\| 'anthropic\/claude-haiku-5\.5'/);
  assert.match(c,/FALLBACK_DRAFT_MODEL = MODELS\.GEMINI_3_FLASH/);
  assert.match(c,/transcript/);
  assert.match(c,/medic|препарат/i);
  assert.match(c,/жалоб|Complaints/i);
  assert.match(c,/анамнез|History of present illness/i);
  assert.match(c,/Объектив|Objective/i);
  assert.match(c,/дозиров|dose/i);
  assert.match(c,/\[T1\]/);
  assert.match(c,/modelUsed/);
 }
});
test('C14: physician review remains necessary between extraction and final note generation',()=>{
 for(const edition of ['ru','en'] as const){
  const page=readFileSync('integrations/protocol/'+edition+'/app/protocol/page.tsx','utf8');
  assert.match(page,/draftSourceTranscript!==conversationTranscriptText.trim\(\)/);
  assert.match(page,/recordedDraftText/);
  assert.doesNotMatch(page,/autoInsertConversationToProtocol/);
 }
 const final=readFileSync('integrations/protocol/en/app/api/protocol/final-note/route.ts','utf8');
 assert.match(final,/STAGE2_SOAP_SYSTEM_PROMPT/);
 assert.match(final,/physicianAdditions/);
 assert.doesNotMatch(final,/claude-haiku-5\.5/);
});
test('C14: no global model-policy or original speaker separation change',()=>{
 const ru=readFileSync('integrations/protocol/ru/lib/openrouter.ts','utf8');
 assert.match(ru,/HAIKU: 'anthropic\/claude-haiku-4\.5'/);
 const diarization=readFileSync('integrations/protocol/ru/lib/stt-role-diarization.ts','utf8');
 assert.match(diarization,/STT_ROLE_DIARIZATION_ENABLED/);
 assert.match(diarization,/MODELS.HAIKU/);
});
