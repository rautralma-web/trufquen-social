// Trufquén — disparador confiable del publicador de Instagram.
//
// Reemplaza el cron interno de GitHub Actions, que bajo poca actividad
// retrasa sus propios disparos entre 2 y 13 horas (comportamiento documentado
// de la plataforma, no un error de código). Cloudflare Cron Triggers no tiene
// esa limitación: dispara a la hora exacta.
//
// Este worker NO decide qué publicar. Solo toca el timbre cada 5 minutos
// llamando a workflow_dispatch; toda la lógica de "qué toca publicar" sigue
// viviendo en un único lugar: scripts/publish.mjs + content/calendario.json.
// Así no hay dos sistemas que puedan desincronizarse sobre la misma decisión.

const REPO = 'rautralma-web/trufquen-social';
const WORKFLOW = 'publish.yml';

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(tocarElTimbre(env));
  },

  // Permite una comprobación manual visitando la URL del worker.
  async fetch(request, env) {
    const resultado = await tocarElTimbre(env);
    return new Response(JSON.stringify(resultado, null, 2), {
      status: resultado.ok ? 200 : 502,
      headers: { 'content-type': 'application/json' },
    });
  },
};

async function tocarElTimbre(env) {
  if (!env.GH_DISPATCH_TOKEN) {
    return { ok: false, error: 'Falta el secreto GH_DISPATCH_TOKEN en este Worker.' };
  }

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'trufquen-kicker-worker',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  );

  // 204 = aceptado. GitHub decide internamente si había algo que publicar;
  // publish.mjs sale limpio (código 0) cuando no hay nada vencido.
  if (res.status === 204) {
    return { ok: true, hora: new Date().toISOString() };
  }

  const texto = await res.text();
  return { ok: false, status: res.status, detalle: texto.slice(0, 300) };
}
