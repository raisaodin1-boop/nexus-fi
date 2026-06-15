/**
 * Certificats PDF HODIX — HTML léger (sans images base64 lourdes).
 * Un seul document par kind : identity | trust-score | savings
 */

export type CertificateKind = "identity" | "trust-score" | "savings";

export interface IdentityCertData {
  fullName: string;
  email?: string;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  occupation?: string | null;
  kycStatus?: string | null;
  memberSince?: string | null;
  score?: number;
  scoreLevel?: string;
  scoreColor?: string;
  totalSavings?: number;
  groups?: number;
  tontines?: number;
  currency?: string;
}

export interface SavingsCertData {
  fullName: string;
  totalSaved: number;
  depositsCount: number;
  goalsCount: number;
  currency?: string;
}

export interface TrustScoreCertData {
  fullName: string;
  score: number;
  level: string;
  color: string;
  risk?: string;
  regularity?: number;
  longevity?: number;
  participation?: number;
  engagement?: number;
}

const PAGE_CSS = `
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 210mm;
    min-height: 297mm;
    font-family: "Segoe UI", system-ui, -apple-system, Helvetica, Arial, sans-serif;
    color: #0f172a;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    width: 100%;
    min-height: 269mm;
    padding: 8mm 10mm 12mm;
    position: relative;
    border: 2px solid #1B5E20;
    border-radius: 6px;
  }
  .page::before {
    content: "";
    position: absolute;
    inset: 6mm;
    border: 1px solid #D4AF3744;
    border-radius: 4px;
    pointer-events: none;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 14px;
    border-bottom: 3px solid #1B5E20;
    margin-bottom: 18px;
  }
  .brand-block { display: flex; align-items: center; gap: 12px; }
  .brand-icon {
    width: 52px; height: 52px;
    border-radius: 14px;
    background: linear-gradient(135deg, #1B5E20, #2E7D32);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 900; font-size: 22px; letter-spacing: -1px;
  }
  .brand-name { font-size: 26px; font-weight: 900; color: #1B5E20; letter-spacing: 3px; }
  .brand-sub { font-size: 10px; color: #64748b; font-weight: 600; margin-top: 2px; letter-spacing: 0.5px; }
  .stamp {
    border: 2px solid #D4AF37;
    color: #B8860B;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 1.5px;
    padding: 6px 10px;
    border-radius: 4px;
    transform: rotate(-8deg);
    text-transform: uppercase;
  }
  .doc-title { font-size: 22px; font-weight: 900; color: #1B5E20; margin-bottom: 4px; }
  .doc-subtitle { font-size: 12px; color: #64748b; margin-bottom: 20px; font-weight: 600; }
  .holder {
    background: linear-gradient(135deg, #f0fdf4, #ecfdf5);
    border: 1px solid #bbf7d0;
    border-radius: 12px;
    padding: 16px 18px;
    margin-bottom: 20px;
  }
  .holder-label { font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
  .holder-name { font-size: 24px; font-weight: 900; color: #0f172a; margin-top: 4px; }
  .holder-meta { font-size: 12px; color: #475569; margin-top: 6px; line-height: 1.5; }
  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 20px;
  }
  .stat {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 12px;
    text-align: center;
  }
  .stat-val { font-size: 18px; font-weight: 900; color: #1B5E20; }
  .stat-lbl { font-size: 9px; color: #64748b; font-weight: 700; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.3px; }
  .details { margin-bottom: 20px; }
  .detail-row {
    display: flex;
    justify-content: space-between;
    padding: 9px 0;
    border-bottom: 1px solid #f1f5f9;
    font-size: 13px;
  }
  .detail-label { color: #64748b; font-weight: 600; }
  .detail-value { font-weight: 800; color: #0f172a; text-align: right; max-width: 55%; }
  .footer {
    margin-top: auto;
    padding-top: 16px;
    border-top: 1px solid #e2e8f0;
    font-size: 9px;
    color: #64748b;
    line-height: 1.55;
  }
  .verify {
    margin-top: 14px;
    background: #f8fafc;
    border: 1px dashed #cbd5e1;
    border-radius: 8px;
    padding: 10px 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .verify-code { font-family: ui-monospace, monospace; font-size: 15px; font-weight: 900; color: #1B5E20; letter-spacing: 2px; }
  .legal { margin-top: 10px; font-size: 8px; color: #94a3b8; }
`;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtXaf(n: number, currency = "XAF"): string {
  return `${Math.round(n).toLocaleString("fr-FR")} ${currency}`;
}

