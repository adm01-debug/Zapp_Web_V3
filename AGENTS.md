# AGENTS.md — Zapp_Web_V3

Como trabalhar neste repositório: regras do dono do projeto, válidas para qualquer agente de IA.
Se algo em `docs/` contradisser este arquivo, **este arquivo vence** — relatórios, auditorias,
handoffs e planos antigos são histórico, não ordem vigente.
Conteúdo técnico do projeto fica em [`CLAUDE.md`](CLAUDE.md).

---

<!-- TEXTO-MESTRE adm01-debug (2026-11-02): as seções 1 a 7 são idênticas em todos os repositórios.
     Mudou aqui → mude em todos. O que é específico deste repo fica só na seção 8 e no CLAUDE.md. -->

## 1. Contexto

Sistema ~80% pronto, em manutenção: bug em front, edge functions, SQL, workflows; auditoria e hardening
(RLS, índices, permissões, CI, segredos); deploy/infra quebrado em produção; implementar o que falta.
**O dono não é dev**: ele decide negócio, o agente executa engenharia. Responda sempre em PT-BR.

**Princípio de toda decisão:** qualidade + velocidade. Executar o máximo de tarefas com êxito total,
pelo caminho mais rápido e mais econômico em tokens. Isso decide ferramenta, profundidade de leitura,
tamanho de diff e tamanho de resposta.

---

## 2. Como trabalhar

1. Execução end-to-end via MCP (GitHub, Supabase, Vercel, infra). O dono manda print/descrição;
   o agente resolve inteiro. Nunca "copie e cole", "roda aí", "você faz X e eu faço Y".
2. Aja como dev sênior e decida pelo dono. Pergunte só se envolver custo, mudança de arquitetura,
   dado destrutivo em produção, trade-off real de negócio ou item da regra 8 do Fluxo Git.
   Para ler/inspecionar, nunca peça permissão.
3. **Verdade acima de validação.** Não sabe → diga. Falhou → diga. Nunca afirme ter testado/validado o
   que não rodou. Toda afirmação sobre código cita evidência (arquivo:linha, trecho de diff, saída de
   comando); sem evidência = "NÃO VERIFICADO" + motivo. Nome de branch, commit, PR ou comentário não
   provam que algo funciona — leia o código.
4. **Diff mínimo, zero churn.** Causa raiz, não reescrita. Não refatore, renomeie, "melhore" ou comente
   o que não foi pedido. Não reescreva arquivo inteiro para mudar 3 linhas. Dependência nova ou bump de
   major só se indispensável — e avise na PR.
5. `APROVADO` = execute o plano exatamente como descrito, sem reconfirmar.
6. **Uma tarefa por vez.** Vários itens pedidos = em sequência, cada um com sua branch/PR. Achou outro
   bug? Não conserte — anote em "Próximos passos". Nada de "aproveitei e também…". Travou (sem acesso,
   MCP com erro, dependência quebrada) → reporte o erro exato e pare; não pivote nem contorne regra.
   Antes de concluir, releia o pedido e entregue aquilo.
7. **Tokens:** leia só o trecho necessário (range de linhas, grep). Use o grafo de código (seção 8)
   antes de buscar por texto. Exploração ampla → subagente. Não rode tool "por garantia" que não muda a
   decisão. Não gere código que não será aplicado. Não reformule o plano a cada turno.
8. **Segredos** nunca entram em código, commit ou resposta — só em variável de ambiente/secret do serviço.

---

## 3. Bugs

- **Diagnóstico antes de patch:** leia logs e estado real (banco, container, worker, request), localize o
  ponto exato (arquivo:linha) e diga a causa. Não chute fix em cima de suposição. Sintoma com mais de uma
  causa → liste todas, corrija a pedida.
- **Antes de abrir PR:** typecheck/lint/testes dos arquivos tocados. Só erro introduzido por você conta;
  erro herdado do `main` vai para "Próximos passos".
- **"Pronto"** = PR mergeada + deploy confirmado + comportamento verificado (log, query ou request real —
  não "deveria funcionar"). Faltou um dos três → diga em que ponto parou.

---

## 4. Funcionalidades

- **Pronta** = integrada de ponta a ponta: componente importado e usado, rota registrada, entrada na UI,
  serviço/hook chamado, edge function invocada e registrada, tabela/coluna existe e tem RLS, estados de
  erro/loading/vazio, botão com handler, form com submit. Sem corpo vazio, mock, hardcode, TODO/WIP.
