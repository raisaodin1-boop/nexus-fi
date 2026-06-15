import { Platform } from "react-native";
import Head from "expo-router/head";

import {
  OG_IMAGE_HEIGHT,
  OG_IMAGE_URL,
  OG_IMAGE_WIDTH,
  SITE_ORIGIN,
  absoluteUrl,
  isNoindexPath,
} from "@/src/seo-config";

export { SITE_ORIGIN, absoluteUrl, isNoindexPath } from "@/src/seo-config";

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export interface SeoMeta {
  title: string;
  description: string;
  breadcrumbs?: BreadcrumbItem[];
  noindex?: boolean;
}

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function SeoHead({ title, description, path, breadcrumbs, noindex }: SeoMeta & { path: string }) {
  if (Platform.OS !== "web") return null;

  const canonical = absoluteUrl(path);
  const shouldNoindex = noindex ?? isNoindexPath(path);
  const jsonLd = breadcrumbs?.length ? buildBreadcrumbJsonLd(breadcrumbs) : null;

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta
        name="robots"
        content={shouldNoindex ? "noindex, nofollow" : "index, follow, max-image-preview:large"}
      />
      <meta property="og:url" content={canonical} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:image" content={OG_IMAGE_URL} />
      <meta property="og:image:width" content={String(OG_IMAGE_WIDTH)} />
      <meta property="og:image:height" content={String(OG_IMAGE_HEIGHT)} />
      <meta property="og:image:alt" content="HODIX – Tontines digitales africaines" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={OG_IMAGE_URL} />
      {jsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      ) : null}
    </Head>
  );
}
