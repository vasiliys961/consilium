import {parseEnv} from 'node:util';

/** Only explicit, previously saved, server-side Preview decisions may override
 * inherited environment variables. Do not import keys, tokens or settings
 * from the child .env.local into the parent process or a browser response.
 */
const FLAGS=[
  'RADIOLOGY_ENABLE_DEIDENTIFIED_OPENROUTER_PILOT',
  'RADIOLOGY_OPENROUTER_HEALTH_DATA_APPROVED',
  'RADIOLOGY_LOCAL_REVIEWED_FRAME_SESSION',
] as const;

export function radiologyPreviewApprovalOverrides(content:string):Record<string,string>{
  const env=parseEnv(content);
  const out:Record<string,string>={};
  for(const key of FLAGS){
    if(env[key]==='1'||env[key]==='0')out[key]=env[key];
  }
  return out;
}
