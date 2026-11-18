export const COPILOT_PRIMARY='anthropic/claude-haiku-5.5';
export const COPILOT_RESERVE='openai/gpt-6-luna';
export const COPILOT_MAX_INPUT_BYTES=18000;
export const COPILOT_MAX_OUTPUT_TOKENS=800;
export const COPILOT_TASK_LIMIT_USD=.005;
// OpenRouter enforces these provider prices per million tokens. Context is far
// below the long-context price tiers. Reasoning is disabled for coordination.
export const COPILOT_PROVIDER={require_parameters:true,allow_fallbacks:false,max_price:{prompt:.10,completion:.50}};
export function copilotModel(value:unknown):typeof COPILOT_PRIMARY|typeof COPILOT_RESERVE{
 return value===COPILOT_RESERVE?COPILOT_RESERVE:COPILOT_PRIMARY;
}
export function copilotMaximumCharge(inputBytes:number,requests=2):number{
 return requests*((inputBytes+512)*.10+COPILOT_MAX_OUTPUT_TOKENS*.50)/1_000_000;
}
