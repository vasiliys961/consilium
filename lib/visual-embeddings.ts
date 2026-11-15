import {expandLibraryKeywords} from './library-query.ts';
export const VISUAL_MODEL='Xenova/clip-vit-base-patch32';
export const VISUAL_INDEX_VERSION='clip-page-regions-v2';
let loaded:Promise<{image:(input:string)=>Promise<Float32Array>;text:(input:string)=>Promise<Float32Array>}>|undefined;
function normalized(data:ArrayLike<number>){const out=Float32Array.from(data);const norm=Math.sqrt(out.reduce((sum,value)=>sum+value*value,0));if(!norm)throw Error('Invalid visual vector');for(let i=0;i<out.length;i++)out[i]/=norm;return out;}
async function models(){
 if(!loaded)loaded=(async()=>{
  const {env,AutoTokenizer,AutoProcessor,CLIPTextModelWithProjection,CLIPVisionModelWithProjection,RawImage}=await import('@xenova/transformers');
  env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath='/models/';env.backends.onnx.wasm.wasmPaths='/ort/';env.backends.onnx.wasm.numThreads=1;
  const [tokenizer,processor,textModel,imageModel]=await Promise.all([AutoTokenizer.from_pretrained(VISUAL_MODEL),AutoProcessor.from_pretrained(VISUAL_MODEL),CLIPTextModelWithProjection.from_pretrained(VISUAL_MODEL,{quantized:true}),CLIPVisionModelWithProjection.from_pretrained(VISUAL_MODEL,{quantized:true})]);
  return {image:async(input:string)=>normalized((await imageModel(await processor(await RawImage.read(input)))).image_embeds.data),text:async(input:string)=>normalized((await textModel(tokenizer(input,{padding:true,truncation:true,max_length:77}))).text_embeds.data)};
 })().catch(error=>{loaded=undefined;throw error;});
 return loaded;
}
export async function embedBookImage(image:string){return (await models()).image(image);}
export function visualQueryText(query:string){
 const words=query.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];
 const english=expandLibraryKeywords(words,query).filter(word=>/^[a-z][a-z\s-]+$/i.test(word));
 return /[а-яё\u0600-\u06ff\u4e00-\u9fff]/iu.test(query)?english.join(' ').slice(0,600):query.slice(0,600);
}
export async function embedBookVisualQuery(query:string){const text=visualQueryText(query);return text.trim()?(await models()).text(text):null;}
