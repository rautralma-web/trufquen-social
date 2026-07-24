#!/bin/bash
# Trufquén — respaldo local de publicación.
#
# Corre en el Mac cada 15 minutos, DESFASADO 7 minutos respecto al reloj de
# GitHub (GitHub va en 3/18/33/48, este en 10/25/40/55). El desfase evita
# publicar dos veces: si GitHub ya publicó, dejó el registro en el repositorio,
# este hace "git pull" antes de decidir y encuentra el trabajo hecho.
#
# Instalado como agente de arranque. Para desactivarlo:
#   launchctl unload ~/Library/LaunchAgents/studio.trufquen.publicador.plist

export PATH="$HOME/.local/opt/node/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
REPO="$HOME/Documents/Trufquen-Social/repo"
LOG="$HOME/Library/Logs/trufquen-publicador.log"
mkdir -p "$(dirname "$LOG")"

registra() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

cd "$REPO" || { registra "ERROR: no existe $REPO"; exit 1; }

# Traer lo que GitHub haya publicado ya, para no repetir.
if ! git pull --rebase --autostash -q origin main 2>>"$LOG"; then
  registra "AVISO: no se pudo sincronizar con GitHub; se sigue con la copia local"
fi

salida=$(node scripts/publish.mjs 2>&1)
codigo=$?

if echo "$salida" | grep -q "Nada pendiente"; then
  # Silencio: es el caso normal la mayoría de las veces.
  exit 0
fi

registra "--- ejecución ---"
echo "$salida" | sed 's/^/    /' >> "$LOG"

# Si publicó algo, registrarlo en GitHub para que no se repita allá.
if [ -n "$(git status --porcelain state/)" ]; then
  git add state/
  git -c user.name="trufquen-mac" -c user.email="rautralma@gmail.com" \
      commit -qm "registro: publicación desde el respaldo local"
  if git push -q origin main 2>>"$LOG"; then
    registra "Registro enviado a GitHub."
  else
    registra "ERROR: no se pudo enviar el registro a GitHub. Riesgo de doble publicación."
  fi
fi

registra "Fin (código $codigo)"
exit $codigo
