"use client";

export function PublicFormGuard({ requestField = "" }) {
  return (
    <>
      <div className="pointer-events-none absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <input
        type="hidden"
        name="form_started_at"
        defaultValue=""
        ref={(node) => { if (node && !node.value) node.value = String(Date.now()); }}
      />
      {requestField ? (
        <input
          type="hidden"
          name={requestField}
          defaultValue=""
          ref={(node) => { if (node && !node.value) node.value = globalThis.crypto?.randomUUID?.() || ""; }}
        />
      ) : null}
    </>
  );
}
