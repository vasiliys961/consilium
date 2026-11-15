/** Local service ports are scoped by application instance.
 * This profile intentionally uses a NEXT_PUBLIC flag because both server routes
 * and browser-side iframe bridges must agree on the same child origins.
 */
const PRIMARY = Object.freeze({
  app: 3107,
  phone: 3108,
  radiology: 3110,
  protocolRu: 3111,
  protocolEn: 3112,
  translator: 3113,
});
const PREVIEW = Object.freeze({
  app: 3207,
  phone: 3208,
  radiology: 3210,
  protocolRu: 3211,
  protocolEn: 3212,
  translator: 3213,
});
export type LocalService = keyof typeof PRIMARY;

export function isPreviewInstance(): boolean {
  return process.env.NEXT_PUBLIC_CONCILIUM_PREVIEW === '1';
}
export function localPorts() {
  return isPreviewInstance() ? PREVIEW : PRIMARY;
}
export function localOrigin(service: LocalService): string {
  return `http://127.0.0.1:${localPorts()[service]}`;
}
/** Require an exact loopback origin bound to this instance's app port. */
export function allowedAppOrigin(origin: string | null): boolean {
  const port = localPorts().app;
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}
