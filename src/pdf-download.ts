/** Generate and download/share a PDF from HTML — web (iframe) + native (expo-print). */
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import * as Print from "expo-print";

/** Web/PWA: expo-print imprime la page entière — on utilise une iframe isolée. */
async function printHtmlOnWeb(html: string, filename: string): Promise<void> {
  if (typeof document === "undefined") {
    throw new Error("Génération PDF indisponible sur cette plateforme.");
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", filename);
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    throw new Error("Impossible de préparer le document PDF.");
  }

  doc.open();
  doc.write(html);
  doc.close();

  await new Promise<void>((resolve) => {
    const done = () => {
      setTimeout(resolve, 350);
    };
    if (iframe.contentWindow?.document?.readyState === "complete") {
      done();
    } else {
      iframe.onload = done;
      setTimeout(done, 1200);
    }
  });

  try {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  } finally {
    setTimeout(() => {
      if (iframe.parentNode) document.body.removeChild(iframe);
    }, 1500);
  }
}


export async function downloadOrSharePdf(html: string, filename: string, dialogTitle = "Enregistrer le document") {
  const safeName = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;

  if (Platform.OS === "web") {
    await printHtmlOnWeb(html, safeName);
    return;
  }

  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
    width: 595,
    height: 842,
  });

  const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
  const dest = `${baseDir}${safeName}`;
  await FileSystem.copyAsync({ from: uri, to: dest });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(dest, {
      mimeType: "application/pdf",
      dialogTitle,
      UTI: "com.adobe.pdf",
    });
    return;
  }

  throw new Error("Le partage n'est pas disponible sur cet appareil.");
}
