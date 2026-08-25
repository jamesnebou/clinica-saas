# Arquitetura multissegmento

## Princípio

A NexaWi Clínicas possui um único core. `segmentos` descreve o contexto clínico; `planos_sistema` descreve o que foi contratado; `usuarios_clinica` descreve quem pode acessar; `clinica_capability_overrides` aplica exceções explícitas.

## Modelo

- `segmentos`: registro administrado pela plataforma.
- `clinica_segmentos`: vínculo N:N, com um único segmento principal por clínica.
- `src/lib/segments/registry.js`: labels, formulários, KPIs e capabilities padrão.
- `src/lib/segments/service.js`: leitura centralizada e fallback para clínicas legadas.
- `src/lib/domain/segment-core.mjs`: composição pura e testável das capabilities.

O onboarding salva o segmento principal e adicionais. A migration associa clínicas legadas sem vínculo a estética, sem alterar dados operacionais.

## Autorização

O recurso só fica disponível quando:

1. faz sentido para ao menos um segmento;
2. o plano permite, quando o plano possui lista restritiva;
3. o override da clínica não desabilita;
4. o papel ou a permissão personalizada do usuário libera a seção.

Essa ordem evita confundir vertical clínica com precificação comercial.

## Extensão

Para adicionar um segmento:

1. inserir o registro em `segmentos` por migration;
2. incluir a definição no registry;
3. criar capabilities clínicas específicas apenas quando necessário;
4. implementar formulários e módulos atrás da capability;
5. adicionar testes sem criar condições espalhadas pelas páginas.

Multiunidade deve entrar futuramente como dimensão independente (`unidade_id`) em registros e agregações, sem ser modelada como segmento.

