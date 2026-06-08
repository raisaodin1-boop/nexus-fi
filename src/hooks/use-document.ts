/**
 * useDocument — generate, list, and download certified Hodix PDF documents.
 *
 * Usage:
 *   const { generate, downloading } = useDocument();
 *   await generate({ kind: "tontine_certificate", ref_id: tontineId });
 */
import { useState, useCallback } from "react";
import { Platform, Alert } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { api } from "@/src/api";

const _BASE = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");

export type DocKind =
  | "tontine_certificate"
  | "contribution_receipt"
  | "tontine_disbursement"
  | "savings_summary"
  | "trust_score";

export interface GeneratedDoc {
  doc_id: string;
  kind: DocKind;
  filename: string;
  label: string;
  download_url: string;
  expires_at: string;
  verification_code: string;
  verify_url: string;
}

export interface DocListItem {
  id: string;
  kind: DocKind;
  label: string;
  filename: string;
  verification_code: string;
  size_bytes: number;
  created_at: string;
}

async function _downloadAndShare(doc: GeneratedDoc, baseUrl: string = _BASE): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.open(baseUrl + doc.download_url, "_blank");
    }
    return;
  }

  const localUri = FileSystem.cacheDirectory + doc.filename;
  const fullUrl = baseUrl + doc.download_url;

  // Download to cache
  const dl = await FileSystem.downloadAsync(fullUrl, localUri);
  if (dl.status !== 200) {
    throw new Error(`Téléchargement échoué (${dl.status})`);
  }

  // Share sheet
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(dl.uri, {
      mimeType: "application/pdf",
      dialogTitle: doc.label,
      UTI: "com.adobe.pdf",
    });
  } else {
    Alert.alert("Téléchargé", `Fichier enregistré dans le cache: ${doc.filename}`);
  }
}

export function useDocument() {
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (params: { kind: DocKind; ref_id?: string }): Promise<GeneratedDoc | null> => {
      setGenerating(true);
      setError(null);
      try {
        const doc = await api.post<GeneratedDoc>("/documents/generate", params);
        return doc;
      } catch (e: any) {
        const msg = e?.message ?? "Échec de la génération du document.";
        setError(msg);
        Alert.alert("Erreur", msg);
        return null;
      } finally {
        setGenerating(false);
      }
    },
    []
  );

  const download = useCallback(async (doc: GeneratedDoc, baseUrl: string = "") => {
    setDownloading(true);
    setError(null);
    try {
      await _downloadAndShare(doc, baseUrl);
    } catch (e: any) {
      const msg = e?.message ?? "Échec du téléchargement.";
      setError(msg);
      Alert.alert("Erreur", msg);
    } finally {
      setDownloading(false);
    }
  }, []);

  const generateAndDownload = useCallback(
    async (params: { kind: DocKind; ref_id?: string }, baseUrl: string = "") => {
      const doc = await generate(params);
      if (doc) await download(doc, baseUrl);
    },
    [generate, download]
  );

  const refreshAndDownload = useCallback(
    async (docId: string, filename: string, label: string, baseUrl: string = "") => {
      setDownloading(true);
      setError(null);
      try {
        const refreshed = await api.post<{ download_url: string; expires_at: string }>(
          `/documents/${docId}/refresh-url`,
          {}
        );
        const fakeDoc: GeneratedDoc = {
          doc_id: docId,
          kind: "trust_score",
          filename,
          label,
          download_url: refreshed.download_url,
          expires_at: refreshed.expires_at,
          verification_code: "",
          verify_url: "",
        };
        await _downloadAndShare(fakeDoc, baseUrl);
      } catch (e: any) {
        const msg = e?.message ?? "Échec du téléchargement.";
        setError(msg);
        Alert.alert("Erreur", msg);
      } finally {
        setDownloading(false);
      }
    },
    []
  );

  const listDocuments = useCallback(async (): Promise<DocListItem[]> => {
    try {
      const res = await api.get<{ items: DocListItem[] }>("/documents");
      return res.items ?? [];
    } catch {
      return [];
    }
  }, []);

  return { generate, download, generateAndDownload, refreshAndDownload, listDocuments, generating, downloading, error };
}
