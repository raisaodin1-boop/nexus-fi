import { Platform } from "react-native";
import Head from "expo-router/head";

export const SITE_ORIGIN = "https://www.hodix.app";

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export interface SeoMeta {
  title: string;
  description: string;
  breadcrumbs?: BreadcrumbItem[];
}

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_ORIGIN}${item.path.startsWith("/") ? item.path : `/${item.path}`}`,
    })),
  };
}

export function SeoHead({ title, description, path, breadcrumbs }: SeoMeta & { path: string }) {
  if (Platform.OS !== "web") return null;

  const canonical = `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
  const jsonLd = breadcrumbs?.length ? buildBreadcrumbJsonLd(breadcrumbs) : null;

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta property="og:url" content={canonical} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {jsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      ) : null}
    </Head>
  );
}
