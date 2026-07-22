"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Layers3,
  Play,
  Search,
  Sparkles,
  X,
} from "lucide-react";

const STORAGE_KEY = "nexawi-clinica-tutoriais-concluidos-v1";

function videoInfo(videoUrl) {
  try {
    const url = new URL(videoUrl);
    const hostname = url.hostname.replace(/^www\./, "");

    if (hostname === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? { type: "embed", src: `https://www.youtube.com/embed/${id}?rel=0`, youtubeId: id } : { type: "external", src: videoUrl };
    }

    if (hostname.endsWith("youtube.com")) {
      const id = url.searchParams.get("v") || url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1];
      return id ? { type: "embed", src: `https://www.youtube.com/embed/${id}?rel=0`, youtubeId: id } : { type: "external", src: videoUrl };
    }

    if (hostname.endsWith("vimeo.com")) {
      const id = url.pathname.split("/").filter(Boolean).findLast((part) => /^\d+$/.test(part));
      return id ? { type: "embed", src: `https://player.vimeo.com/video/${id}` } : { type: "external", src: videoUrl };
    }

    if (/\.(mp4|webm|ogg)$/i.test(url.pathname)) return { type: "video", src: videoUrl };
  } catch {
    return { type: "external", src: videoUrl };
  }

  return { type: "external", src: videoUrl };
}

function tutorialThumbnail(tutorial) {
  if (tutorial.thumbnail_url) return tutorial.thumbnail_url;
  const info = videoInfo(tutorial.video_url);
  return info.youtubeId ? `https://i.ytimg.com/vi/${info.youtubeId}/hqdefault.jpg` : "";
}

function safeSteps(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
}

