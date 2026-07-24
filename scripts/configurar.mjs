#!/usr/bin/env node
// Trufquén — configuración guiada. Un solo comando hace todo:
// pide los dos valores, los valida, escribe ~/.trufquen/.env,
// convierte el token a 60 días y entrega los datos para GitHub.
//
//   node scripts/configurar.mjs
//
// Los valores se leen por teclado, nunca por argumento: no quedan en el
// historial de la terminal. El archivo se guarda con permisos 600.

import { createInterface } from 'node:readline/promises';
import { writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { graph } from './lib.mjs';

const APP_ID = '1027801293070721';

// Modo interactivo (uso normal) o entrada por tubería (pruebas automáticas).
const interactivo = process.stdin.isTTY;
let cola = [];
if (!interactivo) {
  const trozos = [];
  for await (const c of process.stdin) trozos.push(c);
  cola = Buffer.concat(trozos).toString('utf8').split('\n');
}
const rl = interactivo ? createInterface({ input: process.stdin, output: process.stdout }) : null;

const linea = '─'.repeat(60);
console.log(`\n${linea}\n  TRUFQUÉN · configuración de Instagram\n${linea}`);

/** Pide un valor y no avanza hasta que tenga la forma correcta. */
async function pedir({ titulo, donde, pasos, ejemplo, valida, ayuda }) {
  console.log(`\n${titulo}\n`);
  console.log(`  Ábrelo aquí:\n    ${donde}\n`);
  pasos.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  console.log(`\n  Se ve parecido a esto:  ${ejemplo}\n`);
  for (;;) {
    let v;
    if (interactivo) {
      v = (await rl.question('  Pégalo aquí y presiona Enter:\n  > ')).trim();
    } else {
      if (!cola.length) { console.error('  (sin más entrada)'); process.exit(2); }
      v = (cola.shift() ?? '').trim();
      console.log(`  Pégalo aquí y presiona Enter:\n  > [${v.length} caracteres]`);
    }
    if (!v) { console.log('\n  ⚠ No pegaste nada. Intenta de nuevo.\n'); continue; }
    if (valida(v)) { console.log('  ✓ Correcto.\n'); return v; }
    console.log(`\n  ⚠ Eso no sirve: ${ayuda(v)}\n     Vuelve a copiarlo e inténtalo otra vez.\n`);
  }
}

const appSecret = await pedir({
  titulo: '── DATO 1 de 2 · La clave secreta de la app ──',
  donde: `https://developers.facebook.com/apps/${APP_ID}/settings/basic/`,
  pasos: [
    'Busca el recuadro "Clave secreta de la app". Está arriba a la derecha y muestra puntos negros.',
    'Haz clic en el botón gris "Mostrar" que está a su derecha.',
    'Facebook te pedirá TU contraseña de Facebook. Escríbela. Es la página oficial de Facebook.',
    'Los puntos se convierten en letras y números. Selecciónalos todos y cópialos (Cmd+C).',
  ],
  ejemplo: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
  valida: (v) => /^[a-f0-9]{32}$/i.test(v),
  ayuda: (v) => `debe medir 32 caracteres entre letras y números, y lo que pegaste mide ${v.length}.`,
});

const shortToken = await pedir({
  titulo: '── DATO 2 de 2 · El token de acceso ──',
  donde: 'https://developers.facebook.com/tools/explorer/',
  pasos: [
    'En el panel derecho, "App de Meta" debe decir: Trufquen Publisher.',
    'Justo debajo, abre el desplegable "Usuario o página" y elige la opción de token de USUARIO.',
    'Más abajo, en la pestaña "Permissions", abre "Agregar un permiso" y agrega estos seis, uno por uno:',
    '     instagram_basic · instagram_content_publish · instagram_manage_insights',
    '     pages_show_list · pages_read_engagement · business_management',
    'Haz clic en el botón azul "Generate Access Token". Se abre una ventana de Facebook.',
    'Autoriza, y cuando pregunte marca la página de Trufquén y la cuenta de Instagram.',
    'Vuelves al explorador. Arriba a la derecha, el campo "Token de acceso" ya tiene un texto muy largo.',
    'Cópialo con el ícono de copiar que está al lado del campo.',
  ],
  ejemplo: 'EAAOq7ZBd... (más de 150 caracteres)',
  valida: (v) => /^EA[A-Za-z0-9]/.test(v) && v.length >= 80,
  ayuda: (v) =>
    !/^EA/.test(v)
      ? 'un token de verdad empieza con las letras EAA, y lo que pegaste no.'
      : `un token de verdad pasa de 150 caracteres, y lo que pegaste mide ${v.length}.`,
});

if (rl) rl.close();

// Guardar
const dir = `${homedir()}/.trufquen`;
mkdirSync(dir, { recursive: true });
const f = `${dir}/.env`;
writeFileSync(f, `FB_APP_ID=${APP_ID}\nFB_APP_SECRET=${appSecret}\nFB_SHORT_TOKEN=${shortToken}\n`);
chmodSync(f, 0o600);
console.log(`${linea}\n  ✓ Datos guardados en ~/.trufquen/.env (solo tú puedes leerlo)\n${linea}\n`);

// Intercambio y descubrimiento
console.log('Conectando con Meta…\n');
process.env.FB_APP_ID = APP_ID;
process.env.FB_APP_SECRET = appSecret;
process.env.FB_SHORT_TOKEN = shortToken;

try {
  console.log('1/3 · Convirtiendo el token a uno de 60 días…');
  const long = await graph('oauth/access_token', {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: APP_ID,
      client_secret: appSecret,
      fb_exchange_token: shortToken,
    },
  });
  if (!long.access_token) throw new Error('Meta no devolvió un token de larga duración.');
  const dias = long.expires_in ? Math.round(long.expires_in / 86400) : 60;
  console.log(`    ✓ listo, dura ${dias} días`);

  console.log('2/3 · Buscando tu página de Facebook…');
  const pages = await graph('me/accounts', { params: { fields: 'id,name' }, token: long.access_token });
  if (!pages.data?.length) {
    throw new Error(
      'El token no ve ninguna página de Facebook.\n' +
      '    Causa habitual: no marcaste la página al autorizar, o falta el permiso pages_show_list.\n' +
      '    Vuelve al Explorador, genera el token de nuevo y marca la página de Trufquén.'
    );
  }
  console.log(`    ✓ ${pages.data.map((p) => p.name).join(', ')}`);

  console.log('3/3 · Buscando la cuenta de Instagram…');
  let igUserId = null, quien = null;
  for (const p of pages.data) {
    const r = await graph(p.id, { params: { fields: 'instagram_business_account{id,username}' }, token: long.access_token });
    if (r.instagram_business_account) {
      igUserId = r.instagram_business_account.id;
      quien = `@${r.instagram_business_account.username}`;
      break;
    }
  }
  if (!igUserId) {
    throw new Error(
      'La página no tiene una cuenta de Instagram profesional vinculada.\n' +
      '    En Instagram: Configuración → Tipo de cuenta → cambiar a Empresa o Creador,\n' +
      '    y vincularla con la página de Facebook de Trufquén. Después repite este paso.'
    );
  }
  console.log(`    ✓ ${quien}\n`);

  const vence = new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
  console.log(`${linea}\n  ÚLTIMO PASO — copia estos dos valores a GitHub\n${linea}\n`);
  console.log('  Abre esta página:');
  console.log('    https://github.com/rautralma-web/trufquen-social/settings/secrets/actions\n');
  console.log('  Botón "New repository secret". Créalos uno por uno:\n');
  console.log('    ┌─ Secreto 1 ─────────────────────────');
  console.log('    │  Name:   IG_USER_ID');
  console.log(`    │  Secret: ${igUserId}`);
  console.log('    └─────────────────────────────────────\n');
  console.log('    ┌─ Secreto 2 ─────────────────────────');
  console.log('    │  Name:   IG_TOKEN');
  console.log(`    │  Secret: ${long.access_token}`);
  console.log('    └─────────────────────────────────────\n');
  console.log(`  Renovar el token antes del ${vence}.\n${linea}\n`);
} catch (e) {
  console.error(`\n❌ ${e.message}\n`);
  console.error('   Tus datos quedaron guardados. Cuando resuelvas lo de arriba, ejecuta:');
  console.error('       node ~/Documents/Trufquen-Social/repo/scripts/setup-token.mjs\n');
  process.exit(1);
}
