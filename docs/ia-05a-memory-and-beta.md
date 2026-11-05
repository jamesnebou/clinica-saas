# IA-05A: memoria, privacidade e Beta

## Estado implementado

A conversa aberta usa apenas contexto temporario no navegador: assunto, periodo
validado (7 ou 30 dias), rotulo de indicador confirmado e objetivo. O servidor
valida o contrato e recalcula os indicadores a cada consulta. O contexto nao
concede acesso, nao escolhe a clinica e nao e enviado como historico textual ao
modelo. Troca de clinica, sessao, aba ou nova conversa descarta esse estado.

Nao ha historico persistente, metas salvas ou memoria compartilhada nesta
entrega. Referencias sem lastro, como uma recomendacao anterior cujo texto nao
foi preservado, exigem esclarecimento em vez de reconstrucao inventada.

## Contrato proposto para historico persistente

- `ai_conversations`: id, clinica_id, user_id, titulo normalizado, created_at,
  updated_at, expires_at. O titulo nao pode copiar uma pergunta livre.
- `ai_conversation_events`: id, conversation_id, clinica_id, user_id,
  intent enum, periodo enum, foco enum, indicadores agregados permitidos,
  created_at. Nunca armazenar pergunta bruta, resposta de agenda detalhada,
  nome de paciente, prontuario ou texto integral do modelo.
- RLS `SELECT/INSERT/DELETE` vinculada simultaneamente a `auth.uid()` e a uma
  associacao ativa com a clinica; eventos devem herdar o mesmo dono da conversa.
- Excluir conversa e eventos em uma operacao transacional. Expiracao configuravel
  deve apagar ambos e ser testada com identidades ficticias A e B.
- Perguntas com possivel PII devem ser processadas apenas na memoria temporaria
  e nao persistidas. Regex nao constitui anonimizacao suficiente.

Esse desenho requer migration, revisao de policies e testes autenticados A/B
em staging antes de ser implementado ou ativado. Nenhuma migration foi criada
ou aplicada nesta fase.

## Contrato proposto para metas

Metas individuais e metas compartilhadas devem ser entidades separadas,
ligadas a `user_id` e `clinica_id` respectivamente. Apenas valores de categorias
administrativas predefinidas podem ser persistidos. Salvar exige confirmacao
explicita; alterar e apagar devem ser auditaveis. Metas nunca substituem
movimentos financeiros oficiais, e toda comparacao deve recalcular a metrica
operacional atual. Nao persistir textos livres ou dados de pacientes.

## Gate Beta e custos

Em Production, `NEXAWI_AI_BETA_ENABLED` deve ser `true` **e** o `user.id` e
`clinic.id` devem estar nas allowlists server-side separadas. O default e
desligado. Associacao ativa, role owner/admin e entitlement continuam
obrigatorios. Preview conserva o gate Alpha existente. Nenhuma dessas variaveis
de Production e alterada por esta entrega.

Consultas deterministicas nao chamam o AI Gateway. Analises usam no maximo
1200 tokens de saida; continuacoes, 700. O limitador persistente permanece
fail-closed, sem retry automatico. Estimativa por conversa: soma dos tokens de
entrada e saida de cada inferencia multiplicada pelas tarifas vigentes do
modelo, mais custos de infraestrutura. Sem tarifa e uso medidos, nao ha valor
monetario confiavel para registrar.

## Release e rollback

1. Testes locais, build com staging, Preview isolado e inspecao de logs.
2. Smoke autenticado com duas identidades ficticias e verificacao RLS A/B.
3. Revisao de privacidade, custos, rate limit e diff contra main.
4. Somente apos aprovacao explicita, preparar deployment de Production com
   flag desligada. Confirmar Supabase de Production, sem copiar secrets de staging.
5. Ativar Beta apenas para IDs aprovados apos smoke do deployment. Nao liberar
   para todas as clinicas.

Se ocorrer regressao, desativar a flag e retornar ao deployment anterior.
Nao reverter schema automaticamente. Como nao ha persistencia nesta entrega,
nao ha migration de memoria a reverter.
