import { usePathname } from "expo-router";

import { SeoHead } from "@/src/seo";
import { seoForPath } from "@/src/seo-routes";

/** Per-route canonical URLs + BreadcrumbList JSON-LD on web. */
export function DynamicSeo() {
  const pathname = usePathname();
  const meta = seoForPath(pathname ?? "/");
  return <SeoHead {...meta} />;
}
