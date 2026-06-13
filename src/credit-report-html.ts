/**
 * Rapport de crédit HODIX — PDF avec en-tête et cachet Yorix.
 */
import { type CreditScoreResult, getTier } from "@/src/credit-score";
import { wrapYorixDocumentHtml } from "@/src/yorix-document-html";

export function generateCreditReportHtml(
  data: CreditScoreResult & { tips?: string[]; user?: any },
): string {
  const tier = getTier(data.score);
  const now = new Date();
  const timeStr = now.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const verificationCode = Math.random().toString(36).slice(2, 10).toUpperCase();
  const { breakdown } = data;

  const barHtml = (label: string, value: number, max: number, color: string, pct: string) => {
    const ratio = Math.round((value / max) * 100);
    return `
    <div class="bar-row">
      <div class="bar-label"><span>${label}</span><span class="bar-pct">${pct}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${ratio}%;background:${color}"></div></div>
      <div class="bar-val">${value}<span class="bar-max">/${max}</span></div>
    </div>`;
  };

  const tipItems = (data.tips ?? []).map((t) => `<li>${t}</li>`).join("");

  const innerStyles = `
    <style>
      .score-hero { border-left: 5px solid ${tier.color}; padding: 14px 0 18px; margin-bottom: 16px; display: flex; align-items: center; gap: 20px; border-bottom: 1px solid #e2e8f0; }
      .score-circle { width: 88px; height: 88px; border-radius: 50%; border: 4px solid ${tier.color}; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; }
      .score-num { font-size: 30px; font-weight: 900; color: ${tier.color}; line-height: 1; }
      .score-denom { font-size: 11px; color: #94a3b8; }
      .tier-badge { display: inline-block; background: ${tier.color}22; color: ${tier.color}; border: 1px solid ${tier.color}; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 700; }
      .eligible { display: inline-block; background: #10b98122; color: #10b981; border: 1px solid #10b981; border-radius: 20px; padding: 3px 10px; font-size: 10px; font-weight: 600; margin-left: 6px; }
      .not-eligible { display: inline-block; background: #ef444422; color: #ef4444; border: 1px solid #ef4444; border-radius: 20px; padding: 3px 10px; font-size: 10px; font-weight: 600; margin-left: 6px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .card { background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; padding: 14px; }
      .card-title { font-size: 12px; font-weight: 700; margin-bottom: 10px; color: #1b5e20; border-bottom: 2px solid ${tier.color}; padding-bottom: 5px; }
      .bar-row { margin-bottom: 10px; }
      .bar-label { display: flex; justify-content: space-between; font-size: 10px; color: #64748b; margin-bottom: 3px; }
      .bar-track { height: 7px; background: #f1f5f9; border-radius: 4px; overflow: hidden; }
      .bar-fill { height: 100%; border-radius: 4px; }
      .bar-val { font-size: 11px; font-weight: 700; text-align: right; margin-top: 2px; }
      .bar-max { font-weight: 400; color: #94a3b8; }
      .info-row { display: flex; justify-content: space-between; font-size: 11px; padding: 5px 0; border-bottom: 1px solid #f1f5f9; }
      .info-label { color: #64748b; }
      .info-val { font-weight: 600; }
      .tips ul { padding-left: 16px; margin: 0; }
      .tips li { font-size: 11px; color: #475569; line-height: 1.5; margin-bottom: 4px; }
      .tier-ladder { display: flex; gap: 0; margin-top: 6px; }
      .tier-seg { flex: 1; height: 7px; }
      .tier-names { display: flex; margin-top: 3px; }
      .tier-name { flex: 1; font-size: 7px; color: #94a3b8; text-align: center; }
    </style>
  `;

  const body = `${innerStyles}
    <div class="score-hero">
      <div class="score-circle">
        <div class="score-num">${data.score}</div>
        <div class="score-denom">/1000</div>
      </div>
      <div>
        <strong style="font-size:16px;">Score de Crédit Hodix</strong><br/>
        <span class="tier-badge">⭐ ${tier.label}</span>
        ${data.is_loan_eligible
    ? '<span class="eligible">✓ Éligible financement</span>'
    : '<span class="not-eligible">✗ Score &lt; 700</span>'}
        <p style="margin:8px 0 0;font-size:10px;color:#64748b">Fiabilité basée sur épargne et contributions communautaires.</p>
      </div>
    </div>
    <div class="grid">
      <div class="card">
        <div class="card-title">Décomposition du score</div>
        ${barHtml("Régularité des cotisations", breakdown.regularity, 350, "#1d4ed8", "35%")}
        ${barHtml("Volume d'épargne", breakdown.savings_volume, 250, "#f59e0b", "25%")}
        ${barHtml("Ancienneté", breakdown.seniority, 200, "#8b5cf6", "20%")}
        ${barHtml("Réseau communautaire", breakdown.network, 100, "#10b981", "10%")}
        ${barHtml("Niveau KYC", breakdown.kyc, 100, "#06b6d4", "10%")}
      </div>
      <div>
        <div class="card" style="margin-bottom:14px">
          <div class="card-title">Niveaux de score</div>
          <div class="tier-ladder">
            <div class="tier-seg" style="background:#94a3b8;border-radius:4px 0 0 4px"></div>
            <div class="tier-seg" style="background:#cd7f32"></div>
            <div class="tier-seg" style="background:#8b9eb0"></div>
            <div class="tier-seg" style="background:#d4af37"></div>
            <div class="tier-seg" style="background:#8b5cf6;border-radius:0 4px 4px 0"></div>
          </div>
          <div class="tier-names">
            <span class="tier-name">Débutant</span><span class="tier-name">Bronze</span>
            <span class="tier-name">Argent</span><span class="tier-name">Or</span><span class="tier-name">Platine</span>
          </div>
          <div style="margin-top:10px">
            <div class="info-row"><span class="info-label">Votre niveau</span><span class="info-val" style="color:${tier.color}">${tier.label}</span></div>
            <div class="info-row"><span class="info-label">Seuil financement</span><span class="info-val">700 / 1000</span></div>
            <div class="info-row"><span class="info-label">Calculé le</span><span class="info-val">${timeStr}</span></div>
          </div>
        </div>
        <div class="card tips">
          <div class="card-title">Recommandations</div>
          <ul>${tipItems || "<li>Excellent profil — continuez sur cette lancée.</li>"}</ul>
        </div>
      </div>
    </div>
  `;

  return wrapYorixDocumentHtml(body, {
    documentTitle: "Rapport de Crédit Officiel",
    subtitle: "HODIX — Identité financière participative",
    verificationCode,
    docRef: verificationCode,
  });
}
