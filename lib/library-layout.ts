/** PDF text geometry is source data, never clinical interpretation. */
export interface PdfTextItem {str?:string;hasEOL?:boolean;transform?:number[];width?:number;height?:number}
export interface BookObject {kind:'figure'|'table'|'footnote';label:string;text:string;bounds?:[number,number,number,number]}
export function extractBookLayout(items:PdfTextItem[],width:number,height:number){
 const rows: {y:number;x:number;size:number;text:string}[]=[];
 for(const item of items){if(!item.str?.trim())continue;const x=item.transform?.[4]??0,y=item.transform?.[5]??-rows.length*12,size=item.height??Math.abs(item.transform?.[3]??12);
  let row=rows.find(row=>Math.abs(row.y-y)<Math.max(2,size*.3));
  if(!row){row={x,y,size,text:''};rows.push(row);}row.text+=(row.text?'  ':'')+item.str;row.size=Math.max(row.size,size);
 }
 rows.sort((a,b)=>b.y-a.y||a.x-b.x);
 const text=items.some(item=>item.hasEOL)?items.map(item=>(item.str??'')+(item.hasEOL?'\n':' ')).join(''):rows.map(row=>row.text).join('\n');
 const sizes=rows.map(row=>row.size).sort((a,b)=>a-b),median=sizes[Math.floor(sizes.length/2)]??12;
 const footnotes=rows.filter(row=>row.y<height*.2&&row.size<median*.9||/^\s*(?:\*|†|‡|note\b|примечан|сноск)/iu.test(row.text)).map(row=>row.text).join('\n');
 const objects:BookObject[]=[];
 rows.forEach((row,index)=>{
  const figure=/^\s*(?:fig(?:ure)?\.?|рис(?:унок)?\.?|иллюстраци[яи])\s*[\dIVX]/iu.test(row.text);
  const table=/^\s*(?:table|таблиц[аы]|табл\.?)\s*[\dIVX]/iu.test(row.text);
  if(figure||table)objects.push({kind:figure?'figure':'table',label:row.text.slice(0,300),text:[...rows.slice(Math.max(0,index-2),Math.min(rows.length,index+14)).map(line=>line.text),footnotes].filter(Boolean).join('\n').slice(0,6500),bounds:[0,Math.max(0,1-(row.y+row.size)/height),1,Math.min(1,row.size*16/height)]});
 });
 if(footnotes)objects.push({kind:'footnote',label:'Footnotes / source notes',text:footnotes.slice(0,4000)});
 return {text,objects,heading:rows.find(row=>row.size>median*1.2)?.text.slice(0,250)??'',width,height};
}
/** A page and overlapping regions cover vector diagrams as well as embedded pictures. */
export function pageVisualRegions():{id:string;bounds:[number,number,number,number]}[]{
 return [{id:'page',bounds:[0,0,1,1]},
 ...[0,.45].flatMap((y,iy)=>[0,.45].map((x,ix)=>({id:`tile-${iy}-${ix}`,bounds:[x,y,.55,.55] as [number,number,number,number]})))];
}

export function multiplyPdfMatrix(a:number[],b:number[]){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
/** Exact placement of raster image operations; vector art remains covered by tiles. */
export function embeddedImageRegions(list:{fnArray:number[];argsArray:unknown[][]},ops:Record<string,number>,viewport:{width:number;height:number;transform:number[]}){
 let matrix=[1,0,0,1,0,0];const stack:number[][]=[],forms:number[][]=[];
 const regions:{id:string;bounds:[number,number,number,number]}[]=[];
 for(let i=0;i<list.fnArray.length;i++){
  const fn=list.fnArray[i],args=list.argsArray[i];
  if(fn===ops.save)stack.push([...matrix]);else if(fn===ops.restore)matrix=stack.pop()??matrix;
  else if(fn===ops.transform&&args.length===6)matrix=multiplyPdfMatrix(matrix,args as number[]);
  else if(fn===ops.paintFormXObjectBegin){forms.push([...matrix]);if(Array.isArray(args[0]))matrix=multiplyPdfMatrix(matrix,args[0] as number[]);}
  else if(fn===ops.paintFormXObjectEnd)matrix=forms.pop()??matrix;
  else if(fn===ops.paintImageXObject||fn===ops.paintInlineImageXObject){
   const m=multiplyPdfMatrix(viewport.transform,matrix);
   const points=[[0,0],[1,0],[0,1],[1,1]].map(([x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]);
   const left=Math.max(0,Math.min(...points.map(p=>p[0]))/viewport.width),top=Math.max(0,Math.min(...points.map(p=>p[1]))/viewport.height);
   const right=Math.min(1,Math.max(...points.map(p=>p[0]))/viewport.width),bottom=Math.min(1,Math.max(...points.map(p=>p[1]))/viewport.height);
   if(right-left>=.025&&bottom-top>=.02&&right>left&&bottom>top)regions.push({id:`figure-${i}`,bounds:[left,top,right-left,bottom-top]});
  }
 }
 return regions;
}
