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
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--clinic-primary)]">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }) {
  return (
    <section className={`rounded-lg border border-neutral-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

export function SectionTitle({ icon: Icon, title, description }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        {Icon ? <Icon size={20} className="text-[var(--clinic-primary)]" /> : null}
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {description ? <p className="mt-2 text-sm leading-6 text-neutral-600">{description}</p> : null}
    </div>
  );
}

export function Field({ label, name, type = "text", required = false, placeholder = "", defaultValue = "" }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <input
        className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-[var(--clinic-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--clinic-primary)_18%,transparent)]"
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
      />
    </label>
  );
}

export function TextArea({ label, name, placeholder = "", defaultValue = "" }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <textarea
        className="mt-2 min-h-24 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--clinic-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--clinic-primary)_18%,transparent)]"
        name={name}
        placeholder={placeholder}
        defaultValue={defaultValue}
      />
    </label>
  );
}

export function SelectField({ label, name, defaultValue = "", required = false, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-[var(--clinic-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--clinic-primary)_18%,transparent)]"
      >
        {children}
      </select>
    </label>
  );
}

export function SubmitButton({ children }) {
  return (
    <button className="h-11 rounded-lg bg-[var(--clinic-primary)] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-95" type="submit">
      {children}
    </button>
  );
}

export function LinkButton({ href, children, variant = "primary" }) {
  const styles = variant === "outline"
    ? "border border-[color-mix(in_srgb,var(--clinic-primary)_24%,#e5e5e5)] text-[var(--clinic-primary)] hover:bg-[color-mix(in_srgb,var(--clinic-accent)_8%,white)]"
    : "bg-[var(--clinic-primary)] text-white shadow-sm hover:brightness-95";

  return (
    <a href={href} className={`inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold transition ${styles}`}>
      {children}
    </a>
  );
}

export function Notice({ type = "info", title, children }) {
  const styles = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    success: "border-[color-mix(in_srgb,var(--clinic-primary)_24%,#e5e5e5)] bg-[color-mix(in_srgb,var(--clinic-accent)_10%,white)] text-[var(--clinic-primary)]",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-800",
  };

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${styles[type] || styles.info}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-1 leading-6" : "leading-6"}>{children}</div>
    </div>
  );
}

export function LimitNotice({ message, resource = "recurso" }) {
  return (
    <Notice type="warning" title="Limite do plano atingido">
      <p>{message || `Seu plano atual chegou ao limite de ${resource}.`}</p>
      <div className="mt-3">
        <LinkButton href="/dashboard/assinatura">Ver opcoes de upgrade</LinkButton>
      </div>
    </Notice>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="rounded-lg border border-dashed border-[color-mix(in_srgb,var(--clinic-primary)_28%,#d4d4d4)] bg-[color-mix(in_srgb,var(--clinic-accent)_8%,white)] px-4 py-6 text-center">
      <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-600">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

