export function radiologyReportMessage(input:unknown,session:string):string|null{
 if(!input||typeof input!=='object')return null;const value=input as Record<string,unknown>;return value.type==='concilium.report'&&value.session===session&&typeof value.text==='string'&&value.text.trim().length>0&&value.text.length<=100000?value.text.trim():null;
}
