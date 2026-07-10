import { VerifyCertificateView, useVerifyHash } from "@/src/verify-certificate-screen";

/** Pre-render a placeholder so the dynamic segment exists in the static export. */
export function generateStaticParams(): { hash: string }[] {
  return [{ hash: "_" }];
}

export default function VerifyHashScreen() {
  const hash = useVerifyHash();
  return <VerifyCertificateView hash={hash} />;
}
