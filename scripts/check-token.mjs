#!/usr/bin/env node
// Trufquén — vigía del vencimiento del token de Instagram.
// Corre dentro del flujo semanal de métricas. No pide ningún secreto nuevo:
// compara contra la fecha de vencimiento real, verificada contra Meta el
// 28-jul-2026 (quedaban 55,9 días). Actualizar VENCE cada vez que se renueve
// el token con scripts/setup-token.mjs.
//
// Falla el paso a propósito cuando quedan pocos días — GitHub ya avisa por
// correo cuando un workflow falla, así que no hace falta un canal nuevo.

const VENCE = '2026-09-22';
const AVISO_DIAS = 14;

const dias = (new Date(`${VENCE}T00:00:00Z`) - new Date()) / 86400000;

if (dias <= 0) {
  console.error(`❌ El token de Instagram venció el ${VENCE}. Las publicaciones están fallando ahora mismo.`);
  console.error('   Renovar: node scripts/setup-token.mjs, luego actualizar IG_TOKEN en GitHub Secrets');
  console.error('   y la constante VENCE en este archivo con la nueva fecha.');
  process.exit(1);
}

if (dias <= AVISO_DIAS) {
  console.error(`⚠️  El token de Instagram vence en ${dias.toFixed(1)} días (${VENCE}). Renovarlo pronto.`);
  console.error('   Renovar: node scripts/setup-token.mjs, luego actualizar IG_TOKEN en GitHub Secrets');
  console.error('   y la constante VENCE en este archivo con la nueva fecha.');
  process.exit(1);
}

console.log(`✓ Token de Instagram saludable — vence en ${dias.toFixed(0)} días (${VENCE}).`);
