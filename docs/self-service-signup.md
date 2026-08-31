# Cadastro self-service da NexaWi Clínicas

## Funil público

O funil canônico é:

```text
Site -> /cadastro -> Supabase Auth -> /onboarding -> clínica + owner -> /dashboard
```

- `/login-cliente` é exclusivo para entrar em uma conta existente.
- `/cadastro` cria apenas a credencial do proprietário.
- `/onboarding` continua sendo a autoridade para criar a clínica e o vínculo `owner`.
- `/demo` autentica a conta compartilhada e não cria usuário, clínica ou conversão de cadastro.

## Supabase Auth e sessão

O cadastro chama `supabase.auth.signUp()` pelo cliente SSR do servidor. A chave `service_role` nunca é enviada ao navegador e a metadata pública não contém papéis ou permissões.

Metadata permitida no signup:

- `name`;
- `phone` normalizado com código `55`;
- `signup_source = self_service`;
- `selected_plan`;
- atribuição comercial normalizada e identificador da sessão de marketing.

Se o Supabase devolver uma sessão, o usuário segue imediatamente para `/onboarding`. Se a confirmação de e-mail estiver habilitada, a conta é criada sem sessão e a página orienta o usuário a confirmar o endereço.

Para cumprir o onboarding imediato, desabilite **Authentication > Providers > Email > Confirm email** no projeto Supabase. Não use Admin API para confirmar automaticamente usuários públicos.

Em produção, confira também:

- `Site URL`: `https://www.clinicas.nexawi.com.br`;
- Redirect URL: `https://www.clinicas.nexawi.com.br/auth/callback`;
- Redirects dos ambientes de preview que serão homologados.

## Demo

O CTA de contratação da Demo usa:

```text
/auth/leave-demo?next=/cadastro
```

A rota encerra a sessão somente quando o e-mail autenticado é o e-mail reservado da Demo. Usuários normais não são desconectados. O parâmetro `next` aceita apenas caminhos internos.

## Plano selecionado

CTAs de preço usam `/cadastro?plan=<slug>`. A intenção é normalizada, salva na metadata do usuário e depois em `clinicas.metadata.selected_plan_intent`.

O plano técnico inicial da clínica continua `starter` durante o trial. A intenção não cria assinatura, `Subscribe` ou `Purchase`. A tela de assinatura apenas destaca o plano escolhido para revisão.

## Tracking

O fluxo reutiliza Tracking 2.0:

- first-touch e last-touch continuam no `client-attribution`;
- UTMs, `fbclid`, `fbc`, `fbp` e segmento seguem no cadastro e onboarding;
- `signup_started` e `signup_completed` são eventos internos;
- nenhum evento customizado de signup é enviado à Meta;
- `CompleteRegistration` permanece exclusivamente depois da clínica ser criada;
- `Subscribe` e `Purchase` continuam dependentes dos eventos reais de assinatura e pagamento.

## Segurança e abuso

- validação server-side de nome, e-mail, WhatsApp, senha e aceite;
- bloqueio dos e-mails da Demo e dos administradores internos;
- honeypot no formulário;
- limite de cinco tentativas por IP anonimizado em dez minutos;
- rate limit nativo do Supabase como segunda barreira;
- metadata de usuário sem `role`, `internal_admin` ou permissões;
- respostas de recuperação de senha sem confirmar a existência da conta;
- índice incremental em `clinica_marketing_eventos(ip_hash, created_at)`.

Configure `SIGNUP_HASH_SALT` com um valor longo e aleatório. Se estiver vazio, o servidor reutiliza `CLINICA_SECRETS_KEY` para anonimizar o IP.

## Recuperação de senha

- Admin interno: `/login/recuperar-senha` e `/login/nova-senha`.
- Cliente: `/login-cliente/recuperar-senha` e `/login-cliente/nova-senha`.

O reset de cliente recusa a conta Demo e contas administrativas. O callback troca o código por sessão e bloqueia redirecionamentos externos.

## Homologação

1. Aplicar a migration incremental `20260831130000_self_service_signup_rate_limit.sql`.
2. Configurar `SIGNUP_HASH_SALT` na Vercel.
3. Decidir e configurar a política de confirmação de e-mail no Supabase.
4. Conferir Site URL e Redirect URLs do Supabase Auth.
5. Abrir uma janela anônima com UTMs e acessar `/cadastro?plan=growth`.
6. Criar a conta e confirmar o comportamento com ou sem confirmação de e-mail.
7. Verificar nome, telefone e plano no onboarding.
8. Criar a clínica e confirmar o vínculo `owner`.
9. Conferir `CompleteRegistration` somente depois da criação da clínica.
10. Entrar na Demo e usar “Criar minha clínica”; confirmar que somente a sessão Demo foi encerrada.
11. Validar recuperação de senha de cliente e do admin separadamente.
12. Conferir os eventos internos `signup_started` e `signup_completed` no funil administrativo.
