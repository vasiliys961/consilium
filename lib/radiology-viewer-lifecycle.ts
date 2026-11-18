/** A slow health probe must not destroy uploaded files or an in-flight review.
 * A new study/session is still explicitly keyed by the owning component.
 */
export function retainRadiologyViewer(opened:boolean,running:unknown):boolean{
 return opened||running===true;
}
