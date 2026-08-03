#!/usr/bin/env node
// Trufquén — publicador de carruseles en Instagram.
//
//   node scripts/publish.mjs --dry-run        prueba completa sin enviar nada
//   node scripts/publish.mjs                  publica lo que esté vencido en el calendario
//   node scripts/publish.mjs --id dia-2       fuerza una publicación concreta
//   node scripts/publish.mjs --all            ignora la hora (publica todo lo pendiente)
//
// Idempotente: si existe state/published/<id>.json, no vuelve a publicar.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { graph, waitContainer, env, sleep } from './lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const ignoreTime = args.includes('--all');
const onlyId = args[args.indexOf('--id') + 1] && args.includes('--id') ? args[args.indexOf('--id') + 1] : null;

const cal = JSON.parse(readFileSync(join(ROOT, 'content/calendario.json'), 'utf8'));

// Antes de configurar las credenciales, el cron corre cada 15 min y no debe
// fallar: se sale limpio para no llenar el correo de avisos de error.
if (!dryRun && (!process.env.IG_TOKEN || !process.env.IG_USER_ID)) {
  console.log('Sin credenciales configuradas (IG_TOKEN / IG_USER_ID). No hay nada que publicar todavía.');
  process.exit(0);
}

const token = dryRun ? 'DRYRUN' : env('IG_TOKEN');
const igUser = dryRun ? '0000000000' : env('IG_USER_ID');
const base = cal.media_base_url;

const stateFile = (id) => join(ROOT, 'state/published', `${id}.json`);
const now = Date.now();

function due(post) {
  if (onlyId) return post.id === onlyId;
  if (existsSync(stateFile(post.id))) return false;
  if (ignoreTime || dryRun) return true;
  return new Date(post.publish_at_utc).getTime() <= now;
}

async function publicar(post) {
  if (post.video) return publicarReel(post);

  const urls = post.images.map((f) => `${base}/${post.folder}/${f}`);
  console.log(`\n▸ ${post.id} — ${post.pilar} · ${urls.length} imagen(es)`);
  console.log(`  programado: ${post.publish_at_local} (Chile)`);

  let creationId;

  if (urls.length === 1) {
    const c = await graph(`${igUser}/media`, {
      method: 'POST',
      params: { image_url: urls[0], caption: post.caption },
      token, dryRun,
    });
    await waitContainer(c.id, { token, dryRun });
    creationId = c.id;
  } else {
    // 1) un contenedor por imagen
    const children = [];
    for (const [i, u] of urls.entries()) {
      const c = await graph(`${igUser}/media`, {
        method: 'POST',
        params: { image_url: u, is_carousel_item: 'true' },
        token, dryRun,
      });
      console.log(`  slide ${String(i + 1).padStart(2, '0')} → ${c.id}`);
      children.push(c.id);
      await sleep(dryRun ? 0 : 1200); // respeta el rate limit
    }
    for (const id of children) await waitContainer(id, { token, dryRun });

    // 2) contenedor padre del carrusel
    const parent = await graph(`${igUser}/media`, {
      method: 'POST',
      params: { media_type: 'CAROUSEL', children: children.join(','), caption: post.caption },
      token, dryRun,
    });
    await waitContainer(parent.id, { token, dryRun });
    creationId = parent.id;
  }

  // 3) publicar
  const out = await graph(`${igUser}/media_publish`, {
    method: 'POST', params: { creation_id: creationId }, token, dryRun,
  });
  console.log(`  ✅ publicado — media id ${out.id}`);

  if (!dryRun) {
    mkdirSync(join(ROOT, 'state/published'), { recursive: true });
    writeFileSync(stateFile(post.id), JSON.stringify({
      id: post.id, media_id: out.id, published_at: new Date().toISOString(), slides: urls.length,
    }, null, 2));
  }
  return out.id;
}

// Los Reels tardan más en procesarse que una imagen: el contenedor de video
// puede quedar "IN_PROGRESS" varios minutos, por eso el timeout es más largo.
async function publicarReel(post) {
  const url = `${base}/${post.folder}/${post.video}`;
  console.log(`\n▸ ${post.id} — ${post.pilar} · reel`);
  console.log(`  programado: ${post.publish_at_local} (Chile)`);

  const c = await graph(`${igUser}/media`, {
    method: 'POST',
    params: { media_type: 'REELS', video_url: url, caption: post.caption, share_to_feed: 'true' },
    token, dryRun,
  });
  await waitContainer(c.id, { token, dryRun, timeoutMs: 300000 });

  const out = await graph(`${igUser}/media_publish`, {
    method: 'POST', params: { creation_id: c.id }, token, dryRun,
  });
  console.log(`  ✅ publicado — media id ${out.id}`);

  if (!dryRun) {
    mkdirSync(join(ROOT, 'state/published'), { recursive: true });
    writeFileSync(stateFile(post.id), JSON.stringify({
      id: post.id, media_id: out.id, published_at: new Date().toISOString(), tipo: 'reel',
    }, null, 2));
  }
  return out.id;
}

const pendientes = cal.posts.filter(due);
if (!pendientes.length) {
  console.log('Nada pendiente por publicar.');
  process.exit(0);
}
console.log(`${dryRun ? '[DRY RUN] ' : ''}${pendientes.length} publicación(es) por procesar.`);

let fallos = 0;
for (const p of pendientes) {
  try { await publicar(p); }
  catch (e) { fallos++; console.error(`  ❌ ${p.id}: ${e.message}`); }
}
if (fallos) { console.error(`\n${fallos} publicación(es) fallaron.`); process.exit(1); }
console.log('\nTodo listo.');
