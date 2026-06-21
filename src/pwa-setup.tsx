import { useEffect } from "react";
import { Platform } from "react-native";

import { replayQueue } from "@/src/offline-queue";

function registerBackgroundSync(reg: ServiceWorkerRegistration) {
  const sync = (reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
  return sync?.register("hodix-replay-queue");
}

/** Registers the service worker and wires background-sync → offline queue replay (web only). */
export function PwaSetup() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "REPLAY_OFFLINE_QUEUE") {
        replayQueue().catch(() => {});
      }
    };

    navigator.serviceWorker.addEventListener("message", onSwMessage);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => registerBackgroundSync(registration))
      .catch(() => {});

    const onOnline = () => {
      replayQueue().catch(() => {});
      navigator.serviceWorker.ready
        .then((reg) => {
          reg.active?.postMessage({ type: "REGISTER_SYNC" });
          return registerBackgroundSync(reg);
        })
        .catch(() => {});
    };

    window.addEventListener("online", onOnline);

    return () => {
      navigator.serviceWorker.removeEventListener("message", onSwMessage);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return null;
}
