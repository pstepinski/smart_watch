#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if ! command -v docker >/dev/null 2>&1; then
    echo "Brak Dockera. Zainstaluj Docker Engine lub Docker Desktop z Docker Compose." >&2
    exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
    echo "Brak Docker Compose. Zainstaluj wtyczkę docker compose." >&2
    exit 1
fi

docker compose --project-directory "$project_dir" -f "$project_dir/compose.yaml" up --detach --build --wait --wait-timeout 60 "$@"
echo "Aplikacja działa. Domyślny adres: http://localhost:4173 (port można zmienić przez HORIZON_PORT)."
echo "Panel odwiedzin: http://localhost:${HORIZON_PORT:-4173}/stats (login: admin; hasło: ./scripts/stats-password.sh)."
