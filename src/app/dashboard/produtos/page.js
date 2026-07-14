import { PackageOpen, ShoppingBag, Store } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireClinicSection } from "@/lib/auth/session";
import { EmptyClinicState, EmptyState, Field, Notice, PageHeader, SubmitButton, TextArea } from "@/components/app-shell/ui";
import { createProdutoAction, deleteProdutoAction, toggleLojinhaAction, toggleProdutoAction, updateProdutoAction, updateStoreCommerceSettingsAction } from "../actions";
import { getStoreConfig } from "@/lib/store/config";

export const metadata = { title: "Lojinha | NexaWi Clínicas" };

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function stock(value) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function ProductImageUpload({ currentImage = "" }) {
  return (
    <label className="product-upload-field block rounded-xl border border-white/10 bg-black/20 p-4">
      <span className="block text-sm font-bold text-neutral-100">{currentImage ? "Substituir imagem do produto" : "Imagem do produto"}</span>
      <span className="mt-1 block text-xs leading-5 text-neutral-400">
        {currentImage ? "Se não escolher outro arquivo, a imagem atual será mantida." : "Envie uma foto pronta para aparecer no catálogo e na lojinha."}
      </span>
      <input
        className="dashboard-field mt-3 h-auto min-h-12 w-full cursor-pointer rounded-lg border border-white/10 px-2 py-2 text-sm"
        name="imagem_file"
        type="file"
        accept="image/jpeg,image/png,image/webp"
      />
      <span className="mt-2 block text-[11px] font-medium text-neutral-500">JPG, PNG ou WebP · máximo de 10 MB</span>
    </label>
  );
}

