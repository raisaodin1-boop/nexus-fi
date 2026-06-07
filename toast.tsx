// HODIX Toast — global notification system.
// Usage: wrap app in <ToastProvider>, call useToast().show(message, type, duration)
import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { CheckCircle2, XCircle, Info } from "lucide-react-native";
import { Colors, Radius, Spacing } from "@/src/theme";

type ToastType = "success" | "error" | "info";

interface ToastState {
  message: string;
  type: ToastType;
  visible: boolean;
}

interface ToastContextValue {
  show: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>({ message: "", type: "info", visible: false });
  const opacity = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, type: ToastType = "info", duration = 3000) => {
    // Cancel any running timer
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    // Reset opacity in case a toast is already showing
    opacity.setValue(0);

    setToast({ message, type, visible: true });

    Animated.timing(opacity, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      timeoutRef.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          setToast((prev) => ({ ...prev, visible: false }));
        });
      }, duration);
    });
  }, [opacity]);

  const bgColor =
    toast.type === "success"
      ? Colors.accent
      : toast.type === "error"
      ? Colors.danger
      : Colors.secondary;

  const Icon =
    toast.type === "success" ? CheckCircle2 : toast.type === "error" ? XCircle : Info;

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast.visible && (
        <Animated.View style={[styles.container, { backgroundColor: bgColor, opacity }]}>
          <Icon color="#fff" size={18} />
          <Text style={styles.text}>{toast.message}</Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 40,
    left: Spacing.xl,
    right: Spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 14,
    borderRadius: Radius.xl,
    zIndex: 9999,
    // Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  text: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
    lineHeight: 20,
  },
});
