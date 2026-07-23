// Trufquén — helpers compartidos para la Instagram Graph API.
// Sin dependencias: usa fetch nativo de Node 18+.

export const API = 'https://graph.facebook.com/v21.0';

/** Lee una variable de entorno obligatoria sin volcarla nunca a los logs. */
export function env(name, { required = true } = {}) {
  const v = process.env[name];
  if (required && !v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

/** Oculta el token si se cuela en un mensaje de error. */
export function redact(s) {
  return String(s).replace(/(access_token=)[^&\s]+/g, '$1***');
}

/**
 * Llamada a la Graph API con reintentos exponenciales.
 * dryRun -> no envía nada, devuelve un id simulado y registra la llamada.
 */
export async function graph(path, { method = 'GET', params = {}, token, dryRun = false, retries = 3 } = {}) {
  const url = new URL(`${API}/${path}`);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (method === 'GET') url.searchParams.set(k, v);
    else body.set(k, v);
  }
  if (token) (method === 'GET' ? url.searchParams : body).set('access_token', token);

  if (dryRun) {
    console.log(`   [dry-run] ${method} ${redact(url.pathname + url.search)}`);
    for (const [k, v] of body) if (k !== 'access_token') console.log(`             ${k}=${String(v).slice(0, 90)}`);
    return { id: `DRY_${Math.random().toString(36).slice(2, 10)}`, status_code: 'FINISHED' };
  }

  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, method === 'GET' ? {} : { method, body });
      const json = await res.json();
      if (!res.ok || json.error) {
        const e = json.error || {};
        // 4 = rate limit, 2 = fallo temporal del servidor -> reintentar
        const retryable = [4, 2, 1].includes(e.code) || res.status >= 500;
        const err = new Error(`Graph ${res.status}: ${e.message || 'error desconocido'} (code ${e.code ?? '?'})`);
        if (!retryable) throw err;
        lastErr = err;
      } else {
        return json;
      }
    } catch (err) {
      lastErr = err;
      if (err.message?.startsWith('Graph 4')) throw err;
    }
    const wait = 2000 * 2 ** i;
    console.log(`   reintento ${i + 1}/${retries} en ${wait / 1000}s — ${redact(lastErr.message)}`);
    await sleep(wait);
  }
  throw lastErr;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera a que un contenedor termine de procesarse antes de publicar. */
export async function waitContainer(id, { token, dryRun = false, timeoutMs = 120000 } = {}) {
  if (dryRun) return 'FINISHED';
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await graph(id, { params: { fields: 'status_code,status' }, token });
    if (r.status_code === 'FINISHED') return 'FINISHED';
    if (r.status_code === 'ERROR' || r.status_code === 'EXPIRED') {
      throw new Error(`Contenedor ${id} en estado ${r.status_code}: ${r.status || ''}`);
    }
    await sleep(3000);
  }
  throw new Error(`Contenedor ${id} no terminó de procesarse en ${timeoutMs / 1000}s`);
}
