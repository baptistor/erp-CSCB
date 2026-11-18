#!/usr/bin/env bash
# Arrête puis relance l'infra locale (PostgreSQL + Mailpit).
#   ./scripts/restart-infra.sh          -> redémarre en gardant les données
#   ./scripts/restart-infra.sh --reset  -> supprime AUSSI la base (volume) : repart de zéro
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "${1:-}" == "--reset" ]]; then
  echo "⚠️  Suppression des conteneurs ET des données (volume pgdata)…"
  docker compose down -v --remove-orphans
else
  echo "Arrêt des conteneurs (données conservées)…"
  docker compose down --remove-orphans
fi

echo "Démarrage…"
# --wait : attend que Postgres soit healthy (healthcheck pg_isready)
docker compose up -d --wait

docker compose ps
echo "✅ Infra prête — Postgres :5432, Mailpit http://localhost:8025"
