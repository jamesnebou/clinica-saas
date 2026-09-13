# PUBLIC-HARDEN-01 - Protecao antiabuso
Data: 2026-09-12
Projeto: NexaWi Clinicas / clinica-saas

## Resultado
**AUD-P1-01: CONDITIONALLY CLOSED (implementacao local; nao publicado).**

Base testada: 7503ba08639b59d37f5607d0c756f2eafe41c87f, branch main, MAIS o working tree desta tarefa. Nao existe novo SHA de release, pois nenhum commit foi criado.
Nenhuma escrita remota, deploy, mudanca de secrets ou chamada real de cobranca foi realizada nesta tarefa.
A migration foi aplicada exclusivamente no Docker local clinica-estetica (API 55421 / DB 55422).
Alteracoes preexistentes de F0C-CLOSE-03/DR foram preservadas. NexaWi Ads nao participa deste trabalho.

## Evidencias e limites
- npm test: 461/461 PASS. Inclui 40 testes novos de antiabuso (20 de core/contratos e 20 executando actions/handlers com dependencias simuladas).
- npm run lint: PASS, exit code 0.
- npm run build: PASS, Next 16.3.4, 82 paginas, diretorio isolado .next-public-harden. Nenhum deploy.
- git diff --check: PASS antes da documentacao; repetido ao concluir.
- Fresh reset local: 56 migrations aplicadas (55 anteriores + a nova), sem seed.
- pgTAP local: 69/69 PASS: F0A 27, F0B 26, antiabuso 16.
- Policies locais de escrita para anon/public no schema public: nenhuma encontrada. Isso nao substitui auditar cada RPC SECURITY DEFINER; F0A/F0B e grants do limiter foram testados.
- Build e testes usam codigo real. Providers, cobrancas, e-mails e banco dos testes JS sao simulados. Os testes nao equivalem a uma compra ou agendamento E2E real no browser.
- A primeira tentativa de smoke HTTP foi bloqueada pelo limite de uso da revisao automatica. A retomada foi autorizada: servidor temporario localhost:3012 usando exclusivamente Supabase local; encerrado depois do teste. Nenhuma homologacao remota.
- Smoke HTTP real local: evento invalido 400; payload 70 KiB 413; 62 POSTs honeypot resultaram em 59 respostas 200 e 3 respostas 429 (um request valido anterior ja havia consumido ingresso). Resposta final com Retry-After=198, Cache-Control=no-store e mensagem padrao. Um bucket HMAC no banco local, zero leads, zero bookings e zero pedidos criados.

## Inventario de superficies
Metodos nao exportados pelos Route Handlers permanecem com a resposta de metodo nao permitido do Next. HEAD de GET segue o framework.
Server Actions usam POST do framework, nao JSON REST: feedback de limite dentro da action permanece mensagem/redirect; a barreira de ingresso do Proxy retorna 429 JSON + Retry-After antes da action.

