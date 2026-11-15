import { redactText } from '../packages/intake/redact.ts';
import { relativeDateCleaner } from './privacy-dates.ts';

export const CHAT_TEXT_PURPOSE = 'chat-text';

export function cleanChatText(value: string) {
  const dates = relativeDateCleaner();
  const cleaned = redactText(dates.clean(value));
  return { text: cleaned.text, removed: cleaned.removed + dates.count() };
}
