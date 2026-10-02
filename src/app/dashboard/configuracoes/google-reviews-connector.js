"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Search, Star, Unplug } from "lucide-react";

export function GoogleReviewsConnector({ connected, details, unavailable, canManage }) {
  const [linked, setLinked] = useState(connected);
  const [linkedDetails, setLinkedDetails] = useState(details);
  const [editing, setEditing] = useState(!connected);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing || query.trim().length < 3) { return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/dashboard/google-places?q=${encodeURIComponent(query.trim())}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Busca indisponível.");
        setResults(data.places || []);
      } catch (cause) {
        if (cause.name !== "AbortError") { setResults([]); setError(cause.message); }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 450);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [editing, query]);

  async function changeLink(method, placeId) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/dashboard/google-places", {
        method,
        headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
        body: method === "POST" ? JSON.stringify({ placeId }) : undefined,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível atualizar a conexão.");
      setLinked(method === "POST");
      setLinkedDetails(method === "POST" ? results.find((place) => place.id === placeId) || null : null);
      setEditing(method === "DELETE");
      setQuery("");
      setResults([]);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-5 border-t border-neutral-200 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-neutral-950">Avaliações do Google</h3>
          <p className="mt-1 text-sm text-neutral-600">Encontre a clínica e confirme o estabelecimento correto.</p>
        </div>
        {linked ? <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 size={16} /> Google conectado</span> : null}
      </div>

      {linked ? (
        <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-4">
          {linkedDetails ? (
            <>
              <strong className="block text-sm text-neutral-950">{linkedDetails.name}</strong>
              {linkedDetails.address ? <p className="mt-1 text-sm text-neutral-600">{linkedDetails.address}</p> : null}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-700">
                {linkedDetails.rating !== null ? <span className="inline-flex items-center gap-1"><Star size={14} className="fill-amber-400 text-amber-400" /> {linkedDetails.rating.toFixed(1)}</span> : null}
                {linkedDetails.userRatingCount !== null ? <span>{linkedDetails.userRatingCount} avaliações</span> : null}
                <span translate="no" className="text-xs font-normal text-[#5e5e5e]">Google Maps</span>
              </div>
              {linkedDetails.attributions?.map((item) => <p key={item.provider} className="mt-2 text-xs text-neutral-500">{item.providerUri ? <a href={item.providerUri} target="_blank" rel="noopener noreferrer" className="underline">{item.provider}</a> : item.provider}</p>)}
            </>
          ) : <p className="text-sm text-amber-800">{unavailable || "Não foi possível validar a empresa vinculada. Pesquise e selecione novamente ou contate o suporte."}</p>}
          {canManage ? <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => setEditing((value) => !value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold hover:bg-white">Alterar empresa</button>
            <button type="button" disabled={saving} onClick={() => changeLink("DELETE")} className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"><Unplug size={15} /> Desconectar</button>
          </div> : null}
        </div>
      ) : null}

      {editing && canManage ? (
        <div className="mt-4">
          <label htmlFor="google-place-search" className="text-sm font-semibold text-neutral-800">Pesquise sua clínica no Google</label>
          <div className="relative mt-2">
            <Search size={17} className="pointer-events-none absolute left-3 top-3 text-neutral-500" />
            <input id="google-place-search" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setResults([]); setError(""); }} placeholder="Nome, cidade ou endereço" maxLength={120} autoComplete="off" className="h-11 w-full rounded-md border border-neutral-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-[var(--clinic-primary)]" />
          </div>
          {loading ? <p className="mt-3 text-sm text-neutral-500" role="status">Pesquisando...</p> : null}
          {!loading && query.trim().length >= 3 && !results.length && !error ? <p className="mt-3 text-sm text-neutral-500">Nenhum resultado encontrado. Inclua a cidade na busca.</p> : null}
          {results.length ? <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white" aria-label="Estabelecimentos encontrados">
            {results.map((place) => <li key={place.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0 flex-1">
                <strong className="block text-sm text-neutral-900">{place.name}</strong>
                {place.address ? <p className="mt-1 text-xs text-neutral-600">{place.address}</p> : null}
                <p className="mt-1 text-xs text-neutral-600">{place.rating !== null ? `${place.rating.toFixed(1)} estrelas` : ""}{place.userRatingCount !== null ? ` · ${place.userRatingCount} avaliações` : ""}</p>
                <span translate="no" className="text-xs font-normal text-[#5e5e5e]">Google Maps</span>
                {place.attributions?.map((item) => <span key={item.provider} className="ml-2 text-xs text-neutral-500">{item.provider}</span>)}
              </div>
              <button type="button" disabled={saving} onClick={() => changeLink("POST", place.id)} className="rounded-md bg-[var(--clinic-primary)] px-3 py-2 text-xs font-bold text-white hover:brightness-95 disabled:opacity-50">Esta é minha clínica</button>
            </li>)}
          </ul> : null}
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
