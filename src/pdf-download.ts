/** Generate and download/share a PDF from HTML — works on web (incl. mobile Safari) and native. */
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import * as Print from "expo-print";

async function downloadPdfOnWeb(uri: string, filename: string) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const file = new File([blob], filename, { type: "application/pdf" });

  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: filename });
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function downloadOrSharePdf(html: string, filename: string, dialogTitle = "Enregistrer le document") {
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  if (Platform.OS === "web") {
    await downloadPdfOnWeb(uri, filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
    return;
  }

  const safeName = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
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
