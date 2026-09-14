# Capturas da galeria do sistema

Pasta usada pela secao "Por dentro da NexaWi", em /odontologia.

Auditoria local de 2026-09-14: os 17 PNGs possuem SHA-256 distintos. Eles podem permanecer como telas independentes sem representar cópias como se fossem módulos diferentes. Substitua qualquer arquivo futuro pela captura correspondente, mantendo exatamente o nome e a extensao .png.

| Aba | Arquivo |
| --- | --- |
| Visão geral | visao-geral.png |
| Inteligência / BI | inteligencia-bi.png |
| Agenda | agenda.png |
| Notificações | notificacoes.png |
| WhatsApp | whatsapp.png |
| Clientes | clientes.png |
| CRM | crm.png |
| Automações | automacoes.png |
| Profissionais | profissionais.png |
| Procedimentos | procedimentos.png |
| Lojinha | lojinha.png |
| Pedidos | pedidos.png |
| Usuários | usuarios.png |
| Configurações | configuracoes.png |
| Financeiro | financeiro.png |
| Assinatura | assinatura.png |
| Tutoriais | tutoriais.png |

## Preparacao das imagens
- Formato: PNG real (nao basta renomear JPG para PNG).
- Proporcao recomendada: aproximadamente 16:9. Referencia atual: 1907 x 1079 pixels.
- Use capturas do sistema com dados ficticios; remova nomes, telefones, prontuarios e credenciais reais.
- Nao corte informacoes importantes: a galeria usa object-fit contain.
- Alvo de peso: ate 700 KB por captura, sem comprometer leitura.
- So a imagem da aba ativa e renderizada; clicar no print abre o arquivo integral.
- Se um arquivo faltar ou falhar ao carregar, a galeria usa o preview original.
- Alteracoes em public precisam acompanhar a proxima publicacao para aparecer no site remoto. Esta tarefa nao fez deploy.

A configuracao de nomes/caminhos esta em src/lib/marketing/product-showcase.mjs. Nao e necessario editar codigo ao substituir PNGs com os mesmos nomes.
