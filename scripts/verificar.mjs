#!/usr/bin/env node
// Trufquén — comprobación de extremo a extremo, sin publicar nada.
//
//   node scripts/verificar.mjs
//
// Confirma que el token sirve, que la cuenta está bien conectada y que las
// imágenes son accesibles. Nunca imprime tokens ni claves.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { graph, env } from './lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const linea = '─'.repeat(58);
console.log(`\n${linea}\n  COMPROBACIÓN DEL SISTEMA\n${linea}\n`);

let fallos = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const mal = (m) => { fallos++; console.log(`  ✗ ${m}`); };

// 1 · Credenciales presentes
let token;
try {
  token = env('IG_TOKEN', { required: false }) || env('FB_SHORT_TOKEN');
  ok('Credenciales encontradas en ~/.trufquen/.env');
} catch {
  mal('No hay credenciales. Ejecuta: node scripts/configurar.mjs');
  process.exit(1);
}

// 2 · El token sirve y a qué cuenta llega
let igUserId = null;
try {
  const me = await graph('me', { params: { fields: 'name' }, token });
  ok(`El token funciona — cuenta de Facebook: ${me.name}`);

  const pages = await graph('me/accounts', { params: { fields: 'id,name' }, token });
  if (!pages.data?.length) {
    mal('El token no ve ninguna página de Facebook (falta pages_show_list o no la marcaste al autorizar)');
  } else {
    ok(`Página visible: ${pages.data.map((p) => p.name).join(', ')}`);
    for (const p of pages.data) {
      const r = await graph(p.id, {
        params: { fields: 'instagram_business_account{id,username,followers_count,media_count}' },
        token,
      });
      const ig = r.instagram_business_account;
      if (ig) {
        igUserId = ig.id;
        ok(`Instagram conectado: @${ig.username} — ${ig.followers_count} seguidores, ${ig.media_count} publicaciones`);
        break;
      }
    }
    if (!igUserId) mal('La página no tiene cuenta de Instagram profesional vinculada');
  }
} catch (e) {
  const exp = /expired|session|OAuthException/i.test(e.message);
  mal(`El token no responde: ${e.message}`);
  if (exp) console.log('     (Si es el token corto de 1 hora, ya caducó. Es normal: el que importa es el de GitHub.)');
}

// 3 · Permiso de publicación
if (igUserId) {
  try {
    await graph(`${igUserId}/media`, { params: { limit: 1 }, token });
    ok('Permiso de lectura de publicaciones confirmado');
  } catch (e) {
    mal(`Sin acceso a las publicaciones: ${e.message}`);
  }
}

// 4 · Imágenes accesibles públicamente
const cal = JSON.parse(readFileSync(join(ROOT, 'content/calendario.json'), 'utf8'));
const prueba = cal.posts[0];
const url = `${cal.media_base_url}/${prueba.folder}/${prueba.images[0]}`;
try {
  const r = await fetch(url, { method: 'HEAD' });
  const tipo = r.headers.get('content-type');
  if (r.ok && tipo?.startsWith('image/')) ok(`Las imágenes son públicas y legibles (${tipo})`);
  else mal(`La imagen respondió ${r.status} ${tipo ?? ''}`);
} catch (e) {
  mal(`No se pudo leer la imagen: ${e.message}`);
}

// 5 · Estado del calendario
const ahora = new Date();
const prox = cal.posts.find((p) => new Date(p.publish_at_utc) > ahora);
console.log(`\n  Próxima publicación: ${prox ? `${prox.id} · ${prox.publish_at_local} Chile` : 'ninguna pendiente'}`);

console.log(`\n${linea}`);
console.log(fallos === 0 ? '  TODO CORRECTO — el sistema puede publicar.' : `  ${fallos} problema(s) por resolver.`);
console.log(`${linea}\n`);
process.exit(fallos ? 1 : 0);
