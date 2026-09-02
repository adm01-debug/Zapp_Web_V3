# SECURITY INCIDENT REPORT — Token Exposure in .mcp.json

**Report Date:** 2026-07-26
**Severity:** CRITICAL (P0)
**Status:** ✅ **RESOLVED (2026-08-24)** — token rotacionado via Portainer e verificado (evidência abaixo)

## ✅ RESOLUÇÃO (2026-08-24)

| Passo | Evidência |
|---|---|
| **Rotação** | Stack `supabase-db-mcp` (Portainer, ID 128) atualizado com novo token no PathPrefix do Traefik (`portainer_update_stack`, "updated successfully") |
| **Token antigo MORTO** | `POST …/s-a501…(antigo)/mcp` → **404** |
| **Token novo FUNCIONA** | `POST …/<novo>/mcp` → **200**; smoke `supabase_db_query` (`select current_database()`) → `postgres` em 1ms |
| **Serviço saudável** | `GET /health` → **200** |
| **Redação no repo** | 14 ocorrências do token antigo substituídas por placeholder em 8 arquivos (este incluído); stack file versionado agora documenta que o valor real vive só no Portainer — **repo é público, token novo jamais é versionado** |

> **Precisão do registro original:** o valor exposto era o **token de path do Traefik** que
> autentica o acesso ao MCP endpoint (concede SQL arbitrário via `supabase_db_query`), não
> uma service_role key literal. A service_role subjacente (`supabase_service_key_v3`) já
> havia sido rotacionada em 2026-08-10 — a rotação de hoje mata o último caminho de acesso
> derivado da exposição.
>
> **Controle pendente (dono):** tornar o repo **private** permanece recomendado (tabela
> "SECURITY CONTROLS TO ENABLE"); o token em git history segue lá (limpeza via
> `git filter-repo` = backlog da etapa 9 do PLANO-100), porém **sem valor** — a rotação
> o invalidou.

---

## INCIDENT SUMMARY

| Field | Value |
|-------|-------|
| **Type** | Credential Exposure in Version Control |
| **Location** | `.mcp.json` (versioned in git) |
| **Exposed Token** | `s-REDACTED-rotacionado-20260824` |
| **Token Type** | Supabase Service Role Key (URL-embedded) |
| **First Commit** | `3937abec724a` (2026-07-14) |
| **Repository Visibility** | PUBLIC |
| **Secret Scanning** | DISABLED |
| **Push Protection** | DISABLED |

---

## EXPOSURE ANALYSIS

### What This Token Provides

The exposed Supabase Service Role Key grants **full administrative access** to:
- All database operations (read/write/delete on ALL tables)
- User management and authentication
- Storage operations (files)
- Realtime subscriptions
- Row Level Security bypass
- Schema modifications
- Function execution

### Attack Surface

```
Token: s-REDACTED-rotacionado-20260824
Endpoint: https://supabase-mcp.atomicabr.com.br/s-REDACTED-rotacionado-20260824/mcp

Capabilities exposed via MCP tools:
- supabase_db_query (arbitrary SQL)
- supabase_storage_* (file operations)
- supabase_auth_delete_user
- supabase_meta_delete_table
- All CRUD operations on ALL schemas
```

---

## BLAST RADIUS ASSESSMENT

### Confirmed Locations

| Location | Token Present | Risk Level |
|----------|---------------|------------|
| `.mcp.json` (git history) | ✅ YES | 🔴 CRITICAL |
| Cloudflare Worker env | ✅ YES | 🔴 CRITICAL |
| GitHub Secrets (unverified) | ❓ UNKNOWN | 🔴 HIGH |
| CI/CD Variables (unverified) | ❓ UNKNOWN | 🔴 HIGH |
| n8n Workflows (unverified) | ❓ UNKNOWN | 🔴 HIGH |
| Portainer MCP | ⚠️ Related | 🟡 MEDIUM |

### Data at Risk

Based on database schema analysis:

| Data Category | Records (est.) | Sensitivity |
|--------------|----------------|-------------|
| WhatsApp Messages | ~2,500+ | 🔴 HIGH (LGPD) |
| User Profiles | Unknown | 🔴 HIGH |
| Evolution Media | ~2,500+ | 🔴 HIGH (LGPD) |
| Auth Sessions | Unknown | 🟡 MEDIUM |
| Business Data | Unknown | 🟡 MEDIUM |

