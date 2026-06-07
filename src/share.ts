// Native PDF share helper via expo-file-system + expo-sharing
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { api } from "@/src/api";

export async function sharePdfCertificate(kind: "identity" | "trust-score" | "savings") {
  const resp = await api.get<{ filename: string; base64: string }>(`/reports-b64/${kind}`);
  if (Platform.OS === "web") {
    // Web fallback: trigger anonymous download (we know the data is base64)
    const link = document.createElement("a");
    link.href = `data:application/pdf;base64,${resp.base64}`;
    link.download = resp.filename;
    link.click();
    return;
  }
  // Native: write to cache then share
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
  const uri = `${dir}${resp.filename}`;
  await FileSystem.writeAsStringAsync(uri, resp.base64, { encoding: FileSystem.EncodingType.Base64 });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Le partage n'est pas disponible sur cet appareil.");
  }
  await Sharing.shareAsync(uri, {
    dialogTitle: "Partager le certificat Hodix",
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
  });
}