### Autenticacao, tenant, validacao e limites
| Superficie / arquivo | Metodo / autenticacao | Tenant e origem dos IDs | Entrada / limite / protecao |
|---|---|---|---|
| /api/public/availability | GET anonimo | slug -> clinicas ativa/trial; profissionais e procedimentos filtrados por clinic.id | URL 8 KiB; UUID; ate 50 procedimentos; data real OU mes; rejeita clinica_id/tenant_id; availability + public_read |
| /api/public/analytics | POST anonimo | slug -> clinicas; nunca clinica_id do body | JSON 16 KiB em streaming; allowlist de 5 eventos; metadata restrita; analytics + ingresso |
| /api/public/marketing-events | POST anonimo | aquisicao SaaS global, sem tenant escolhido pelo browser | JSON 24 KiB; allowlist de eventos; metadata allowlist; marketing_events + ingresso |
| /api/public/marketing-leads | POST anonimo | lead de aquisicao SaaS global | JSON 32 KiB; nome/WhatsApp/email; contact_consent separado de consent de tracking; honeypot; marketing_leads + alvo + ingresso |
| /api/public/store/cart | GET anonimo com bearer token UUID | slug -> clinica; token de sessao/recuperacao sempre filtrado pelo tenant | UUID; nao retorna carrinho terminal; cart_read + public_read; no-store |
| /api/public/store/cart | POST anonimo com token UUID | slug -> clinica; produtos ativos/publicados pertencentes a ela | JSON 32 KiB; ate 50 itens; quantidade inteira 1..99; metadata allowlist; cart_write + ingresso |
| createPublicBookingAction em /c/[slug]/actions.js | POST publico / CSRF nativo Next | slug -> clinica ativa; professional/procedures scoped; RPC F0B valida ownership novamente | FormData 48 KiB de valores, ate 100 campos; campos individuais; UUID; grade de 30 min do expediente; data futura; LGPD; honeypot; booking_create + alvo |
| createPublicLeadAction no mesmo arquivo | POST publico / CSRF Next | slug -> clinica; contato buscado por igualdade e tenant, nao ilike | FormData bounded; nome/telefone/email; mensagem 1200; honeypot; clinic_lead_create + alvo |
| createPublicStoreOrderAction em /c/[slug]/store-actions.js | POST publico / CSRF Next | slug -> clinica; produtos/cliente scoped; RPC de pedido valida estoque e tenant | FormData bounded; 50 produtos UUID unicos; quantidade inteira; entrega e pagamento permitidos; LGPD; honeypot; store_order_create + alvo |
| /cadastro, signUpAction | GET publico / POST publico | Supabase Auth cria usuario; clinica so no onboarding autenticado | FormData bounded; validacao de cadastro existente; honeypot; signup + alvo; ingresso |
| /login e /login-cliente, signInAction | GET/POST publico | sessao Supabase, tenant posterior ao login | FormData bounded; login + alvo; credencial invalida generica; demo passa pelo controle antes do reset |
| /login/recuperar-senha e /login-cliente/recuperar-senha | GET/POST publico | email alvo; nao permite escolher tenant | FormData bounded; honeypot; password_recovery + alvo; resposta generica inclusive falha do envio |
| /login/nova-senha e /login-cliente/nova-senha | GET e POST com sessao recuperada | usuario validado server-side; regra admin/cliente preservada | FormData bounded; autenticacao existente; ingresso POST |
| /auth/confirm | GET com token hash email | usuario retornado por verifyOtp; destino confiavel | token ate 512, tipo email; auth_exchange; token de uso unico gerenciado pelo Auth |
| /auth/callback | GET com code PKCE | sessao do code; safeInternalNext | URL 4 KiB; auth_exchange; troca Supabase; erro publico generico |
| /auth/recovery | GET publico, bridge para sessao de recuperacao | token verificado pelo Supabase SDK, nao tenant do query | safeInternalNext; permanece no contrato Auth existente; throttling nativo Supabase deve estar habilitado |
| /auth/leave-demo | GET; verifica usuario | somente encerra sessao demo ou redireciona sessao atual | next interno seguro; sem criacao de dados; sem limiter novo dedicado |
| /demo | GET publico com efeito de reset/login demo | identidade demo exclusivamente server-side | demo_access antes de reset; erro sem objeto/secret |
| /api/demo/reset | POST com sessao demo | usuario deve ser demo | demo_access antes do reset; nenhuma alteracao no mecanismo DR/restore |
| /c/[slug], /c/[slug]/agendamento | GET publico | clinica publicada por slug | public_read no Proxy; formulario protegido separadamente; informacao publicada nao privada |
| /c/[slug]/loja, /c/[slug]/checkout | GET publico | slug / produtos publicados | public_read; POST protegido na action; carrinho no browser sem autoridade sobre precos |
| /c/[slug]/pedido/[token] | GET bearer UUID | slug + token_publico + clinica_id | forma valida antes de consulta; order_read; notFound generico no bloqueio/inexistencia; force-dynamic, noindex, no-referrer |
| /c/[slug]/favicon | GET publico | slug -> configuracao publica | leitura publica via Proxy; redireciona favicon publicado; nao cria dados |
| Dominio proprio /, /agendamento, /loja, /checkout, /pedido/... | GET/POST conforme superficie | rewrite existente para /c/[slug]; as actions resolvem slug e escopam os recursos | barreiras de ingresso; nao alterada a arquitetura de dominios |
| /api/webhooks/asaas | POST com webhook token | token global/clinica e recurso do provider; verificacao existente preservada | webhook_auth antes da busca de token; JSON 128 KiB; nenhum cambio no provider/cobranca |
| /api/webhooks/infinitepay | POST publico com verificacao externa obrigatoria | referencia agendamento:UUID ou loja:UUID -> recurso/tenant | webhook_verify; JSON 32 KiB; nao revela matched; falha generica; verificacao real do pagamento preservada |
| /api/webhooks/meta/whatsapp | GET challenge / POST assinatura Meta | app/conexao conforme implementacao WhatsApp existente | inventariado, NAO ALTERADO por exclusao explicita de escopo |
| /api/whatsapp/payment/[token] | GET com token opaco | token -> job/booking/tenant existente | expiracao/validacao existente; link/pagamento WhatsApp NAO ALTERADO |
| /api/whatsapp/embedded-signup/{start,start-top-level,callback,status} | POST/GET com sessao, membership e role | tenant autenticado | META-05/rollback preservados; NAO ALTERADO |
| /api/whatsapp/embedded-signup/broker/{callback,telemetry}, /whatsapp/connect | POST/GET com state/sessao broker | validacao broker existente | arquivos historicos mantidos fora do caminho ativo; NAO ALTERADO |
| /api/cron/{automations,finance-recurring,meta-capi,notifications,store-expirations} | handlers com CRON_SECRET | jobs/recursos server-side | nao sao escrita anonima autorizada; scheduler/DR/WhatsApp NAO ALTERADOS |
| /, /estetica, /termos, /privacidade, /exclusao-de-dados | GET publico | sem clinica privada | conteudo publico; / tem public_read; formularios/trackers usam entradas listadas acima |
| robots.txt, sitemap.xml, opengraph-image, assets | GET publico | publicacao de conteudo | sem escrita de usuario, nao sujeitos a limite restritivo de formularios |
| /onboarding, /dashboard/*, /admin/* e /dashboard-admin/* | sessao / membership / role | usuario e clinica server-side | fora de escrita anonima; nenhuma mudanca de regras funcionais; Proxy preserva refresh de sessao |

### Persistencia, efeitos externos e risco
| Grupo | Registros/efeitos | Idempotencia | Custo, enumeracao e spam residual |
|---|---|---|---|
| Disponibilidade/site | SELECT; site pode consultar Places com cache 21600s | leitura | cardinalidade de profissionais/agenda ainda depende do tenant; clinicas publicadas sao enumeraveis por natureza |
| Analytics clinica | eventos_analiticos | chave de sessao/evento/path existente; conflito ignorado | eventos browser nao sao prova de conversao financeira; limite por IP/tenant, nao autenticacao de humano |
| Marketing events | clinica_marketing_eventos; ViewContent CAPI quando permitido | contrato Meta/event_id preservado | metadata allowlist, paths sem query; eventos publicos podem ser sintetizados por atacante abaixo do limite |
| Marketing leads | clinica_marketing_leads, eventos e fila CAPI existente | contrato event_id preservado; criacao de lead nao tem exactly-once novo | tres por janela/alvo; contact_consent continua independente de marketing |
| Booking | cliente, agendamento, site_agendamentos_publicos, financeiro/outbox F0B; gateway, CRM, email/WhatsApp existentes | agenda_booking_operations e RPC atomica; apenas vencedor executa provider | mesma chave nao repete cobranca/notify; falha ambigua exige conciliacao, nao retry cego |
| Lead da clinica | contato e oportunidade CRM/evento | lookup de contato por igualdade; identificador_externo de lead se UUID | CRM/contatos ainda podem repetir com novas chaves ou corrida; protegido por rate limit, nao declarado exactly-once |
| Cart | upsert carrinhos_abandonados_clinica; recuperacao atualiza status | clinica_id + sessao_token | token e uma capability; nao revela contato em GET; nao equivale a login do titular |
| Pedido | cliente, pedido, reserva/itens, gateway | indice unico tenant + checkout_request_id permanente, inclusive cancelado | concorrencia aborta pedido perdedor antes do gateway; criacao previa de contato pode competir; token publico exige cuidado |
| Signup/login/recovery | Supabase Auth, eventos; email Auth; demo pode resetar | tokens de Auth existentes | resposta recovery uniforme; Supabase direto exige limites nativos; grupos atras de NAT dividem quota IP |
| Webhooks | financeiro/pedido/booking/outbox existentes | idempotencia de dominio existente preservada | verificacao de pagamento ainda pode custar chamada externa; limite por ingress IP deve ser calibrado para rajadas legitimas |
| Auth callbacks | troca/verificacao de token e cookies | uso unico/PKCE Auth | sem retorno de dados de outro tenant; callbacks nao sao geradores de cobranca |
| Demo | reset/logon da demo e evento | mecanismo demo existente | custo alto limitado; conta demo nao da acesso a outra clinica |

## Arquitetura e politicas
Arquivos: src/lib/security/public-antiabuse-core.mjs, public-antiabuse-runtime.mjs, public-antiabuse.js.
Sem dependencia nova e sem contador em memoria do processo.
RPC atomica consume_public_rate_limit executada exclusivamente com service_role. Tabela com RLS e sem grants anon/authenticated.

Chave: categoria/rota + tenant resolvido + HMAC do IP (ou do alvo normalizado) + janela fixa.
HMAC-SHA256, sem IP puro nos buckets/logs do limiter. IPv6 normalizado por /64 e IPv4-mapped convertido a IPv4.
Na Vercel, usa x-vercel-forwarded-for e fallback x-forwarded-for unitario, conforme contrato de ingress da plataforma; nao usa client-ip, Forwarded ou x-real-ip arbitrario.
Self-hosted so confia em XFF se PUBLIC_RATE_LIMIT_TRUST_PROXY=1, que exige proxy real sobrescrevendo o header; nao ativar em origem exposta.
Sem ingress atestado, usa bucket "unknown" compartilhado: falha conservadora, nao IP inventado pelo usuario.
Referencia de ingress: https://vercel.com/docs/headers/request-headers

| Politica | Quota IP / janela | Quota alvo | Falha da infraestrutura |
|---|---:|---:|---|
| public_read | 180 / 60s | - | open |
| availability | 60 / 60s por clinica | - | open |
| analytics | 120 / 60s por clinica | - | closed |
| marketing_events | 120 / 60s | - | closed |
| marketing_leads | 3 / 120s | 3 | closed |
| cart_read | 60 / 300s por clinica | - | closed |
| cart_write | 120 / 600s por clinica | - | closed |
| booking_create | 6 / 600s por clinica | 3 | closed |
| clinic_lead_create | 6 / 600s por clinica | 3 | closed |
| store_order_create | 5 / 600s por clinica | 3 | closed |
| signup | 5 / 600s | 3 | closed |
| password_recovery | 5 / 900s | 3 | closed |
| login | 10 / 600s | 5 | closed |
| demo_access | 6 / 600s | - | closed |
| order_read | 60 / 300s por slug | - | closed |
| auth_exchange | 15 / 600s | - | closed |
| public_form_ingress | 60 / 600s por host/slug | - | closed |
| webhook_verify | 120 / 60s | - | closed |
| webhook_auth | 240 / 60s | - | closed |

Limite atingido: 429, no-store, Retry-After com segundos ate fim da janela, corpo sem quota/tenant/IP.
Infra indisponivel em writes: 503 e mensagem generica; nas actions, resultado/redirect seguro sem side effect.
Leituras de baixo risco: fail-open documentado. Webhooks falham fechado para incentivar retry do provider, nao reconhecer evento descartado como processado.
Politicas de dominio sao separadas; public_read e ingresso sao barreiras amplas adicionais, nao substitutos do tenant-aware.

## Payload, formularios e privacidade
- JSON lido em streaming com teto real de bytes, mesmo sem Content-Length. Objeto raiz obrigatorio; IDs de tenant/client na raiz recusados.
- FormData: rejeita arquivos, singleton duplicado, campos grandes, mais de 100 campos, e clinica_id/cliente_id/tenant_id; permite lista de procedimentos limitada a 50.
- FormData total de valores/chaves: 48 KiB. POST publico no Proxy: Content-Length acima de 64 KiB retorna 413.
- LIMITACAO: Next global ainda permite bodySizeLimit 60mb para uploads autenticados. Um POST action sem Content-Length so recebe a validacao de 48 KiB depois do parsing pelo framework. Nao foi reduzido o limite global porque quebraria uploads clinicos. Ver pendencias.
- Honeypot Website fora da tela, aria-hidden, tabIndex=-1, autocomplete off; min 800ms quando timestamp existe. Timestamp ausente permite uso sem JS. Nao e assinatura nem substituto do limiter.
- Formularios protegidos: booking, lead clinica, checkout, lead marketing, signup, login, recovery admin/cliente.
- Nao foi adicionado CAPTCHA.
- Metadata analytics da clinica: allowlist; remove emails/telefones obvios, querystrings e caminhos de auth/pedido/token. Marketing: campos comerciais/numericos allowlisted, sem body arbitrario.
- first/last touch, click IDs, consent e contratacao CAPI continuam no normalizador existente; nao foram substituidos pelo consentimento comercial.
- Logs novos de limite: somente scope e codigo seguro. Rejeicao repetida nao loga a cada request (primeiro excesso da janela). Infra indisponivel ainda gera um log por falha; drenagem/amostragem operacional futura pode ser necessaria.
- Erros dos gateways nao sao devolvidos em redirects publicos. Recovery nao devolve erro diferente dependendo da existencia do email.
- Nenhuma alteracao de CORS.

## Idempotencia e comportamento de falha
Booking:
1. Mantem agenda_criar_agendamento_atomico_v2 e operacao F0B.
2. Chave HMAC vinculada ao request UUID + contato + profissional/data/procedimentos (tenant prefixado).
3. Consulta operacao existente antes da verificacao otimista de ocupacao.
4. Resultado idempotente da RPC retorna sem nova cobranca, CRM, tracking ou notificacao.
5. Excecao do provider deixa registro com erro; retry da mesma operacao nao emite segunda cobranca.
Nao existe garantia de recuperacao automatica de efeito externo interrompido: conciliacao e contato com a clinica continuam necessarios. Nao foi inventada transacao distribuida.

Pedido:
1. Chave vinculada ao request UUID (fallback cart UUID) e contato; tenant no indice.
2. Lookup antes de criar; indice unico protege corrida na RPC de estoque.
3. Conflito 23505 busca pedido existente e nunca chama gateway.
4. Mesmo pedido cancelado/estornado permanece ocupando a chave, evitando duplicacao apos erro ambiguo.
5. Nova compra deliberada deve usar novo formulario/chave; nao reutilizar uma chave cancelada para criar outra cobranca.
Nao se afirma idempotencia global para leads/contatos/metricas: sao limitados, com os contratos existentes preservados.

## Migration, TTL e performance
Nova migration: supabase/migrations/20260912100000_public_antiabuse_rate_limits.sql.
- public.public_rate_limit_buckets com PK scope/tenant_key/subject_hash/window_start.
- indice expires_at; RPC service_role only; validacao de argumentos; contador satura sem overflow.
- expiracao logica em duas janelas; cleanup oportunista em 2% das chamadas, ate 500 registros por rodada, FOR UPDATE SKIP LOCKED.
- Nao ha job remoto novo. Em repouso, linhas expiradas podem permanecer ate novas chamadas; nao ha crescimento sem trafego. Em uso constante a capacidade media de limpeza supera a criacao por RPC, mas NAO e SLA de retencao.
- pedidos_clinica_checkout_request_active_uidx: nome mantido da implementacao local inicial, mas condicao final NAO exclui cancelados. Registros historicos sem chave nao sao afetados.
- Ate duas RPCs por action de escrita (IP + alvo), mais ingresso do Proxy quando aplicavel. Nao ha varredura COUNT na tabela de leads/signup para decidir limite.
- Contencao localizada no mesmo bucket; tenants diferentes usam PKs diferentes. Periodo fixo permite rajada nos dois lados da fronteira (ate duas quotas).
- 10/100/1000/3000 clinicas: numero de clinicas nao define carga sozinho; dimensionar pela taxa e diversidade de IPs/rotas. Nao foi feito benchmark que comprove capacidade para 3000 clinicas. Ataque distribuido exige defesa de borda/capacidade.
- Nenhuma migration historica foi alterada.

## Testes adicionados
tests/public-antiabuse.test.mjs (20): quota, 429/Retry-After, independencia tenant/rota/IP, hash sem IP puro, fail-open/closed, honeypot, validadores, contratos F0B/checkout.
tests/public-antiabuse-actions.test.mjs (20): executa codigo real com imports substituidos por mocks controlados:
- booking permitido, bloqueado, payload/honeypot, spoofing, off-grid;
- retry sequencial/concorrente, falha ambigua, uma cobranca/notificacao;
- checkout normal, retry/concorrencia/cancelamento, quantidade invalida;
- JSON streaming, falta de secret, trusted ingress e equivalencia IPv6;
- analytics HTTP 429/413/400, metadata sem PII;
- recovery generica e Proxy rejeitando body gigante antes da sessao.
supabase/tests/public_antiabuse.test.sql (16): tabela/RPC/RLS/grants, contagem real, tenant/rota independentes, rejeicao IP puro, Retry-After, chave unica mesmo apos cancelamento.
F0A/F0B executados sem mudancas nos arquivos historicos.
Mocks de concorrencia JS verificam o contrato do vencedor/perdedor; unicidade real e testada no SQL. Nao foi realizado teste de carga de rede concorrente.

## Arquivos alterados nesta tarefa
- src/proxy.js
- src/app/api/public/availability/route.js
- src/app/api/public/analytics/route.js
- src/app/api/public/marketing-events/route.js
- src/app/api/public/marketing-leads/route.js
- src/app/api/public/store/cart/route.js
- src/app/api/webhooks/asaas/route.js
- src/app/api/webhooks/infinitepay/route.js
- src/app/api/demo/reset/route.js
- src/app/auth/callback/route.js
- src/app/auth/confirm/route.js
- src/app/demo/route.js
- src/app/c/[slug]/actions.js
- src/app/c/[slug]/store-actions.js
- src/app/c/[slug]/booking-form.js
- src/app/c/[slug]/lead-form.js
- src/app/c/[slug]/checkout/checkout-client.js
- src/app/c/[slug]/pedido/[token]/page.js
- src/app/cadastro/actions.js
- src/app/cadastro/cadastro-form.js
- src/app/login/actions.js
- src/app/login/login-form.js
- src/app/login/password-reset-form.js
- src/app/login-cliente/password-reset-form.js
- src/components/marketing/lead-capture-form.js
- docs/AUDIT-01-2026-09-11.md (adendo, nao substitui evidencia historica)

## Arquivos criados
- src/lib/security/public-antiabuse-core.mjs
- src/lib/security/public-antiabuse-runtime.mjs
- src/lib/security/public-antiabuse.js
- src/components/public-site/public-form-guard.js
- supabase/migrations/20260912100000_public_antiabuse_rate_limits.sql
- supabase/tests/public_antiabuse.test.sql
- tests/public-antiabuse.test.mjs
- tests/public-antiabuse-actions.test.mjs
- docs/PUBLIC-HARDEN-01-ANTIABUSE-2026-09-12.md

Nao pertencem a esta tarefa, embora aparecam no working tree: docs/F0-C-CLOSURE-2026-09-11.md, docs/database-migration-runbook.md, docs/F0C-CLOSE-03-DISASTER-RECOVERY-2026-09-11.md, docs/disaster-recovery-runbook.md, scripts/dr/, tests/disaster-recovery-safety.test.mjs.

## Rollout recomendado (NAO executado)
1. Revisar este diff isolando alteracoes DR preexistentes; sem descartar nenhuma delas.
2. Configurar privadamente em staging um PUBLIC_RATE_LIMIT_SECRET forte e estavel. Fallbacks existentes: LEAD_HASH_SALT, SIGNUP_HASH_SALT, CLINIC_SECRETS_KEY, nessa ordem. Nenhum valor remoto foi consultado/divulgado/alterado nesta tarefa; smoke usou secret ficticio apenas no processo local.
3. Nao mudar a fonte/valor do secret casualmente apos publicar: ele tambem participa das chaves de retry; rotacao requer plano de compatibilidade.
4. Aplicar apenas a nova migration em staging, com autorizacao explicita e Project Ref validado. Depois publicar codigo. Nunca publicar writes fail-closed antes da RPC existir.
5. Testar staging em browser real: reserva, calendario, carrinho, pedido, retry/reload, recovery, respostas 429, consentimentos e retornos. Gateways em ambiente de teste/mocks.
6. Validar contrato de ingress Vercel, limites nativos Supabase Auth, rajadas de webhook e usuario compartilhando IP (NAT).
7. Medir latencia/locks/cardinalidade e limpeza sob carga antes de ampliar.
8. Production exige nova autorizacao; nao ha comandos de push/deploy executados aqui.

Rollback: reverter somente o changeset de codigo desta tarefa em um novo commit autorizado, nao reset global. Manter tabela/RPC/indice inertes; nao apagar dados e nao editar migration aplicada. Reverter o indice de idempotencia nao e necessario para rollback do codigo e remove uma protecao.

## Pendencias para CLOSED sem ressalvas
- Homologacao HTTP/browser real em staging e calibracao da quota por IP/provider; nao inventar evidencia remota.
- Barreira de bytes ANTES do parsing de Server Actions sem Content-Length, sem reduzir o limite de upload autenticado; manter como risco residual de consumo de recursos.
- Verificar limites nativos do endpoint Supabase Auth direto (anon key publica): o limiter da aplicacao nao substitui esse controle.
- Benchmark e observacao da limpeza oportunista/retencao; nao declarar capacidade 3000 tenants sem medicao.
- Carrinho/lead/contato nao receberam transacao exactly-once nova. Carrinho terminal pode ser reativado pelo holder da sessao no POST existente, sem criar cobranca por si; revisao de lifecycle fica documentada.
- Eventos anonimos de tracking continuam sendo dados nao confiaveis de browser. Limite reduz spam, nao comprova humanidade.
- WhatsApp e DR expressamente fora do escopo.

## Validacao final
Lint PASS (exit 0); git diff --check PASS; npm test 461/461 PASS; build isolado PASS; pgTAP 69/69 PASS; fresh local 56/56 migrations. Smoke HTTP local concluido e servidor temporario encerrado. Working tree intencionalmente sujo, sem commit/push. Nenhum ambiente remoto alterado.
