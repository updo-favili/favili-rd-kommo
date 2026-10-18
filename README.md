# Grupo Favili · RD Station → Kommo

Conta: escolanormal.kommo.com. Destino: Escola (8794271), NOVOS LEADS - RD (113083004).

## Formulários

| Conversão RD | Aba Kommo | Campo RD | ID Kommo |
|---|---|---|---|
| matricula-2027-visita | Escola Matrícula | cf_quantidade_de_filhos | 2017912 |
| matricula-2027-visita | Escola Matrícula | cf_series_2027 | 2017914 |
| matricula-2027-visita | Escola Matrícula | cf_periodo_da_visita | 2017916 |
| colonia-de-ferias-2026 | Escola Colônia | cf_quantidade_de_filhos | 2017918 |
| colonia-de-ferias-2026 | Escola Colônia | cf_colonia_criancas | 2017920 |
| colonia-de-ferias-2026 | Escola Colônia | cf_colonia_tem_aluno_en | 2017922 |
| colonia-de-ferias-2026 | Escola Colônia | cf_colonia_semanas | 2017924 |
| colonia-de-ferias-2026 | Escola Colônia | cf_colonia_pagamento | 2017926 |
| colonia-de-ferias-2026 | Escola Colônia | cf_colonia_indicacao_amigo | 2017928 |
| colonia-de-ferias-2026 | Escola Colônia | cf_colonia_valor_estimado | 2017930 |

IDs verificados na API em 18/10/2026. Todos esses campos são texto; listas são unidas com ponto e vírgula. Campos ausentes não apagam dados existentes. Cada formulário escreve somente nos IDs da sua aba.

Origem: traffic_source → utm_source; traffic_medium → utm_medium; traffic_campaign → utm_campaign; traffic_value → utm_term. Valores presentes da conversão recebida têm prioridade. Nenhuma primeira conversão é usada como fallback de origem.

## Oportunidades

O contato é localizado por telefone/e-mail. Cada formulário possui uma oportunidade independente identificada pela tag de seu evento. Uma oportunidade aberta do mesmo formulário é atualizada mantendo sua etapa atual. Sem oportunidade aberta correspondente, cria uma em NOVOS LEADS - RD. Oportunidades sem a tag do evento não são reutilizadas automaticamente. Tags existentes são preservadas.

## Webhooks

Webhook padrão: POST /api/webhooks/rd?secret=SEGREDO.

Automação Matrícula: POST /api/webhooks/rd/matricula-2027-visita/SEGREDO.

Automação Colônia: POST /api/webhooks/rd/colonia-de-ferias-2026/SEGREDO.

Webhook único recomendado para os dois formulários: POST /api/webhooks/rd/escola/SEGREDO. Nas automações, essa rota identifica exclusivamente last_conversion e ignora eventos desconhecidos ou sem identificador; não usa first_conversion. As rotas individuais permanecem disponíveis. Envie um contato por requisição. Uma conversão incompatível com a rota é ignorada. Eventos da Ibrate não são aceitos.

## Estado e validação

Sincronização local desativada. Nenhum deploy ou webhook RD foi cadastrado nesta etapa. Ainda é necessário validar um payload real de cada formulário em modo de captura antes de habilitar gravações. A regra de oportunidades separadas é a recomendação inicial.

Copie .env.example para .env.local e configure as credenciais localmente. Não versione segredos. Defina RD_WEBHOOK_SECRET exclusivo antes de testar o endpoint.

Comandos: npm ci, npm test, npm run lint, npm run build.
