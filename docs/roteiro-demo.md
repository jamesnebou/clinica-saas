# Roteiro de apresentacao da demo

## Abertura

Objetivo da demonstracao: mostrar que a clinica consegue operar agenda, cliente, prontuario, financeiro e plano em um unico sistema, com dados reais e controle comercial por assinatura.

Login recomendado:

- URL: `/login-cliente`
- Usuario: `demo@clinicasaas.com.br`
- Senha: definida manualmente no Supabase Auth.

## 1. Agenda

Tela: `/dashboard/agenda`

Mostre:

- visao do dia com atendimentos reais;
- status dos agendamentos: agendado, confirmado, concluido, parcial/pago;
- filtro por profissional;
- resumo do dia com atendimentos, faturamento previsto e faltas;
- botao rapido de WhatsApp para confirmar horario.

Mensagem comercial:

> A agenda nao e so calendario. Ela ja conecta cliente, procedimento, profissional, pagamento previsto e comunicacao rapida.

## 2. Cliente

Tela: `/dashboard/clientes`

Mostre:

- lista de clientes com origem e status;
- busca por cliente;
- abrir `Ana Paula Ribeiro` ou `Mariana Costa`;
- ficha com dados cadastrais, origem, LGPD e retorno recomendado.

Mensagem comercial:

> Cada atendimento vira historico da cliente. A clinica para de depender de papel, WhatsApp perdido ou memoria da recepcao.

## 3. Prontuario

Tela: detalhe do cliente

Mostre:

- observacoes clinicas;
- alergias e contraindicacoes;
- anamnese;
- termos de consentimento com versao e registro de aceite;
- fotos antes/depois com visibilidade restrita.

Cliente sugerido:

- `Ana Paula Ribeiro`: mostra pacote corporal, fotos antes/depois e consentimento de imagem.
- `Mariana Costa`: mostra termo de procedimento e observacoes faciais.

Mensagem comercial:

> O prontuario aumenta valor percebido e reduz risco operacional, porque centraliza consentimento, historico, anamnese e evolucao.

## 4. Financeiro

Tela: `/dashboard/financeiro`

Mostre:

- pagamentos pagos, pendentes e parciais;
- forma de pagamento;
- valor pago por agendamento;
- pacote de sessoes ativo;
- vinculo entre atendimento e receita.

Mensagem comercial:

> A clinica enxerga o dinheiro da agenda. Isso ajuda a recepcao a cobrar, acompanhar pendencias e entender faturamento do dia.

## 5. CRM

Tela: `/dashboard/crm`

Mostre:

- pipeline por etapa;
- origem do lead;
- proxima acao/follow-up;
- WhatsApp rapido;
- conversao para cliente.

Mensagem comercial:

> O CRM organiza o que normalmente fica espalhado no WhatsApp: lead, avaliacao, negociacao, retorno e conversao.

## 6. Plano

Tela: `/dashboard/assinatura`

Mostre:

- plano atual;
- limites de usuarios, profissionais, clientes e agendamentos;
- status da assinatura;
- acao de upgrade;
- mensagem de limite quando o plano e atingido.

Mensagem comercial:

> O produto ja nasce como SaaS: cada clinica tem plano, limite, status comercial e caminho claro para upgrade.

## Fechamento

Resumo sugerido:

> Em poucos minutos vimos o fluxo completo: a clinica agenda, atende, registra prontuario, controla pagamento e sabe em qual plano esta. Esse e o minimo necessario para vender com confianca e evoluir para CRM, automacoes e cobranca integrada.

## Checklist rapido antes de apresentar

- Login demo funcionando.
- Dashboard sem estado vazio.
- Agenda com atendimentos de hoje.
- Cliente com prontuario abrindo.
- Fotos antes/depois visiveis.
- Financeiro com valores.
- Assinatura com plano Growth ativo.
- Layout responsivo testado em largura mobile.
