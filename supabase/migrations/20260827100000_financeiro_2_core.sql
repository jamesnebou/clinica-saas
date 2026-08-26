begin;

-- Financeiro 2.0: motor gerencial canônico, aditivo e compatível com o legado.
create or replace function app_private.finance_usuario_pode_gerir(p_clinica_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select current_setting('request.jwt.claim.role', true) = 'service_role' or exists (
    select 1 from public.usuarios_clinica uc
    where uc.clinica_id = p_clinica_id and uc.ativo
      and (uc.user_id = auth.uid() or lower(uc.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
      and (uc.papel in ('owner','admin','financeiro') or coalesce(uc.permissoes -> 'secoes', '[]'::jsonb) ? 'financeiro')
  );
$$;

create or replace function app_private.finance_usuario_configura(p_clinica_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select current_setting('request.jwt.claim.role', true) = 'service_role' or exists (
    select 1 from public.usuarios_clinica uc
    where uc.clinica_id = p_clinica_id and uc.ativo and uc.papel in ('owner','admin')
      and (uc.user_id = auth.uid() or lower(uc.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  );
$$;
grant execute on function app_private.finance_usuario_pode_gerir(uuid) to authenticated, service_role;
grant execute on function app_private.finance_usuario_configura(uuid) to authenticated, service_role;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profissionais_clinica_id_id_key') then alter table public.profissionais add constraint profissionais_clinica_id_id_key unique (clinica_id,id); end if;
  if not exists (select 1 from pg_constraint where conname = 'procedimentos_clinica_id_id_key') then alter table public.procedimentos add constraint procedimentos_clinica_id_id_key unique (clinica_id,id); end if;
  if not exists (select 1 from pg_constraint where conname = 'agendamentos_clinica_id_id_key') then alter table public.agendamentos add constraint agendamentos_clinica_id_id_key unique (clinica_id,id); end if;
  if not exists (select 1 from pg_constraint where conname = 'pacotes_clinica_clinica_id_id_key') then alter table public.pacotes_clinica add constraint pacotes_clinica_clinica_id_id_key unique (clinica_id,id); end if;
  if not exists (select 1 from pg_constraint where conname = 'cliente_pacotes_clinica_id_id_key') then alter table public.cliente_pacotes add constraint cliente_pacotes_clinica_id_id_key unique (clinica_id,id); end if;
end $$;

create table public.finance_contas (
  id uuid primary key default gen_random_uuid(), clinica_id uuid not null references public.clinicas(id) on delete cascade,
  nome text not null, tipo text not null check (tipo in ('caixa','banco','carteira_digital','gateway','recebiveis','outro')),
  instituicao text, saldo_inicial numeric(14,2) not null default 0, data_saldo_inicial date not null default current_date,
  ativa boolean not null default true, padrao boolean not null default false, provider text,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (clinica_id,id)
);
create unique index finance_contas_padrao_idx on public.finance_contas(clinica_id) where padrao and ativa;
create index finance_contas_ativas_idx on public.finance_contas(clinica_id,ativa,nome);

create table public.finance_categorias (
  id uuid primary key default gen_random_uuid(), clinica_id uuid not null references public.clinicas(id) on delete cascade, parent_id uuid,
  nome text not null, tipo text not null check (tipo in ('receita','deducao','custo_variavel','despesa','outra_receita','outra_despesa','transferencia')),
  grupo_dre text not null check (grupo_dre in ('receita_bruta','deducoes','custos_variaveis','despesas_operacionais','outras_receitas','outras_despesas','nao_dre')),
  codigo text, ativa boolean not null default true, sistema boolean not null default false, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (clinica_id,id), unique (clinica_id,codigo),
  foreign key (clinica_id,parent_id) references public.finance_categorias(clinica_id,id) on delete restrict
);
create index finance_categorias_tipo_idx on public.finance_categorias(clinica_id,tipo,ativa);

create table public.finance_centros_custo (
  id uuid primary key default gen_random_uuid(), clinica_id uuid not null references public.clinicas(id) on delete cascade,
  nome text not null, codigo text, ativo boolean not null default true, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (clinica_id,id), unique (clinica_id,codigo)
);

create table public.finance_fornecedores (
  id uuid primary key default gen_random_uuid(), clinica_id uuid not null references public.clinicas(id) on delete cascade,
  nome text not null, documento text, telefone text, email text, observacoes text, ativo boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (clinica_id,id)
);
create index finance_fornecedores_nome_idx on public.finance_fornecedores(clinica_id,nome);

create table public.finance_recebiveis (
  id uuid primary key default gen_random_uuid(), clinica_id uuid not null references public.clinicas(id) on delete cascade,
  cliente_id uuid, profissional_id uuid, procedimento_id uuid, agendamento_id uuid, pedido_id uuid, cliente_pacote_id uuid,
  categoria_id uuid, centro_custo_id uuid, descricao text not null, origem_tipo text not null, origem_id text not null,
  valor_original numeric(14,2) not null check (valor_original >= 0), desconto numeric(14,2) not null default 0 check (desconto >= 0),
  acrescimo numeric(14,2) not null default 0 check (acrescimo >= 0), juros numeric(14,2) not null default 0 check (juros >= 0),
  multa numeric(14,2) not null default 0 check (multa >= 0),
  valor_total numeric(14,2) generated always as (greatest(0,valor_original-desconto+acrescimo+juros+multa)) stored,
  valor_recebido numeric(14,2) not null default 0 check (valor_recebido >= 0), emissao date not null default current_date,
  competencia date not null default date_trunc('month',current_date)::date, vencimento date,
  status text not null default 'aberto' check (status in ('aberto','parcial','pago','cancelado','renegociado','estornado')),
  forma_pagamento text, provider text, provider_reference text, observacoes text, metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (clinica_id,id), unique (clinica_id,origem_tipo,origem_id),
  foreign key (clinica_id,cliente_id) references public.clientes(clinica_id,id) on delete restrict,
  foreign key (clinica_id,profissional_id) references public.profissionais(clinica_id,id) on delete restrict,
  foreign key (clinica_id,procedimento_id) references public.procedimentos(clinica_id,id) on delete restrict,
  foreign key (clinica_id,agendamento_id) references public.agendamentos(clinica_id,id) on delete restrict,
  foreign key (clinica_id,pedido_id) references public.pedidos_clinica(clinica_id,id) on delete restrict,
  foreign key (clinica_id,cliente_pacote_id) references public.cliente_pacotes(clinica_id,id) on delete restrict,
  foreign key (clinica_id,categoria_id) references public.finance_categorias(clinica_id,id) on delete restrict,
  foreign key (clinica_id,centro_custo_id) references public.finance_centros_custo(clinica_id,id) on delete restrict,
  check (valor_recebido <= greatest(0,valor_original-desconto+acrescimo+juros+multa))
);
create index finance_recebiveis_status_idx on public.finance_recebiveis(clinica_id,status,vencimento);
create index finance_recebiveis_competencia_idx on public.finance_recebiveis(clinica_id,competencia);
create index finance_recebiveis_cliente_idx on public.finance_recebiveis(clinica_id,cliente_id,vencimento);
create unique index finance_recebiveis_provider_idx on public.finance_recebiveis(clinica_id,provider,provider_reference) where provider_reference is not null;

create table public.finance_recebivel_parcelas (
  id uuid primary key default gen_random_uuid(), clinica_id uuid not null references public.clinicas(id) on delete cascade,
  recebivel_id uuid not null, numero integer not null check (numero > 0), vencimento date not null, valor numeric(14,2) not null check (valor > 0),
  valor_liquidado numeric(14,2) not null default 0 check (valor_liquidado >= 0),
  status text not null default 'aberto' check (status in ('aberto','parcial','pago','cancelado','estornado')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (clinica_id,id), unique (recebivel_id,numero),
  foreign key (clinica_id,recebivel_id) references public.finance_recebiveis(clinica_id,id) on delete cascade, check (valor_liquidado <= valor)
);

create table public.finance_pagaveis (
  id uuid primary key default gen_random_uuid(), clinica_id uuid not null references public.clinicas(id) on delete cascade,
  fornecedor_id uuid, categoria_id uuid, centro_custo_id uuid, descricao text not null, origem_tipo text not null default 'manual', origem_id text not null,
  valor_original numeric(14,2) not null check (valor_original >= 0), desconto numeric(14,2) not null default 0 check (desconto >= 0),
  juros numeric(14,2) not null default 0 check (juros >= 0), multa numeric(14,2) not null default 0 check (multa >= 0),
  valor_total numeric(14,2) generated always as (greatest(0,valor_original-desconto+juros+multa)) stored,
  valor_pago numeric(14,2) not null default 0 check (valor_pago >= 0), emissao date not null default current_date,
  competencia date not null default date_trunc('month',current_date)::date, vencimento date,
  status text not null default 'aberto' check (status in ('aberto','parcial','pago','cancelado','estornado')),
  observacoes text, metadata jsonb not null default '{}'::jsonb, created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (clinica_id,id), unique (clinica_id,origem_tipo,origem_id),
  foreign key (clinica_id,fornecedor_id) references public.finance_fornecedores(clinica_id,id) on delete restrict,
  foreign key (clinica_id,categoria_id) references public.finance_categorias(clinica_id,id) on delete restrict,
  foreign key (clinica_id,centro_custo_id) references public.finance_centros_custo(clinica_id,id) on delete restrict,
  check (valor_pago <= greatest(0,valor_original-desconto+juros+multa))
);
create index finance_pagaveis_status_idx on public.finance_pagaveis(clinica_id,status,vencimento);
create index finance_pagaveis_competencia_idx on public.finance_pagaveis(clinica_id,competencia);

create table public.finance_pagavel_parcelas (
  id uuid primary key default gen_random_uuid(), clinica_id uuid not null references public.clinicas(id) on delete cascade,
  pagavel_id uuid not null, numero integer not null check (numero > 0), vencimento date not null, valor numeric(14,2) not null check (valor > 0),
  valor_liquidado numeric(14,2) not null default 0 check (valor_liquidado >= 0), status text not null default 'aberto' check (status in ('aberto','parcial','pago','cancelado','estornado')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (clinica_id,id), unique (pagavel_id,numero),
  foreign key (clinica_id,pagavel_id) references public.finance_pagaveis(clinica_id,id) on delete cascade, check (valor_liquidado <= valor)
);

create table public.finance_liquidacoes (
  id uuid primary key default gen_random_uuid(), clinica_id uuid not null references public.clinicas(id) on delete cascade,
  recebivel_id uuid, pagavel_id uuid, conta_financeira_id uuid not null,
  tipo text not null check (tipo in ('recebimento','pagamento','estorno_recebimento','estorno_pagamento')),
  valor_bruto numeric(14,2) not null check (valor_bruto > 0), taxa numeric(14,2) not null default 0 check (taxa >= 0),
  desconto numeric(14,2) not null default 0 check (desconto >= 0), valor_liquido numeric(14,2) not null,
  forma_pagamento text, data_liquidacao timestamptz not null default now(), provider text, provider_reference text,
  idempotency_key text not null, reversao_de_id uuid, conciliado boolean not null default false, metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), unique (clinica_id,id), unique (clinica_id,idempotency_key),
  foreign key (clinica_id,recebivel_id) references public.finance_recebiveis(clinica_id,id) on delete restrict,
  foreign key (clinica_id,pagavel_id) references public.finance_pagaveis(clinica_id,id) on delete restrict,
  foreign key (clinica_id,conta_financeira_id) references public.finance_contas(clinica_id,id) on delete restrict,
  foreign key (clinica_id,reversao_de_id) references public.finance_liquidacoes(clinica_id,id) on delete restrict,
  check ((recebivel_id is not null)::integer + (pagavel_id is not null)::integer = 1)
);
create unique index finance_liquidacoes_provider_idx on public.finance_liquidacoes(clinica_id,provider,provider_reference) where provider_reference is not null and tipo in ('recebimento','pagamento');
create index finance_liquidacoes_data_idx on public.finance_liquidacoes(clinica_id,data_liquidacao desc);

create table public.finance_liquidacao_parcelas (
  id uuid primary key default gen_random_uuid(), clinica_id uuid not null references public.clinicas(id) on delete cascade,
  liquidacao_id uuid not null, recebivel_parcela_id uuid, pagavel_parcela_id uuid, valor numeric(14,2) not null check (valor > 0),
  created_at timestamptz not null default now(), unique (clinica_id,id),
  foreign key (clinica_id,liquidacao_id) references public.finance_liquidacoes(clinica_id,id) on delete restrict,
  foreign key (clinica_id,recebivel_parcela_id) references public.finance_recebivel_parcelas(clinica_id,id) on delete restrict,
  foreign key (clinica_id,pagavel_parcela_id) references public.finance_pagavel_parcelas(clinica_id,id) on delete restrict,
  check ((recebivel_parcela_id is not null)::integer + (pagavel_parcela_id is not null)::integer = 1)
);
create index finance_liquidacao_parcelas_liquidacao_idx on public.finance_liquidacao_parcelas(clinica_id,liquidacao_id);

create table public.finance_movimentos (
  id uuid primary key default gen_random_uuid(), clinica_id uuid not null references public.clinicas(id) on delete cascade,
  conta_financeira_id uuid not null, categoria_id uuid, centro_custo_id uuid, liquidacao_id uuid,
  tipo text not null check (tipo in ('entrada','saida','transferencia_entrada','transferencia_saida','ajuste_entrada','ajuste_saida','estorno')),
  origem_tipo text not null, origem_id text not null, descricao text not null,
  valor_bruto numeric(14,2) not null check (valor_bruto >= 0), taxa numeric(14,2) not null default 0 check (taxa >= 0),
  desconto numeric(14,2) not null default 0 check (desconto >= 0), valor_liquido numeric(14,2) not null,
  data_movimento timestamptz not null default now(), competencia date not null default date_trunc('month',current_date)::date,
  provider text, provider_reference text, conciliado boolean not null default false, metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(),
  unique (clinica_id,id), unique (clinica_id,origem_tipo,origem_id,tipo),
  foreign key (clinica_id,conta_financeira_id) references public.finance_contas(clinica_id,id) on delete restrict,
  foreign key (clinica_id,categoria_id) references public.finance_categorias(clinica_id,id) on delete restrict,
  foreign key (clinica_id,centro_custo_id) references public.finance_centros_custo(clinica_id,id) on delete restrict,
  foreign key (clinica_id,liquidacao_id) references public.finance_liquidacoes(clinica_id,id) on delete restrict
);
create index finance_movimentos_extrato_idx on public.finance_movimentos(clinica_id,conta_financeira_id,data_movimento desc);
create index finance_movimentos_competencia_idx on public.finance_movimentos(clinica_id,competencia,categoria_id);

create table public.finance_transferencias (
  id uuid primary key default gen_random_uuid(), clinica_id uuid not null references public.clinicas(id) on delete cascade,
  conta_origem_id uuid not null, conta_destino_id uuid not null, movimento_saida_id uuid, movimento_entrada_id uuid,
  valor numeric(14,2) not null check (valor > 0), data_transferencia timestamptz not null default now(),
  descricao text, idempotency_key text not null, metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(),
  unique (clinica_id,id), unique (clinica_id,idempotency_key),
  foreign key (clinica_id,conta_origem_id) references public.finance_contas(clinica_id,id) on delete restrict,
  foreign key (clinica_id,conta_destino_id) references public.finance_contas(clinica_id,id) on delete restrict,
  foreign key (clinica_id,movimento_saida_id) references public.finance_movimentos(clinica_id,id) on delete restrict,
  foreign key (clinica_id,movimento_entrada_id) references public.finance_movimentos(clinica_id,id) on delete restrict,
  check (conta_origem_id <> conta_destino_id)
);

create table public.finance_comissao_regras (
  id uuid primary key default gen_random_uuid(), clinica_id uuid not null references public.clinicas(id) on delete cascade,
  profissional_id uuid, procedimento_id uuid, tipo text not null default 'percentual' check (tipo in ('percentual','fixo')),
  percentual numeric(7,4) not null default 0 check (percentual between 0 and 100), valor_fixo numeric(14,2) not null default 0 check (valor_fixo >= 0),
  base_calculo text not null default 'recebido_liquido' check (base_calculo in ('recebido_bruto','recebido_liquido','competencia')),
  prioridade integer not null default 0, ativa boolean not null default true, vigencia_inicio date, vigencia_fim date,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (clinica_id,id),
  foreign key (clinica_id,profissional_id) references public.profissionais(clinica_id,id) on delete cascade,
  foreign key (clinica_id,procedimento_id) references public.procedimentos(clinica_id,id) on delete cascade,
  check (vigencia_fim is null or vigencia_inicio is null or vigencia_fim >= vigencia_inicio)
);
create index finance_comissao_regras_busca_idx on public.finance_comissao_regras(clinica_id,profissional_id,procedimento_id,ativa,prioridade desc);

create table public.finance_comissoes (
  id uuid primary key default gen_random_uuid(), clinica_id uuid not null references public.clinicas(id) on delete cascade,
  profissional_id uuid not null, procedimento_id uuid, agendamento_id uuid, recebivel_id uuid, liquidacao_id uuid, regra_id uuid,
  competencia date not null, base_calculo numeric(14,2) not null check (base_calculo >= 0), percentual numeric(7,4) not null default 0,
  valor numeric(14,2) not null check (valor >= 0), status text not null default 'provisionada' check (status in ('provisionada','disponivel','paga','cancelada','estornada')),
  pagavel_id uuid, pago_em timestamptz, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (clinica_id,id),
  foreign key (clinica_id,profissional_id) references public.profissionais(clinica_id,id) on delete restrict,
  foreign key (clinica_id,procedimento_id) references public.procedimentos(clinica_id,id) on delete set null,
  foreign key (clinica_id,agendamento_id) references public.agendamentos(clinica_id,id) on delete set null,
  foreign key (clinica_id,recebivel_id) references public.finance_recebiveis(clinica_id,id) on delete set null,
  foreign key (clinica_id,liquidacao_id) references public.finance_liquidacoes(clinica_id,id) on delete set null,
  foreign key (clinica_id,regra_id) references public.finance_comissao_regras(clinica_id,id) on delete set null,
  foreign key (clinica_id,pagavel_id) references public.finance_pagaveis(clinica_id,id) on delete set null
);
create unique index finance_comissoes_liquidacao_idx on public.finance_comissoes(clinica_id,liquidacao_id,profissional_id) where liquidacao_id is not null and status <> 'estornada';
create index finance_comissoes_periodo_idx on public.finance_comissoes(clinica_id,profissional_id,competencia,status);

create table public.finance_competencias (
  id uuid primary key default gen_random_uuid(), clinica_id uuid not null references public.clinicas(id) on delete cascade,
  categoria_id uuid not null, centro_custo_id uuid, recebivel_id uuid, pagavel_id uuid,
  origem_tipo text not null, origem_id text not null, descricao text not null,
  tipo text not null check (tipo in ('receita','deducao','custo','despesa','outra_receita','outra_despesa')),
  competencia date not null, valor numeric(14,2) not null check (valor >= 0), estornada boolean not null default false,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), unique (clinica_id,id),
  unique (clinica_id,origem_tipo,origem_id,tipo),
  foreign key (clinica_id,categoria_id) references public.finance_categorias(clinica_id,id) on delete restrict,
  foreign key (clinica_id,centro_custo_id) references public.finance_centros_custo(clinica_id,id) on delete restrict,
  foreign key (clinica_id,recebivel_id) references public.finance_recebiveis(clinica_id,id) on delete set null,
  foreign key (clinica_id,pagavel_id) references public.finance_pagaveis(clinica_id,id) on delete set null
);
create index finance_competencias_periodo_idx on public.finance_competencias(clinica_id,competencia,categoria_id);

create table public.finance_recorrencias (
  id uuid primary key default gen_random_uuid(), clinica_id uuid not null references public.clinicas(id) on delete cascade,
  tipo text not null check (tipo in ('receber','pagar')), descricao text not null, fornecedor_id uuid, categoria_id uuid not null,
  centro_custo_id uuid, conta_financeira_id uuid, valor numeric(14,2) not null check (valor > 0),
  periodicidade text not null check (periodicidade in ('semanal','quinzenal','mensal','bimestral','trimestral','semestral','anual')),
  dia_vencimento integer check (dia_vencimento between 1 and 31), proxima_competencia date not null, proximo_vencimento date not null,
  termina_em date, ativa boolean not null default true, ultima_geracao_em timestamptz, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (clinica_id,id),
  foreign key (clinica_id,fornecedor_id) references public.finance_fornecedores(clinica_id,id) on delete restrict,
  foreign key (clinica_id,categoria_id) references public.finance_categorias(clinica_id,id) on delete restrict,
  foreign key (clinica_id,centro_custo_id) references public.finance_centros_custo(clinica_id,id) on delete restrict,
  foreign key (clinica_id,conta_financeira_id) references public.finance_contas(clinica_id,id) on delete restrict
);
create index finance_recorrencias_geracao_idx on public.finance_recorrencias(ativa,proximo_vencimento);

create table public.finance_conciliacoes (
  id uuid primary key default gen_random_uuid(), clinica_id uuid not null references public.clinicas(id) on delete cascade,
  conta_financeira_id uuid, liquidacao_id uuid, movimento_id uuid, provider text not null, provider_reference text not null,
  valor_provider numeric(14,2), data_provider timestamptz, status text not null default 'pendente' check (status in ('pendente','conciliado','divergente','ignorado')),
  conciliado_em timestamptz, conciliado_por uuid references auth.users(id) on delete set null, divergencia text,
  payload_resumo jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (clinica_id,id), unique (clinica_id,provider,provider_reference),
  foreign key (clinica_id,conta_financeira_id) references public.finance_contas(clinica_id,id) on delete restrict,
  foreign key (clinica_id,liquidacao_id) references public.finance_liquidacoes(clinica_id,id) on delete set null,
  foreign key (clinica_id,movimento_id) references public.finance_movimentos(clinica_id,id) on delete set null
);
create index finance_conciliacoes_status_idx on public.finance_conciliacoes(clinica_id,status,created_at desc);

create table public.finance_orcamentos (
  id uuid primary key default gen_random_uuid(), clinica_id uuid not null references public.clinicas(id) on delete cascade,
  categoria_id uuid not null, centro_custo_id uuid, competencia date not null, valor_planejado numeric(14,2) not null check (valor_planejado >= 0),
  observacoes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (clinica_id,id),
  unique (clinica_id,categoria_id,centro_custo_id,competencia),
  foreign key (clinica_id,categoria_id) references public.finance_categorias(clinica_id,id) on delete cascade,
  foreign key (clinica_id,centro_custo_id) references public.finance_centros_custo(clinica_id,id) on delete cascade
);

create table public.finance_configuracoes (
  clinica_id uuid primary key references public.clinicas(id) on delete cascade, regime text not null default 'caixa' check (regime in ('caixa','competencia')),
  dia_fechamento integer not null default 1 check (dia_fechamento between 1 and 28),
  reconhecer_receita_agendamento_em text not null default 'conclusao' check (reconhecer_receita_agendamento_em in ('agendamento','conclusao','recebimento')),
  bloquear_exclusao_com_movimento boolean not null default true, comissao_padrao_percentual numeric(7,4) not null default 0 check (comissao_padrao_percentual between 0 and 100),
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['finance_contas','finance_categorias','finance_centros_custo','finance_fornecedores','finance_recebiveis','finance_recebivel_parcelas','finance_pagaveis','finance_pagavel_parcelas','finance_comissao_regras','finance_comissoes','finance_recorrencias','finance_conciliacoes','finance_orcamentos','finance_configuracoes'] loop
    execute format('drop trigger if exists set_updated_at_%I on public.%I',t,t);
    execute format('create trigger set_updated_at_%I before update on public.%I for each row execute function app_private.set_updated_at()',t,t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['finance_contas','finance_categorias','finance_centros_custo','finance_fornecedores','finance_recebiveis','finance_recebivel_parcelas','finance_pagaveis','finance_pagavel_parcelas','finance_liquidacoes','finance_liquidacao_parcelas','finance_movimentos','finance_transferencias','finance_comissao_regras','finance_comissoes','finance_competencias','finance_recorrencias','finance_conciliacoes','finance_orcamentos','finance_configuracoes'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy %I on public.%I for select to authenticated using (app_private.finance_usuario_pode_gerir(clinica_id))','finance_select_'||t,t);
    execute format('create policy %I on public.%I for insert to authenticated with check (app_private.finance_usuario_pode_gerir(clinica_id))','finance_insert_'||t,t);
    execute format('create policy %I on public.%I for update to authenticated using (app_private.finance_usuario_pode_gerir(clinica_id)) with check (app_private.finance_usuario_pode_gerir(clinica_id))','finance_update_'||t,t);
    execute format('create policy %I on public.%I for delete to authenticated using (app_private.finance_usuario_configura(clinica_id))','finance_delete_'||t,t);
  end loop;
end $$;

grant select,insert,update,delete on public.finance_contas,public.finance_categorias,public.finance_centros_custo,public.finance_fornecedores,
  public.finance_recebiveis,public.finance_recebivel_parcelas,public.finance_pagaveis,public.finance_pagavel_parcelas,
  public.finance_liquidacoes,public.finance_liquidacao_parcelas,public.finance_movimentos,public.finance_transferencias,public.finance_comissao_regras,
  public.finance_comissoes,public.finance_competencias,public.finance_recorrencias,public.finance_conciliacoes,
  public.finance_orcamentos,public.finance_configuracoes to authenticated;
grant all privileges on public.finance_contas,public.finance_categorias,public.finance_centros_custo,public.finance_fornecedores,
  public.finance_recebiveis,public.finance_recebivel_parcelas,public.finance_pagaveis,public.finance_pagavel_parcelas,
  public.finance_liquidacoes,public.finance_liquidacao_parcelas,public.finance_movimentos,public.finance_transferencias,public.finance_comissao_regras,
  public.finance_comissoes,public.finance_competencias,public.finance_recorrencias,public.finance_conciliacoes,
  public.finance_orcamentos,public.finance_configuracoes to service_role;

insert into public.finance_configuracoes(clinica_id) select id from public.clinicas on conflict (clinica_id) do nothing;
insert into public.finance_contas(clinica_id,nome,tipo,padrao)
select id,'Caixa principal','caixa',true from public.clinicas
on conflict do nothing;
insert into public.finance_centros_custo(clinica_id,nome,codigo)
select id,'Clínica','CLINICA' from public.clinicas on conflict (clinica_id,codigo) do nothing;
insert into public.finance_categorias(clinica_id,nome,tipo,grupo_dre,codigo,sistema)
select c.id,v.nome,v.tipo,v.grupo,v.codigo,true from public.clinicas c cross join (values
  ('Receita de serviços','receita','receita_bruta','REC_SERVICOS'),('Receita de pacotes','receita','receita_bruta','REC_PACOTES'),
  ('Venda de produtos','receita','receita_bruta','REC_PRODUTOS'),('Taxas de meios de pagamento','deducao','deducoes','DED_TAXAS'),
  ('Comissões profissionais','custo_variavel','custos_variaveis','CUSTO_COMISSOES'),('Materiais e insumos','custo_variavel','custos_variaveis','CUSTO_INSUMOS'),
  ('Despesas administrativas','despesa','despesas_operacionais','DESP_ADMIN'),('Marketing','despesa','despesas_operacionais','DESP_MARKETING'),
  ('Aluguel e ocupação','despesa','despesas_operacionais','DESP_OCUPACAO'),('Outras receitas','outra_receita','outras_receitas','OUTRAS_RECEITAS'),
  ('Outras despesas','outra_despesa','outras_despesas','OUTRAS_DESPESAS'),('Transferências','transferencia','nao_dre','TRANSFERENCIAS')
) as v(nome,tipo,grupo,codigo) on conflict (clinica_id,codigo) do nothing;

comment on table public.finance_recebiveis is 'Obrigações a receber; agenda apenas origina previsão e não representa caixa.';
comment on table public.finance_movimentos is 'Livro-caixa canônico e imutável por origem; transferências não compõem resultado.';
comment on table public.finance_competencias is 'Fatos de competência usados pela DRE gerencial, separados do caixa.';
comment on table public.finance_conciliacoes is 'Conferência entre liquidações internas e referências de provedores externos.';

commit;
