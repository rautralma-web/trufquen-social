# trufquen-social

Publicación automática de Instagram para **Trufquén** (@trufquen).
Sin dependencias externas: Node 20+ y `fetch` nativo.

> ⚠️ **Este repositorio debe ser PÚBLICO.** Instagram no sube archivos: descarga
> cada imagen desde una URL accesible. Un repo privado no sirve las imágenes y la
> API falla. Todo lo que hay en `media/` está destinado a publicarse igual.
> Los secretos (token, IG user id) **nunca** viven aquí — van en GitHub Secrets.

## Estructura

```
content/calendario.json   qué se publica, cuándo y con qué texto
media/dia-N/NN.jpg        imágenes ya recortadas a 4:5 (1080×1350)
scripts/setup-token.mjs   token de 1 h → token de 60 días + IG_USER_ID
scripts/publish.mjs       publicador de carruseles
scripts/insights.mjs      lector de métricas → state/metricas.csv
state/published/          registro de lo publicado (evita duplicados)
```

## Puesta en marcha

1. **Token** (una sola vez, en el Mac):

   ```bash
   source ~/.trufquen/.env && node scripts/setup-token.mjs
   ```

   Imprime `IG_USER_ID` e `IG_TOKEN`. Pégalos en
   *Settings → Secrets and variables → Actions*.

2. **Prueba sin publicar nada:**

   ```bash
   node scripts/publish.mjs --dry-run
   ```

3. **Automático:** el workflow `publish.yml` corre cada 15 min y publica lo que
   esté vencido en el calendario. No hay que tocar nada más.

## Uso manual

```bash
node scripts/publish.mjs --id dia-2   # forzar una publicación
node scripts/insights.mjs             # actualizar métricas
```

También desde GitHub → *Actions* → *Publicar en Instagram* → *Run workflow*.

## Límites

- Máximo **10 imágenes** por carrusel.
- **25 publicaciones** por cuenta cada 24 h.
- Los contenedores caducan a las **24 h**: se crean justo antes de publicar.
- El token dura **60 días**. Renovar con `setup-token.mjs`.

## Horarios

Chile es UTC−4 en invierno y UTC−3 con horario de verano (sept–abril).
`calendario.json` guarda la hora local **y** la UTC; al pasar a horario de verano
hay que recalcular `publish_at_utc`.
