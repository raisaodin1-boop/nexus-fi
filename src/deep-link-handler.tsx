import { useEffect } from "react";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";

import { parseDeepLink } from "@/src/deep-link";

/** Routes inbound hodix:// and https://hodix.app links to Expo Router screens. */
export function DeepLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    const navigate = (url: string) => {
      const route = parseDeepLink(url);
      if (route) {
        try { router.push(route as any); } catch { /* route may not exist yet */ }
      }
    };

    Linking.getInitialURL().then((url) => { if (url) navigate(url); });
    const sub = Linking.addEventListener("url", ({ url }) => navigate(url));
    return () => sub.remove();
  }, [router]);

  return null;
}
