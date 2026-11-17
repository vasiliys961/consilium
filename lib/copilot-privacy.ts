import {cleanChatText} from './privacy-chat.ts';

/** Local preflight to decide whether we need the full physician review window.
 * Every turn, even if no modal is shown, is sanitized and HMAC-signed server-side.
 * No regex can guarantee the absence of every personal identifier.
 */
const IDENTIFIER_CONTEXT=/(?:фио|фамили[яю]|имя\s+пациент|дата\s+рожд|телефон|адрес|паспорт|снилс|полис|номер\s+(?:истории|карты)|медкарт|patient\s+(?:name|id)|date\s+of\s+birth|phone\s+number|medical\s+record|dob|mrn|ssn)\s*[:=№#]?\s*[^\s\n,;]{2,}/i;
const STRUCTURED_PERSON=/\b[A-Z][a-z'-]{2,}\s+[A-Z][a-z'-]{2,}\b|(?<![\p{L}])[А-ЯЁ][а-яё-]{2,}\s+[А-ЯЁ][а-яё-]{2,}(?![\p{L}])/u;
const PRODUCT_NAMES=/^(?:Doctor Opus|Opus Copilot|OpenRouter|Claude Opus|Gemini Flash|Gemini Argon|GPT Sol|Open Evidence|OpenEvidence)$/i;
const LOCAL_FILE=/[A-Za-z]:\\|\/Users\/|\/home\/|(?:[\w-]+\.(?:pdf|docx|dcm|jpg|png|vcf))\b/i;

export function copilotNeedsPrivacyReview(utterance:string):boolean{
 if(!utterance.trim())return false;
 if(cleanChatText(utterance).removed>0)return true;
 if(IDENTIFIER_CONTEXT.test(utterance)||LOCAL_FILE.test(utterance))return true;
 const name=utterance.match(STRUCTURED_PERSON);
 return !!name&&!PRODUCT_NAMES.test(name[0]);
}
