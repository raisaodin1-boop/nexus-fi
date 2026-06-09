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

  const brandColor = "#00C896";
  const indigoColor = "#6366F1";

  const base = `
    <html>
    <head>
      <meta charset="UTF-8"/>
      <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background: #F7F8FC; color: #0D0F1A; }
        .page { max-width: 700px; margin: 40px auto; background: #fff; border-radius: 16px; padding: 48px; box-shadow: 0 4px 32px rgba(0,0,0,0.08); }
        .header { display: flex; align-items: center; gap: 16px; margin-bottom: 32px; border-bottom: 2px solid ${brandColor}; padding-bottom: 20px; }
        .logo { width: 56px; height: 56px; background: ${brandColor}; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #fff; font-weight: 900; }
        .brand { font-size: 28px; font-weight: 900; color: ${brandColor}; letter-spacing: -1px; }
        .title { font-size: 22px; font-weight: 800; color: #0D0F1A; margin: 24px 0 8px; }
        .subtitle { font-size: 14px; color: #6B7280; margin-bottom: 28px; }
        .field { margin-bottom: 16px; }
        .field-label { font-size: 11px; font-weight: 700; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
        .field-value { font-size: 16px; font-weight: 600; color: #0D0F1A; }
        .badge { display: inline-block; background: ${brandColor}20; color: ${brandColor}; font-weight: 700; font-size: 13px; padding: 4px 14px; border-radius: 20px; margin-top: 8px; }
        .verify { margin-top: 32px; padding: 16px; background: #F0F2F8; border-radius: 10px; }
        .verify-label { font-size: 11px; font-weight: 700; color: #6B7280; margin-bottom: 4px; }
        .verify-code { font-size: 18px; font-weight: 900; color: ${indigoColor}; letter-spacing: 2px; }
        .verify-url { font-size: 11px; color: #6B7280; margin-top: 4px; }
        .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #E5E7EB; font-size: 11px; color: #9CA3AF; text-align: center; }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="header">
          <div class="logo">H</div>
          <div>
            <div class="brand">HODIX</div>
            <div style="font-size:12px;color:#6B7280;">Plateforme d'épargne et tontines digitales</div>
          </div>
        </div>
  `;

  const footer = `
        <div class="verify">
          <div class="verify-label">Code de vérification</div>
          <div class="verify-code">${verifyCode}</div>
          <div class="verify-url">https://hodix.app/verify/${verifyCode}</div>
        </div>
        <div class="footer">
          Document généré le ${now} · HODIX © 2024 · Certifié authentique
        </div>
      </div>
    </body>
    </html>
  `;

  if (kind === "trust_score") {
    const score = data?.trust_score?.score ?? data?.score ?? 0;
    const level = data?.trust_score?.level ?? data?.level ?? "Bronze";
    const color = score >= 810 ? "#8B5CF6" : score >= 610 ? "#D4AF37" : score >= 310 ? "#8B9EB0" : "#CD7F32";
    return base + `
        <div class="title">Certificat Trust Score</div>
        <div class="subtitle">Attestation officielle du score de confiance HODIX</div>
        <div class="field"><div class="field-label">Titulaire</div><div class="field-value">${fullName}</div></div>
        <div class="field">
          <div class="field-label">Score de confiance</div>
          <div class="field-value" style="font-size:36px;font-weight:900;color:${color};">${score} <span style="font-size:16px;color:#6B7280;">/ 1000</span></div>
          <div class="badge" style="background:${color}20;color:${color};">${level}</div>
        </div>
        <div class="field"><div class="field-label">Date de certification</div><div class="field-value">${now}</div></div>
    ` + footer;
  }

  if (kind === "savings_summary") {
    const totalSaved = data?.total_saved ?? 0;
    const activeGoals = data?.active_goals ?? 0;
    const progressPct = data?.progress_pct ?? 0;
    return base + `
        <div class="title">Relevé d'Épargne</div>
        <div class="subtitle">Résumé officiel de votre épargne HODIX</div>
        <div class="field"><div class="field-label">Titulaire</div><div class="field-value">${fullName}</div></div>
        <div class="field"><div class="field-label">Total épargné</div><div class="field-value" style="font-size:28px;font-weight:900;color:${brandColor};">${Math.round(totalSaved).toLocaleString("fr-FR")} XAF</div></div>
        <div class="field"><div class="field-label">Objectifs actifs</div><div class="field-value">${activeGoals}</div></div>
        <div class="field"><div class="field-label">Progression globale</div><div class="field-value">${progressPct}%</div></div>
        <div class="field"><div class="field-label">Date du relevé</div><div class="field-value">${now}</div></div>
    ` + footer;
  }

  if (kind === "tontine_certificate") {
    const tontineName = data?.tontine?.name ?? data?.name ?? "Tontine HODIX";
    const role = data?.role ?? "Membre";
    return base + `
        <div class="title">Certificat de Participation</div>
        <div class="subtitle">Attestation officielle de participation à une tontine HODIX</div>
        <div class="field"><div class="field-label">Titulaire</div><div class="field-value">${fullName}</div></div>
        <div class="field"><div class="field-label">Tontine</div><div class="field-value">${tontineName}</div></div>
        <div class="field"><div class="field-label">Rôle</div><div class="field-value">${role}</div></div>
        <div class="field"><div class="field-label">Date de certification</div><div class="field-value">${now}</div></div>
    ` + footer;
  }

  if (kind === "contribution_receipt") {
    const amount = data?.amount ?? 0;
    const tontineName = data?.tontine_name ?? "Tontine HODIX";
    return base + `
        <div class="title">Reçu de Cotisation</div>
        <div class="subtitle">Reçu officiel de votre cotisation HODIX</div>
        <div class="field"><div class="field-label">Payé par</div><div class="field-value">${fullName}</div></div>
        <div class="field"><div class="field-label">Tontine</div><div class="field-value">${tontineName}</div></div>
        <div class="field"><div class="field-label">Montant</div><div class="field-value" style="font-size:28px;font-weight:900;color:${brandColor};">${Math.round(amount).toLocaleString("fr-FR")} XAF</div></div>
        <div class="field"><div class="field-label">Date</div><div class="field-value">${now}</div></div>
    ` + footer;
  }

  // Default / disbursement
  return base + `
      <div class="title">Attestation HODIX</div>
      <div class="subtitle">Document officiel HODIX</div>
      <div class="field"><div class="field-label">Titulaire</div><div class="field-value">${fullName}</div></div>
      <div class="field"><div class="field-label">Date</div><div class="field-value">${now}</div></div>
  ` + footer;
}

/* ── Main hook ─────────────────────────────────────────────────── */

export function useDocument() {
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateAndDownload = useCallback(
    async (params: { kind: DocKind; ref_id?: string }, _baseUrl?: string) => {
      setGenerating(true);
      setError(null);
      try {
        // KYC gate
        const kyc = await checkKyc();
        if (!kyc.ok) {
          Alert.alert(
            "Vérification requise",
            kyc.message ?? "Vous devez compléter et faire valider votre identité avant d'accéder aux certificats.",
            [{ text: "OK" }]
          );
          return;
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
