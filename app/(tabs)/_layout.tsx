import { useRef } from "react";
import { Animated, StyleSheet, TouchableOpacity, View } from "react-native";
import { Tabs } from "expo-router";
import { Users, PiggyBank, User, Award } from "lucide-react-native";
import { Colors } from "@/src/theme";

function AnimatedTabIcon({ Icon, focused, color }: { Icon: any; focused: boolean; color: string }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scaleAnim, { toValue: 0.85, useNativeDriver: true, damping: 10, stiffness: 200 }).start();
  const onPressOut = () =>
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 10, stiffness: 200 }).start();

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Icon color={color} size={22} strokeWidth={focused ? 2.5 : 1.8} />
      {focused && <View style={styles.dot} />}
    </Animated.View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.secondary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 62,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="groups"
        options={{
          title: "Communauté",
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon Icon={Users} focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="savings"
        options={{
          title: "Épargne",
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon Icon={PiggyBank} focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="identity"
        options={{
          title: "Identité",
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon Icon={Award} focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, focused }) => <AnimatedTabIcon Icon={User} focused={focused} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: Colors.secondary,
    alignSelf: "center", marginTop: 3,
  },
});
