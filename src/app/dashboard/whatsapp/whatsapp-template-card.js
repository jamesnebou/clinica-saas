import {
  Ban,
  BellRing,
  CalendarClock,
  CalendarPlus2,
  CheckCircle2,
  CircleAlert,
  Clock3,
  CreditCard,
  MessageCircleMore,
  TimerReset,
} from "lucide-react";
import { templatePreview } from "@/lib/whatsapp/meta/templates";

const MESSAGE_GUIDE = {
  booking_created: {
    title: "Novo agendamento",
    when: "Enviada assim que um novo agendamento é registrado.",
    icon: CalendarPlus2,
  },

  booking_payment_pending: {
    title: "Pagamento pendente",
    when: "Enviada após o agendamento quando existe um sinal aguardando pagamento.",
    icon: CreditCard,
  },

  payment_expiring: {
    title: "Pagamento perto do vencimento",
    when: "Enviada antes do prazo do sinal terminar.",
    icon: TimerReset,
  },

  payment_confirmed: {
    title: "Pagamento confirmado",
    when: "Enviada assim que o pagamento do sinal é confirmado.",
    icon: CheckCircle2,
  },

  payment_expired: {
    title: "Pagamento expirado",
    when: "Enviada quando o prazo para pagamento da reserva termina.",
    icon: Clock3,
  },

  appointment_reminder_24h: {
    title: "Lembrete 24h",
    when: "Enviada aproximadamente 24 horas antes do atendimento.",
    icon: BellRing,
  },

  appointment_reminder_3h: {
    title: "Lembrete 3h",
    when: "Enviada próximo ao horário do atendimento.",
    icon: BellRing,
  },

  booking_cancelled: {
    title: "Cancelamento",
    when: "Enviada quando um atendimento é cancelado.",
    icon: Ban,
  },

  booking_rescheduled: {
    title: "Remarcação",
    when: "Enviada quando o atendimento recebe uma nova data ou horário.",
    icon: CalendarClock,
  },
};

function date(value) {
  if (!value) return "Ainda não sincronizado";

  return new Date(value).toLocaleString("pt-BR");
}

function statusMeta(status) {
  switch (status) {
    case "APPROVED":
      return {
        label: "Pronto para uso",
        tone: "ready",
        Icon: CheckCircle2,
      };

    case "PENDING":
    case "IN_APPEAL":
      return {
        label: "Aguardando aprovação",
        tone: "pending",
        Icon: Clock3,
      };

    case "REJECTED":
      return {
        label: "Precisa de ajuste",
        tone: "error",
        Icon: CircleAlert,
      };

    default:
      return {
        label: "Indisponível no momento",
        tone: "neutral",
        Icon: Clock3,
      };
  }
}

function validRejectionReason(item) {
  const reason = String(
    item?.rejection_reason || ""
  ).trim();

  if (!reason) return null;
  if (reason.toUpperCase() === "NONE") return null;
  if (item?.status !== "REJECTED") return null;

  return reason;
}

export function WhatsAppTemplateCard({ item }) {
  const preview = templatePreview(item);
  const guide =
    MESSAGE_GUIDE[item.purpose] ||
    MESSAGE_GUIDE.booking_created;

  const Icon = guide.icon || MessageCircleMore;

  const status = statusMeta(item.status);
  const StatusIcon = status.Icon;

  const rejectionReason =
    validRejectionReason(item);

  return (
    <article className="wa-template-card">
      <div className="wa-template-card__top">
        <div className="wa-template-card__identity">
          <span className="wa-template-card__icon">
            <Icon size={19} strokeWidth={2} />
          </span>

          <div>
            <h3 className="wa-template-card__title">
              {guide.title}
            </h3>

            <p className="wa-template-card__when">
              {guide.when}
            </p>
          </div>
        </div>

        <span
          className={`wa-status-badge wa-status-${status.tone}`}
        >
          <StatusIcon
            size={13}
            strokeWidth={2.4}
          />

          {status.label}
        </span>
      </div>

      <div className="wa-message-preview">
        <div className="wa-message-preview__label">
          <MessageCircleMore size={13} />

          Prévia para o cliente
        </div>

        <div className="wa-message-bubble">
          <p className="whitespace-pre-wrap break-words">{preview.body}</p>
          {preview.footer ? <p className="mt-2 text-xs opacity-70">{preview.footer}</p> : null}

          <div className="wa-message-bubble__meta">
            <span>14:32</span>
            <span>✓✓</span>
          </div>
        </div>
      </div>

      {rejectionReason ? (
        <div className="wa-template-error">
          <strong>Essa mensagem precisa de ajuste.</strong>
          <br />
          {rejectionReason}
        </div>
      ) : null}

      <div className="wa-template-footer">
        <span className="wa-template-updated">
          Atualizado em {date(item.last_synced_at)}
        </span>

        <details className="wa-tech-details">
          <summary>Detalhes técnicos</summary>

          <div className="wa-tech-details__body">
            <span>
              <strong>Modelo:</strong> {item.name}
            </span>

            <span>
              <strong>Idioma:</strong>{" "}
              {item.language || "pt_BR"}
            </span>

            <span>
              <strong>Categoria:</strong>{" "}
              {item.category || "UTILITY"}
            </span>

            <span>
              <strong>Status Meta:</strong>{" "}
              {item.status || "-"}
            </span>
          </div>
        </details>
      </div>
    </article>
  );
}
