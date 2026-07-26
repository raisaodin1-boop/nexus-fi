// Cross-platform dialogs — react-native-web's Alert.alert is a no-op,
// so confirmations must go through window.confirm on web.
import { Alert, Platform } from "react-native";

interface ConfirmOptions {
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

export function confirmDialog(
  title: string,
  message: string,
  opts: ConfirmOptions = {},
): Promise<boolean> {
  const { confirmText = "Confirmer", cancelText = "Annuler", destructive = false } = opts;
  if (Platform.OS === "web") {
    return Promise.resolve(
      typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`),
    );
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelText, style: "cancel", onPress: () => resolve(false) },
      {
        text: confirmText,
        style: destructive ? "destructive" : "default",
        onPress: () => resolve(true),
      },
    ]);
  });
}

/** Simple informational dialog (single OK button). */
export function infoDialog(title: string, message: string): void {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message, [{ text: "OK" }]);
}

/** Free-text prompt. Falls back to null on Android where Alert.prompt does not exist —
 *  callers must offer preset choices in that case. */
export function promptDialog(title: string, message: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return Promise.resolve(
      typeof window !== "undefined" ? window.prompt(`${title}\n\n${message}`) : null,
    );
  }
  return new Promise((resolve) => {
    if (Alert.prompt) {
      Alert.prompt(title, message, (value) => resolve(value ?? null));
    } else {
      resolve(null);
    }
  });
}
