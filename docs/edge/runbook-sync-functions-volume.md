# Runbook: Sincronizar Edge Functions do volume com o repositório

**Data:** 2026-08-01 · **Motivo:** validação exaustiva encontrou o volume com 113/123
funções DESATUALIZADAS em relação ao `main` (deploy parcial de outra sessão — o
`main/index.ts` foi atualizado mas as funções individuais não). Duas funções
(`auto-close-conversations`, `cleanup-storage-orphans`) rodavam versões SEM
autenticação (executáveis por qualquer pessoa na internet).

## Como verificar divergência

```bash
# 1. md5 de todas as funções no volume
docker exec <supabase_functions> sh -c 'cd /home/deno/functions && for d in */; do d=${d%/}; [ "$d" = main ] && continue; case "$d" in _*) continue;; esac; echo "$d $(md5sum < $d/index.ts | cut -d" " -f1)"; done'

# 2. Comparar com o raw do repo (main)
#    (script em docs/edge/ ou gerar via gh api git/trees)
```

## Como sincronizar (192 arquivos: 124 funções + 68 _shared)

O volume persiste entre restarts (mount em `/root/supabase/docker/volumes/functions`),
então o sync é feito por download direto do `raw.githubusercontent.com` (repo público):

```bash
# No container supabase_functions (instalar curl se ausente):
BASE=https://raw.githubusercontent.com/adm01-debug/zapp-web-v3/main/supabase/functions
# Para CADA função <fn> do repo:
curl -fsSL -o /home/deno/functions/<fn>/index.ts "$BASE/<fn>/index.ts"
# Para CADA arquivo _shared/<x>.ts:
curl -fsSL -o /home/deno/functions/_shared/<x>.ts "$BASE/_shared/<x>.ts"
# main/index.ts:
curl -fsSL -o /home/deno/functions/main/index.ts "$BASE/main/index.ts"
```

Depois: **reiniciar o serviço** (`docker service update --force supabase_functions` ou
restart do container) para recarregar.

> **Caminho preferido hoje:** `gh workflow run edge-deploy.yml --ref main` — roda
> `infra/edge-deploy/deploy-edge.sh --apply --restart`, que copia MISSING/STALE,
> **valida o hash pós-escrita** e reinicia o serviço. Nunca use `--prune` sem ler a
> seção "Registry de órfãos" abaixo.

## Como validar (sweep de autenticação)

Para cada função, `curl -X POST https://supabase.atomicabr.com.br/functions/v1/<fn> -d '{}'`:

| Resposta | Significado | Esperado |
|---|---|---|
| 401 "Authorization failed"/"Missing authorization" | bloqueada pelo main | funções FORA da allowlist |
| 401 (outro corpo) | auto-protegida (CRON_SECRET/service_role) | funções NA allowlist (cron/alert) |
| 200 | pública | só health-check, status, email-track-pixel, webhooks HMAC |
| 400/404/405/422/500/503 | fail-closed ou quebrada | investigar individualmente |

Meta: **nenhuma função fora da allowlist responde 200 ou 401-de-função** (só 401 do main).

## Lição registrada

O deploy de Edge Functions self-hosted é manual (copiar para o volume). SEMPRE
sincronizar TODAS as funções + `_shared` + `main/index.ts` juntos — nunca apenas o
`main`. Considerar automatizar via workflow (candidato: `edge-sync` job no CI).

---

## Registry de órfãos do volume (revisado 2026-09-27)

`deploy-edge.sh` reporta `ORPHAN` = arquivo presente no volume que **não existe no repo**.
O gate **não** remove nada; a própria mensagem dele diz *"conferir registry antes de
remover"*. Este é o registry. **NÃO rode `--apply --prune` sem revisar cada linha.**

### Funções (ORPHAN = 2) — NÃO REMOVER

| função | situação | evidência medida |
|---|---|---|
| `zapp-google-calendar-sync` | arquivada no repo com 0 chamadores (commit `f39118d1b`), mas **ainda deployada no volume** | 1 referência no código do repo |
| `email-health` | **nunca existiu no repo** — criada direto no volume | 3 referências no código do repo |

As duas são referenciadas por código do repo: um `--prune` as apagaria do volume e
**quebraria quem as chama**. Para removê-las com segurança: (1) remover os chamadores no
repo, (2) confirmar que nada externo chama (cron, alertas, n8n), (3) só então deploy sem elas.

### `_shared/` (ORPHAN = 7) — mortos, removíveis

| arquivo | por que é seguro remover |
|---|---|
| `db-columns.ts` | **0 imports** no repo |
| `mode.ts` | **0 imports** no repo |
| `criticalPayloadSchemas.ts` | referenciado apenas em **comentários** (`contract-schemas.ts`); 0 imports |
| `evolution-event-types.json` | 0 imports no código — o `.ts` homônimo (que existe no repo) é o usado |
| `README.md` | documento |
| `evolution-webhook-messages.ts.bak_s18` · `ingest-port.ts.bak_s18` | backups (`*.bak_*`) |

## Incidente 2026-09-27: a correção que nunca chegou à produção

O commit `c2e3aeb54` (26/09) — *"remove getLogger duplicado que impedia 2 Edge Functions de
bootar"* — **não estava em produção**: o último deploy de edge bem-sucedido era de **15/09**
e a tentativa de 26/09 ficou `cancelled`. O gate acusava `_shared: STALE=3` exatamente nesses
três arquivos (`evolution-webhook-handlers.ts`, `evolution-webhook-msg-handlers.ts`,
`whatsapp-cloud-normalizer.ts`), ou seja: **duas Edge Functions rodaram quebradas por dias**.

Corrigido em 27/09 com `gh workflow run edge-deploy.yml --ref main` (`--apply --restart`).
O script valida o hash pós-escrita e os três confirmaram:

```
✅ _shared/evolution-webhook-handlers.ts  → 22c8f122c229 (hash pós-escrita OK)
✅ _shared/evolution-webhook-msg-handlers.ts → 3cf6216c3063 (hash pós-escrita OK)
✅ _shared/whatsapp-cloud-normalizer.ts   → 82af2db1cec3 (hash pós-escrita OK)
```

Gate re-executado: **`STALE=0`** (era 3). Restante: `ORPHAN=2` (as duas funções acima, que
são problema de registry, não de drift).

**Lição:** `STALE` nunca é ruído — é produção rodando código que o repo já corrigiu. O
sintoma passa despercebido enquanto ninguém olha o gate; até 27/09 o check nem conseguia
rodar (chamava `scripts/deploy-edge.sh --read-only`, caminho inexistente e flag inexistente).