export default async function ProdutosPage({ searchParams }) {
  const params = await searchParams;
  const { activeClinic, memberships = [] } = await requireClinicSection("produtos");

  if (!activeClinic) {
    return <main className="px-5 py-8 sm:px-8 lg:px-10"><EmptyClinicState /></main>;
  }

  const lojinhaAtiva = activeClinic.metadata?.site_publico?.lojinha_ativa !== false;
  const storeConfig = getStoreConfig(activeClinic.metadata?.site_publico);
  const membership = memberships.find((item) => item.clinica_id === activeClinic.id) || memberships[0];
  const podeConfigurarLojinha = ["owner", "admin"].includes(membership?.papel);

  const supabase = await createClient();
  const { data: produtos = [], error } = await supabase
    .from("produtos_clinica")
    .select("id, nome, sku, codigo_barras, categoria, descricao, custo, preco, estoque_atual, estoque_reservado, estoque_minimo, unidade, imagem_url, publicado_site, ativo, created_at")
    .eq("clinica_id", activeClinic.id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const publicados = produtos.filter((item) => item.publicado_site && item.ativo).length;
  const estoqueBaixo = produtos.filter((item) => item.ativo && Number(item.estoque_atual) <= Number(item.estoque_minimo)).length;
  const valorEstoque = produtos.reduce((total, item) => total + Number(item.estoque_atual || 0) * Number(item.custo || 0), 0);

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10">
      <section className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="Lojinha"
          title="Produtos e estoque"
          description="Cadastre produtos, acompanhe o estoque e escolha o que aparece na lojinha do site público."
          action={(
            <a href={lojinhaAtiva ? `/c/${activeClinic.slug}#loja` : `/c/${activeClinic.slug}`} target="_blank" rel="noreferrer" className="dashboard-primary-button inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--clinic-primary)] px-4 text-sm font-semibold text-white">
              <Store size={17} /> Ver lojinha pública
            </a>
          )}
        />

        {params?.erro ? (
          <div className="mt-6">
            <Notice type="danger" title={params.erro === "imagem" ? "Não foi possível salvar a imagem" : "Não foi possível concluir a ação"}>
              {params.mensagem || "Confira os dados e tente novamente."}
            </Notice>
          </div>
        ) : null}

        {params?.ok === "configuracao" ? (
          <div className="mt-6">
            <Notice type="success" title="Configurações salvas">
              A operação da lojinha foi atualizada com sucesso.
            </Notice>
          </div>
        ) : null}

        <div className={`mt-7 flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between ${lojinhaAtiva ? "border-emerald-200 bg-emerald-50/80" : "border-neutral-200 bg-neutral-100/80"}`}>
          <div>
            <p className={`text-xs font-black uppercase tracking-[0.2em] ${lojinhaAtiva ? "text-emerald-700" : "text-neutral-500"}`}>Lojinha {lojinhaAtiva ? "ativa" : "desativada"}</p>
            <h2 className="mt-2 text-lg font-black text-neutral-950">{lojinhaAtiva ? "Os produtos publicados aparecem no site" : "A seção está oculta no site do cliente"}</h2>
            <p className="mt-1 text-sm leading-6 text-neutral-600">Desativar a lojinha não apaga produtos, preços ou estoque. Você pode reativá-la quando quiser.</p>
          </div>
          {podeConfigurarLojinha ? (
            <form action={toggleLojinhaAction}>
              <input type="hidden" name="ativa" value={lojinhaAtiva ? "false" : "true"} />
              <button type="submit" className={`inline-flex h-11 items-center justify-center rounded-lg px-5 text-sm font-black transition ${lojinhaAtiva ? "border border-red-200 bg-white text-red-700 hover:bg-red-50" : "bg-[var(--clinic-primary)] text-white hover:brightness-105"}`}>
                {lojinhaAtiva ? "Desativar lojinha" : "Ativar lojinha"}
              </button>
            </form>
          ) : (
            <span className="text-xs font-semibold text-neutral-500">Somente proprietário ou administrador pode alterar.</span>
          )}
        </div>

        {podeConfigurarLojinha ? (
          <details className="product-edit-panel mt-5 rounded-xl border border-white/10 p-5">
            <summary className="cursor-pointer text-sm font-black text-white">Configurar vendas, entrega e pagamento</summary>
            <form action={updateStoreCommerceSettingsAction} className="mt-5 grid gap-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[['retirada_ativa', 'Permitir retirada', storeConfig.retiradaAtiva], ['entrega_ativa', 'Permitir entrega local', storeConfig.entregaAtiva], ['pagamento_retirada_ativo', 'Pagar na retirada', storeConfig.pagamentoRetiradaAtivo], ['checkout_asaas_ativo', 'Checkout Asaas', storeConfig.checkoutAsaasAtivo], ['pix_ativo', 'Aceitar Pix', storeConfig.pixAtivo], ['cartao_ativo', 'Aceitar cartão', storeConfig.cartaoAtivo]].map(([name, label, checked]) => (
                  <label key={name} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-neutral-200"><input type="checkbox" name={name} defaultChecked={checked} /> {label}</label>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block"><span className="text-sm font-medium text-neutral-200">Responsável pela entrega</span><select name="entrega_modo" defaultValue={storeConfig.entregaModo} className="dashboard-field mt-2 h-11 w-full rounded-lg px-3 text-sm"><option value="propria">Equipe da clínica</option><option value="motoboy">Motoboy contratado</option></select></label>
                <Field label="Taxa de entrega" name="taxa_entrega" type="number" step="0.01" defaultValue={String(storeConfig.taxaEntrega)} />
                <Field label="Frete grátis acima de" name="frete_gratis_acima" type="number" step="0.01" defaultValue={String(storeConfig.freteGratisAcima)} />
                <Field label="Pedido mínimo" name="pedido_minimo" type="number" step="0.01" defaultValue={String(storeConfig.pedidoMinimo)} />
                <Field label="Cidade atendida" name="entrega_cidade" defaultValue={storeConfig.entregaCidade} placeholder="Ex.: Vitória da Conquista" />
                <Field label="Reserva do estoque (min)" name="reserva_minutos" type="number" defaultValue={String(storeConfig.reservaMinutos)} />
                <Field label="Mensagem de retirada" name="mensagem_retirada" defaultValue={storeConfig.mensagemRetirada} />
                <Field label="Prazo de entrega" name="prazo_entrega" defaultValue={storeConfig.prazoEntrega} />
              </div>
              <TextArea label="Bairros atendidos" name="bairros_entrega" defaultValue={storeConfig.bairrosEntrega.join("\n")} placeholder="Um bairro por linha. Deixe vazio para aceitar toda a cidade informada." />
              <TextArea label="Orientação de entrega" name="mensagem_entrega" defaultValue={storeConfig.mensagemEntrega} placeholder="Ex.: O motoboy confirmará o horário pelo WhatsApp." />
              <p className="text-xs leading-5 text-neutral-400">A entrega é operacional: o sistema cobra a taxa e registra o endereço, mas a clínica chama e acompanha o motoboy por conta própria.</p>
              <div><SubmitButton>Salvar operação da lojinha</SubmitButton></div>
            </form>
          </details>
        ) : null}

        <div className="mt-7 grid gap-4 sm:grid-cols-3">
          {[
            [ShoppingBag, "Produtos cadastrados", produtos.length],
            [Store, "Publicados na lojinha", publicados],
            [PackageOpen, "Estoque baixo", estoqueBaixo],
          ].map(([Icon, label, value]) => (
            <article key={label} className="premium-panel dashboard-card rounded-lg p-5">
              <Icon size={20} className="text-[var(--clinic-primary)]" />
              <p className="mt-4 text-2xl font-black text-neutral-950">{value}</p>
              <p className="mt-1 text-sm text-neutral-500">{label}</p>
            </article>
          ))}
        </div>

        <div className="mt-4 rounded-lg border border-[color-mix(in_srgb,var(--clinic-primary)_20%,#e5e5e5)] bg-[color-mix(in_srgb,var(--clinic-accent)_8%,white)] px-4 py-3 text-sm text-neutral-700">
          Valor de custo estimado no estoque: <strong className="text-[var(--clinic-primary)]">{money(valorEstoque)}</strong>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[390px_1fr]">
          <form action={createProdutoAction} className="premium-panel dashboard-card h-fit rounded-lg p-5 xl:sticky xl:top-6">
            <h2 className="text-lg font-black">Novo produto</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-500">O produto pode ficar somente no estoque ou também ser publicado na lojinha.</p>
            <div className="mt-5 space-y-4">
              <Field label="Nome" name="nome" required placeholder="Ex: Pomada Matte 80g" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="SKU" name="sku" placeholder="NN-POM-80" />
                <Field label="Código de barras" name="codigo_barras" />
              </div>
              <Field label="Categoria" name="categoria" placeholder="Modeladores, barba, acessórios..." />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Custo" name="custo" type="number" defaultValue="0" />
                <Field label="Preço de venda" name="preco" type="number" defaultValue="0" />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Estoque" name="estoque_atual" type="number" defaultValue="0" />
                <Field label="Mínimo" name="estoque_minimo" type="number" defaultValue="0" />
                <Field label="Unidade" name="unidade" defaultValue="un" />
              </div>
              <ProductImageUpload />
              <TextArea label="Descrição" name="descricao" />
              <label className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700">
                <input type="checkbox" name="publicado_site" defaultChecked />
                Publicar na lojinha do site
              </label>
              <SubmitButton>Cadastrar produto</SubmitButton>
            </div>
          </form>

          <section className="premium-panel dashboard-card rounded-lg p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black">Catálogo de produtos</h2>
                <p className="mt-1 text-sm text-neutral-500">{produtos.length} produto(s) cadastrado(s)</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {produtos.length === 0 ? (
                <div className="md:col-span-2"><EmptyState title="Nenhum produto cadastrado" description="Cadastre o primeiro item para começar a organizar estoque e lojinha." /></div>
              ) : produtos.map((item) => {
                const baixo = Number(item.estoque_atual) <= Number(item.estoque_minimo);
                return (
                  <article key={item.id} className="overflow-hidden rounded-xl border border-neutral-200 bg-white/70 shadow-sm">
                    <div className="flex gap-4 p-4">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
                        {item.imagem_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.imagem_url} alt={item.nome} className="h-full w-full object-cover" />
                        ) : <ShoppingBag size={27} className="text-[var(--clinic-primary)]" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${item.publicado_site && item.ativo ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>
                            {item.publicado_site && item.ativo ? "Na lojinha" : "Oculto"}
                          </span>
                          {baixo ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase text-amber-700">Estoque baixo</span> : null}
                        </div>
                        <h3 className="mt-3 truncate font-black text-neutral-950">{item.nome}</h3>
                        <p className="mt-1 text-xs text-neutral-500">{item.categoria || "Sem categoria"} · {item.sku || "Sem SKU"}</p>
                        <div className="mt-3 flex items-end justify-between gap-3">
                          <strong className="text-lg text-[var(--clinic-primary)]">{money(item.preco)}</strong>
                          <span className={`text-xs font-bold ${baixo ? "text-amber-700" : "text-neutral-500"}`}>{stock(item.estoque_atual)} {item.unidade}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 border-t border-neutral-200 px-4 py-3">
                      <a href={`#editar-produto-${item.id}`} className="inline-flex h-9 items-center rounded-lg border border-neutral-200 px-3 text-xs font-bold text-neutral-700">Editar</a>
                      <form action={toggleProdutoAction}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="campo" value="publicado_site" />
                        <input type="hidden" name="valor" value={item.publicado_site ? "false" : "true"} />
                        <button className="h-9 rounded-lg border border-neutral-200 px-3 text-xs font-bold text-neutral-700" type="submit">{item.publicado_site ? "Ocultar do site" : "Publicar no site"}</button>
                      </form>
                      <form action={toggleProdutoAction}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="campo" value="ativo" />
                        <input type="hidden" name="valor" value={item.ativo ? "false" : "true"} />
                        <button className="h-9 rounded-lg border border-neutral-200 px-3 text-xs font-bold text-neutral-700" type="submit">{item.ativo ? "Desativar" : "Ativar"}</button>
                      </form>
                    </div>

                    <details id={`editar-produto-${item.id}`} className="product-edit-panel border-t border-white/10 p-4">
                      <summary className="cursor-pointer text-sm font-black text-white">Editar produto</summary>
                      <form action={updateProdutoAction} className="mt-4 grid gap-4">
                        <input type="hidden" name="id" value={item.id} />
                        <Field label="Nome" name="nome" required defaultValue={item.nome || ""} />
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="SKU" name="sku" defaultValue={item.sku || ""} />
                          <Field label="Código de barras" name="codigo_barras" defaultValue={item.codigo_barras || ""} />
                        </div>
                        <Field label="Categoria" name="categoria" defaultValue={item.categoria || ""} />
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Custo" name="custo" type="number" defaultValue={String(item.custo || 0)} />
                          <Field label="Preço" name="preco" type="number" defaultValue={String(item.preco || 0)} />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-3">
                          <Field label="Estoque" name="estoque_atual" type="number" defaultValue={String(item.estoque_atual || 0)} />
                          <Field label="Mínimo" name="estoque_minimo" type="number" defaultValue={String(item.estoque_minimo || 0)} />
                          <Field label="Unidade" name="unidade" defaultValue={item.unidade || "un"} />
                        </div>
                        <ProductImageUpload currentImage={item.imagem_url || ""} />
                        <TextArea label="Descrição" name="descricao" defaultValue={item.descricao || ""} />
                        <label className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-700">
                          <input type="checkbox" name="publicado_site" defaultChecked={item.publicado_site} />
                          Publicar na lojinha
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <SubmitButton>Salvar produto</SubmitButton>
                        </div>
                      </form>
                      <form action={deleteProdutoAction} className="mt-3">
                        <input type="hidden" name="id" value={item.id} />
                        <button type="submit" className="h-9 rounded-lg border border-red-200 px-3 text-xs font-bold text-red-700">Excluir produto</button>
                      </form>
                    </details>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
