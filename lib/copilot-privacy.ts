import {cleanChatText} from './privacy-chat.ts';

/**
 * Client-side conservative preflight. The server still sanitizes every text
 * conversation and issues a fresh signed approval. This hint only decides
 * whether a clinician must see the full privacy review dialog first.
 */
const IDENTIFIER_CONTEXT=/(?:фио|фамили[яю]|имя\s+пациент|дата\s+рожд|телефон|адрес|паспорт|снилс|полис|номер\s+(?:истории|карты)|медкарт|patient\s+(?:name|id)|date\s+of\s+birth|phone\s+number|medical\s+record|dob|mrn|ssn)\s*[:=№#]?\s*[^\s\n,;]{2,}/i;
const STRUCTURED_PERSON=/\b[A-Z][a-z'-]{2,}\s+[A-Z][a-z'-]{2,}\b|(?<![\p{L}])[А-ЯЁ][а-яё-]{2,}\s+[А-ЯЁ][а-яё-]{2,}(?![\p{L}])/u;
const SAFE_NAMED_SYSTEMS=/^(?:Doctor Opus|Opus Copilot|OpenRouter|Claude Opus|Gemini Flash|GPT Sol)$/i;
export function copilotNeedsPrivacyReview(text:string):boolean{
 if(!text.trim())return false;
 // Common product and model names are not patient identities.
 const noProductNames=text.replace(/\b(?:Doctor Opus|Opus Copilot|Claude Opus|Gemini Flash|Gemini Argon|OpenRouter|GPT-6\.1 Sol)\b/gi,'[product]');
 if(redactText(noProductNames).removed>0||IDENTIFIER_CONTEXT.test(text))return true;
 const words=noProductNames.match(STRUCTURED_PERSON);
 if(words&&!SAFE_NAMED_SYSTEMS.test(words[0]))return true;
 // Case-file references and pasted local paths are not for the lightweight chat.
 if(/(?:[A-Za-z]:\\|\/Users\/|\/home\/|(?:[\w-]+\.(?:pdf|docx|dcm|jpg|png|vcf))\b)/i.test(text))return true;
 return false;
}
