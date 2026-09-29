"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function JitDashboardAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const handleFocus = () => {
      router.refresh();
    };

    const interval = setInterval(() => {
      router.refresh();
    }, 10000);

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
      clearInterval(interval);
    };
  }, [router]);

  return null;
}
