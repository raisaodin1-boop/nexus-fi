import { VerifyCertificateView, useVerifyHash } from "@/src/verify-certificate-screen";

/** Static /verify and /verify?h=… — always included in Expo web export. */
export default function VerifyIndexScreen() {
  const hash = useVerifyHash();
  return <VerifyCertificateView hash={hash} />;
}
