import { Redirect } from "expo-router";
import React from "react";

import { useStore } from "@/store";

/** Food screens read the day budget, which needs a profile; deep links before onboarding go to welcome. */
export function RequireProfile({ children }: { children: React.ReactNode }) {
  const onboarded = useStore((s) => !!s.profile?.onboardedAt);
  if (!onboarded) return <Redirect href="/welcome" />;
  return <>{children}</>;
}
