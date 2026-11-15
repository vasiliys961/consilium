import {recognizeWords} from '@/packages/intake/ocr';
import {decodeDataUrl} from '@/packages/intake/raster';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const url=new URL(request.url),host=request.headers.get('host');
 if(!host||!['127.0.0.1','localhost','[::1]'].some(name=>host===`${name}:${url.port}`)||request.headers.get('origin')!==`http://${host}`)return Response.json({error:'origin'},{status:403});
 const raw=await request.text();if(raw.length>6000000)return Response.json({error:'size'},{status:413});
 let image;try{image=JSON.parse(raw).image;}catch{return Response.json({error:'json'},{status:400});}
 if(typeof image!=='string'||!/^data:image\/(jpeg|png);base64,/.test(image)||!decodeDataUrl(image))return Response.json({error:'image'},{status:400});
 const words=await recognizeWords(Buffer.from(image.split(',')[1],'base64'),image.startsWith('data:image/png')?'png':'jpg');
 if(!words)return Response.json({error:'ocr_unavailable'},{status:503});
 const lines:Array<{y:number;height:number;words:typeof words}>=[];
 for(const word of words.slice().sort((a,b)=>a.y-b.y||a.x-b.x)){
  const line=lines.find(line=>Math.abs(line.y-word.y)<Math.max(line.height,word.height)*.6);
  if(line)line.words.push(word);else lines.push({y:word.y,height:word.height,words:[word]});
 }
 return Response.json({text:lines.map(line=>line.words.sort((a,b)=>a.x-b.x).map(word=>word.text).join(' ')).join('\n')});
}
