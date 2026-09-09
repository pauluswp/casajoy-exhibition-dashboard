const WORKER_ORIGIN = 'https://casajoy-exhibition-api.uanlejia.workers.dev';

async function proxyApi(request, env) {
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, WORKER_ORIGIN);
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('X-Internal-Token', env.INTERNAL_API_TOKEN || '');

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body
  });
  const output = new Response(response.body, response);
  output.headers.set('Cache-Control', 'no-store');
  return output;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/api/')) return proxyApi(request, env);
    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      const response = await env.ASSETS.fetch(new Request(new URL('/admin-view', request.url), request));
      const output = new Response(response.body, response);
      output.headers.set('Content-Type', 'text/html; charset=utf-8');
      return output;
    }
    return env.ASSETS.fetch(request);
  }
};
