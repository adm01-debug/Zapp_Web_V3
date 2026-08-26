# syntax=docker/dockerfile:1
# Portado do harness de produção do zapp-web (v1) para o v3.

FROM oven/bun:1.3.14-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
# Release Docker precisa ser determinística: sem drift silencioso do lockfile.
RUN bun install --frozen-lockfile

FROM deps AS builder
WORKDIR /app
COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SENTRY_DSN
ARG VITE_GIT_SHA
ARG VITE_SENTRY_ENVIRONMENT=production
ARG VITE_APP_ENV=production
# plano-100 etapa 91 (2026-08-20): liga o upload de web-vitals para a edge fn
# client-observability em prod (gate exato ==='true' em src/lib/webVitals.ts).
ARG VITE_ENABLE_CLIENT_OBSERVABILITY=true

ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
ENV VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY:-${VITE_SUPABASE_ANON_KEY}}
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
ENV VITE_GIT_SHA=${VITE_GIT_SHA}
ENV VITE_SENTRY_ENVIRONMENT=${VITE_SENTRY_ENVIRONMENT}
ENV VITE_APP_ENV=${VITE_APP_ENV}
ENV VITE_ENABLE_CLIENT_OBSERVABILITY=${VITE_ENABLE_CLIENT_OBSERVABILITY}

RUN case "${VITE_GIT_SHA:-}" in \
    ""|"dev") ;; \
    [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;; \
    *) echo "VITE_GIT_SHA inválido: esperado SHA git completo com 40 hex em release" >&2; exit 1 ;; \
  esac

# build direto pelo Vite (determinístico em CI/Docker; component-registry já versionado)
RUN bunx vite build

# Lista apenas os assets produzidos por ESTE build. A imagem seguinte usa este
# manifesto para reter N-1, sem recarregar gerações mais antigas.
RUN find dist/assets -type f | sed 's#^dist/assets/##' | LC_ALL=C sort \
  > dist/current-assets.txt

FROM nginx:1.31-alpine AS runtime
ARG VITE_GIT_SHA
LABEL org.opencontainers.image.revision="${VITE_GIT_SHA}"
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Retenção de assets do build anterior — assets com nomes content-hashed do
# build N-1 coexistem com os do build N, sem colisão. Sessões vivas com tab
# aberta do deploy anterior não recebem 404 nos seus chunks JS/CSS.
# previous_assets é um contexto BuildKit separado: nunca entra no `COPY . .`
# do builder. Se estiver vazio (primeiro deploy/migração), COPY é no-op.
COPY --from=previous_assets / /usr/share/nginx/html/assets/
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O - http://127.0.0.1/healthz >/dev/null || exit 1
CMD ["nginx", "-g", "daemon off;"]
