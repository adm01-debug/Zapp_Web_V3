# zapp-web-v3

## Frescura do Grafo
Antes de consultar graphify, verifique se o grafo esta atualizado:
```sh
git rev-parse --short HEAD
grep "Built from commit" graphify-out/GRAPH_REPORT.md
```
Se divergirem, o auto-sync via N8N deve ter corrigido em ate 15 min.
Para forcar rebuild manual: `graphify update . --force`
