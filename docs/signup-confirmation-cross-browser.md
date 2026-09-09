# Confirmação de cadastro cross-browser

No Supabase, abra `Authentication > Email Templates > Confirm signup` e substitua somente o link de confirmação pelo padrão abaixo:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email&amp;redirect_to={{ .RedirectTo }}">
  Confirmar cadastro
</a>
```

Configuração esperada em `Authentication > URL Configuration`:

- Site URL: `https://clinicas.nexawi.com.br`
- Redirect URL permitida: `https://clinicas.nexawi.com.br/onboarding`

O endpoint aceita somente `type=email`, verifica o `token_hash` no servidor, grava a sessão em cookies SSR e limita o destino final a `/onboarding`. O plano é reconstruído a partir do metadata autenticado do usuário.

O template de recuperação de senha não deve ser alterado.
