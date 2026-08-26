# CRM 2.0 - Pipeline

O pipeline padrão é criado automaticamente com as etapas: Novo lead, Contato iniciado, Qualificado, Avaliação agendada, Em negociação, Ganho e Perdido.

Etapas abertas usam `tipo=open`; Ganho e Perdido são terminais. A `semantic_key` preserva o significado interno mesmo se a clínica renomear uma etapa. A tela de configurações permite editar nome, cor, probabilidade e semântica, além de criar etapas, etiquetas e motivos de perda.

O Kanban usa drag-and-drop com mouse, toque e teclado. A interface aplica movimentação otimista e desfaz a alteração se a RPC falhar. Ao mover para Perdido, o motivo é obrigatório. O drawer continua oferecendo o comando explícito de movimentação como fallback acessível.

As métricas consideram as etapas dinâmicas e atividades reais: valor aberto, valor ponderado, ganhos, perdas, conversão, ticket médio, follow-ups vencidos e oportunidades sem próxima ação.
