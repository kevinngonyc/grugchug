import { useEffect } from "react";
import { reportJourney } from "@/features/chat";
import { journeyForSession, useStudySession } from "@/features/conductor";
import { useProfile } from "@/features/profile";

const DEFAULT_AVATAR = "poku" as const;

// The room should see where you are and what you look like. Session is the
// bridge: it reads the study session and the profile, and hands chat a status.
export function syncJourney(): void {
  const { mode, stationIndex, plan } = useStudySession.getState();
  const avatar = useProfile.getState().user?.avatar ?? DEFAULT_AVATAR;
  reportJourney({ avatar, journey: journeyForSession({ mode, stationIndex, plan }) });
}

export function useJourneyLink(): void {
  useEffect(() => {
    syncJourney();
    const unsubscribeStudy = useStudySession.subscribe((s, prev) => {
      if (s.mode !== prev.mode || s.stationIndex !== prev.stationIndex || s.plan !== prev.plan) {
        syncJourney();
      }
    });
    const unsubscribeProfile = useProfile.subscribe((s, prev) => {
      if (s.user?.avatar !== prev.user?.avatar) syncJourney();
    });
    return () => {
      unsubscribeStudy();
      unsubscribeProfile();
    };
  }, []);
}
