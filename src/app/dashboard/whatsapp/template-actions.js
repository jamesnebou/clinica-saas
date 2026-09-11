"use client";

import {
  useState,
  useTransition,
} from "react";

import { useRouter } from "next/navigation";

import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import {
  submitWhatsAppTemplatesAction,
  syncWhatsAppTemplatesAction,
} from "./actions";

export function WhatsAppTemplateActions() {
  const router = useRouter();

  const [isPending, startTransition] =
    useTransition();

  const [feedback, setFeedback] =
    useState(null);

  function execute(action, type) {
    if (isPending) return;

    setFeedback({
      type: "loading",
      message:
        type === "submit"
          ? "Preparando suas mensagens automáticas..."
          : "Atualizando o status das mensagens...",
    });

    startTransition(async () => {
      try {
        const result = await action();

        if (result?.ok) {
          let message =
            "Operação concluída com sucesso.";

          if (type === "submit") {
            const submitted = Number(
              result?.submitted || 0
            );

            message =
              submitted > 0
                ? `${submitted} mensagem(ns) preparada(s) e enviada(s) para aprovação.`
                : "Todas as mensagens já estão preparadas.";
          }

          if (type === "sync") {
            message =
              "Status das mensagens atualizado com sucesso.";
          }

          setFeedback({
            type: "success",
            message,
          });

          router.refresh();
          return;
        }

        setFeedback({
          type: "error",
          message:
            type === "submit"
              ? "Não foi possível preparar todas as mensagens. Tente novamente."
              : "Não foi possível atualizar os status agora. Tente novamente.",
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

  const submitting =
    isPending &&
    feedback?.type === "loading" &&
    feedback?.message?.startsWith(
      "Preparando"
    );

  const syncing =
    isPending &&
    feedback?.type === "loading" &&
    feedback?.message?.startsWith(
      "Atualizando"
    );

  return (
    <div className="wa-template-actions">
      <div className="wa-template-actions__buttons">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            execute(
              submitWhatsAppTemplatesAction,
              "submit"
            )
          }
          className="wa-action-button wa-action-button--primary"
        >
          {submitting ? (
            <Loader2
              size={16}
              className="animate-spin"
            />
          ) : (
            <Sparkles size={16} />
          )}

          {submitting
            ? "Preparando..."
            : "Preparar mensagens"}
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
          className="wa-action-button wa-action-button--secondary"
        >
          {syncing ? (
            <Loader2
              size={16}
              className="animate-spin"
            />
          ) : (
            <RefreshCw size={16} />
          )}

          {syncing
            ? "Atualizando..."
            : "Atualizar status"}
        </button>
      </div>

      {feedback ? (
        <div
          aria-live="polite"
          className={`wa-action-feedback wa-action-feedback--${feedback.type}`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2
              size={17}
              className="shrink-0"
            />
          ) : feedback.type === "error" ? (
            <CircleAlert
              size={17}
              className="shrink-0"
            />
          ) : (
            <Loader2
              size={17}
              className="shrink-0 animate-spin"
            />
          )}

          <span>{feedback.message}</span>
        </div>
      ) : null}
    </div>
  );
}