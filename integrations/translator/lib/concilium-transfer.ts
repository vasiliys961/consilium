/** Browser-only translator iframe bridge. Not a session token for the paid speech API. */
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
export function translatorParentOrigin(previewFlag:string|undefined=process.env.NEXT_PUBLIC_CONCILIUM_PREVIEW):string{
 return previewFlag==='1'?'http://127.0.0.1:3207':'http://127.0.0.1:3107'
}
export function translatorCaseSession(search:string):string{
 const session=new URLSearchParams(search).get('conciliumSession')??''
 return UUID.test(session)?session:''
}
