// Hook to detect first launch — persists across app restarts
import { useEffect, useState } from "react";
import { storage } from "@/src/utils/storage";

const KEY = "hodix_welcome_seen";

export function useFirstLaunch(): { isFirstLaunch: boolean | null; markAsSeen: () => Promise<void> } {
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);

  useEffect(() => {
    storage.getItem(KEY, false).then((val) => {
      setIsFirstLaunch(!val);
    }).catch(() => {
      setIsFirstLaunch(false);
    });
  }, []);

  const markAsSeen = async () => {
    await storage.setItem(KEY, true);
    setIsFirstLaunch(false);
  };

  return { isFirstLaunch, markAsSeen };
}
