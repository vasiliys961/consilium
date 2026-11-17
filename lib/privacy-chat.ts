import { redactText } from '../packages/intake/redact.ts';
import { relativeDateCleaner } from './privacy-dates.ts';

export const CHAT_TEXT_PURPOSE = 'chat-text';

/** Product names are not patient identities, but generic name detection can
 * mistake "Doctor Opus" for a first and last name. Keep only known names. */
const PRODUCT_NAMES=/\b(?:Doctor Opus|Opus Copilot|OpenRouter|Claude Opus|Gemini Flash|GPT-6\.1 Sol|GPT Sol)\b/gi;

export function cleanChatText(value: string) {
  const protectedNames:string[]=[];
  const source=value.replace(PRODUCT_NAMES,match=>{
    const index=protectedNames.push(match)-1;
    return `__COPILOT_PRODUCT_${index}__`;
  });
  const dates=relativeDateCleaner();
  const cleaned=redactText(dates.clean(source));
  const restored=cleaned.text.replace(/__COPILOT_PRODUCT_(\d+)__/g,(_,index:string)=>{
    return protectedNames[Number(index)]??'[product]';
  });
  return {text:restored,removed:cleaned.removed+dates.count()};
}
