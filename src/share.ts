// Native PDF share helper via expo-print + expo-sharing
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { api } from "@/src/api";

export async function sharePdfCertificate(kind: "identity" | "trust-score" | "savings") {
  const resp = await api.get<{ filename: string; html: string }>(`/reports-b64/${kind}`);
  const Print = await import("expo-print");

  if (Platform.OS === "web") {
    const { uri } = await Print.printToFileAsync({ html: resp.html });
    const link = document.createElement("a");
    link.href = uri;
    link.download = resp.filename;
    link.click();
    return;
  }

  const { uri } = await Print.printToFileAsync({ html: resp.html });
  const dest = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ""}${resp.filename}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Le partage n'est pas disponible sur cet appareil.");
  }
  await Sharing.shareAsync(dest, {
    dialogTitle: "Partager le certificat HODIX",
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
  });
}
