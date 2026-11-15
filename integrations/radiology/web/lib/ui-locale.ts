/** Local dictionary only: no patient text or runtime translation requests. */
export function makeUiTranslator(catalog:Record<string,string>){
 const patterns=Object.entries(catalog).flatMap(([key,translation])=>{
  if(!/\{\d+\}/.test(key))return [];
  const ids:number[]=[];
  const pattern=key.split(/(\{\d+\})/).map(part=>{if(/^\{\d+\}$/.test(part)){ids.push(Number(part.slice(1,-1)));return '(.*?)';}return part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}).join('');
  return [{pattern:new RegExp('^'+pattern+'$','s'),ids,translation}];
 });
 return (value:string)=>{
  if(catalog[value])return catalog[value];
  for(const {pattern,ids,translation} of patterns){const match=pattern.exec(value);if(match)return translation.replace(/\{(\d+)\}/g,(_s,id)=>match[ids.indexOf(Number(id))+1]??'');}
  return value;
 };
}
