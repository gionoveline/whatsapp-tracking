"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { GoogleLpCaptureMonitor } from "@/components/google-lp/GoogleLpCaptureMonitor";

function GoogleLpCaptureMonitorWithQuery({ partnerId }: { partnerId: string }) {
  const searchParams = useSearchParams();
  const wciSmokeGclid = searchParams.get("wci_smoke");
  return <GoogleLpCaptureMonitor partnerId={partnerId} highlightGclid={wciSmokeGclid} />;
}

export function GoogleLpCaptureMonitorSection({ partnerId }: { partnerId: string }) {
  return (
    <Suspense
      fallback={
        <GoogleLpCaptureMonitor partnerId={partnerId} />
      }
    >
      <GoogleLpCaptureMonitorWithQuery partnerId={partnerId} />
    </Suspense>
  );
}
