"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Props = {
  url: string;
  label?: string;
  emptyHint?: string;
  inputId?: string;
};

export function CopyableGoLinkField({
  url,
  label = "Link para URL final (Google Ads)",
  emptyHint = "Salve a configuração ou recarregue a página para montar o link.",
  inputId,
}: Props) {
  const [copied, setCopied] = useState(false);

  if (!url) {
    return <p className="text-xs text-[var(--muted-foreground)]">{emptyHint}</p>;
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const id = inputId ?? "go-link-url";

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide">
        {label}
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          id={id}
          readOnly
          value={url}
          className="font-mono text-xs bg-[var(--muted)]/30"
          onFocus={(e) => e.currentTarget.select()}
        />
        <div className="flex shrink-0 gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
            {copied ? "Copiado" : "Copiar"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
          >
            Abrir
          </Button>
        </div>
      </div>
    </div>
  );
}