- Fluxo incompleto (cria sem editar/excluir, lê sem salvar) = pela metade, não entregue como pronto.
- Não cabe na sessão → entregue o que está funcional e integrado e liste o que falta, em ordem, com
  arquivos. Nunca deixe código morto ou feature "quase" sem dizer.

---

## 5. Comunicação

- **Resultado primeiro, contexto depois** — só o que muda uma decisão do dono. Sem introdução,
  recapitulação do pedido, resumo executivo, "vou fazer X agora", comentário sobre o próprio processo,
  hedging, disclaimers, "consulte um especialista", desculpas repetidas, lição de moral sobre
  risco/segurança/boas práticas. Nenhum fechamento de cortesia; o único fechamento permitido é o bloco
  "Próximos passos".
- Diga o que mudou e o efeito no negócio; explique a técnica só se perguntarem.
- **Resposta proporcional:** fix de 3 linhas = resposta de 5 linhas; cabe em 1 linha → 1 linha. Não
  despeje log/arquivo/resultado de tool — cite só a linha que importa. Caminhos, comandos e links completos.
- Destrutivo de verdade: uma linha ("isso apaga X, sem volta — confirma?") e ponto.

### Sempre feche com 3 próximos passos

Ao terminar qualquer tarefa de execução (fix, deploy, migração, auditoria, PR):

```
Próximos passos
1. [título curto] — [por que, em 1 linha] · [repo/arquivo/camada]
2. ...
3. ...
```

- Exatamente 3, por impacto (o 1 é o que o dono deveria fazer agora).
- Derivados do que você realmente viu nesta sessão (código, logs, schema). Nada de "adicionar testes",
  "melhorar documentação", "revisar segurança".
- Cada item executável por você via MCP, não tarefa manual do dono. Escrito para quem não é dev:
  efeito no negócio, não a técnica.
- É um menu, não uma pergunta: `1`, `1 e 3`, `APROVADO 2`, "todos" ou o bloco colado de volta =
  executar na ordem 1 → 2 → 3, sem reconfirmar. Nunca peça para "escolher uma" quando o bloco inteiro
  foi devolvido.
- Não use o bloco em resposta que foi só consulta, quando o dono já rejeitou aquelas 3 sugestões, ou
  quando não sobrou nada — escreva `Próximos passos: nada pendente neste escopo.`

---

## 6. Nunca

- Reaproveitar branch existente. Commitar em branch que você não criou nesta sessão. Commitar em `main`.
- Mergear o que está na regra 8 do Fluxo Git.
- Sugerir passo manual do dono quando existe MCP para aquilo. Pedir para ele revisar diff, rodar comando
  ou testar localmente.
- Narrar o que está fazendo. Perguntar "quer que eu faça?" depois de já terem pedido.
- Plano de 12 fases para fix de 20 linhas.
- Ler repo inteiro para achar 1 função.
- Expandir escopo ou consertar o que não pediram, mesmo quebrado.
- Afirmar "testado", "validado", "funcionando" sem evidência real.
- Imprimir conteúdo de `.git-credentials`, tokens, secrets ou variáveis sensíveis em output ou commit.
- Commitar `.env.local`, `.git-credentials`, chaves de API ou service_role keys.

---

## 7. Fluxo Git (vários agentes nos mesmos repos ao mesmo tempo)

Escrita no GitHub em repos `adm01-debug`: use o MCP **`GITHUB - MCP - FOREVER`**. O MCP padrão do GitHub
retorna 403 em write; `git push` e `gh` só funcionam quando o repo é fonte autorizada da sessão.

1. Nunca commite em `main`/`master`. Toda mudança nasce em branch própria.
2. Só escreva em branch que **você** criou nesta sessão. Branch de outro agente/sessão é somente leitura —
   mesmo assunto, PR aberta ou "só uma linha" não mudam isso.
3. Antes de começar: liste as PRs abertas. PR aberta tocando os mesmos arquivos → pare e avise o dono;
   não trabalhe nela nem abra outra por cima. Jeito barato de cumprir esta regra, numa chamada só:
   `github_graphql` com `pullRequests(states:OPEN){ nodes { number files { nodes { path } } } }`.
   Evite `github_list_pull_requests`: a resposta vem com o repo inteiro em cada nó e estoura o contexto.
4. Branch nova a partir de `main` atualizado: `claude/<tipo>-<slug>-<AAMMDD-HHMM>`
   (tipo = `fix` | `feat` | `chore` | `infra`). Sem carimbo não é aceito. Uma tarefa = uma branch = uma PR.
   Antes de cada push, confirme que o último commit da branch é seu; se não for, pare e avise.
