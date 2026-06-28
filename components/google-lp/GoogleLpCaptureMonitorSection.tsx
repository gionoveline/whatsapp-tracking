"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { GoogleLpCaptureMonitor } from "@/components/google-lp/GoogleLpCaptureMonitor";
import { GoogleWciCaptureMonitor } from "@/components/google-lp/GoogleWciCaptureMonitor";

function GoogleLpCaptureMonitorWithQuery({ partnerId }: { partnerId: string }) {
  const searchParams = useSearchParams();
  const wciSmokeGclid = searchParams.get("wci_smoke");
  return (
    <>
      <GoogleWciCaptureMonitor partnerId={partnerId} highlightGclid={wciSmokeGclid} />
      <GoogleLpCaptureMonitor partnerId={partnerId} highlightGclid={wciSmokeGclid} />
    </>
  );
}

export function GoogleLpCaptureMonitorSection({ partnerId }: { partnerId: string }) {
  return (
    <Suspense
      fallback={
        <>
          <GoogleWciCaptureMonitor partnerId={partnerId} />
          <GoogleLpCaptureMonitor partnerId={partnerId} />
        </>
      }
    >
      <GoogleLpCaptureMonitorWithQuery partnerId={partnerId} />
    </Suspense>
  );
}
