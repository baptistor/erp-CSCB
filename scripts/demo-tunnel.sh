#!/usr/bin/env bash
# Expose l'application (profil dev) sur internet via un tunnel Cloudflare temporaire, pour une session de test.
#
#   ./scripts/demo-tunnel.sh
#
# - Lance l'infra (Postgres, Mailpit), le back en profil dev (sauf s'il tourne déjà sur 8080, ex. IntelliJ),
#   le front en configuration « tunnel », puis un tunnel https://xxx.trycloudflare.com.
# - Ctrl+C arrête tout ce que le script a lancé (le back déjà lancé avant n'est pas touché).
#
# ⚠️ Le login est SIMULÉ (profil dev) : toute personne qui a l'URL peut se connecter, y compris en admin.
#    À réserver à une session de test courte, avec des données fictives. L'URL change à chaque lancement.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
LOG_DIR="${TMPDIR:-/tmp}/erp-demo-tunnel"
mkdir -p "$LOG_DIR"
GROUPS_TO_KILL=()

cleanup() {
  echo
  echo "Arrêt du tunnel et des processus lancés par le script…"
  for pgid in "${GROUPS_TO_KILL[@]}"; do
    kill -- "-$pgid" 2>/dev/null || true
  done
}
trap cleanup EXIT
trap 'exit 130' INT TERM

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

wait_port() { # port, nom, fichier de log, timeout (s)
  local i
  for ((i = 0; i < $4; i++)); do
    port_open "$1" && return 0
    sleep 1
  done
  echo "❌ $2 n'a pas démarré sur le port $1 en $4 s. Voir $3"
  exit 1
}

# lance une commande dans son propre groupe de processus (pour pouvoir tout arrêter proprement)
start_group() { # dossier, fichier de log, commande…
  local dir="$1" log="$2"
  shift 2
  (cd "$dir" && exec setsid "$@" >"$log" 2>&1) &
  GROUPS_TO_KILL+=("$!")
}

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "❌ cloudflared est introuvable. Installe-le (voir README) puis relance."
  exit 1
fi

echo "1/4 Infra (Postgres, Mailpit)…"
docker compose up -d --wait >/dev/null

if port_open 8080; then
  echo "2/4 Back déjà lancé sur 8080 : réutilisé (vérifie qu'il est en profil dev et à jour)."
else
  echo "2/4 Démarrage du back (profil dev)…"
  start_group "$ROOT/backend" "$LOG_DIR/back.log" ./mvnw -q spring-boot:run
  wait_port 8080 "Le back" "$LOG_DIR/back.log" 240
fi

if port_open 4200; then
  echo "❌ Un front tourne déjà sur 4200 (npm start ?) : arrête-le, il refuserait le domaine du tunnel."
  exit 1
fi
echo "3/4 Démarrage du front (configuration tunnel)…"
start_group "$ROOT/frontend" "$LOG_DIR/front.log" npm run start:tunnel
wait_port 4200 "Le front" "$LOG_DIR/front.log" 180

echo "4/4 Ouverture du tunnel Cloudflare…"
start_group "$ROOT" "$LOG_DIR/tunnel.log" cloudflared tunnel --no-autoupdate --url http://localhost:4200
URL=""
for _ in $(seq 1 60); do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG_DIR/tunnel.log" | head -n1 || true)
  [[ -n "$URL" ]] && break
  sleep 1
done
if [[ -z "$URL" ]]; then
  echo "❌ Pas d'URL de tunnel. Voir $LOG_DIR/tunnel.log"
  exit 1
fi

cat <<EOF

✅ Application accessible depuis internet :

   $URL

   Page de connexion : $URL/login  (comptes de démo : admin@exemple.fr, alice.martin@exemple.fr…)
   ⚠️ Login simulé : quiconque a cette URL peut entrer, y compris en admin.
   Logs : $LOG_DIR
   Ctrl+C pour tout arrêter.
EOF

wait