function TutorialCard({ tutorial, completed, onOpen, featured = false }) {
  const thumbnail = tutorialThumbnail(tutorial);

  return (
    <button
      type="button"
      onClick={() => onOpen(tutorial)}
      className={`group flex h-full min-w-0 flex-col overflow-hidden rounded-[1.65rem] border bg-white/88 text-left shadow-[0_22px_55px_rgba(25,25,23,0.10)] backdrop-blur-xl transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_30px_75px_rgba(25,25,23,0.16)] ${featured ? "border-[color-mix(in_srgb,var(--clinic-primary)_38%,#e5e5e5)]" : "border-white/80"}`}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-[linear-gradient(135deg,#171715,#292925)]">
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_20%,color-mix(in_srgb,var(--clinic-accent)_42%,transparent),transparent_45%),linear-gradient(135deg,#171715,#292925)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />
        <span className="absolute left-4 top-4 rounded-full border border-white/20 bg-black/40 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white backdrop-blur-md">{tutorial.categoria}</span>
        {featured ? <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-[var(--clinic-primary)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-white"><Sparkles size={12} /> Destaque</span> : null}
        <span className="absolute bottom-4 left-4 flex h-11 w-11 items-center justify-center rounded-full bg-white text-[var(--clinic-primary)] shadow-xl transition group-hover:scale-110"><Play size={18} fill="currentColor" /></span>
        <span className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-black text-white backdrop-blur-md"><Clock3 size={13} /> {tutorial.duracao_minutos} min</span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-black leading-snug tracking-tight text-neutral-950">{tutorial.titulo}</h3>
          {completed ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" title="Concluído"><Check size={16} strokeWidth={3} /></span> : null}
        </div>
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-neutral-600">{tutorial.descricao_curta || tutorial.descricao || "Assista ao vídeo e domine mais uma etapa do sistema."}</p>
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-neutral-100 pt-4 text-xs font-black uppercase tracking-[0.12em] text-[var(--clinic-primary)]">
          <span>{completed ? "Rever tutorial" : "Começar agora"}</span>
          <ArrowRight className="transition group-hover:translate-x-1" size={16} />
        </div>
      </div>
    </button>
  );
}

function TutorialModal({ tutorial, completed, onClose, onToggleComplete }) {
  const info = videoInfo(tutorial.video_url);
  const steps = safeSteps(tutorial.passos);

  useEffect(() => {
    const handleKeyDown = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-neutral-950/76 p-3 backdrop-blur-md sm:p-6" onClick={onClose}>
      <div className="mx-auto flex min-h-full max-w-5xl items-center justify-center">
        <article className="w-full overflow-hidden rounded-[2rem] border border-white/12 bg-[#171715] text-white shadow-[0_45px_140px_rgba(0,0,0,0.58)]" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-7">
            <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--clinic-accent)]">{tutorial.categoria}</p><h2 className="mt-1 truncate text-lg font-black sm:text-xl">{tutorial.titulo}</h2></div>
            <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white transition hover:bg-white/15" aria-label="Fechar tutorial"><X size={19} /></button>
          </div>

          <div className="aspect-video w-full bg-black">
            {info.type === "embed" ? <iframe src={info.src} title={tutorial.titulo} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /> : null}
            {info.type === "video" ? <video src={info.src} className="h-full w-full" controls playsInline /> : null}
            {info.type === "external" ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center"><Play size={42} /><p className="max-w-md text-sm leading-6 text-white/65">Este provedor não permite reprodução incorporada. Abra o vídeo em uma nova guia para assistir.</p><a href={info.src} target="_blank" rel="noreferrer" className="rounded-xl bg-white px-5 py-3 text-sm font-black text-neutral-950">Abrir vídeo</a></div>
            ) : null}
          </div>

          <div className="grid gap-7 p-5 sm:p-7 lg:grid-cols-[1fr_0.78fr]">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-white/58"><span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] px-3 py-1.5"><Clock3 size={13} /> {tutorial.duracao_minutos} minutos</span>{completed ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-3 py-1.5 text-emerald-300"><CheckCircle2 size={13} /> Concluído</span> : null}</div>
              <h3 className="mt-5 text-2xl font-black tracking-tight">O que você vai aprender</h3>
              <p className="mt-3 whitespace-pre-line text-sm leading-7 text-white/68">{tutorial.descricao || tutorial.descricao_curta || "Acompanhe o vídeo e aplique o conteúdo diretamente na rotina da clínica."}</p>
              <button type="button" onClick={() => onToggleComplete(tutorial.id)} className={`mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-black transition ${completed ? "border border-emerald-400/35 bg-emerald-400/12 text-emerald-300" : "bg-[var(--clinic-primary)] text-white shadow-[0_18px_40px_color-mix(in_srgb,var(--clinic-primary)_32%,transparent)] hover:brightness-110"}`}><CheckCircle2 size={18} /> {completed ? "Marcar como não concluído" : "Marcar como concluído"}</button>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5">
              <div className="flex items-center gap-2"><BookOpenCheck className="text-[var(--clinic-accent)]" size={19} /><h3 className="font-black">Passo a passo</h3></div>
              {steps.length ? <ol className="mt-5 space-y-4">{steps.map((step, index) => <li key={`${index}-${step}`} className="flex gap-3 text-sm leading-6 text-white/72"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--clinic-primary)] text-xs font-black text-white">{index + 1}</span><span>{step}</span></li>)}</ol> : <p className="mt-4 text-sm leading-6 text-white/55">Assista ao conteúdo completo e pause sempre que precisar repetir uma etapa.</p>}
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}

export function TutorialHub({ tutorials, brandName }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [selected, setSelected] = useState(null);
  const [completedIds, setCompletedIds] = useState([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
        setCompletedIds(Array.isArray(stored) ? stored : []);
      } catch {
        setCompletedIds([]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const categories = useMemo(() => ["Todos", ...new Set(tutorials.map((item) => item.categoria).filter(Boolean))], [tutorials]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return tutorials.filter((tutorial) => {
      const categoryMatches = category === "Todos" || tutorial.categoria === category;
      const haystack = `${tutorial.titulo} ${tutorial.descricao_curta || ""} ${tutorial.descricao || ""} ${tutorial.categoria || ""}`.toLocaleLowerCase("pt-BR");
      return categoryMatches && (!normalized || haystack.includes(normalized));
    });
  }, [tutorials, query, category]);

  const completedCount = tutorials.filter((item) => completedIds.includes(item.id)).length;
  const progress = tutorials.length ? Math.round((completedCount / tutorials.length) * 100) : 0;

  function toggleComplete(id) {
    setCompletedIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <section className="relative overflow-hidden rounded-[2rem] bg-[#171715] px-6 py-8 text-white shadow-[0_32px_95px_rgba(23,23,21,0.26)] sm:px-9 sm:py-10 lg:px-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_12%,color-mix(in_srgb,var(--clinic-primary)_46%,transparent),transparent_28rem),radial-gradient(circle_at_90%_0%,color-mix(in_srgb,var(--clinic-accent)_24%,transparent),transparent_27rem)]" />
        <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full border border-white/10" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_0.46fr] lg:items-end">
          <div className="max-w-3xl">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-[var(--clinic-accent)]"><GraduationCap size={17} /> Academia NexaWi</p>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Domine o sistema. Eleve a experiência da sua clínica.</h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-white/68 sm:text-base">Tutoriais rápidos e práticos para organizar {brandName}, atender melhor as pacientes e aproveitar cada recurso sem complicação.</p>
          </div>
          <div className="rounded-[1.5rem] border border-white/12 bg-white/[0.07] p-5 backdrop-blur-xl">
            <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-bold text-white/55">Seu progresso</p><strong className="mt-1 block text-3xl font-black">{progress}%</strong></div><p className="text-right text-xs font-bold leading-5 text-white/55">{completedCount} de {tutorials.length}<br />concluídos</p></div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[linear-gradient(90deg,var(--clinic-primary),var(--clinic-accent))] transition-all duration-500" style={{ width: `${progress}%` }} /></div>
          </div>
        </div>
      </section>

      {tutorials.length ? (
        <>
          <section className="rounded-[1.5rem] border border-white/75 bg-white/70 p-4 shadow-[0_20px_55px_rgba(25,25,23,0.08)] backdrop-blur-xl sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <label className="relative block w-full lg:max-w-md"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar um tutorial..." className="h-12 w-full rounded-xl border border-neutral-200 bg-white pl-11 pr-4 text-sm font-medium text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-[var(--clinic-primary)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--clinic-primary)_10%,transparent)]" /></label>
              <div className="flex gap-2 overflow-x-auto pb-1">{categories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`shrink-0 rounded-full px-4 py-2.5 text-xs font-black transition ${category === item ? "bg-[var(--clinic-primary)] text-white shadow-lg" : "border border-neutral-200 bg-white text-neutral-600 hover:text-[var(--clinic-primary)]"}`}>{item}</button>)}</div>
            </div>
          </section>

          <section>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.24em] text-[var(--clinic-primary)]">Biblioteca prática</p><h2 className="mt-2 text-2xl font-black tracking-tight text-neutral-950 sm:text-3xl">Aprenda no seu ritmo</h2></div><p className="inline-flex items-center gap-2 text-sm font-bold text-neutral-500"><Layers3 size={17} /> {filtered.length} {filtered.length === 1 ? "conteúdo" : "conteúdos"}</p></div>
            {filtered.length ? <div className="grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">{filtered.map((tutorial) => <TutorialCard key={tutorial.id} tutorial={tutorial} completed={completedIds.includes(tutorial.id)} onOpen={setSelected} featured={tutorial.destaque} />)}</div> : <div className="rounded-[1.5rem] border border-dashed border-neutral-300 bg-white/65 px-6 py-14 text-center"><Search className="mx-auto text-neutral-400" size={34} /><h3 className="mt-4 font-black text-neutral-900">Nenhum tutorial encontrado</h3><p className="mt-2 text-sm text-neutral-500">Tente outra palavra ou selecione uma categoria diferente.</p></div>}
          </section>
        </>
      ) : (
        <section className="rounded-[1.75rem] border border-dashed border-neutral-300 bg-white/70 px-6 py-16 text-center shadow-sm backdrop-blur"><BookOpenCheck className="mx-auto text-[var(--clinic-primary)]" size={42} /><h2 className="mt-5 text-2xl font-black">A central de tutoriais está sendo preparada</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-neutral-600">Em breve você encontrará aqui vídeos curtos para dominar todas as áreas do sistema.</p></section>
      )}

      {selected ? <TutorialModal tutorial={selected} completed={completedIds.includes(selected.id)} onClose={() => setSelected(null)} onToggleComplete={toggleComplete} /> : null}
    </div>
  );
}
