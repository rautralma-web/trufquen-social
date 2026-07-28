#!/bin/bash
# Trufquén — instala el reloj preciso de publicación en Cloudflare.
# Un solo comando: inicio de sesión, guardar el permiso, y desplegar.
set -e
cd "$(dirname "$0")"

L='─────────────────────────────────────────────────────'
echo -e "\n$L\n  TRUFQUÉN · instalando el reloj de Cloudflare\n$L\n"

echo "PASO 1 de 3 — Iniciar sesión en Cloudflare"
echo "Se va a abrir tu navegador. Inicia sesión ahí (o confirma si ya lo estás)"
echo "y haz clic en 'Allow'. Cuando vuelvas a ver esta ventana, siguió solo.\n"
npx --yes wrangler login

echo -e "\n$L"
echo "PASO 2 de 3 — Guardar el permiso de GitHub"
echo "Pega ahora el texto que empieza con 'github_pat_...' (el del punto 7"
echo "de la sección A.1) y presiona Enter. No se va a ver mientras lo pegas."
echo "Eso es normal — sigue igual, no está trabado.\n"
npx --yes wrangler secret put GH_DISPATCH_TOKEN

echo -e "\n$L"
echo "PASO 3 de 3 — Instalar el reloj"
echo "Sin que hagas nada más.\n"
npx --yes wrangler deploy

echo -e "\n$L"
echo "  ✓ LISTO"
echo "$L"
echo "Copia la línea que dice 'https://trufquen-kicker...workers.dev'"
echo "de arriba y pégamela — con eso confirmo que quedó funcionando."
echo "$L\n"
