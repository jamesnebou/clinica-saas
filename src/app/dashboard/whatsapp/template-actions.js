"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  RefreshCw,
  Send,
} from "lucide-react";

import {
  submitWhatsAppTemplatesAction,
  syncWhatsAppTemplatesAction,
} from "./actions";

export function WhatsAppTemplateActions() {
  const router = useRouter();

  const [isPending, startTransition] = useTransition();

  const [feedback, setFeedback] = useState(null);

  function execute(action, type) {
    if (isPending) return;

    setFeedback({
      type: "loading",
      message:
        type === "submit"
          ? "Enviando templates para a Meta..."
          : "Sincronizando templates com a Meta...",
    });

    startTransition(async () => {
      try {
        const result = await action();

        if (result?.ok) {
          setFeedback({
            type: "success",
            message:
              result.message ||
              "Operação concluída com sucesso.",
          });

          router.refresh();
          return;
        }

        setFeedback({
          type: "error",
          message:
            result?.message ||
            "Não foi possível concluir a operação.",
        });
      } catch (error) {
        console.error(
          "whatsapp_template_ui_action_failed",
          error
        );

        setFeedback({
          type: "error",
          message:
            "Não foi possível concluir a operação. Tente novamente.",
        });
      }
    });
  }

  return (
    <div className="flex max-w-xl flex-col items-end gap-3">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            execute(
              submitWhatsAppTemplatesAction,
              "submit"
            )
          }
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--clinic-primary)] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending &&
          feedback?.type === "loading" &&
          feedback?.message?.startsWith("Enviando") ? (
            <Loader2
              size={16}
              className="animate-spin"
            />
          ) : (
            <Send size={16} />
          )}

          {isPending &&
          feedback?.message?.startsWith("Enviando")
            ? "Enviando..."
            : "Enviar ausentes"}
        </button>

        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            execute(
              syncWhatsAppTemplatesAction,
              "sync"
            )
          }
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-neutral-950 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending &&
          feedback?.type === "loading" &&
          feedback?.message?.startsWith(
            "Sincronizando"
          ) ? (
            <Loader2
              size={16}
              className="animate-spin"
            />
          ) : (
            <RefreshCw size={16} />
          )}

          {isPending &&
          feedback?.message?.startsWith(
            "Sincronizando"
          )
            ? "Sincronizando..."
            : "Sincronizar"}
        </button>
      </div>

      {feedback ? (
        <div
          aria-live="polite"
          className={`flex max-w-xl items-start gap-2 rounded-lg border px-4 py-3 text-sm font-semibold ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : feedback.type === "error"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2
              size={18}
              className="mt-0.5 shrink-0"
            />
          ) : feedback.type === "error" ? (
            <CircleAlert
              size={18}
              className="mt-0.5 shrink-0"
            />
          ) : (
            <Loader2
              size={18}
              className="mt-0.5 shrink-0 animate-spin"
            />
          )}

          <span>{feedback.message}</span>
        </div>
      ) : null}
    </div>
  );
}