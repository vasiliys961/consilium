'use client';

import {LanguageSwitcher} from '@/app/components/language-switcher';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CitationContent } from '@/app/components/citation-content';
import { useWorkspaceLanguage } from '@/app/components/workspace-language';
import { requestStreamedJson } from '@/lib/analysis-stream';
import { recordConsultQuestion } from '@/lib/consult-recording';
import { LOCALES, parseLocale, type Locale } from '@/lib/locale';
import { cleanChatText } from '@/lib/privacy-chat';
import { prepareChatSend, reviewBeforeSending } from '@/lib/privacy-client';
import {
  CONSULT_MODELS, REVIEW_MARKER, reviewModelFor, type ConsultDepth, type ConsultModel, type ConsultReply, type ConsultStage,
} from '@/lib/specialist-options';
import {
  ANSWER_MARKER, QUESTION_LIMIT, QUESTION_MARKER, SPECIALIST_PROFILES, consultationTranscript,
  latestQuestion, TRANSCRIPT_LIMIT, type SpecialistId,
} from '@/lib/specialist-profiles';
import { WORKSPACE_LANGUAGES, type WorkspaceLanguage } from '@/lib/workspace-i18n';
import styles from './consult.module.css';

type Turn = ConsultReply & { question: string; transcript: string; verification?: ConsultReply };
type Dialogue = { transcript: string; turns: Turn[] };
type Action = { kind: 'ask' | 'transcribe' } | { kind: 'verify'; index: number };
const EMPTY_DIALOGUE: Dialogue = { transcript: '', turns: [] };

function AnswerMarkdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const openingFence = /^\s*```(?:markdown|md)?[ \t]*\r?\n/i;
  const content = openingFence.test(text) ? text.replace(openingFence, '').replace(/\r?\n```[ \t]*$/, '') : text;
  const rendered = streaming ? content.replace(/(^|[ \t\n])\*\*([^*\r\n]*?)\*?$/, '$1$2') : content;
  return <div dir="auto" className={styles.markdown}>
    <Markdown remarkPlugins={[remarkGfm]} skipHtml disallowedElements={['img', 'a', 'input']} unwrapDisallowed>{rendered}</Markdown>
  </div>;
}

function ReplyContent({ reply }: { reply: ConsultReply }) {
  const { t } = useWorkspaceLanguage();
  return <>
    <AnswerMarkdown text={reply.text} />
    <small>
      {CONSULT_MODELS.find(item => item.id === reply.model)?.label ?? reply.model}
      {reply.depth && ` · ${t(reply.depth === 'brief' ? 'Кратко' : 'Развёрнуто')}`}
      {reply.usageComplete && ` · ≈ $${reply.cost.toFixed(4)}`}
    </small>
    {!!reply.sources.length && <details className={styles.sources}>
      <summary>{t('Источники для проверки')} · {reply.sources.length}</summary>
      <ol>
        {reply.sources.map(source => <li key={source.pmid ?? source.url ?? source.title}>
          {source.url?.startsWith('https://') ?
            <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : source.title}
          {source.year && ` · ${source.year}`}
          <CitationContent citation={source} />
        </li>)}
      </ol>
    </details>}
    {reply.searched && !reply.sources.length && <p className={styles.hint}>{t('В ответе нет материалов академического поиска.')}</p>}
  </>;
}

