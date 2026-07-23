#!/usr/bin/env node
// Trufquén — convierte el token corto (1 h) en uno de larga duración (60 días)
// y descubre el IG_USER_ID. Ejecutar UNA vez, en tu Mac.
//
//   source ~/.trufquen/.env && node scripts/setup-token.mjs
//
// Lee FB_APP_ID, FB_APP_SECRET y FB_SHORT_TOKEN del entorno.
// No escribe el token en ningún archivo del repo: lo imprime para que lo pegues
// en GitHub → Settings → Secrets → Actions.

import { graph, env } from './lib.mjs';

const appId = env('FB_APP_ID');
const appSecret = env('FB_APP_SECRET');
const short = env('FB_SHORT_TOKEN');

console.log('1/3 · Intercambiando por token de larga duración…');
const long = await graph('oauth/access_token', {
  params: {
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: short,
  },
});
if (!long.access_token) throw new Error('No se recibió token de larga duración.');
const dias = long.expires_in ? Math.round(long.expires_in / 86400) : 60;
console.log(`    ✓ token válido ~${dias} días`);

console.log('2/3 · Buscando la Página de Facebook vinculada…');
const pages = await graph('me/accounts', { params: { fields: 'id,name' }, token: long.access_token });
if (!pages.data?.length) throw new Error('El token no tiene acceso a ninguna Página. Revisa los permisos pages_show_list.');
pages.data.forEach((p, i) => console.log(`    [${i}] ${p.name} — ${p.id}`));

console.log('3/3 · Resolviendo la cuenta de Instagram Business…');
let igUserId = null, pageName = null;
for (const p of pages.data) {
  const r = await graph(p.id, { params: { fields: 'instagram_business_account{id,username}' }, token: long.access_token });
  if (r.instagram_business_account) {
    igUserId = r.instagram_business_account.id;
    pageName = `${p.name} → @${r.instagram_business_account.username}`;
    break;
  }
}
if (!igUserId) throw new Error('Ninguna Página tiene cuenta de Instagram Business vinculada.');

console.log(`    ✓ ${pageName}`);
console.log('\n─────────────────────────────────────────────');
console.log('Pega estos DOS valores en GitHub → Settings → Secrets and variables → Actions:');
console.log('\n  Nombre: IG_USER_ID');
console.log(`  Valor : ${igUserId}`);
console.log('\n  Nombre: IG_TOKEN');
console.log(`  Valor : ${long.access_token}`);
console.log('\n─────────────────────────────────────────────');
console.log(`Renovar antes de: ${new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10)}`);
