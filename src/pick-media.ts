/**
 * Cross-platform media picker for KYC / Diaspora uploads.
 * Web: direct <input type="file"> (reliable on hodix.app).
 * Native: expo-image-picker with media-library permission.
 */
import { Platform } from "react-native";

export type PickedMedia = {
  base64: string;
  mime: string;
  fileName?: string | null;
};

export class PickMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PickMediaError";
  }
}

function stripDataUrl(dataUrl: string): string {
  const i = dataUrl.indexOf(",");
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

function pickViaHtmlInput(accept: string): Promise<PickedMedia | null> {
  if (typeof document === "undefined") {
    throw new PickMediaError("Sélecteur de fichier indisponible sur cette plateforme.");
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    let settled = false;
    const finish = (value: PickedMedia | null) => {
      if (settled) return;
      settled = true;
      try { document.body.removeChild(input); } catch { /* ignore */ }
      resolve(value);
    };

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        finish(null);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        settled = true;
        try { document.body.removeChild(input); } catch { /* ignore */ }
        reject(new PickMediaError("Fichier trop volumineux (max 10 Mo)."));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result ?? "");
        const base64 = stripDataUrl(result);
        if (!base64) {
          reject(new PickMediaError("Impossible de lire le fichier sélectionné."));
          return;
        }
        finish({
          base64,
          mime: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
          fileName: file.name,
        });
      };
      reader.onerror = () => reject(new PickMediaError("Lecture du fichier impossible."));
      reader.readAsDataURL(file);
    };

    // Some browsers fire cancel without onchange
    input.addEventListener("cancel", () => finish(null));
    document.body.appendChild(input);
    input.click();
    // Fallback if cancel event unsupported: resolve null when window regains focus with no file
    const onFocus = () => {
      setTimeout(() => {
        if (!settled && !input.files?.length) finish(null);
      }, 400);
      window.removeEventListener("focus", onFocus);
    };
    window.addEventListener("focus", onFocus);
  });
}

export type PickMediaOptions = {
  /** images | images+pdf */
  allowPdf?: boolean;
  quality?: number;
  allowsEditing?: boolean;
};

/** Pick an image (or PDF if allowPdf). Returns null if user cancels. */
export async function pickMedia(opts: PickMediaOptions = {}): Promise<PickedMedia | null> {
  const accept = opts.allowPdf
    ? "image/jpeg,image/png,image/webp,application/pdf,.pdf"
    : "image/jpeg,image/png,image/webp";

  if (Platform.OS === "web") {
    return pickViaHtmlInput(accept);
  }

  const ImagePicker = await import("expo-image-picker");
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new PickMediaError(
      "Autorisez l'accès aux photos dans les réglages de l'appareil pour joindre un document.",
    );
  }

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    base64: true,
    quality: opts.quality ?? 0.8,
    allowsEditing: opts.allowsEditing ?? false,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  if (!asset.base64) {
    throw new PickMediaError("Impossible de lire l'image. Réessayez avec une autre photo.");
  }
  return {
    base64: asset.base64,
    mime: asset.mimeType ?? "image/jpeg",
    fileName: asset.fileName ?? null,
  };
}

/** Convenience: base64 only (legacy callers). */
export async function pickImageBase64(opts?: PickMediaOptions): Promise<string | null> {
  const picked = await pickMedia(opts);
  return picked?.base64 ?? null;
}

export function pickMediaErrorMessage(err: unknown, fallback?: string): string {
  if (err instanceof PickMediaError) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof (err as any).message === "string") {
    const msg = (err as any).message as string;
    if (/permission|denied|accès/i.test(msg)) {
      return "Autorisez l'accès aux photos pour joindre un document.";
    }
  }
  return fallback
    ?? (Platform.OS === "web"
      ? "Sélection du fichier impossible. Réessayez ou changez de navigateur."
      : "Impossible d'accéder à la galerie. Vérifiez les permissions Photos.");
}