function wrapPage(body: string, title: string): string {
  const dateStr = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=210mm"/>
<title>${esc(title)}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="brand-block">
      <div class="brand-icon">H</div>
      <div>
        <div class="brand-name">HODIX</div>
        <div class="brand-sub">Identité financière participative · www.hodix.app</div>
      </div>
    </div>
    <div class="stamp">Vérifié</div>
  </div>
  ${body}
  <div class="footer">
    <div>Document émis le ${dateStr} · Plateforme HODIX</div>
    <div class="legal">YORIX DIGITAL GROUP SARL · RCCM CM-NSI-02-2026-B12-00534 · Yaoundé, Cameroun</div>
  </div>
</div>
</body>
</html>`;
}

function detailRow(label: string, value: string): string {
  return `<div class="detail-row"><span class="detail-label">${esc(label)}</span><span class="detail-value">${esc(value)}</span></div>`;
}

function verifyBlock(code: string): string {
  return `<div class="verify"><span style="font-size:10px;font-weight:700;color:#64748b">Code de vérification</span><span class="verify-code">${esc(code)}</span></div>`;
}

export function buildIdentityCertificateHtml(data: IdentityCertData, verificationCode: string): string {
  const location = [data.city, data.country].filter(Boolean).join(", ") || "—";
  const body = `
    <h1 class="doc-title">Certificat d'Identité Financière</h1>
    <p class="doc-subtitle">Attestation du profil financier et de la fiabilité communautaire</p>
    <div class="holder">
      <div class="holder-label">Titulaire du certificat</div>
      <div class="holder-name">${esc(data.fullName)}</div>
      <div class="holder-meta">${esc(data.email ?? "")}${data.phone ? ` · ${esc(data.phone)}` : ""}<br/>${esc(location)}${data.occupation ? ` · ${esc(data.occupation)}` : ""}</div>
    </div>
    <div class="stats">
      <div class="stat"><div class="stat-val" style="color:${data.scoreColor ?? "#1B5E20"}">${data.score ?? 0}</div><div class="stat-lbl">Score / 1000</div></div>
      <div class="stat"><div class="stat-val">${fmtXaf(data.totalSavings ?? 0, data.currency)}</div><div class="stat-lbl">Total épargné</div></div>
      <div class="stat"><div class="stat-val">${data.groups ?? 0}</div><div class="stat-lbl">Groupes actifs</div></div>
    </div>
    <div class="details">
      ${detailRow("Niveau Trust Score", data.scoreLevel ?? "—")}
      ${detailRow("Statut KYC", data.kycStatus ?? "non soumis")}
      ${detailRow("Tontines", String(data.tontines ?? 0))}
      ${detailRow("Membre depuis", data.memberSince ?? "—")}
    </div>
    <p style="font-size:11px;color:#475569;line-height:1.6;margin-bottom:12px">
      Ce certificat atteste l'identité financière participative du titulaire sur la plateforme HODIX,
      basée sur son historique d'épargne, de contributions et de participation communautaire.
    </p>
    ${verifyBlock(verificationCode)}
  `;
  return wrapPage(body, "Certificat d'Identité Financière HODIX");
}

export function buildSavingsCertificateHtml(data: SavingsCertData, verificationCode: string): string {
  const body = `
    <h1 class="doc-title">Résumé d'Épargne</h1>
    <p class="doc-subtitle">Attestation de l'engagement et du volume d'épargne personnelle</p>
    <div class="holder">
      <div class="holder-label">Titulaire</div>
      <div class="holder-name">${esc(data.fullName)}</div>
    </div>
    <div class="stats">
      <div class="stat"><div class="stat-val">${fmtXaf(data.totalSaved, data.currency)}</div><div class="stat-lbl">Total épargné</div></div>
      <div class="stat"><div class="stat-val">${data.depositsCount}</div><div class="stat-lbl">Dépôts</div></div>
      <div class="stat"><div class="stat-val">${data.goalsCount}</div><div class="stat-lbl">Objectifs</div></div>
    </div>
    <div class="details">
      ${detailRow("Devise", data.currency ?? "XAF")}
      ${detailRow("Date du relevé", new Date().toLocaleDateString("fr-FR"))}
    </div>
    <p style="font-size:11px;color:#475569;line-height:1.6;margin-bottom:12px">
      Ce document résume exclusivement l'activité d'épargne du titulaire sur HODIX.
      Il ne remplace pas un relevé bancaire officiel.
    </p>
    ${verifyBlock(verificationCode)}
  `;
  return wrapPage(body, "Résumé d'Épargne HODIX");
}

export function buildTrustScoreCertificateHtml(data: TrustScoreCertData, verificationCode: string): string {
  const body = `
    <h1 class="doc-title">Certificat Trust Score</h1>
    <p class="doc-subtitle">Attestation officielle du score de confiance HODIX</p>
    <div class="holder">
      <div class="holder-label">Titulaire</div>
      <div class="holder-name">${esc(data.fullName)}</div>
    </div>
    <div class="stats">
      <div class="stat"><div class="stat-val" style="color:${data.color}">${data.score}</div><div class="stat-lbl">Score / 1000</div></div>
      <div class="stat"><div class="stat-val">${esc(data.level)}</div><div class="stat-lbl">Niveau</div></div>
      <div class="stat"><div class="stat-val">${esc(data.risk ?? "—")}</div><div class="stat-lbl">Risque</div></div>
    </div>
    <div class="details">
      ${detailRow("Régularité", `${data.regularity ?? 0} / 100`)}
      ${detailRow("Ancienneté", `${data.longevity ?? 0} / 100`)}
      ${detailRow("Participation", `${data.participation ?? 0} / 100`)}
      ${detailRow("Engagement", `${data.engagement ?? 0} / 100`)}
    </div>
    ${verifyBlock(verificationCode)}
  `;
  return wrapPage(body, "Certificat Trust Score HODIX");
}
