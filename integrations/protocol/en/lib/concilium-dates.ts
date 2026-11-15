/** One transient timeline per outgoing case, not a reversible calendar in the model payload. */
export function relativeDateCleaner(){let anchor:number|null=null;let changed=0;
 const clean=(text:string)=>text.replace(/(?:дата\s*рождения|д\.?\s*р\.?|date\s*of\s*birth|birth\s*date|dob)\s*[:=：]?\s*(?:\d{1,4}[./-]\d{1,2}[./-]\d{1,4})/giu,()=>{changed++;return '[birth date removed]';}).replace(/(?<!\d)(?:(\d{4})-(\d{2})-(\d{2})|(\d{1,2})[./](\d{1,2})[./](\d{4}))(?!\d)/g,(match,y,m,d,day,month,year)=>{const yy=Number(y||year),mm=Number(m||month),dd=Number(d||day);if(yy<1900||yy>2100)return match;const value=Date.UTC(yy,mm-1,dd),date=new Date(value);if(date.getUTCFullYear()!==yy||date.getUTCMonth()!==mm-1||date.getUTCDate()!==dd)return match;if(anchor===null)anchor=value;changed++;return `[day ${Math.round((value-anchor)/86400000)}]`;});
 return {clean,count:()=>changed};
}
