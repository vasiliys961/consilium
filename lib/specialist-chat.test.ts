import assert from 'node:assert/strict';
import test from 'node:test';
import { consultSpecialist, readSpecialistRequest, readSpecialistVoiceRequest } from './specialist-chat.ts';
import { MODELS } from './cost.ts';
import { REVIEW_MARKER, reviewModelFor } from './specialist-options.ts';
import { preparePrivacy } from './privacy-prepare.ts';
import { CHAT_TEXT_PURPOSE, cleanChatText } from './privacy-chat.ts';
import { signPrivacy, verifyPrivacy } from './privacy-ticket.ts';
import { ANSWER_MARKER, HISTORY_LIMIT, QUESTION_MARKER, consultationTranscript, latestQuestion } from './specialist-profiles.ts';
import { wavBase64 } from '../packages/translator/wav.ts';

test('the selected specialty uses only the signed, reviewed conversation', async () => {
  const history = QUESTION_MARKER + 'What information should I collect?' + ANSWER_MARKER + 'Ask about timing.';
  const question = consultationTranscript(history, 'Phone: +7 (999) 123-45-67\nDoes timing matter?');
  const preparation = await preparePrivacy({ text: question, locale: 'en', externalSearch: false });
  assert.ok(!preparation.body.text?.includes('123-45-67'));
  const reviewed = { ...preparation.body, privacy: { consent: true, token: signPrivacy(preparation.body) } };
  assert.deepEqual(readSpecialistRequest({ specialty: 'cardiology', reviewed: { ...reviewed, text: question } }), {
    error: 'privacy_review_required', status: 428,
  });
  const parsed = readSpecialistRequest({ specialty: 'cardiology', reviewed, depth: 'brief' });
  assert.ok('input' in parsed);
  const result = await consultSpecialist(parsed.input, { OPENROUTER_API_KEY: 'synthetic-test-key'  }, async (_url, init) => {
    const { messages } = JSON.parse(String(init?.body));
    assert.match(messages[0].content, /arrhythmia/);
    assert.match(messages[0].content, /Write in English/);
    assert.match(messages[0].content, /Compact but clinically complete/);
    assert.ok(messages[1].content.startsWith(reviewed.text?.trim()));
    assert.match(messages[1].content, /Ask about timing/);
    return Response.json({ choices: [{ message: { content: 'Synthetic reply' }, finish_reason: 'stop' }] });
  });
  assert.equal(result.text, 'Synthetic reply');
});

test('old dialogue is trimmed by whole turns and a missing latest question stays empty', () => {
  const old = QUESTION_MARKER + 'Old question' + ANSWER_MARKER + 'x'.repeat(HISTORY_LIMIT);
  const previous = old + '\n\n' + QUESTION_MARKER + 'Recent question' + ANSWER_MARKER + 'Recent answer';
  const transcript = consultationTranscript(previous, 'Follow-up');
  assert.ok(!transcript.includes('Old question'));
  assert.ok(transcript.includes('Recent answer'));
  assert.equal(latestQuestion(transcript), 'Follow-up');
  assert.equal(latestQuestion(consultationTranscript(previous, '  ')), '');
});

test('an automatically cleaned chat copy can only be used as signed chat text', () => {
  const text = 'У сидорова александр сергеевича 30 лет, ДР 12.10.1995. Визиты 2026-10-01 и 2026-10-05.';
  const cleaned = cleanChatText(text);
  assert.deepEqual(cleaned, { text: 'У [name] 30 лет, [birth date removed]. Визиты [day 0] и [day 4].', removed: 4 });
  const body = { text: cleaned.text, locale: 'ru', externalSearch: false, retain: false };
  const token = signPrivacy({ purpose: CHAT_TEXT_PURPOSE, body });
  const reviewed = { ...body, privacy: { consent: true, token } };
  const parsed = readSpecialistRequest({ specialty: 'cardiology', reviewed });
  assert.ok('input' in parsed);
  assert.equal(parsed.input.transcript, cleaned.text);
  assert.deepEqual(readSpecialistRequest({ specialty: 'cardiology', reviewed: { ...reviewed, text } }), {
    error: 'privacy_review_required', status: 428,
  });
  assert.deepEqual(readSpecialistVoiceRequest(reviewed), { error: 'privacy_review_required', status: 428 });
  assert.equal(verifyPrivacy(body, token), false);
});

test('the specialist uses the signed interface language for sources and keeps the selected answer language', async () => {
  const body = { text: consultationTranscript('', 'How do I manage atrial fibrillation?'), locale: 'en', sourceLocale: 'fr', externalSearch: true };
  const token = signPrivacy({ purpose: CHAT_TEXT_PURPOSE, body });
  const parsed = readSpecialistRequest({ specialty: 'cardiology', reviewed: { ...body, privacy: { consent: true, token } } });
  assert.ok('input' in parsed);
  const queries: string[] = [];
  const modelResponse = (content: string) => Response.json({ choices: [{ message: { content }, finish_reason: 'stop' }] });
  const response = await consultSpecialist(parsed.input, { OPENROUTER_API_KEY: 'synthetic-test-key'  }, async (_url, init) => {
    const { messages } = JSON.parse(String(init?.body));
    assert.match(messages[0].content, /Write in English/);
    assert.match(messages[1].content, /Recommandations pour la fibrillation atriale/);
    return modelResponse('Synthetic reply');
  }, async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === 'openrouter.ai') {
      const { messages } = JSON.parse(String(init?.body));
      assert.match(messages[0].content, /in French in a localizedTopics array/);
      return modelResponse('{"complexity":"complex","topics":["atrial fibrillation"],"localizedTopics":["fibrillation atriale"]}');
    }
    const query = url.searchParams.get('query') ?? '';
    queries.push(query);
    return Response.json({ resultList: { result: query.includes('LANG:"fre"') ? [
      { pmid: '1234', doi: '10.1234/abc', title: 'Recommandations pour la fibrillation atriale' },
    ] : [] } });
  });
  assert.equal(response.sources[0]?.doi, '10.1234/abc');
  assert.ok(queries.some(query => query.includes('LANG:"fre"')));
  assert.ok(queries.some(query => query.includes('LANG:"eng"')));
});

