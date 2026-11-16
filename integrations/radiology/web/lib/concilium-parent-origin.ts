/** The embedded Radiology viewer must talk to the SAME Concilium instance as the bridge.
 * A preview 3207 iframe must never deliver clinical material to the primary 3107.
 * Only exact loopback origins are allowed; no query-controlled or wildcard origins.
 */
export function conciliumParentOrigin(previewFlag:string|undefined=process.env.NEXT_PUBLIC_CONCILIUM_PREVIEW):string{
 return previewFlag==='1'?'http://127.0.0.1:3207':'http://127.0.0.1:3107';
}