export default function ConsultPage() {
  const { language, setLanguage, t } = useWorkspaceLanguage();
  const [specialty, setSpecialty] = useState<SpecialistId>('universal');
  const [answerLanguage, setAnswerLanguage] = useState<Locale>();
  const [model, setModel] = useState<ConsultModel>('auto');
  const [depth, setDepth] = useState<ConsultDepth>('auto');
  const [academic, setAcademic] = useState(true);
  const [dialogues, setDialogues] = useState<Partial<Record<SpecialistId, Dialogue>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<SpecialistId, string>>>({});
  const [pending, setPending] = useState('');
  const [preview, setPreview] = useState('');
  const [stage, setStage] = useState<ConsultStage>('answering');
  const [error, setError] = useState('');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [action, setAction] = useState<Action>();
  const [working, setWorking] = useState(false);
  const [mic, setMic] = useState<'opening' | 'recording'>();
  const [clip, setClip] = useState<string>();
  const [editedCopy, setEditedCopy] = useState<{ original: string; text: string }>();

  const controller = useRef<AbortController>();
  const recording = useRef<AbortController>();
  const stopRecording = useRef<() => void>();
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const question = drafts[specialty] ?? '';
  const dialogue = dialogues[specialty] ?? EMPTY_DIALOGUE;
  const profile = SPECIALIST_PROFILES.find(item => item.id === specialty)!;
  const busy = Boolean(action || mic);
  const original = question.trim() ? consultationTranscript(dialogue.transcript, question) : '';
  const edited = editedCopy?.original === original ? editedCopy.text : undefined;
  const automatic = useMemo(() => cleanChatText(original), [original]);
  const outgoing = useMemo(() => edited === undefined ? automatic : cleanChatText(edited), [automatic, edited]);
  const outgoingQuestion = latestQuestion(outgoing.text);
  const stageText = stage === 'planning' ? 'Уточняем контекст вопроса…'
    : stage === 'searching' ? 'Ищем клинические источники…'
    : action?.kind === 'verify' ? 'Проверяем ответ…' : 'Готовим ответ…';

  useEffect(() => {
    const statusRequest = new AbortController();
    void fetch('/api/status', { signal: statusRequest.signal })
      .then(response => response.ok ? response.json() : { configured: false })
      .then(value => setConfigured(Boolean(value.configured)))
      .catch(() => { if (!statusRequest.signal.aborted) setConfigured(false); });
    return () => {
      statusRequest.abort();
      controller.current?.abort();
      recording.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (conversation.current && action?.kind !== 'verify') {
      conversation.current.scrollTop = conversation.current.scrollHeight;
    }
  }, [specialty, dialogue.turns.length, action?.kind, pending, preview]);

  async function execute(next: Action) {
    if (controller.current || recording.current || configured === false) return;
    const turn = next.kind === 'verify' ? dialogue.turns[next.index] : undefined;
    const text = next.kind === 'ask' ? edited ?? original
      : turn ? turn.transcript + REVIEW_MARKER + turn.text : '';
    if (next.kind === 'transcribe' ? !clip : !text) return;

    const request = new AbortController();
    controller.current = request;
    setError('');
    setAction(next);
    try {
      const voice = next.kind === 'transcribe';
      const locale = answerLanguage ?? language;
      const reviewed = voice
        ? await reviewBeforeSending({ speech: { audio: clip }, locale, externalSearch: false }, 'chat-audio')
        : await prepareChatSend({ text, locale, sourceLocale: language, externalSearch: academic }, request.signal);
      request.signal.throwIfAborted();
      const approvedText = reviewed.text ?? '';
      const approvedQuestion = next.kind === 'ask' ? latestQuestion(approvedText) : '';
      if (next.kind === 'ask' && !approvedQuestion) {
        setError('Добавьте вопрос к отправляемому тексту.');
        return;
      }
      if (next.kind === 'ask' && approvedText !== outgoing.text) {
        setEditedCopy({ original, text: approvedText });
        setError('Текст для отправки обновился. Проверьте его и повторите отправку.');
        return;
      }
      setPending(approvedQuestion);
      setWorking(true);
      const result = await requestStreamedJson<ConsultReply>('/api/specialist-chat', {
        specialty, reviewed, intent: next.kind, model: turn ? reviewModelFor(turn.model) : model,
        depth: turn ? 'detailed' : depth,
      }, {
        signal: request.signal,
        onProgress: event => {
          const phase = event.stage;
          if (!request.signal.aborted && event.event === 'consult.stage' &&
            (phase === 'planning' || phase === 'searching' || phase === 'answering')) setStage(phase);
        },
        onPreview: value => { if (!request.signal.aborted) setPreview(value); },
      });
      request.signal.throwIfAborted();

      if (next.kind === 'transcribe') {
        setDrafts(current => ({
          ...current,
          [specialty]: [current[specialty]?.trim(), result.text].filter(Boolean).join('\n').slice(0, QUESTION_LIMIT),
        }));
        setClip(undefined);
      } else if (next.kind === 'verify') {
        setDialogues(current => ({
          ...current, [specialty]: {
            ...dialogue, turns: dialogue.turns.map((item, index) =>
              index === next.index ? { ...item, verification: result } : item),
          },
        }));
      } else {
        setDialogues(current => ({
          ...current, [specialty]: {
            transcript: (approvedText.startsWith(QUESTION_MARKER) ? approvedText : QUESTION_MARKER + approvedText) + ANSWER_MARKER + result.text,
            turns: [...dialogue.turns, { ...result, question: approvedQuestion, transcript: approvedText }],
          },
        }));
        setDrafts(current => ({ ...current, [specialty]: '' }));
        setEditedCopy(undefined);
      }
    } catch (failure) {
      if (request.signal.aborted) return;
      if (failure instanceof Error && failure.message === t('Отправка отменена врачом.')) return;
      setError(next.kind === 'transcribe' ? 'Не удалось расшифровать запись.'
        : next.kind === 'verify' ? 'Не удалось проверить ответ.'
        : 'Не удалось получить ответ. Вопрос остался в поле ввода.');
    } finally {
      controller.current = undefined;
      setPending('');
      setPreview('');
      setStage('answering');
      setWorking(false);
      setAction(undefined);
    }
  }

  function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (outgoingQuestion) void execute({ kind: 'ask' });
  }

  async function toggleRecording() {
    if (stopRecording.current) {
      stopRecording.current();
      return;
    }
    if (recording.current || controller.current) return;
    const request = new AbortController();
    recording.current = request;
    setError('');
    setMic('opening');
    try {
      const finish = await recordConsultQuestion(request.signal, value => {
        recording.current = undefined;
        stopRecording.current = undefined;
        setMic(undefined);
        if (value) setClip(value);
        else setError('Не удалось записать голос. Проверьте доступ к микрофону.');
      });
      if (recording.current === request) {
        stopRecording.current = finish;
        setMic('recording');
      }
    } catch {
      if (request.signal.aborted) return;
      recording.current = undefined;
      setMic(undefined);
      setError('Не удалось записать голос. Проверьте доступ к микрофону.');
    }
  }

  return <main className={styles.shell}>
    <header className={styles.header}>
      <nav aria-label={t('РАБОЧЕЕ ПРОСТРАНСТВО')}>
        <Link href="/">{language === 'ar' ? '→' : '←'} {t('Главная')}</Link>
        <Link href="/workspace">{t('Клинические случаи')}</Link>
      </nav>
      <span className={styles.badge}>{t('ИИ-помощник')}</span>
      <h1>{t('Спросить специалиста')}</h1>
      <p>{t('Выберите клинический профиль и задайте вопрос. Можно уточнить ответ в том же диалоге.')}</p>
    </header>

    <section className={styles.chat} aria-label={t('Диалог со специалистом')}>
      <div className={styles.settings}>
        <label>{t('Профиль специалиста')}
          <select value={specialty} disabled={busy} onChange={event => {
            setSpecialty(event.target.value as SpecialistId);
            setClip(undefined);
            setEditedCopy(undefined);
            setError('');
          }}>
            {SPECIALIST_PROFILES.map(item => <option key={item.id} value={item.id}>{t(item.label)}</option>)}
          </select>
        </label>
        <LanguageSwitcher disabled={busy}/>
        <label>{t('Язык ответа')}
          <select value={answerLanguage ?? language} disabled={busy} onChange={event => setAnswerLanguage(parseLocale(event.target.value))}>
            {LOCALES.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
        </label>
        <label>{t('Модель ответа')}
          <select value={model} disabled={busy} onChange={event => setModel(event.target.value as ConsultModel)}>
            <option value="auto">{t('По сложности вопроса')}</option>
            {CONSULT_MODELS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>{t('Формат ответа')}
          <select value={depth} disabled={busy} onChange={event => setDepth(event.target.value as ConsultDepth)}>
            <option value="auto">{t('По сложности вопроса')}</option>
            <option value="brief">{t('Кратко')}</option>
            <option value="detailed">{t('Развёрнуто')}</option>
          </select>
        </label>
        <label className={styles.search}>
          <input type="checkbox" checked={academic} disabled={busy} onChange={event => setAcademic(event.target.checked)} />
          {t('Академический поиск')}
        </label>
        <button type="button" disabled={busy || !dialogue.turns.length && !question && !clip} onClick={() => {
          setDialogues(current => ({ ...current, [specialty]: EMPTY_DIALOGUE }));
          setDrafts(current => ({ ...current, [specialty]: '' }));
          setClip(undefined);
          setEditedCopy(undefined);
          setError('');
          promptInput.current?.focus();
        }}>{t('Новый диалог')}</button>
      </div>

      {Boolean(dialogue.turns.length || pending) && <div className={styles.conversation} ref={conversation}>
        {dialogue.turns.map((turn, index) => <div className={styles.turn} key={index}>
          <article className={styles.question}><strong>{t('Ваш вопрос')}</strong><p>{turn.question}</p></article>
          <article className={styles.answer}>
            <strong>{t(profile.label)} · {t('ИИ-помощник')}</strong>
            <ReplyContent reply={turn} />
            {turn.verification ? <section className={styles.verification} aria-label={t('Проверка другой моделью')}>
              <strong>{t('Проверка другой моделью')}</strong>
              <ReplyContent reply={turn.verification} />
            </section> : action?.kind === 'verify' && action.index === index && working ? <section className={styles.verification} aria-busy="true">
              <strong>{t('Проверка другой моделью')}</strong>
              {preview ? <AnswerMarkdown text={preview} streaming /> : <p role="status">{t(stageText)}</p>}
            </section> : <button type="button" className={styles.verifyButton} disabled={busy}
              onClick={() => void execute({ kind: 'verify', index })}>
              {t('Проверить ответ')} · {CONSULT_MODELS.find(item => item.id === reviewModelFor(turn.model))?.label}
            </button>}
          </article>
        </div>)}
        {pending && <div className={styles.turn}>
          <article className={styles.question}><strong>{t('Ваш вопрос')}</strong><p>{pending}</p></article>
          <article className={styles.answer} aria-busy="true">
            <strong>{t(profile.label)} · {t('ИИ-помощник')}</strong>
            {preview ? <AnswerMarkdown text={preview} streaming /> : <p role="status">{t(stageText)}</p>}
          </article>
        </div>}
      </div>}

      <form className={styles.composer} onSubmit={ask}>
        <label>{t('Ваш вопрос')}
          <textarea ref={promptInput} rows={4} dir="auto" value={question} maxLength={QUESTION_LIMIT} required
            disabled={busy} placeholder={t('Напишите вопрос специалисту…')} onChange={event => {
              const value = event.target.value;
              setDrafts(current => ({ ...current, [specialty]: value }));
            }} />
        </label>
        {original && <div className={styles.outgoing}>
          {(automatic.removed > 0 || edited !== undefined) && <p dir="auto">
            <strong>{t('Текст для отправки')}</strong>{' '}
            {outgoingQuestion}
          </p>}
          <details>
            <summary>{t('Проверить и отредактировать отправляемый текст')}</summary>
            <label>{t('Вопрос и предыдущие сообщения')}
              <textarea rows={5} dir="auto" value={edited ?? automatic.text} maxLength={TRANSCRIPT_LIMIT} disabled={busy}
                onChange={event => setEditedCopy({ original, text: event.target.value })} />
            </label>
            {edited !== undefined && <button type="button" disabled={busy} onClick={() => setEditedCopy(undefined)}>
              {t('Вернуть автоматически очищенный текст')}
            </button>}
          </details>
        </div>}
        <p className={styles.hint}>{t('Чат автоматически скрывает распознанные персональные данные. Кнопка «Задать вопрос» отправляет очищенный текст модели.')}</p>
        {academic && <p className={styles.hint}>{t('При академическом поиске в Europe PMC отправляется короткая тема, выделенная из текста.')}</p>}
        {configured === false && <p role="status">{t('Для ответа подключите модель в настройках локального сервера.')}</p>}
        {error && <p role="alert">{t(error)}</p>}
        {clip && <div className={styles.recording}>
          <audio controls src={`data:audio/wav;base64,${clip}`} />
          <button type="button" disabled={busy || configured === false} onClick={() => void execute({ kind: 'transcribe' })}>
            {t(action?.kind === 'transcribe' && working ? 'Расшифровываем запись…' : 'Расшифровать запись')}
          </button>
        </div>}
        <div className={styles.actions}>
          <button className={styles.primary} disabled={busy || !outgoingQuestion || configured === false}>
            {t(action?.kind === 'ask' && working ? 'Готовим ответ…' : 'Задать вопрос')}
          </button>
          <button type="button" disabled={Boolean(action) || mic === 'opening'} onClick={() => void toggleRecording()}>
            {t(mic === 'recording' ? 'Остановить запись' : 'Записать голосом')}
          </button>
          {working && <button type="button" onClick={() => controller.current?.abort()}>{t('Остановить ответ')}</button>}
        </div>
      </form>
    </section>
  </main>;
}