test('a short clinical follow-up keeps its topic, uses a detailed model and passes retrieved evidence to an independent reviewer', async () => {
  const previous = QUESTION_MARKER + 'Чем лечить СКВ?' + ANSWER_MARKER + 'Ответ.';
  const text = consultationTranscript(previous, 'Схемы терапии');
  const body = { text, externalSearch: true, locale: 'ru' };
  const reviewed = { ...body, privacy: { consent: true, token: signPrivacy(body) } };
  const parsed = readSpecialistRequest({ specialty: 'rheumatology', reviewed });
  assert.ok('input' in parsed);
  const answer = 'Тестовый ответ с источником [1].';
  const review = 'Тестовая проверка.';
  const response = (content: string) => Response.json({ choices: [{ message: { content }, finish_reason: 'stop' }] });
  const planner: typeof fetch = async (url, init) => {
    if (String(url).includes('ebi.ac.uk')) {
      assert.match(decodeURIComponent(String(url)), /systemic[+ ]lupus[+ ]erythematosus/);
      assert.ok(!String(url).includes('Тестовый'));
      return Response.json({ resultList: { result: [{
        pmid: '41187097', title: 'Guideline for the Treatment of Systemic Lupus Erythematosus',
        abstractText: 'Evidence packet for a synthetic routing test.',
      }] } });
    }
    const { model, messages } = JSON.parse(String(init?.body));
    assert.equal(model, MODELS.sonnet);
    assert.match(messages[1].content, /Чем лечить СКВ/);
    assert.match(messages[1].content, /Схемы терапии/);
    assert.ok(!messages[1].content.includes('Тестовый ответ'));
    return response('{"complexity":"simple","topics":["systemic lupus erythematosus"]}');
  };
  const env = { OPENROUTER_API_KEY: 'synthetic-test-key'  };
  const stages: string[] = [];
  const draft = await consultSpecialist(parsed.input, env, async (_url, init) => {
    const { model, messages } = JSON.parse(String(init?.body));
    assert.equal(model, MODELS.opus);
    assert.match(messages[0].content, /first-line treatment from escalation/);
    assert.match(messages[0].content, /skin and joint disease, major organ involvement and nephritis/);
    assert.match(messages[1].content, /Evidence packet for a synthetic routing test/);
    return response(answer);
  }, planner, stage => stages.push(stage));
  assert.equal(draft.depth, 'detailed');
  assert.equal(draft.sources.length, 1);
  assert.deepEqual(stages, ['planning', 'searching', 'answering']);

  const packet = { ...body, text: text + REVIEW_MARKER + draft.text };
  const verification = readSpecialistRequest({
    specialty: 'rheumatology', intent: 'verify', model: reviewModelFor(draft.model), depth: 'detailed',
    reviewed: { ...packet, privacy: { consent: true, token: signPrivacy(packet) } },
  });
  assert.ok('input' in verification);
  const checked = await consultSpecialist(verification.input, env, async (_url, init) => {
    const { model, messages } = JSON.parse(String(init?.body));
    assert.equal(model, MODELS.sol);
    assert.match(messages[1].content, /Тестовый ответ/);
    assert.match(messages[1].content, /Evidence packet for a synthetic routing test/);
    return response(review);
  }, planner);
  assert.equal(checked.text, review);
});

test('a valid WAV needs separate approval for transcription', () => {
  const audio = wavBase64(new Float32Array(16000), 16000);
  const body = { speech: { audio } };
  assert.deepEqual(readSpecialistVoiceRequest(body), { error: 'privacy_review_required', status: 428 });
  assert.deepEqual(readSpecialistVoiceRequest({
    ...body, privacy: { consent: true, token: signPrivacy(body) },
  }), { audio });
});


test('C13: matching glossary terms become bounded guidance in the existing specialist call',async()=>{
 const body={text:consultationTranscript('','Does acetaminophen interact with metoprolol 50 mg?'),locale:'en',externalSearch:false};
 const reviewed={...body,privacy:{consent:true,token:signPrivacy(body)}};
 const parsed=readSpecialistRequest({specialty:'universal',depth:'brief',reviewed});
 assert.ok('input' in parsed);
 let calls=0;
 const answer=await consultSpecialist(parsed.input,{OPENROUTER_API_KEY:'synthetic'},async(_url,init)=>{
  calls++;
  const request=JSON.parse(String(init?.body));
  assert.match(request.messages[0].content,/paracetamol/);
  assert.match(request.messages[0].content,/metoprolol/);
  assert.match(request.messages[0].content,/NOT clinically validated/);
  assert.doesNotMatch(request.messages[0].content,/Does acetaminophen interact/);
  assert.match(request.messages[1].content,/Does acetaminophen interact/);
  return Response.json({choices:[{message:{content:'Synthetic reply'},finish_reason:'stop'}]});
 });
 assert.equal(answer.text,'Synthetic reply');
 assert.equal(calls,1);
});
