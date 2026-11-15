import type {PlaneSample} from './quality.ts';
export function samplePlane(raster:{width:number;height:number;data:Uint8Array}):PlaneSample{
 const width=Math.min(64,raster.width),height=Math.min(64,raster.height),gray:number[]=[],edge:number[]=[];let saturation=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=(Math.min(raster.height-1,Math.floor(y*raster.height/height))*raster.width+Math.min(raster.width-1,Math.floor(x*raster.width/width)))*4;const r=raster.data[at]/255,g=raster.data[at+1]/255,b=raster.data[at+2]/255;gray.push(.299*r+.587*g+.114*b);edge.push(Math.max(r,g,b)-Math.min(r,g,b));const max=Math.max(r,g,b);saturation+=max?(max-Math.min(r,g,b))/max:0;}
 return {width:raster.width,height:raster.height,sampleWidth:width,sampleHeight:height,gray,edge,saturation:saturation/(width*height)};
}
