/**
 * Keep home dashboards aligned with Postgres in near-real time.
 * On focus + on membership/payment/notification changes: bust caches and reload.
 */
import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";

import { supabase } from "@/src/supabase";
import { invalidateCache, invalidateUserStatsCaches } from "@/src/db/helpers";
import { debounce } from "@/src/utils/debounce";

export type LiveDashboardMode = "member" | "manager" | "admin" | "diaspora";

type Options = {
  /** Full reload (must refetch primary stats, not secondary-only). */
  reload: () => void | Promise<void>;
  mode?: LiveDashboardMode;
  /** Polling fallback while focused (ms). Default 12s. */
  pollMs?: number;
};

/**
 * Subscribe to DB changes that affect dashboard stats for the signed-in user.
 * Works for all current and future profiles — same hook, same tables.
 */
export function useLiveDashboardSync(userId: string | undefined, opts: Options) {
  const { reload, mode = "member", pollMs = 12_000 } = opts;
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  const bustAndReload = useCallback(() => {
    if (userId) {
      invalidateUserStatsCaches(userId);
      invalidateCache("tontines");
      invalidateCache("admin");
    }
    return Promise.resolve(reloadRef.current());
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;

      // Always fresh when landing on the dashboard
      void bustAndReload();

      const debounced = debounce(() => {
        void bustAndReload();
      }, 350);

      let pollTimer: ReturnType<typeof setInterval> | null = null;

      const ch = supabase.channel(`live-dashboard-${mode}-${userId}`);

      // Membership — join accepted / left / role change
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tontine_members", filter: `user_id=eq.${userId}` },
        debounced,
      );
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "association_members", filter: `user_id=eq.${userId}` },
        debounced,
      );
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cooperative_members", filter: `user_id=eq.${userId}` },
        debounced,
      );
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fund_members", filter: `user_id=eq.${userId}` },
        debounced,
      );

      // Join request status (pending → approved/rejected)
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tontine_join_requests", filter: `requester_id=eq.${userId}` },
        debounced,
      );
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "association_join_requests", filter: `requester_id=eq.${userId}` },
        debounced,
      );

      // Money & savings
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tontine_contributions", filter: `user_id=eq.${userId}` },
        debounced,
      );
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "savings_goals", filter: `user_id=eq.${userId}` },
        debounced,
      );
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "savings_transactions", filter: `user_id=eq.${userId}` },
        debounced,
      );
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wallet_transactions", filter: `user_id=eq.${userId}` },
        debounced,
      );
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `user_id=eq.${userId}` },
        debounced,
      );

      // Inbox
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        debounced,
      );

      if (mode === "manager" || mode === "admin") {
        // Groups I own / manage — member joins elsewhere still update my overview
        ch.on("postgres_changes", { event: "*", schema: "public", table: "tontines" }, debounced);
        ch.on("postgres_changes", { event: "*", schema: "public", table: "tontine_members" }, debounced);
        ch.on("postgres_changes", { event: "*", schema: "public", table: "tontine_join_requests" }, debounced);
        ch.on("postgres_changes", { event: "*", schema: "public", table: "associations" }, debounced);
        ch.on("postgres_changes", { event: "*", schema: "public", table: "association_join_requests" }, debounced);
      }

      if (mode === "diaspora") {
        ch.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "diaspora_contribution_requests", filter: `user_id=eq.${userId}` },
          debounced,
        );
        ch.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "diaspora_enrollments", filter: `user_id=eq.${userId}` },
          debounced,
        );
      }

      ch.subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (!pollTimer) {
            pollTimer = setInterval(() => {
              void bustAndReload();
            }, pollMs);
          }
        } else if (status === "SUBSCRIBED") {
          // Light safety poll even when realtime works (missed events / RLS edge cases)
          if (!pollTimer) {
            pollTimer = setInterval(() => {
              void bustAndReload();
            }, Math.max(pollMs, 15_000));
          }
        }
      });

      return () => {
        supabase.removeChannel(ch);
        if (pollTimer) clearInterval(pollTimer);
      };
    }, [userId, mode, pollMs, bustAndReload]),
  );
}
