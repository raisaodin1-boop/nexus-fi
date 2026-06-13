/**
 * En-tête et cachet officiel YORIX DIGITAL GROUP SARL pour tous les PDF HODIX.
 */
import { YORIX_LETTERHEAD_B64, YORIX_STAMP_B64 } from "./yorix-brand-images";

export interface YorixDocOpts {
  documentTitle?: string;
  subtitle?: string;
  holderName?: string;
  verificationCode?: string;
  docRef?: string;
}

export const YORIX_CONTENT_STYLES = `
  .doc-title { font-size: 20px; font-weight: 800; color: #1B5E20; margin: 0 0 6px; line-height: 1.25; }
  .doc-subtitle { font-size: 13px; color: #475569; margin: 0 0 18px; }
  .holder-name { font-size: 22px; font-weight: 900; color: #0f172a; margin: 0 0 16px; }
  .doc-body { font-size: 13px; color: #0f172a; line-height: 1.65; }
  .doc-body ul { margin: 8px 0 0; padding-left: 20px; }
  .doc-body li { margin-bottom: 6px; }
  .doc-body p { margin: 0 0 10px; }
  .field { margin-bottom: 14px; }
  .field-label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 3px; }
  .field-value { font-size: 15px; font-weight: 600; color: #0f172a; }
  .badge { display: inline-block; background: #1B5E2018; color: #1B5E20; font-weight: 700; font-size: 12px; padding: 4px 12px; border-radius: 20px; margin-top: 6px; }
  .verify-box { margin-top: 20px; padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; }
  .verify-label { font-size: 10px; font-weight: 700; color: #64748b; margin-bottom: 4px; }
  .verify-code { font-family: ui-monospace, monospace; font-size: 16px; font-weight: 900; color: #1B5E20; letter-spacing: 1px; }
  .doc-footer-meta { margin-top: 18px; font-size: 10px; color: #64748b; line-height: 1.5; }
  .issued { margin-top: 4px; }
`;

const PAGE_STYLES = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 210mm; }
  body { font-family: "Segoe UI", Helvetica, Arial, sans-serif; color: #0f172a; background: #fff; }
  .page {
    position: relative;
    width: 210mm;
    min-height: 297mm;
    background-repeat: no-repeat;
    background-size: 100% 100%;
    background-position: top center;
  }
  .content {
    position: relative;
    padding: 46mm 14mm 34mm 14mm;
    min-height: 240mm;
  }
  .stamp {
    position: absolute;
    right: 10mm;
    bottom: 6mm;
    width: 34mm;
    height: auto;
    opacity: 0.96;
    z-index: 2;
  }
  ${YORIX_CONTENT_STYLES}
`;

export function wrapYorixDocumentHtml(bodyHtml: string, opts: YorixDocOpts = {}): string {
  const letterhead = `data:image/png;base64,${YORIX_LETTERHEAD_B64}`;
  const stamp = `data:image/png;base64,${YORIX_STAMP_B64}`;
  const dateStr = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const titleBlock = opts.documentTitle
    ? `<h1 class="doc-title">${opts.documentTitle}</h1>`
    : "";
  const subtitleBlock = opts.subtitle
    ? `<p class="doc-subtitle">${opts.subtitle}</p>`
    : "";
  const holderBlock = opts.holderName
    ? `<p class="holder-name">${opts.holderName}</p>`
    : "";
  const verifyBlock = opts.verificationCode
    ? `<div class="verify-box">
        <div class="verify-label">Code de vérification</div>
        <div class="verify-code">${opts.verificationCode}</div>
        ${opts.docRef ? `<div class="issued">Réf. ${opts.docRef}</div>` : ""}
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>${PAGE_STYLES}</style>
</head>
<body>
<div class="page" style="background-image:url('${letterhead}')">
  <div class="content">
    ${titleBlock}
    ${subtitleBlock}
    ${holderBlock}
    <div class="doc-body">${bodyHtml}</div>
    ${verifyBlock}
    <div class="doc-footer-meta">
      <p class="issued">Document émis le ${dateStr} · YORIX DIGITAL GROUP SARL · Plateforme HODIX</p>
      <p>Carrefour Barrière Ahala, Yaoundé — Cameroun · RCCM CM-NSI-02-2026-B12-00534</p>
    </div>
    <img class="stamp" src="${stamp}" alt="Cachet officiel Yorix Digital Group"/>
  </div>
</div>
</body>
</html>`;
}
