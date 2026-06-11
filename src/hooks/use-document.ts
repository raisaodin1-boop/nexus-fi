/**
 * useDocument — generate certified Hodix PDF documents using expo-print.
 *
 * Usage:
 *   const { generateAndDownload, generating } = useDocument();
 *   await generateAndDownload({ kind: "trust_score" });
 *
 * KYC gate:
 *   Level 1 — profile fields filled (full_name, phone_number, date_of_birth, address)
 *   Level 2 — admin-approved KYC (kyc_status === "approved")
 */
import { useState, useCallback } from "react";
import { Alert, Modal, Text, TouchableOpacity, View, StyleSheet, Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { router } from "expo-router";
import { api } from "@/src/api";
import { getSupabase } from "@/src/supabase";
import { wrapYorixDocumentHtml } from "@/src/yorix-document-html";

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

/* ── KYC check ─────────────────────────────────────────────────── */

async function checkKyc(): Promise<{ ok: boolean; level?: number; message?: string }> {
  const { data: { session } } = await getSupabase().auth.getSession();
  if (!session?.user) return { ok: false, level: 1, message: "Non authentifié" };

  const { data: profile } = await getSupabase()
    .from("profiles")
    .select("full_name, phone, date_of_birth, address, kyc_status")
    .eq("id", session.user.id)
    .maybeSingle();

  if (!profile) return { ok: false, level: 1, message: "Profil introuvable" };

  // Level 1: required profile fields
  const level1 = !!(profile.full_name && profile.phone && profile.date_of_birth && profile.address);
  if (!level1) {
    return { ok: false, level: 1, message: "Profil incomplet" };
  }

  // Level 2: admin-approved KYC
  if (profile.kyc_status !== "approved") {
    return { ok: false, level: 2, message: "KYC non approuvé" };
  }

  return { ok: true };
}

/* ── HTML certificate builder ──────────────────────────────────── */

function buildCertificateHtml(kind: DocKind, data: any): string {
  const now = new Date().toLocaleDateString("fr-FR", {
    year: "numeric", month: "long", day: "numeric",
  });
  const fullName = data?.full_name ?? "Membre HODIX";
  const verifyCode = Math.random().toString(36).toUpperCase().slice(2, 10);
  const brandColor = "#1B5E20";

  const field = (label: string, value: string, valueStyle = "") =>
    `<div class="field"><div class="field-label">${label}</div><div class="field-value" ${valueStyle ? `style="${valueStyle}"` : ""}>${value}</div></div>`;

  const wrap = (title: string, subtitle: string, body: string) =>
    wrapYorixDocumentHtml(body, {
      documentTitle: title,
      subtitle,
      holderName: fullName,
      verificationCode: verifyCode,
      docRef: verifyCode,
    });

  if (kind === "trust_score") {
    const score = data?.trust_score?.score ?? data?.score ?? 0;
    const level = data?.trust_score?.level ?? data?.level ?? "Bronze";
    const color = score >= 810 ? "#8B5CF6" : score >= 610 ? "#D4AF37" : score >= 310 ? "#8B9EB0" : "#CD7F32";
    return wrap("Certificat Trust Score", "Attestation officielle du score de confiance HODIX", `
      ${field("Score de confiance", `${score} <span style="font-size:14px;color:#64748b">/ 1000</span>`, `font-size:32px;font-weight:900;color:${color};`)}
      <div class="badge" style="background:${color}20;color:${color};">${level}</div>
      ${field("Date de certification", now)}
      <p style="font-size:11px;color:#64748b;margin-top:12px;">Vérification : https://hodix.app/verify/${verifyCode}</p>
    `);
  }

  if (kind === "savings_summary") {
    const totalSaved = data?.total_saved ?? 0;
    const activeGoals = data?.active_goals ?? 0;
    const progressPct = data?.progress_pct ?? 0;
    return wrap("Relevé d'Épargne", "Résumé officiel de votre épargne HODIX", `
      ${field("Total épargné", `${Math.round(totalSaved).toLocaleString("fr-FR")} XAF`, `font-size:24px;font-weight:900;color:${brandColor};`)}
      ${field("Objectifs actifs", String(activeGoals))}
      ${field("Progression globale", `${progressPct}%`)}
      ${field("Date du relevé", now)}
    `);
  }

  if (kind === "tontine_certificate") {
    const tontineName = data?.tontine?.name ?? data?.name ?? "Tontine HODIX";
    const role = data?.role ?? "Membre";
    return wrap("Certificat de Participation", "Attestation officielle de participation à une tontine HODIX", `
      ${field("Tontine", tontineName)}
      ${field("Rôle", role)}
      ${field("Date de certification", now)}
    `);
  }

  if (kind === "contribution_receipt") {
    const amount = data?.amount ?? 0;
    const tontineName = data?.tontine_name ?? "Tontine HODIX";
    return wrap("Reçu de Cotisation", "Reçu officiel de votre cotisation HODIX", `
      ${field("Tontine", tontineName)}
      ${field("Montant", `${Math.round(amount).toLocaleString("fr-FR")} XAF`, `font-size:24px;font-weight:900;color:${brandColor};`)}
      ${field("Date", now)}
    `);
  }

  return wrap("Attestation HODIX", "Document officiel HODIX", field("Date", now));
}

/* ── Main hook ─────────────────────────────────────────────────── */

export function useDocument() {
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateAndDownload = useCallback(
    async (params: { kind: DocKind; ref_id?: string; freeDoc?: boolean }, _baseUrl?: string) => {
      setGenerating(true);
      setError(null);
      try {
        // KYC gate
        const kyc = await checkKyc();
        if (!kyc.ok) {
          // Free docs only require Level 1 (profile complete), not KYC approval
          const needsBlock = params.freeDoc ? kyc.level === 1 : true;
          if (!needsBlock) {
            // freeDoc with only level-2 failure → proceed
          } else if (kyc.level === 1) {
            Alert.alert(
              "Profil incomplet",
              "Vous devez compléter vos informations personnelles (nom, téléphone, date de naissance, adresse) avant d'accéder aux certificats.",
              [
                { text: "Annuler", style: "cancel" },
                { text: "Compléter mon profil →", onPress: () => router.push("/complete-profile") },
              ]
            );
            return;
          } else {
            Alert.alert(
              "Vérification KYC requise",
              "Votre identité doit être approuvée par l'administration avant d'accéder aux certificats. Complétez vos 2 niveaux de vérification.",
              [
                { text: "Fermer", style: "cancel" },
                { text: "Vérifier mon identité →", onPress: () => router.push("/kyc") },
              ]
            );
            return;
          }
        }

        // Fetch relevant data
        let certData: any = {};
        try {
          if (params.kind === "trust_score") {
            certData = await api.get<any>("/identity");
          } else if (params.kind === "savings_summary") {
            certData = await api.get<any>("/savings/summary");
            const me = await api.get<any>("/users/me");
            certData.full_name = me.full_name;
          } else if (params.kind === "tontine_certificate" && params.ref_id) {
            const res = await api.get<any>(`/tontines/${params.ref_id}`);
            certData = { ...res.tontine, full_name: res.tontine?.name };
            const me = await api.get<any>("/users/me");
            certData.full_name = me.full_name;
          } else {
            const me = await api.get<any>("/users/me");
            certData = { full_name: me.full_name };
          }
          if (!certData.full_name) {
            const me = await api.get<any>("/users/me");
            certData.full_name = me.full_name;
          }
        } catch {
          // non-blocking — proceed with empty data
        }

        const html = buildCertificateHtml(params.kind, certData);

        setDownloading(true);

        if (Platform.OS === "web") {
          const blob = new Blob([html], { type: "text/html" });
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank");
          return;
        }

        const { uri } = await Print.printToFileAsync({ html, base64: false });
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Enregistrer le certificat",
          UTI: "com.adobe.pdf",
        });
      } catch (e: any) {
        const msg = e?.message ?? "Erreur lors de la génération du document.";
        setError(msg);
        Alert.alert("Erreur", msg);
      } finally {
        setGenerating(false);
        setDownloading(false);
      }
    },
    []
  );

  // Legacy compatibility stubs
  const generate = useCallback(
    async (params: { kind: DocKind; ref_id?: string }): Promise<GeneratedDoc | null> => {
      await generateAndDownload(params);
      return null;
    },
    [generateAndDownload]
  );

  const download = useCallback(async (_doc: GeneratedDoc, _baseUrl?: string) => {}, []);

  const refreshAndDownload = useCallback(
    async (_docId: string, _filename: string, label: string, _baseUrl?: string) => {
      Alert.alert("Info", `Le document "${label}" sera régénéré. Utilisez le bouton de génération principal.`);
    },
    []
  );

  const listDocuments = useCallback(async (): Promise<DocListItem[]> => {
    // Documents are generated on-the-fly — no server-side list
    return [];
  }, []);

  return {
    generate,
    download,
    generateAndDownload,
    refreshAndDownload,
    listDocuments,
    generating,
    downloading,
    error,
  };
}
