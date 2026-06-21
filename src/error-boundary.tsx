import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { captureError } from "@/src/observability";
import { Colors, Spacing } from "@/src/theme";

interface State { hasError: boolean; message: string }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: any): State {
    return { hasError: true, message: error?.message ?? String(error) };
  }

  componentDidCatch(error: any, info: any) {
    captureError(error, { componentStack: info?.componentStack });
    if (__DEV__) console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  reset = () => this.setState({ hasError: false, message: "" });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>⚠️</Text>
        <Text style={styles.title}>Une erreur est survenue</Text>
        <Text style={styles.message} numberOfLines={4}>{this.state.message}</Text>
        <TouchableOpacity style={styles.btn} onPress={this.reset}>
          <Text style={styles.btnText}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center", padding: Spacing.xl },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: { color: Colors.text, fontSize: 20, fontWeight: "900", marginBottom: 12, textAlign: "center" },
  message: { color: Colors.textMuted, fontSize: 13, textAlign: "center", marginBottom: 24, lineHeight: 20 },
  btn: { backgroundColor: Colors.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
