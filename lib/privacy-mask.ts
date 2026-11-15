import type {PixelBox} from '../packages/intake/burned.ts';
export type MaskPoint={x:number;y:number};
export function maskRectangle(a:MaskPoint,b:MaskPoint,width:number,height:number):PixelBox{return {x:Math.min(a.x,b.x)*width,y:Math.min(a.y,b.y)*height,width:Math.abs(a.x-b.x)*width,height:Math.abs(a.y-b.y)*height};}
export function maskBrush(a:MaskPoint,b:MaskPoint,width:number,height:number,size:number):PixelBox[]{
 const radius=Math.max(2,Math.min(width,height)*size/200),steps=Math.max(1,Math.ceil(Math.hypot((b.x-a.x)*width,(b.y-a.y)*height)/radius));
 return Array.from({length:Math.min(2000,steps)},(_,index)=>{const at=(index+1)/Math.min(2000,steps),cx=(a.x+(b.x-a.x)*at)*width,cy=(a.y+(b.y-a.y)*at)*height,x=Math.max(0,cx-radius),y=Math.max(0,cy-radius);return {x,y,width:Math.min(width,cx+radius)-x,height:Math.min(height,cy+radius)-y};});
}
