"use client";

import type { GoogleLpCaptureEvent } from "@/lib/google-lp-monitoring";
import { googleLpCaptureSourceLabel } from "@/lib/google-lp-capture-source";

function formatDateTimeBr(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Sao_Paulo",
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("day")}/${pick("month")}/${pick("year")} ${pick("hour")}:${pick("minute")}`;
}

function truncateGclid(gclid: string | null): string {
  if (!gclid) return "—";
  if (gclid.length <= 20) return gclid;
  return `${gclid.slice(0, 18)}…`;
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
        ok
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
      }`}
    >
      {label}
    </span>
  );
}

type Props = {
  event: GoogleLpCaptureEvent;
  highlighted?: boolean;
  showOrigin?: boolean;
};

export function GoogleLpCaptureEventRow({ event, highlighted, showOrigin = true }: Props) {
  return (
    <tr
      className={`border-b border-[var(--border)] last:border-0 align-top ${
        highlighted ? "bg-emerald-500/10 ring-2 ring-inset ring-emerald-500/50" : ""
      }`}
    >
      <td className="p-2 whitespace-nowrap">{formatDateTimeBr(event.createdAt)}</td>
      <td className="p-2 font-mono text-xs">{event.protocol}</td>
      <td className="p-2 font-mono text-xs">{event.emrCampaignId ?? "—"}</td>
      {showOrigin && (
        <td className="p-2 text-xs whitespace-nowrap">{googleLpCaptureSourceLabel(event.captureSource)}</td>
      )}
      <td className="p-2 font-mono text-xs" title={event.gclid ?? undefined}>
        {truncateGclid(event.gclid)}
      </td>
      <td className="p-2 text-xs max-w-[200px]">
        <p className="line-clamp-2 text-[var(--muted-foreground)]" title={event.messagePreview}>
          {event.messagePreview || "—"}
        </p>
      </td>
      <td className="p-2">
        <div className="flex flex-col gap-1">
          {event.status === "linked" ? (
            <StatusBadge ok={true} label="Lead vinculado" />
          ) : (
            <span className="inline-flex items-center rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
              Aguardando WhatsApp
            </span>
          )}
          <div className="flex flex-wrap gap-1">
            <StatusBadge ok={event.checks.hasGclid} label="gclid" />
            <StatusBadge ok={event.checks.hasEmr} label="ID EMR" />
            <StatusBadge ok={event.checks.messageHasProtocol} label="GLP na msg" />
            {event.checks.leadGclidMatches !== null && (
              <StatusBadge ok={event.checks.leadGclidMatches} label="gclid no lead" />
            )}
          </div>
          {event.lead?.contactPhone && (
            <p className="text-xs text-[var(--muted-foreground)]">{event.lead.contactPhone}</p>
          )}
        </div>
      </td>
    </tr>
  );
}
