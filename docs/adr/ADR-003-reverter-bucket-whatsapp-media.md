# ADR-003: Reverter bucket whatsapp-media para Privado

## Metadados

| Atributo  | Valor                                       |
| --------- | ------------------------------------------- |
| Status    | ACEITA                                      |
| Data      | 2026-07-26                                  |
| Decisores | Equipe de Segurança / Plano 50 Etapas (E10) |
| Revoga    | ADR-002 (Tornar whatsapp-media público)     |

## Contexto

Em 26/07/2026, durante auditoria de segurança, foi identificado que:

- O bucket `whatsapp-media` estava configurado como PÚBLICO desde aprox. 17/06/2026
- 4.680 arquivos de mídia WhatsApp estavam acessíveis sem autenticação
- Esses arquivos contêm mensagens, fotos, áudios e documentos de conversas de clientes
- Violação da LGPD Art. 46: falta de medidas adequadas de segurança

## Decisão

**Reverter o bucket `whatsapp-media` para PRIVADO imediatamente** e implementar signed URLs com cache de 50 minutos.

## Justificativa

### Contra manter público (ADR-002):

- **LGPD** : Art. 46 — operadores de dados devem adotar medidas adequadas de segurança
- **Exposição de PII**: fotos, áudios e documentos de conversas privadas acessíveis sem auth por qualquer pessoa com a URL
- **Superfície de ataque**: URLs públicas são indexadas por mecanismos de busca, not recorders, etc.
- **Não necessário**: O problema N+1 de signed URLs foi resolvido com batch signing

### A favor de signed URLs (ADR-003):

- **Segurança**: apenas usuários autenticados podem acessar mídia
- **Performance equivalente**: batch signing = 1 chamada por bucket por render cycle (450 POSTs → 1 POST)
- **TTL de 60min**: URLs assinadas duram 60min; cache de 50min no cliente
- **Padrão industrial**: é a arquitetura esperada com Supabase Storage

## Consequências

### Imediatas (26/07/2026):

- [x] Executar: `UPDATE storage.buckets SET public = false WHERE id = 'whatsapp-media'; ` — **FEITO**
- [x] Atualizar `PUBLIC_BUCKETS` em `useMediaUrl.ts` - **FEITO**
- [x] Implementar `useSignedMediaUrlBatch()` - **FEITO**

### Futuras (para o time):

- [ ] Atualizar callers do `resolvePublicMediaUrl()` para usar `useSignedMediaUrlBatch()` no nível da lista
- [ ] Testar que mídias renderizam corretamente com signed URLs
- [ ] Avaliar notificação LGPD aos usuários afetados (39 dias de exposições)

## Adendo de Registro

| Data       | Evento                                         |
| ---------- | ---------------------------------------------- |
| 17/06/2026 | Bucket tornado público (ADR-002 - performance) |
| 26/07/2026 | Auditoria detecta violação LGPD                |
| 26/07/2026 | bucket revertido para privado (ADR-003)        |
| 26/07/2026 | `useSignedMediaUrlBatch()` implementado        |

## Referências

- Plano 50 Etapas — Etapa 10
- `docs/security/CREDENTIAL_ROTATION_RUNBOOK.md`
- `src/lib/useMediaUrl.ts` (implementação do batch signing)
