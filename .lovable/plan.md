# Plano — Correção completa dos erros TypeScript

## Objetivo
Eliminar os erros de nulabilidade e incompatibilidade de tipos sem ocultá-los com `@ts-nocheck`, `@ts-ignore`, `any` ou assertions não seguras.

## Execução
1. Corrigir o código de produção com valores padrão e guardas explícitas onde índices, mapas ou propriedades opcionais podem retornar `undefined`.
2. Ajustar os testes para validar a existência dos resultados antes de acessar itens, preservando as asserções comportamentais existentes.
3. Corrigir fixtures e parsers dos testes de RLS para produzir somente strings válidas e falhar claramente caso o formato esperado mude.
4. Executar a verificação TypeScript completa para localizar os erros omitidos da mensagem truncada e repetir as correções por categoria.
5. Rodar apenas as suítes afetadas e a validação TypeScript final, confirmando ausência de regressões.
6. Atualizar o grafo de conhecimento do projeto após as alterações.

## Detalhes técnicos
- Em retornos indexados, usar acesso seguro ou helpers de teste que verificam a existência antes de retornar o item tipado.
- Em produção, normalizar lookups com fallback estável e converter resultados de indexação vazios para `null` quando esse é o contrato público.
- Não alterar banco, Edge Functions, configuração de deploy ou comportamento funcional fora dos erros reportados.

## Critério de conclusão
- Verificação TypeScript sem os erros reportados e sem novos erros.
- Testes diretamente afetados aprovados.
- Nenhuma supressão de tipo adicionada.
