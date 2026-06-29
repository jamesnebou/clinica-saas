"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/app-shell/ui";

const TERMOS = {
  procedimento: {
    titulo: "Termo de consentimento para procedimento estético",
    texto:
      "Declaro que recebi explicações claras sobre o procedimento estético indicado, seus objetivos, benefícios esperados, cuidados necessários antes e depois, possíveis reações, riscos comuns, limitações de resultado e necessidade de retorno. Confirmo que tive oportunidade de esclarecer dúvidas e autorizo a realização do atendimento conforme orientação profissional.",
  },
  imagem: {
    titulo: "Termo de autorização de uso de imagem",
    texto:
      "Autorizo o registro e armazenamento de imagens antes, durante e depois do atendimento para acompanhamento clínico e documentação do prontuário. Caso a clínica utilize imagens para fins de divulgação, essa utilização deverá respeitar a autorização específica definida neste atendimento, preservando a privacidade e a finalidade informada ao cliente.",
  },
  lgpd: {
    titulo: "Termo de consentimento LGPD",
    texto:
      "Autorizo o tratamento dos meus dados pessoais e dados sensíveis relacionados ao atendimento estético pela clínica, incluindo dados cadastrais, informações de saúde, anamnese, registros fotográficos autorizados e histórico de atendimentos, exclusivamente para prestação do serviço, acompanhamento, comunicação, obrigações legais e defesa de direitos.",
  },
  anamnese: {
    titulo: "Termo de veracidade da anamnese",
    texto:
      "Declaro que as informações fornecidas na anamnese são verdadeiras e completas, incluindo histórico de saúde, alergias, medicamentos em uso, procedimentos anteriores, gestação, doenças pré-existentes e demais condições relevantes. Comprometo-me a comunicar qualquer alteração antes de novos atendimentos.",
  },
  outro: {
    titulo: "",
    texto: "",
  },
};

export function ConsentimentoForm({ action, clienteId, clienteNome }) {
  const [tipo, setTipo] = useState("procedimento");
  const [titulo, setTitulo] = useState(TERMOS.procedimento.titulo);
  const [texto, setTexto] = useState(TERMOS.procedimento.texto);

  function handleTipoChange(event) {
    const nextTipo = event.target.value;
    const modelo = TERMOS[nextTipo] || TERMOS.outro;
    setTipo(nextTipo);
    setTitulo(modelo.titulo);
    setTexto(modelo.texto);
  }

  return (
    <form action={action} className="mt-4 space-y-3 rounded-lg bg-white/70 p-3">
      <input type="hidden" name="cliente_id" value={clienteId} />
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Tipo de termo</span>
        <select
          name="tipo"
          value={tipo}
          onChange={handleTipoChange}
          className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-[var(--clinic-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--clinic-primary)_18%,transparent)]"
        >
          <option value="procedimento">Procedimento</option>
          <option value="imagem">Uso de imagem</option>
          <option value="lgpd">LGPD</option>
          <option value="anamnese">Anamnese</option>
          <option value="outro">Outro</option>
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Título</span>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none transition placeholder:text-neutral-400 focus:border-[var(--clinic-primary)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--clinic-primary)_12%,transparent)] focus:ring-0"
          name="titulo"
          value={titulo}
          onChange={(event) => setTitulo(event.target.value)}
          required
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Versão</span>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none transition placeholder:text-neutral-400 focus:border-[var(--clinic-primary)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--clinic-primary)_12%,transparent)] focus:ring-0"
          name="versao"
          defaultValue="v1"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Texto do termo</span>
        <textarea
          className="mt-2 min-h-44 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm leading-6 outline-none transition placeholder:text-neutral-400 focus:border-[var(--clinic-primary)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--clinic-primary)_12%,transparent)] focus:ring-0"
          name="texto"
          value={texto}
          onChange={(event) => setTexto(event.target.value)}
          placeholder={tipo === "outro" ? "Escreva o termo personalizado do zero." : ""}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Aceito por</span>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none transition placeholder:text-neutral-400 focus:border-[var(--clinic-primary)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--clinic-primary)_12%,transparent)] focus:ring-0"
          name="aceito_por_nome"
          defaultValue={clienteNome || ""}
        />
      </label>
      <label className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-700">
        <input className="mt-1" name="aceito" type="checkbox" required />
        Confirmo que o cliente leu/foi informado e aceitou este termo.
      </label>
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Observações do aceite</span>
        <textarea
          className="mt-2 min-h-24 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-neutral-400 focus:border-[var(--clinic-primary)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--clinic-primary)_12%,transparent)] focus:ring-0"
          name="observacoes"
        />
      </label>
      <SubmitButton>Registrar aceite</SubmitButton>
    </form>
  );
}
