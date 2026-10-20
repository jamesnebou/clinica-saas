export const PACKAGE_SALES_SELECT = "*,clientes!cliente_pacotes_cliente_tenant_fk(nome)";

export function packageSalesQuery(supabase, clinicId) {
  return supabase.from("cliente_pacotes")
    .select(PACKAGE_SALES_SELECT)
    .eq("clinica_id", clinicId)
    .order("created_at", { ascending: false })
    .limit(200);
}
