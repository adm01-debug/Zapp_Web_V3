# Simulação pré-execução do plano canônico — 28/08/2026

## Resultado

O plano de 100 etapas continua válido e mantém cobertura dos riscos mais graves. A
simulação encontrou lacunas de **orquestração e prova**, não uma razão para descartar o
plano: 16 cenários foram cruzados contra código, workflows, contratos de banco e o
mapa arquitetural local. As correções foram incorporadas ao `README.md` canônico antes
de iniciar qualquer implementação.

Esta atividade foi somente analítica. Não houve alteração de código de produto,
schema/dados de banco, Edge Function em produção, VPS, serviço externo ou Promo Finance.

## Como a simulação foi feita

- Leitura do plano, do grafo local com 19.475 nós e dos fluxos de maior risco.
- Revisão independente de cinco frentes: banco, fronteiras Evolution/integrações,
  jornadas funcionais e concorrência, CI/release e topologia de execução.
- Simulação de falhas por raciocínio e evidência estática: não foram enviados webhooks,
  mensagens, e-mails ou ações destrutivas a provedores reais.
- Para cada cenário, foi avaliado se o plano detectaria a falha antes de chamar uma etapa
  de concluída.

## Cenários consolidados

| # | Cenário simulado | Resultado | Etapas que o tratam |
|---:|---|---|---|
| 1 | Dois agentes alteram arquivos quentes sem PR/worktree exclusivo. | Gap de execução: a divisão em PRs estava tarde. `091` foi antecipada para a Onda A e `003/010` passaram a bloquear implementação sem owner e reserva. | 003, 010, 091 |
| 2 | Uma migration é preparada na Onda C e alguém interpreta isso como autorização para aplicar em ambiente compartilhado. | Gap de leitura corrigido: a ordem agora limita 026–030/077 a diagnóstico, desenho e testes descartáveis até o G008 registrado. | 007, 026–030, 077, 093 |
| 3 | Uma mudança posterior de contrato invalida teste/evidência de SHA anterior, mas a etapa permanece marcada como pronta. | Gap corrigido: evidência dependente deve ser invalidada ou reexecutada no SHA novo. | 005, 082–100 |
| 4 | Transferência atualiza o contato, mas a auditoria estruturada falha por RLS e a UI mostra sucesso. | Risco real confirmado. O plano já o cobre; `014` passa a exigir o caminho real do chamador além do catálogo. | 014, 027, 041–044, 077 |
| 5 | Subscription Realtime aponta para view/partição ou relation errada e o catálogo parece correto, mas nenhum evento chega ao cliente. | Coberto, com reforço de que prova é evento entregue em staging, não apenas publication presente. | 018, 084, 094–095 |
| 6 | Relatório agendado falha antes do limite de retry e é gravado como `success`. | Risco real confirmado. O plano já exige estados retryáveis, DLQ, concorrência de claim e execução real de cron. | 056, 068, 074, 084, 095 |
| 7 | `connection-health-check` e dispatchers continuam acessando Evolution diretamente, enquanto o inventário imprime `TOTAL: 0`. | Gap de gate confirmado. `052` passa a exigir detecção por rota/cliente real e contrato cross-repo antes da migração. | 052–055, 079 |
| 8 | Telemetria de fallback Evolution existe, mas runtime apenas propaga 404/410/501. | Risco real já coberto: implementar fallback verdadeiro ou remover a promessa operacional. | 055, 060, 079 |
| 9 | HMAC self-test passa para Evolution, mas outros webhooks usam CORS ad hoc, curinga ou segredo compartilhado transitório. | Gap de cobertura corrigido: alvo HMAC-only explícito e gate de CORS fora da biblioteca central. | 072–075 |
| 10 | Admin salva canal/template, Edge existe, mas nenhum evento chega ao dispatcher ou ao delivery log. | Gap de prova corrigido: não basta CRUD ou Edge existir; precisa `salvar → evento → dispatcher → log`. | 033–034, 068 |
| 11 | Sessão expira ou logout ocorre em uma aba, enquanto outra mantém cache; deep link 2FA sofre refresh lento. | Hipótese forte, ainda não bug confirmado. O plano agora exige duas abas reais e prazo de convergência. | 071, 086 |
| 12 | Versão anterior do frontend/service worker permanece ativa durante migration/alteração de contrato. | Gap de release corrigido: regressão em staging deve validar compatibilidade N/N-1 entre browser, Edge e banco. | 037, 084, 094, 097 |
| 13 | Staging é improvisado fora do processo versionado, sem owner, restore ou limite de integração externa. | Gap de reprodutibilidade corrigido: `092` exige runbook e owner; sem isso fica bloqueada. | 092–095 |
| 14 | Deploy usa tag SHA, mas não digest; canário existe só no texto e o pipeline aplica rollout integral. | Gap de operabilidade corrigido: tag não conta como digest e rollout provisório não conta como canário para aceite final. | 096, 099–100 |
| 15 | Health 200/HTTP 200 do cleanup e jobs verdes mascaram fluxo crítico quebrado, cleanup sem efeito ou baseline regenerada durante soak. | Gap de falso verde corrigido: smoke focal versionado, contadores de efeito e baseline congelada nas duas janelas. | 087, 097–099 |
| 16 | Limpeza arquiva/remova módulos antes de certificar drift, cobertura e manifests; ou executa no workspace errado. | Gap de governança corrigido: `070` termina em decisão, execução exige PR próprio posterior; cada onda revalida o repositório e mantém Promo Finance fora do escopo. | 002, 070, 088–091 |

