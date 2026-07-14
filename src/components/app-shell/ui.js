export function EmptyClinicState() {
  return (
    <div className="premium-panel rounded-lg p-5 text-amber-900">
      <h2 className="text-lg font-semibold">Nenhuma clinica vinculada</h2>
      <p className="mt-2 text-sm leading-6">
        Seu usuario esta autenticado, mas ainda nao foi vinculado a uma clinica. Crie uma clinica e um registro em usuarios_clinica no Supabase para liberar o painel.
      </p>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="relative flex flex-col gap-4 border-b border-neutral-200 pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="absolute bottom-[-1px] left-0 h-px w-48 bg-[linear-gradient(90deg,var(--clinic-primary),var(--clinic-accent),transparent)]" />
      <div className="absolute bottom-[-2px] left-0 h-[3px] w-20 rounded-full bg-[var(--clinic-primary)] shadow-[0_0_24px_color-mix(in_srgb,var(--clinic-accent)_55%,transparent)]" />
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--clinic-primary)]">{eyebrow}</p>
        <h1 className="mt-2 max-w-4xl text-3xl font-black tracking-tight text-neutral-950 sm:text-4xl">{title}</h1>
        {description ? <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }) {
  return (
    <section className={`premium-panel min-w-0 rounded-lg p-5 transition duration-200 ${className}`}>
      {children}
    </section>
  );
}

export function SectionTitle({ icon: Icon, title, description }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        {Icon ? <span className="metric-orb inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--clinic-primary)]"><Icon size={19} /></span> : null}
        <h2 className="text-lg font-black tracking-tight">{title}</h2>
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
        className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-[var(--clinic-primary)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--clinic-primary)_12%,transparent)] focus:ring-0"
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
        className="dashboard-field mt-2 min-h-24 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-[var(--clinic-primary)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--clinic-primary)_12%,transparent)] focus:ring-0"
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
        className="dashboard-field mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-[var(--clinic-primary)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--clinic-primary)_12%,transparent)] focus:ring-0"
      >
        {children}
      </select>
    </label>
  );
}

export function SubmitButton({ children }) {
  return (
    <button className="h-11 rounded-lg bg-[linear-gradient(135deg,var(--clinic-primary),color-mix(in_srgb,var(--clinic-primary)_72%,#111))] px-5 text-sm font-semibold text-white shadow-[0_14px_30px_color-mix(in_srgb,var(--clinic-primary)_22%,transparent)] transition hover:-translate-y-0.5 hover:brightness-105" type="submit">
      {children}
    </button>
  );
}

export function LinkButton({ href, children, variant = "primary" }) {
  const styles = variant === "outline"
    ? "border border-[color-mix(in_srgb,var(--clinic-primary)_24%,#e5e5e5)] bg-white/70 text-[var(--clinic-primary)] shadow-sm hover:bg-[color-mix(in_srgb,var(--clinic-accent)_8%,white)]"
    : "bg-[linear-gradient(135deg,var(--clinic-primary),color-mix(in_srgb,var(--clinic-primary)_72%,#111))] text-white shadow-[0_14px_30px_color-mix(in_srgb,var(--clinic-primary)_20%,transparent)] hover:brightness-105";

  return (
    <a href={href} className={`inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold transition ${styles}`}>
      {children}
    </a>
  );
}

export function Notice({ type = "info", title, children }) {
  const styles = {
    info: "border-sky-200/70 bg-sky-50/80 text-sky-900",
    success: "border-[color-mix(in_srgb,var(--clinic-primary)_24%,#e5e5e5)] bg-[color-mix(in_srgb,var(--clinic-accent)_10%,white)] text-[var(--clinic-primary)]",
    warning: "border-amber-200/80 bg-amber-50/90 text-amber-900",
    danger: "border-red-200/80 bg-red-50/90 text-red-800",
  };

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm shadow-sm backdrop-blur ${styles[type] || styles.info}`}>
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
    <div className="rounded-lg border border-dashed border-[color-mix(in_srgb,var(--clinic-primary)_28%,#d4d4d4)] bg-[color-mix(in_srgb,var(--clinic-accent)_8%,white)] px-4 py-6 text-center shadow-sm backdrop-blur">
      <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-600">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