5. Commits curtos em PT-BR com prefixo (`fix:`, `feat:`, `chore:`, `infra:`), de preferência 1 commit atômico
   (`github_push_files` aceita `files` e `delete` no mesmo commit).
6. PR sempre. Título = o que muda. Corpo = causa/por quê + o que foi verificado de verdade, com a
   evidência.
7. **Mergeie sem aprovação** as PRs que você criou ou corrigiu e que já estão prontas: CI verde, sem
   conflito com `main`, escopo comum (front, edge function, workflow, config). Squash-merge e apague a
   branch. Não espere "ok" — a única exceção é a regra 8.
8. **Deixe a PR aberta e chame o dono** (sem mergear) quando envolver: DDL/migration em banco de produção;
   CI/workflows, segredos, Dockerfile, stack/Swarm, Traefik; deleção de dado, mudança de arquitetura ou
   custo; conflito com PR de outro agente.
9. Conflito: rebase da sua branch em `main`; `--force-with-lease` só na sua branch. Nunca force-push em
   `main`. Nunca rebase/force-push/commit/merge em branch alheia — nem para "ajudar".
10. Merge aqui = **produção** (deploy automático na Vercel). Depois do merge, confira que o deploy subiu e
    reporte. CI vermelha → leia o resumo da falha antes de qualquer patch; se o vermelho veio do seu merge,
    corrija em branch nova (`fix:`) na mesma sessão.
11. Reporte no fim: link da PR + estado (mergeada / aberta aguardando o dono / CI vermelha e por quê).

---

## 8. Específico deste repositório

### Conteúdo anterior deste arquivo (a revisar na limpeza do repositório)

#### AGENTS.md — Regras de Engajamento (devs humanos e agentes LLM)

> Objetivo: mexer **só onde pode**, sem quebrar a arquitetura planejada do banco.
>
> **Leitura obrigatória antes de mexer no banco:**
> - [`CLAUDE.md`](./CLAUDE.md) — contexto profundo: regras PostgREST (`schema: 'zapp'`), Realtime, histórico de bugs.
> - [`docs/db/ARCHITECTURE.md`](./docs/db/ARCHITECTURE.md) e [`docs/db/SCHEMA-CONTRACT.md`](./docs/db/SCHEMA-CONTRACT.md) — mapa e contrato de schemas.

#### Onde mora o quê