## Evidências representativas

- A transferência usa o cliente normal para inserir a trilha em
  `src/features/inbox/hooks/useTransferConversation.ts`; a matriz de RLS precisa ser
  provada pelo caminho do usuário, não somente por metadados.
- O bloco de erro de `supabase/functions/send-scheduled-report/index.ts` contém o caso
  que pode persistir `success` antes do limite de retry.
- `connection-health-check`, `evolution-notification-dispatcher` e
  `zapp-notifications-dispatch` possuem caminhos de fetch direto a Evolution; o
  inventário atual não basta como único guard.
- `talkx-control` e `talkx-scheduler` têm comportamentos diferentes de compensação;
  `EmailChatBubble` ainda pode receber lista vazia de anexos apesar de metadata existir.
- O workflow ativo de deploy trabalha com tag SHA; esta simulação não encontrou prova de
  digest injetado no deploy ativo nem mecanismo versionado de canário por percentual.
- O sentinel de branch pode operar em modo de aviso se a credencial administrativa não
  estiver disponível; aviso não é proteção comprovada.

## Ajustes incorporados ao plano

1. Antecipação da etapa 091 para a Onda A e reserva obrigatória de owner/worktree/PR.
2. Regra de invalidação de evidência entre SHAs e hard stop de autorização G008 para a
   Onda C.
3. Provas por caminho real de RLS, restore com escopo declarado e reconciliação
   repo × ledger × snapshot.
4. Gates específicos contra falso verde de Evolution, CORS/HMAC, notificações, staging,
   smoke, cleanup, soak, digest e rollback.
5. Compatibilidade N/N-1 e segurança de fault injection com apenas dados/provedores de
   teste autorizados.
6. Limpeza mantida como decisão individual, jamais autorização implícita de remoção.

## Condições para começar a implementação

- Concluir 001–010 e 091 na ordem, com matriz de ownership atualizada.
- Manter toda mudança de banco como proposta/teste até autorização explícita do Joaquim.
- Não reutilizar uma evidência quando seu contrato predecessor mudar.
- Fazer releases apenas pelo pipeline aprovado; nenhuma alteração de VPS/Swarm faz parte
  deste plano.
- Tratar qualquer cenário sem staging ou canário reproduzível como bloqueio documentado,
  não como sucesso parcial.

## Limite desta simulação

Ela valida a **qualidade do plano e seus controles**, não declara os bugs corrigidos.
Cada correção continua exigindo a implementação, os gates e a evidência da etapa
correspondente. Em especial, não autoriza DDL, exclusão de dados, limpeza de repositório
ou mudanças de infraestrutura.
