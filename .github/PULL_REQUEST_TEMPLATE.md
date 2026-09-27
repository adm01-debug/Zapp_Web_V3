## Descrição
<!-- Descreva brevemente o que foi feito e por quê -->

## Tipo de mudança
- [ ] `feat`: Nova funcionalidade
- [ ] `fix`: Correção de bug
- [ ] `refactor`: Refatoração sem feat nem fix
- [ ] `docs`: Documentação
- [ ] `ci`: CI/CD
- [ ] `security`: Segurança
- [ ] `chore`: Tarefas diversas

## Checklist de qualidade

### Para todo PR
- [ ] Título segue Conventional Commits (`tipo: descrição em minúsculas`)
- [ ] PR aborda um único tema
- [ ] Build local passando (`bun run build`)
- [ ] TypeScript sem novos erros (`bun run typecheck`)
- [ ] `node scripts/audit-contract.mjs` rodou com **0 divergências** (contrato RPC/.from/invoke vs banco)
- [ ] ESLint limpo (`bun run lint`)
- [ ] Testes unitários verdes (`bun run test`)

### Para PRs com `fix:`
- [ ] **OBRIGATÓRIO**: Inclui ao menos um teste de regressão que falha sem a correção
- [ ] O teste está em `src/**/__tests__/*.test.ts(x)`
- [ ] Cobertura não regrediu — `bun run test --coverage` passa com os thresholds em `vitest.config.ts`

### Para PRs com mudanças de banco (migrations)
- [ ] Migration tem seção de ROLLBACK documentada (ou justificativa de irreversibilidade)
- [ ] Testada em ambiente local antes de propor para produção
- [ ] Nome do arquivo é único (sem prefixo de timestamp duplicado)
- [ ] Funções `SECURITY DEFINER` com parâmetros `(uuid, uuid)` possuem ownership guard: `IF p_user_id <> auth.uid() AND NOT zapp.is_admin_or_supervisor() THEN RAISE EXCEPTION 'permission_denied'`
- [ ] `SET search_path` de funções `SECURITY DEFINER` não inclui `public` nem `pg_temp`

### Para PRs de segurança
- [ ] Nenhuma credencial, token ou secret no código
- [ ] `git diff --stat HEAD | grep -i secret` retorna vazio

### Para PRs de CI/Workflows (`.github/workflows/`)
- [ ] Todas as actions de terceiros estão pinadas por SHA digest (não tag flutuante)
- [ ] Nenhum workflow usa `runs-on: ubuntu-latest` para jobs que precisam de DB/VPS
- [ ] `name:` do workflow não usa emoji se é referenciado por outro via `workflow_run:`
- [ ] `timeout-minutes:` definido em todo job
- [ ] `concurrency:` com `cancel-in-progress: false` nos workflows que não devem se cancelar (deploy, migrate)
- [ ] Permissions mínimas (`contents: read` por padrão; escrever só no job que precisa)
- [ ] Secrets usados existem no repositório (`Settings → Secrets → Actions`)
- [ ] `ci-workflows-lint.yml` passa (`actionlint` + checagem de refs `workflow_run`)

> Template CI especializado: `.github/PULL_REQUEST_TEMPLATE/chat-ui-100.md`
> (via `?template=chat-ui-100.md` na URL ao abrir o PR)

## Testes relacionados
<!-- Liste os arquivos de teste adicionados/modificados -->

## Notas para o revisor
<!-- Qualquer contexto adicional que ajude na revisão -->