---

## ACTIONS REQUIRED

### IMMEDIATE (Within 1 Hour)

- [x] **1. Generate new Supabase Service Role Key** → equivalente executado: service_role já rotacionada em 2026-08-10 (`supabase_service_key_v3`); **token de path do MCP rotacionado em 2026-08-24** (este doc, seção RESOLUÇÃO)

- [x] **2. Update Cloudflare Worker** → não se aplica: o endpoint afetado roda na VPS (stack 128), não em Worker; Workers do incidente (evolution/github) não usavam este token

- [x] **3. Verify old token is invalid** ✅ 2026-08-24: `POST /s-a501…(antigo)/mcp` → **404**; novo token → 200 + query funcional

### SHORT-TERM (Within 24 Hours)

- [ ] **4. Audit GitHub Secrets**
  ```bash
  gh secret list
  # Check for any stored credentials
  ```

- [ ] **5. Audit n8n Workflows**
  - Check all workflows for Supabase credentials
  - Update any found credentials

- [ ] **6. Check database access logs**
  ```sql
  SELECT * FROM auth.audit_log_entries 
  WHERE created_at > '2026-07-14'
  ORDER BY created_at DESC;
  ```

- [ ] **7. Review storage access logs**
  - Check for unauthorized file access
  - Verify no unexpected data exports

### COMPLIANCE (Within 72 Hours)

- [ ] **8. LGPD Assessment**
  - Evaluate if personal data was accessed
  - Document incident
  - Determine if ANPD notification required
  - Consider notification to affected data subjects

---

## INVESTIGATION CHECKLIST

### Git History Analysis
```
First commit: 3937abec724a (2026-07-14 18:39:58)
Author: adm01 <adm01@debug.com>
Message: "chore: configure MCPs (Portainer, Evolution, Supabase x2, GitHub) + deploy guide"

Total commits with token in history: 3
- 3937abec7: Initial addition
- cab779542: Feature commit
- 48ca5b716: Auth fix
```

### Duration of Exposure
```
Start: 2026-07-14 18:39:58
End: Present (2026-07-26) — NOT YET ROTATED
Duration: ~12 days
```

---

## SECURITY CONTROLS TO ENABLE

These controls were DISABLED and must be ENABLED:

| Control | Current | Required |
|---------|---------|----------|
| Secret Scanning | ❌ OFF | ✅ ON |
| Push Protection | ❌ OFF | ✅ ON |
| Branch Protection | ❌ OFF | ✅ ON |
| Dependabot Security | ❌ OFF | ✅ ON |
| Repository Visibility | ⚠️ PUBLIC | ✅ PRIVATE |

---

## REMEDIATION TIMELINE

| Phase | Action | Owner | Deadline |
|-------|--------|-------|----------|
| P0 | Rotate token | Security | IMMEDIATE |
| P0 | Update Cloudflare | DevOps | IMMEDIATE |
| P1 | Audit blast radius | Security | +24h |
| P1 | Enable controls | DevOps | +48h |
| P2 | LGPD assessment | DPO | +72h |
| P2 | Document lessons | Security | +1 week |

---

## EVIDENCE

### Original .mcp.json Content
```json
{
  "mcpServers": {
    "portainer": { "url": "https://portainer-mcp.atomicabr.com.br/mcp" },
    "evolution": { "url": "https://evolution-mcp.adm01.workers.dev/mcp" },
    "supabase-selfhosted": { 
      "url": "https://supabase-mcp.atomicabr.com.br/s-REDACTED-rotacionado-20260824/mcp"
    },
    "github": { "url": "https://github-mcp-server.adm01.workers.dev/mcp" }
  }
}
```

### Git Commit Evidence
```
commit 3937abec724a1a87e4a055a2abe5bbf8a20e09b4
Author: adm01 <adm01@debug.com>
Date:   Tue Jul 14 18:39:58 2026 -0300

    chore: configure MCPs (Portainer, Evolution, Supabase x2, GitHub) + deploy guide
```

---

## SIGN-OFF

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Security Lead | | | |
| DevOps Lead | | | |
| DPO (LGPD) | | | |

---

*Document Status: ✅ RESOLVED (2026-08-24 — rotação via Portainer stack 128, evidência no topo)*
*Controles pendentes (dono): repo private + git filter-repo do histórico*
