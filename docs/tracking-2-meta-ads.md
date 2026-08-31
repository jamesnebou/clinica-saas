# Tracking 2.0 — Meta Pixel + Conversions API

## Objetivo

A aquisição da NexaWi Clínicas usa um único Dataset/Pixel Meta para todas as páginas comerciais e segmentos. O Tracking 2.0 separa três verdades:

1. **Navegador:** Pixel mede PageView, ViewContent e a confirmação visual do Lead.
2. **Servidor:** CAPI confirma eventos de alto valor com dados já validados pela NexaWi.
3. **Banco NexaWi:** preserva first-touch, last-touch e a ligação do lead até a clínica/assinatura/pagamento.

O Dataset configurado é o mesmo em todas as LPs. A LP informa apenas contexto como `segment` e `page_type`.

## Limite de privacidade

O tracking é exclusivo para aquisição da própria NexaWi Clínicas. Não instalar o Pixel da NexaWi nos sites públicos de pacientes (`/c/[slug]`) nem no dashboard operacional das clínicas.

Nunca enviar à Meta prontuário, diagnóstico, anamnese, CPF, documentos, observações clínicas, procedimentos de pacientes ou qualquer dado de saúde. O sanitizador de metadata bloqueia chaves clínicas óbvias e a CAPI possui uma whitelist de `custom_data`.

## Eventos

| Evento Meta | Origem | Regra |
| --- | --- | --- |
| PageView | Browser | visita a uma superfície comercial da NexaWi |
| ViewContent | Browser + CAPI | uma vez por sessão/caminho em página comercial relevante |
| Lead | Browser + CAPI | somente após o lead ser persistido com sucesso |
| Schedule | Preparado, não emitido ainda | somente quando existir agendamento real de demonstração |
| CompleteRegistration | CAPI | clínica realmente criada no onboarding |
| Subscribe | CAPI | assinatura SaaS realmente criada no Asaas |
| Purchase | CAPI | pagamento real de assinatura SaaS confirmado no webhook |

Eventos internos como `demo_click`, `pricing_click`, `whatsapp_click` e `roi_calculate` continuam no analytics da NexaWi/GA e não poluem o Dataset Meta como eventos customizados.

## Deduplicação

Eventos enviados por browser e servidor usam o mesmo `event_name` e `event_id`.

Exemplo de Lead:

- browser: `Lead`, `eventID=lead:...`
- servidor: `Lead`, `event_id=lead:...`

O servidor devolve o `event_id` confirmado para o formulário e o browser dispara o evento padrão somente depois do HTTP 200.

## Atribuição

A captura mantém:

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`
- `fbclid`
- `_fbc`
- `_fbp`
- página de entrada
- referrer
- segmento
- tipo de página
- first-touch
- last-touch pago

Uma revisita direta não apaga o último toque pago. Um `fbclid` novo substitui o clique Meta antigo mesmo antes do Pixel atualizar o cookie `_fbc`.

No onboarding, a atribuição é persistida em `saas_marketing_attribution`. Se o usuário trocar de navegador, o sistema tenta recuperar a origem pelo lead comercial mais recente com o mesmo e-mail ou WhatsApp.

## CAPI e matching

Dados de identificação enviados quando naturalmente disponíveis:

- e-mail: normalizado e SHA-256
- telefone: normalizado para país configurado e SHA-256
- nome/sobrenome: normalizados e SHA-256
- external_id: SHA-256
- fbc/fbp: sem hash
- IP: sem hash
- User-Agent: sem hash

Nenhum dado adicional deve ser coletado apenas para publicidade.

## Fila durável

Lead, CompleteRegistration, Subscribe e Purchase são persistidos em `meta_conversion_events` antes da resposta final sempre que possível. A entrega imediata ocorre após a resposta usando `after()`. Falhas transitórias ficam para retry.

O worker `/api/cron/meta-capi` usa o mesmo `CRON_SECRET` e faz claim concorrente com `FOR UPDATE SKIP LOCKED`. Eventos enviados ou abandonados são redigidos para não manter o payload de matching indefinidamente.

`ViewContent` não usa a fila durável para evitar transformar visualizações de página em uma fila de banco de alto volume; ele é enviado diretamente após o registro interno.

## Variáveis de ambiente

```env
NEXT_PUBLIC_META_PIXEL_ID=2335104113905923
META_CAPI_DATASET_ID=2335104113905923
META_CAPI_ACCESS_TOKEN=<server-only>
META_CAPI_GRAPH_API_VERSION=v26.0
META_CAPI_DEFAULT_COUNTRY_CODE=55

# Apenas durante homologação no Events Manager. Remover depois.
META_CAPI_TEST_EVENT_CODE=
```

`META_CAPI_ACCESS_TOKEN` nunca pode usar prefixo `NEXT_PUBLIC_`.

## Migration

Aplicar depois de validar o código:

`20260831120000_tracking_2_meta_capi.sql`

Ela:

- amplia `clinica_marketing_leads` sem destruir histórico;
- cria `saas_marketing_attribution`;
- cria a fila `meta_conversion_events`;
- protege as tabelas com RLS/service_role;
- cria claim concorrente para retries.

Migrations históricas não são alteradas.

## Homologação Meta

1. Definir as variáveis na Vercel.
2. Aplicar a migration.
3. Fazer deploy.
4. Definir temporariamente `META_CAPI_TEST_EVENT_CODE` com o código da aba **Eventos de teste**.
5. Abrir a página comercial e validar `PageView` e `ViewContent`.
6. Enviar um lead controlado e validar `Lead` Browser + Server com o mesmo `event_id`.
7. Validar criação controlada de clínica para `CompleteRegistration`.
8. Validar assinatura de teste para `Subscribe`.
9. Validar pagamento sandbox/real controlado para `Purchase` com valor/moeda corretos.
10. Remover `META_CAPI_TEST_EVENT_CODE` após a homologação.
11. Conferir Diagnóstico, deduplicação e qualidade de correspondência.

## Futuras LPs

Cada LP deve usar a camada central, por exemplo:

```jsx
<MarketingTracking
  segment="odontologia"
  pageType="landing_page"
  contentName="NexaWi Clínicas para Odontologia"
/>
```

Não copiar o snippet do Pixel em cada LP e não criar um Pixel por segmento.

## Scheduler

A entrega imediata cobre o caminho normal. O cron existe para resiliência/retry. Se a conta continuar no Vercel Hobby, um scheduler externo pode chamar com `Authorization: Bearer <CRON_SECRET>`:

- `/api/cron/automations`
- `/api/cron/meta-capi`

A cada 5 minutos é uma boa cadência operacional quando o scheduler escolhido suportar isso.
