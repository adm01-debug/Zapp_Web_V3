# ADR-CI-002: Boundary de segurança do runner vps-zapp em workflows dispatch

**Data:** 2026-10-02
**Status:** Aceito
**Contexto:** PR #1631 — gen-types-zapp.yml, Codex round 9 finding P1 #4161915437

## Contexto

O runner `vps-zapp` tem acesso ao Docker socket de produção e às credenciais da VPS
(montados em `infra/runner/docker-compose.runner.yml`). Qualquer job executado nele
tem acesso de-facto a produção.

O workflow `gen-types-zapp.yml` usa `workflow_dispatch`, o que permite que qualquer
usuário com permissão de write no repositório dispare o workflow com `--ref <branch>`.
O GitHub carrega o arquivo YAML da branch especificada, não de `main`. Portanto, um
colaborador pode:
1. Criar `attack-branch` com `environment: types-generation` e `if: github.ref == 'refs/heads/main'` removidos
2. Disparar `gh workflow run gen-types-zapp.yml --ref attack-branch`
3. Executar código arbitrário no `vps-zapp` sem passar pela branch protection de main

## Decisão

### Mitigações em código (necessárias mas insuficientes)

O workflow implementa camadas defensivas em YAML:
- `environment: types-generation` com branch policy = `main` only
- `if: github.ref == 'refs/heads/main'` no nível do job
- Step "Validate dispatch ref" que falha se `github.ref_name != 'main'`

**Limitação:** todas essas mitigações vivem no arquivo YAML e podem ser removidas por
um atacante que controla o `--ref` do dispatch.

### Mitigação estrutural obrigatória (fora do YAML)

A única barreira inviolável é a configuração do **runner group** no nível de organização
GitHub, que o YAML não pode contornar:

**Configuração necessária (ação do administrador GitHub da org):**
```
GitHub Settings → Actions → Runner Groups → vps-zapp
→ "Allow public repositories": OFF
→ "Only allow specific branches" (ou "Restrict to specific branches"): ON
→ Branch pattern: main
```

Com essa configuração, o runner `vps-zapp` recusa jobs de qualquer branch que não seja
`main`, independentemente do conteúdo do YAML.

## Risco residual aceito

Enquanto a configuração de runner group não estiver ativa, o risco é:
- **Quem pode explorar:** colaboradores com permissão `write` no repositório
- **Impacto:** execução arbitrária no VPS de produção
- **Mitigação parcial atual:** as 3 camadas YAML acima dificultam exploração casual

O risco foi avaliado e aceito explicitamente pelo dono do repositório enquanto a
configuração de runner group não é aplicada.

## Consequências

- O workflow `gen-types-zapp.yml` mantém `workflow_dispatch` para uso operacional
- A configuração de runner group deve ser aplicada pelo administrador GitHub da org
- Este ADR serve como referência para auditores e revisores de código
