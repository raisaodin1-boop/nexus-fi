/** HTML certificats HODIX — convertis en PDF via expo-print côté client. */

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
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><style>
  body{font-family:Segoe UI,Arial,sans-serif;margin:0;padding:40px;background:#f8fafc;color:#0f172a}
  .card{background:#fff;border-radius:16px;padding:40px;max-width:700px;margin:0 auto;border:2px solid #10B981}
  h1{color:#0B1F3A;font-size:26px;margin:0 0 8px}
  h2{color:#64748b;font-size:14px;font-weight:600;margin:0 0 24px}
  .name{font-size:22px;font-weight:900;color:#0B1F3A;margin:16px 0}
  ul{line-height:1.8;font-size:14px;padding-left:20px}
  .footer{margin-top:28px;font-size:12px;color:#94a3b8;line-height:1.6}
  .code{font-family:monospace;font-weight:800;color:#10B981}
  </style></head><body><div class="card">
  <h1>${title}</h1><h2>${subtitle}</h2>
  <div class="name">${holderName}</div>
  <ul>${linesHtml}</ul>
  <p class="footer">${footer}<br>Code de vérification : <span class="code">${verificationCode}</span></p>
  </div></body></html>`;
}
