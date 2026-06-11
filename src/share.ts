// PDF share helper — expo-print + download (web) or native share sheet
import { api } from "@/src/api";
import { downloadOrSharePdf } from "@/src/pdf-download";

export async function sharePdfCertificate(kind: "identity" | "trust-score" | "savings") {
  const resp = await api.get<{ filename: string; html: string }>(`/reports-b64/${kind}`);
  await downloadOrSharePdf(resp.html, resp.filename, "Partager le certificat HODIX");
}
