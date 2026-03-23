"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch, getClientAuth } from "@/lib/client-auth";

type PartnerOption = { id: string; name: string };

export function useRequiredPartner() {
  const router = useRouter();
  const [partnerId, setPartnerId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setIsLoading(true);
      setError("");

      const auth = await getClientAuth();
      if (!auth) {
        router.replace("/login");
        return;
      }

      const sessionRes = await authFetch("/api/auth/session");
      const sessionData = await sessionRes.json().catch(() => ({}));
      const availablePartners: PartnerOption[] = Array.isArray(sessionData.partners)
        ? sessionData.partners.map((p: PartnerOption) => ({ id: p.id, name: p.name }))
        : [];

      let currentPartnerId = localStorage.getItem("active_partner_id") ?? "";
      if (!currentPartnerId || !availablePartners.some((p) => p.id === currentPartnerId)) {
        currentPartnerId = availablePartners[0]?.id ?? "";
      }

      if (!mounted) return;
      if (!currentPartnerId) {
        setPartnerId("");
        setError("Nenhuma empresa disponivel para sua conta.");
        setIsLoading(false);
        return;
      }

      localStorage.setItem("active_partner_id", currentPartnerId);
      setPartnerId(currentPartnerId);
      setIsLoading(false);
    };

    void load();

    const handlePartnerChanged = () => {
      const currentPartnerId = localStorage.getItem("active_partner_id") ?? "";
      if (!currentPartnerId) return;
      setPartnerId(currentPartnerId);
      setError("");
    };

    window.addEventListener("partner-changed", handlePartnerChanged as EventListener);
    return () => {
      mounted = false;
      window.removeEventListener("partner-changed", handlePartnerChanged as EventListener);
    };
  }, [router]);

  return { partnerId, isLoading, error };
}
