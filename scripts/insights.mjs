#!/usr/bin/env node
// Trufquén — lector de métricas. Escribe state/metricas.csv y lo deja listo
// para el informe semanal.
//
//   node scripts/insights.mjs            métricas de todo lo publicado
//   node scripts/insights.mjs --dry-run  verifica el flujo sin llamar a la API
//
// Orden de prioridad de la marca: alcance · guardados · compartidos ·
// visitas al perfil · comentarios. Los likes son secundarios.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { graph, env } from './lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');
const token = dryRun ? 'DRYRUN' : env('IG_TOKEN');

const METRICAS = ['reach', 'saved', 'shares', 'total_interactions', 'comments', 'likes', 'profile_visits', 'follows'];

const dir = join(ROOT, 'state/published');
const publicados = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];

if (!publicados.length && !dryRun) {
  console.log('Todavía no hay publicaciones registradas.');
  process.exit(0);
}

const filas = [['post', 'media_id', 'publicado', 'dias', ...METRICAS].join(',')];

for (const f of publicados) {
  const p = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const dias = ((Date.now() - new Date(p.published_at).getTime()) / 86400000).toFixed(1);
  let vals = {};
  try {
    const r = await graph(`${p.media_id}/insights`, { params: { metric: METRICAS.join(',') }, token, dryRun });
    for (const m of r.data || []) vals[m.name] = m.values?.[0]?.value ?? '';
  } catch (e) {
    // Instagram rechaza el lote entero si una métrica no aplica al tipo de medio.
    console.log(`  ${p.id}: lote rechazado (${e.message}). Consultando una por una…`);
    for (const m of METRICAS) {
      try {
        const r = await graph(`${p.media_id}/insights`, { params: { metric: m }, token, dryRun });
        vals[m] = r.data?.[0]?.values?.[0]?.value ?? '';
      } catch { vals[m] = ''; }
    }
  }
  filas.push([p.id, p.media_id, p.published_at.slice(0, 10), dias, ...METRICAS.map((m) => vals[m] ?? '')].join(','));
  console.log(`  ✓ ${p.id} — alcance ${vals.reach ?? '?'} · guardados ${vals.saved ?? '?'} · compartidos ${vals.shares ?? '?'}`);
}

if (dryRun) { console.log('[dry-run] flujo de métricas verificado.'); process.exit(0); }

const out = join(ROOT, 'state/metricas.csv');
writeFileSync(out, filas.join('\n') + '\n');
console.log(`\nEscrito ${out} (${publicados.length} publicaciones).`);
