/** Navigation keeps only an opaque bridge token, never clinical context. */
export function conciliumSession(search:string,stored:string|null):string{
 const candidate=new URLSearchParams(search).get('conciliumSession')??stored??'';
 return /^[a-f0-9-]{36}$/i.test(candidate)?candidate:'';
}
