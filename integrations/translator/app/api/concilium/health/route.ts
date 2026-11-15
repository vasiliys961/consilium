import {accessAccounts} from '@/lib/access'
export const dynamic='force-dynamic'
export function GET(){return Response.json({module:'medical-translator',bridge:1,ready:Boolean(process.env.OPENAI_API_KEY&&process.env.AUTH_SECRET&&accessAccounts().length)},{headers:{'Cache-Control':'no-store'}})}
