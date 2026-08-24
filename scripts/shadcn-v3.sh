#!/bin/sh
# Wrapper shadcn CLI pinado em Tailwind v3.
# O npx shadcn@latest (4.19.0+) instala componentes Tailwind v4 incompatíveis
# com o build atual (TW 3.4.17). Use este wrapper para instalar componentes.
#
# Uso: bash scripts/shadcn-v3.sh add <componente>
exec npx shadcn@2.3.0 "$@"
