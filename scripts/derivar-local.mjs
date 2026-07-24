#!/usr/bin/env node
// Trufquén — deja credenciales de publicación en ~/.trufquen/.env para que el
// Mac pueda publicar como respaldo si GitHub falla.
//
//   node scripts/derivar-local.mjs
//
// Usa el token corto que ya está en el archivo, lo convierte en uno de 60 días
// y añade IG_TOKEN e IG_USER_ID. NUNCA imprime ningún valor.

import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { graph, env } from './lib.mjs';

const f = `${homedir()}/.trufquen/.env`;

if (process.env.IG_TOKEN && process.env.IG_USER_ID) {
  console.log('Ya hay credenciales de publicación guardadas. No hay nada que hacer.');
  process.exit(0);
}

const appId = env('FB_APP_ID');
const appSecret = env('FB_APP_SECRET');
const short = env('FB_SHORT_TOKEN');

console.log('1/3 · Convirtiendo el token a uno de larga duración…');
const long = await graph('oauth/access_token', {
  params: { grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: short },
});
if (!long.access_token) throw new Error('Meta no devolvió token de larga duración.');
const dias = long.expires_in ? Math.round(long.expires_in / 86400) : 60;
console.log(`    ✓ válido ~${dias} días`);

console.log('2/3 · Localizando la página…');
const pages = await graph('me/accounts', { params: { fields: 'id,name' }, token: long.access_token });
if (!pages.data?.length) throw new Error('El token no ve ninguna página de Facebook.');
console.log(`    ✓ ${pages.data.map((p) => p.name).join(', ')}`);

console.log('3/3 · Localizando la cuenta de Instagram…');
let igUserId = null, quien = null;
for (const p of pages.data) {
  const r = await graph(p.id, { params: { fields: 'instagram_business_account{id,username}' }, token: long.access_token });
  if (r.instagram_business_account) {
    igUserId = r.instagram_business_account.id;
    quien = `@${r.instagram_business_account.username}`;
    break;
  }
}
if (!igUserId) throw new Error('La página no tiene cuenta de Instagram profesional vinculada.');
console.log(`    ✓ ${quien}`);

// Conservar lo que ya estaba y añadir lo nuevo, sin duplicar claves.
const previo = readFileSync(f, 'utf8')
  .split('\n')
  .filter((l) => !/^\s*(export\s+)?(IG_TOKEN|IG_USER_ID)\s*=/.test(l))
  .join('\n')
  .replace(/\n+$/, '');

const vence = new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
writeFileSync(f, `${previo}\nIG_USER_ID=${igUserId}\nIG_TOKEN=${long.access_token}\n# Token de larga duración. Renovar antes del ${vence}.\n`);
chmodSync(f, 0o600);

console.log(`\n✓ Credenciales de publicación guardadas en ~/.trufquen/.env`);
console.log(`  Renovar antes del ${vence}.`);
