/**
 * Generates a premium HTML credit report for expo-print.
 * Output is a single-page A4 HTML string that expo-print converts to PDF.
 */
import { type CreditScoreResult, getTier } from "@/src/credit-score";

export function generateCreditReportHtml(
  data: CreditScoreResult & { tips?: string[]; user?: any }
): string {
  const tier = getTier(data.score);
  const now = new Date();
  const dateStr = now.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const timeStr = now.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const verificationCode = Math.random().toString(36).slice(2, 10).toUpperCase();
  const { breakdown } = data;

  const barHtml = (label: string, value: number, max: number, color: string, pct: string) => {
    const ratio = Math.round((value / max) * 100);
    return `
    <div class="bar-row">
      <div class="bar-label"><span>${label}</span><span class="bar-pct">${pct}</span></div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${ratio}%;background:${color}"></div>
      </div>
      <div class="bar-val">${value}<span class="bar-max">/${max}</span></div>
    </div>`;
  };

  const tipItems = (data.tips ?? []).map(t => `<li>${t}</li>`).join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rapport de Crédit Hodix</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; background: #F8FAFC; color: #0F172A; font-size: 13px; }

  /* ── Header ── */
  .header { background: linear-gradient(135deg, #0B1F3A 0%, #1D4ED8 100%); padding: 28px 32px 24px; color: #fff; display: flex; justify-content: space-between; align-items: flex-start; }
  .logo-block { display: flex; align-items: center; gap: 12px; }
  .logo-sq { background: #10B981; width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; color: #fff; }
  .logo-text h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
  .logo-text p { font-size: 10px; color: rgba(255,255,255,0.6); }
  .header-right { text-align: right; }
  .header-right p { font-size: 10px; color: rgba(255,255,255,0.6); }
  .doc-title { font-size: 13px; font-weight: 700; margin-bottom: 2px; }

  /* ── Score hero ── */
  .score-hero { background: #fff; border-left: 5px solid ${tier.color}; padding: 20px 32px; display: flex; align-items: center; gap: 28px; border-bottom: 1px solid #E2E8F0; }
  .score-circle { width: 100px; height: 100px; border-radius: 50%; border: 5px solid ${tier.color}; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .score-num { font-size: 36px; font-weight: 900; color: ${tier.color}; line-height: 1; }
  .score-denom { font-size: 12px; color: #94A3B8; }
  .score-meta h2 { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
  .tier-badge { display: inline-flex; align-items: center; gap: 6px; background: ${tier.color}22; color: ${tier.color}; border: 1px solid ${tier.color}; border-radius: 20px; padding: 3px 12px; font-size: 12px; font-weight: 700; }
  .eligible { display: inline-flex; align-items: center; gap: 6px; background: #10B98122; color: #10B981; border: 1px solid #10B981; border-radius: 20px; padding: 3px 12px; font-size: 11px; font-weight: 600; margin-left: 8px; }
  .not-eligible { display: inline-flex; background: #EF444422; color: #EF4444; border: 1px solid #EF4444; border-radius: 20px; padding: 3px 12px; font-size: 11px; font-weight: 600; margin-left: 8px; }

  /* ── Body ── */
  .body { padding: 24px 32px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .card { background: #fff; border-radius: 14px; border: 1px solid #E2E8F0; padding: 18px; }
  .card-title { font-size: 13px; font-weight: 700; margin-bottom: 14px; color: #0B1F3A; border-bottom: 2px solid ${tier.color}; padding-bottom: 6px; }

  /* ── Bars ── */
  .bar-row { margin-bottom: 12px; }
  .bar-label { display: flex; justify-content: space-between; font-size: 11px; color: #64748B; margin-bottom: 4px; }
  .bar-pct { font-weight: 600; color: #94A3B8; }
  .bar-track { height: 8px; background: #F1F5F9; border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; }
  .bar-val { font-size: 12px; font-weight: 700; color: #0F172A; text-align: right; margin-top: 2px; }
  .bar-max { font-weight: 400; color: #94A3B8; }

  /* ── Tier ladder ── */
  .tier-ladder { display: flex; gap: 0; margin-top: 8px; }
  .tier-seg { flex: 1; height: 8px; }
  .tier-names { display: flex; gap: 0; }
  .tier-name { flex: 1; font-size: 8px; color: #94A3B8; text-align: center; }

  /* ── Info grid ── */
  .info-row { display: flex; justify-content: space-between; font-size: 12px; padding: 6px 0; border-bottom: 1px solid #F1F5F9; }
  .info-label { color: #64748B; }
  .info-val { font-weight: 600; }

  /* ── Tips ── */
  .tips ul { padding-left: 16px; }
  .tips li { font-size: 12px; color: #475569; line-height: 1.6; margin-bottom: 4px; }

  /* ── Footer ── */
  .footer { background: #0B1F3A; color: rgba(255,255,255,0.6); padding: 14px 32px; display: flex; justify-content: space-between; align-items: center; font-size: 9px; }
  .footer-code { font-family: monospace; color: #10B981; font-size: 10px; }
  .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-30deg); font-size: 72px; font-weight: 900; color: rgba(0,0,0,0.03); white-space: nowrap; pointer-events: none; z-index: 0; }
</style>
</head>
<body>

<div class="watermark">HODIX CONFIDENTIEL</div>

<!-- Header -->
<div class="header">
  <div class="logo-block">
    <div class="logo-sq">HX</div>
    <div class="logo-text">
      <h1>HODIX</h1>
      <p>Building Trust Together · Africa</p>
    </div>
  </div>
  <div class="header-right">
    <p class="doc-title">RAPPORT DE CRÉDIT OFFICIEL</p>
    <p>Émis le ${dateStr}</p>
    <p>Réf. ${verificationCode}</p>
  </div>
</div>

<!-- Score hero -->
<div class="score-hero">
  <div class="score-circle">
    <div class="score-num">${data.score}</div>
    <div class="score-denom">/1000</div>
  </div>
  <div class="score-meta">
    <h2>Score de Crédit Hodix</h2>
    <span class="tier-badge">⭐ ${tier.label}</span>
    ${data.is_loan_eligible
      ? '<span class="eligible">✓ Éligible au financement</span>'
      : '<span class="not-eligible">✗ Score < 700</span>'}
    <p style="margin-top:10px;font-size:11px;color:#64748B">
      Ce score reflète votre fiabilité financière basée sur vos comportements d'épargne et de contribution communautaire.
    </p>
  </div>
</div>

<!-- Body -->
<div class="body">

  <!-- Breakdown -->
  <div class="card">
    <div class="card-title">📊 Décomposition du score</div>
    ${barHtml("Régularité des cotisations", breakdown.regularity, 350, "#1D4ED8", "35%")}
    ${barHtml("Volume d'épargne", breakdown.savings_volume, 250, "#F59E0B", "25%")}
    ${barHtml("Ancienneté", breakdown.seniority, 200, "#8B5CF6", "20%")}
    ${barHtml("Réseau communautaire", breakdown.network, 100, "#10B981", "10%")}
    ${barHtml("Niveau KYC", breakdown.kyc, 100, "#06B6D4", "10%")}
  </div>

  <!-- Tiers + Info -->
  <div style="display:flex;flex-direction:column;gap:16px">

    <div class="card">
      <div class="card-title">🏅 Niveaux de score</div>
      <div class="tier-ladder">
        <div class="tier-seg" style="background:#94A3B8;border-radius:4px 0 0 4px"></div>
        <div class="tier-seg" style="background:#CD7F32"></div>
        <div class="tier-seg" style="background:#8B9EB0"></div>
        <div class="tier-seg" style="background:#D4AF37"></div>
        <div class="tier-seg" style="background:#8B5CF6;border-radius:0 4px 4px 0"></div>
      </div>
      <div class="tier-names" style="margin-top:4px">
        <span class="tier-name">Débutant</span>
        <span class="tier-name">Bronze</span>
        <span class="tier-name">Argent</span>
        <span class="tier-name">Or</span>
        <span class="tier-name">Platine</span>
      </div>
      <div style="margin-top:12px">
        <div class="info-row"><span class="info-label">Votre niveau</span><span class="info-val" style="color:${tier.color}">${tier.label}</span></div>
        <div class="info-row"><span class="info-label">Seuil financement</span><span class="info-val">700 / 1000</span></div>
        <div class="info-row"><span class="info-label">Calculé le</span><span class="info-val">${timeStr}</span></div>
      </div>
    </div>

    <div class="card tips">
      <div class="card-title">💡 Recommandations</div>
      <ul>${tipItems || "<li>Excellent profil — continuez sur cette lancée.</li>"}</ul>
    </div>

  </div>

</div>

<!-- Footer -->
<div class="footer">
  <span>© ${now.getFullYear()} Hodix · Ce rapport est confidentiel et destiné à l'usage exclusif du titulaire.</span>
  <span class="footer-code">CODE : ${verificationCode}</span>
</div>

</body>
</html>`;
}
