import { requireClinicSection } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { TutorialHub } from "./tutorial-hub";

export const metadata = { title: "Tutoriais | Dashboard" };
export const dynamic = "force-dynamic";

export default async function ClinicTutorialsPage() {
  const { activeClinic } = await requireClinicSection("tutoriais");
  const { data, error } = await supabaseAdmin
    .from("clinica_tutoriais")
    .select("id, titulo, descricao_curta, descricao, categoria, video_url, thumbnail_url, duracao_minutos, ordem, passos, destaque")
    .eq("ativo", true)
    .order("destaque", { ascending: false })
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw error;

  const metadata = activeClinic?.metadata || {};
  const brandName = metadata.brand_name || activeClinic?.nome || "sua clínica";

  return (
    <div className="px-5 py-7 sm:px-8 sm:py-9 lg:px-10">
      <TutorialHub tutorials={data || []} brandName={brandName} />
    </div>
  );
}
