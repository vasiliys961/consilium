import {cleanChatText} from './privacy-chat.ts';
import {
 copilotRequestedOpen,isCopilotHelpQuery,isCopilotToolDiscoveryQuery,
} from './physician-task-router.ts';

export type CopilotDialogueTurn={role:'physician'|'assistant';text:string};

/** Record free, deterministic navigation as dialogue context, too.
 * No localStorage, network call or paid inference is performed here. */
export function appendLocalCopilotTurn(
 previous:readonly CopilotDialogueTurn[], question:string,route:string,
):CopilotDialogueTurn[]{
 const physician=cleanChatText(question).text.trim().slice(0,1000);
 const assistant=cleanChatText(route).text.trim().slice(0,400);
 if(!physician)return [...previous];
 return [...previous.slice(-12),
  {role:'physician' as const,text:physician},
  ...(assistant?[{role:'assistant' as const,text:assistant}]:[]),
 ].slice(-14);
}

function clinicalQuestion(text:string):string{
 const question=cleanChatText(text).text.trim().slice(0,850);
 if(!question||isCopilotHelpQuery(question)||isCopilotToolDiscoveryQuery(question)||
  copilotRequestedOpen(question))return '';
 return question;
}

/** Preserve at most three recent physician questions across Copilot → specialist.
 * Navigation commands and platform-help queries are not patient history.
 * The clinician reviews this one-time, short local draft before any model call. */
export function composeCopilotSpecialistDraft(
 history:readonly CopilotDialogueTurn[],latest:string,
):string{
 const questions=history.filter(turn=>turn.role==='physician')
  .map(turn=>clinicalQuestion(turn.text)).filter(Boolean);
 const last=clinicalQuestion(latest);
 if(last&&questions.at(-1)!==last)questions.push(last);
 const recent=questions.slice(-3);
 if(recent.length<=1)return recent[0]??'';
 return ['Последние вопросы врача (проверьте контекст перед отправкой специалисту):',
  ...recent.map((question,index)=>`${index+1}. ${question}`),
 ].join('\n').slice(0,3000);
}
