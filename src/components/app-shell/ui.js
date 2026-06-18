export function EmptyClinicState() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-900">
      <h2 className="text-lg font-semibold">Nenhuma clinica vinculada</h2>
      <p className="mt-2 text-sm leading-6">
        Seu usuario esta autenticado, mas ainda nao foi vinculado a uma clinica. Crie uma clinica e um registro em usuarios_clinica no Supabase para liberar o painel.
      </p>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="flex flex-col gap-4 border-b border-neutral-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Field({ label, name, type = "text", required = false, placeholder = "", defaultValue = "" }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <input
        className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-600"
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
      />
    </label>
  );
}

export function TextArea({ label, name, placeholder = "" }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <textarea
        className="mt-2 min-h-24 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-600"
        name={name}
        placeholder={placeholder}
      />
    </label>
  );
}

export function SubmitButton({ children }) {
  return (
    <button className="h-11 rounded-lg bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800" type="submit">
      {children}
    </button>
  );
}
