#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if ! command -v docker >/dev/null 2>&1; then
    echo "Brak Dockera." >&2
    exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
    echo "Brak Docker Compose. Zainstaluj wtyczkę docker compose." >&2
    exit 1
fi

docker compose --project-directory "$project_dir" -f "$project_dir/compose.yaml" down "$@"
echo "Aplikacja została zatrzymana. Dane zapisane w przeglądarce pozostają zachowane."
