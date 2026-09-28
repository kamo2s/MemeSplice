// Use a deployment-controlled origin behind TLS-terminating proxies. Never
// derive the CSRF allowlist from client-supplied Host or forwarded headers.
export function requestOrigin(request: Request) {
  const configured = process.env.APP_ORIGIN;
  if (!configured) return new URL(request.url).origin;
  const url = new URL(configured);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('APP_ORIGIN must be a single HTTP(S) origin.');
  }
  return url.origin;
}
