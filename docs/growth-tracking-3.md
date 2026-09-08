# Growth Tracking 3.0 - Fase 1

## Escopo

Esta fase amplia o Tracking 2.0 sem substituir a Meta CAPI, sua fila, deduplicacao ou a semantica financeira SaaS. A mensuracao cobre exclusivamente a aquisicao da NexaWi Clinicas. Dados de pacientes, prontuarios, agenda clinica e pagamentos de pacientes nao podem entrar nesta estrutura.

## Consentimento

O visitante pode escolher as categorias `necessarios`, `analise` e `marketing`. Necessarios permanecem ativos para seguranca e funcionamento. GA4 depende de analise; Meta Pixel, Meta CAPI, Google Ads, click IDs e enhanced conversions dependem de marketing.

As preferencias ficam no navegador em `nexawi_tracking_consent_v1` e podem ser reabertas pelo botao Privacidade. O Google Consent Mode v2 recebe os estados de `analytics_storage`, `ad_storage`, `ad_user_data` e `ad_personalization`, inicialmente negados.

## Atribuicao

First touch e last touch preservam:

- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`;
- `fbclid`, `fbc`, `fbp`;
- `gclid`, `gbraid`, `wbraid`;
- pagina inicial, referencia, segmento e tipo de pagina.

Padrao recomendado de UTM:

```text
utm_source=google|facebook|instagram|parceiro
utm_medium=cpc|paid_social|organic|referral|email
utm_campaign=<objetivo_segmento_periodo>
utm_content=<criativo_variacao>
utm_term=<palavra_chave>
```

Nao reutilize o mesmo nome para campanhas com objetivos diferentes. Nunca coloque e-mail, telefone, CPF ou nome em UTMs.

## Eventos

Eventos internos mantem a verdade operacional. A camada GA4 mapeia:

| NexaWi | GA4 |
| --- | --- |
| `landing_view` | `page_view` |
| `cta_click`, `demo_click` | `select_content` |
| `pricing_click` | `select_item` |
| `whatsapp_click` | `contact` |
| `lead_submit` | `generate_lead` |
| `signup_started` | `begin_checkout` |
| `signup_completed` | `sign_up` |

`CompleteRegistration`, `Subscribe`, `Purchase` e `MQL` geram contratos idempotentes em `google_offline_conversion_events` somente com consentimento de marketing. `Purchase` continua nascendo apenas do pagamento SaaS valido no webhook Asaas. A tabela nao envia conversoes sozinha: a integracao futura com Google Ads Data Manager deve exportar somente linhas `ready` e marcar `exported` apos confirmacao.

## Enhanced conversions

Sao usados somente e-mail, telefone e nome fornecidos naturalmente em lead/cadastro. No contrato server-side esses valores sao normalizados e armazenados apenas como SHA-256. CPF, dados clinicos e dados de pacientes sao proibidos.

## Configuracao

Na Vercel, configure:

```text
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_GOOGLE_ADS_ID=AW-XXXXXXXXX
NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL=<label da conversao Lead>
NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL=<label da conversao Signup>
```

No GA4, marque os eventos relevantes como eventos principais conforme a estrategia comercial. No Google Ads, crie as acoes de conversao antes de informar os labels e habilite enhanced conversions. Nao use labels de `Purchase` no navegador; receita SaaS depende do webhook e do contrato offline.

## Diagnostico

`/dashboard-admin/funil` mostra leads, presenca de click ID Google, consentimento, vinculacao com clinica, fila Meta e contratos Google preparados. O acesso continua restrito ao administrador interno.

Consultas de homologacao:

```sql
select event_name, status, count(*)
from public.meta_conversion_events
group by event_name, status
order by event_name, status;

select event_name, status, count(*)
from public.google_offline_conversion_events
group by event_name, status
order by event_name, status;

select id, utm_source, utm_campaign,
       (gclid is not null or gbraid is not null or wbraid is not null) as google_click,
       consent->>'marketing' as marketing_consent
from public.clinica_marketing_leads
order by created_at desc
limit 30;
```

## GTM

GTM foi adiado. O codigo atual ja centraliza consentimento, deduplicacao e destinos. Inserir outro roteador de tags nesta fase aumentaria o risco de eventos duplicados. Ele deve ser reavaliado apenas se a operacao de marketing precisar publicar tags sem deploy, com governanca e plano explicito de desativacao dos disparos equivalentes no codigo.

## Homologacao

1. Aplicar a migration `20260907120000_growth_tracking_3_phase_1.sql` antes do deploy.
2. Configurar IDs e labels em ambiente de preview.
3. Abrir uma URL com UTMs e `gclid` ficticio.
4. Validar que, antes do consentimento, nenhuma tag externa carrega.
5. Autorizar somente analise e validar GA4 sem Meta/Ads.
6. Autorizar marketing e validar Meta Pixel, Google Ads e persistencia da atribuicao.
7. Enviar um lead controlado e confirmar `generate_lead`, Meta `Lead` deduplicado e click IDs no admin.
8. Criar uma clinica e confirmar `CompleteRegistration` uma vez.
9. Homologar assinatura/pagamento SaaS real conforme o roteiro financeiro existente e confirmar um unico `Subscribe` e um unico `Purchase` por identidade.
10. Confirmar que Demo, booking e loja nao criam conversoes SaaS.