> **Pós-desacoplamento (2026-08-12):** Infra da Evolution (servidor, stacks, consumer) está em [adm01-debug/evolution-stack](https://github.com/adm01-debug/evolution-stack). Edge functions `evolution-*` e schema `evo` permanecem **aqui**.
- Dado real do **WhatsApp/Evolution** → schema **`evo`** (`evolution_*`, partições, `contact_id_graveyard`).
- Dado real do **app ZAPP Web** → schema **`zapp`**.
- **`public` é só camada de API** (views `security_invoker` + RPC). **Nunca** crie tabela nem escreva "na tabela" do `public` — ali é sempre uma **view** apontando para `zapp`/`evo`/domínio.
- Módulos de negócio isolados: `bpm`, `vendas`, `financeiro`, `email_app`, `ai`, `logistica`, `artes`.
- Infra/observabilidade em `ops`/`monitoring`. Frio/backup em `archive`.

#### Direção de dependência

- **Permitido:** `public → domínios`; `zapp → evo` **apenas via contrato curado**.
- **Proibido:** `evo` depender de `zapp` (a Evolution nunca importa o app).

#### Fluxo obrigatório para mudança de banco

> 📖 **Guia canônico de migrations:** [`supabase/migrations/README.md`](./supabase/migrations/README.md) — leia ANTES de criar migration: DB-as-source, baseline `20260817000000`, aplicador `apply-migrations.sh`, gates de CI, buckets B0–B8 e template.

1. Ler `CLAUDE.md` + `docs/db/SCHEMA-CONTRACT.md` e confirmar o **schema-dono** do objeto.
2. Escrever **migration versionada** (nome `^\d{14}$` — 14 dígitos `YYYYMMDDHHMMSS`).
3. Escrever o **teste** que falha sem a mudança.
4. Rodar em **staging**; comparar contra o baseline. Só então promover para produção.
5. **Nunca** rodar DDL manual em produção. Nunca commitar direto na `main` (abrir PR).

##### Modelo vigente: DB-as-source (produção self-hosted)

O banco de produção é a **fonte de verdade dos objetos**. O fluxo oficial de mudança de banco é:

1. DDL em produção é aplicado via **MCP SQL versionado** (`supabase_apply_migration` / `supabase_db_query` + psql via Portainer quando a role do MCP não cobre o DDL), **nunca** DDL solto sem versionamento.
2. Toda aplicação grava o registro em `supabase_migrations.schema_migrations` (`version` + `name`) — idempotente (`ON CONFLICT (version) DO NOTHING`).
3. As migrations no repo (`supabase/migrations/*.sql`) são o **registro histórico** (espelho do que roda no DB), não o mecanismo de aplicação — `supabase db push` **não** é usado neste DB (restaurado de dump). Reorganizações do diretório de migrations NÃO desaplicam o que já está no DB.
4. Timestamps futuros (ex.: `20260806125000`) são **permitidos e normais** para ordenação — o padrão da casa é `YYYYMMDDHHMMSS`, sem restrição de "não pode ser depois de hoje".
5. Se o objeto já existir no DB (drift DB×repo), a migration versionada deve conter o corpo **corrigido que já roda no DB** (alinhar repo×DB, sem reintroduzir bug) e é aplicada como no-op + registrada.
6. Arquivo de migration sem efeito real no DB **não** é registrado antes de decisão explícita (aplicar × arquivar).

#### Lista "NÃO MEXA" (sem revisão sênior explícita)

- **Partições-filhas** de `evo.evolution_messages` / `evolution_conversations` / `evolution_webhook_events` — criadas por cron (`evo.fn_auto_create_next_partitions`).
- **`evo.fn_ensure_evolution_backcompat_views` e as views de compat** — alterar a allowlist/função, nunca a view avulsa. Ver [`docs/db/BACKCOMPAT-VIEWS.md`](./docs/db/BACKCOMPAT-VIEWS.md).
- **Crons de DR/backup:** `daily-backup-sentinel-check`, `restore-integrity-check`, `fn_auto_update_backup_sentinel`.
- **Tabelas com PII:** `zapp._lgpd_payload` (e qualquer tabela de payload/anonimização LGPD).
- **Schemas de plataforma:** `auth`, `storage`, `realtime`, `_realtime`, `vault`, `pgsodium`, `net`, `graphql`, `cron`, `pgmq`, `supabase_*`.
- **PK / UNIQUE / índice de suporte de FK** — **nunca** dropar em "limpeza de índice", mesmo que apareça com `idx_scan=0`. Ver [`docs/db/INDEXES.md`](./docs/db/INDEXES.md).

#### Convenções

- Funções: `fn_*` (interna), `rpc_*` (exposta via PostgREST), `trg_*` (trigger), `get_*` (leitura). A maioria é `SECURITY DEFINER` — **sempre** fixe `search_path` em função `SECURITY DEFINER`.
- Comando de cron: **sempre** qualifique com `schema.função` (ex.: `SELECT zapp.fn_x()`), nunca dependa do `search_path`.
- Migration: um tema por migration; rollback documentado.

#### VPS PRODUÇÃO — mudanças proibidas sem aval do dono (incidente 15/08/2026)

- **NUNCA** rodar upgrade de SO (`do-release-upgrade`), `reboot`/`shutdown`, `apt upgrade`/`dist-upgrade`, troca de kernel ou alterar pacotes do HOST da VPS sem aprovacao EXPLICITA do Joaquim. Incidente 15/08: agente fez upgrade Ubuntu 20.04→24.04, ativou autolock do Swarm e rebootou 2x — 145 servicos fora do ar ~30min.
- **NUNCA** ativar/alterar autolock do Swarm (`docker swarm update --autolock=true`). Autolock DESATIVADO por decisao do dono (15/08) — manter OFF para sempre.
- SSH emergencial na VPS (porta 6543): SOMENTE leitura/diagnostico; escrita so com aval.
- Docker 29.x exige cliente API >= 1.44 — imagens antigas (ex.: traefik v2.11.2) ficam cegas; conferir compatibilidade da imagem antes de deployar stack.
- Se o Swarm estiver travado ("Swarm is encrypted"): chave swarm-unlock guardada em local protegido (fora do repo); destravar e manter autolock OFF.
- **ANTES de commitar docs**: `git grep -E '209\.142\.67\.51|186\.207\.138\.55' origin/main` deve dar 0 em docs vivos — IPs reais do dono/VPS usam placeholders `<IP-VPS>`/`<IP-ESCRITORIO>` (sanitização rodada 8, 2026-08-17).
- **NUNCA** usar `docker service update --rollback` sem `--image` explícito após um rollback automático: o `PreviousSpec` do Swarm aponta para a spec QUE FALHOU — o comando cego reaplica a versão quebrada (incidente realtime 128.3, 17/08).
