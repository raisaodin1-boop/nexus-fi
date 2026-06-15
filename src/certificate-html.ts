/** HTML certificats HODIX — convertis en PDF via expo-print côté client. */
import { wrapYorixDocumentHtml } from "./yorix-document-html";

export function generateCertificateHtml(opts: {
  title: string;
  subtitle: string;
  holderName: string;
  lines: string[];
  footer: string;
  verificationCode: string;
}): string {
  const { title, subtitle, holderName, lines, footer, verificationCode } = opts;
  const linesHtml = lines.map((l) => `<li>${l}</li>`).join("");
  const body = `
    <ul>${linesHtml}</ul>
    <p>${footer}</p>
  `;
  return wrapYorixDocumentHtml(body, {
    documentTitle: title,
    subtitle,
    holderName,
    verificationCode,
  });
}
