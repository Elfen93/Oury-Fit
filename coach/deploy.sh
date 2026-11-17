#!/usr/bin/env bash
# Despliega la función del entrenador en Neon Functions.
# Necesita una clave de API de Neon: export NEON_API_KEY=... (o un proxy que la inyecte).
set -euo pipefail
cd "$(dirname "$0")"
PROJECT=small-credit-13449564
BRANCH=br-nameless-credit-a1wax9gf
node build.mjs
curl -sS -X POST "https://console.neon.tech/api/v2/projects/$PROJECT/branches/$BRANCH/functions/coach/deployments" \
  ${NEON_API_KEY:+-H "Authorization: Bearer $NEON_API_KEY"} \
  -F "zip=@dist/function.zip" -F "runtime=nodejs24"
echo
