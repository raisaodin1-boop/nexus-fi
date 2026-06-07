import { Tabs } from "expo-router";
import { Users, PiggyBank, User, Award, Home } from "lucide-react-native";
import { Colors } from "@/src/theme";

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
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Accueil",
          tabBarIcon: ({ color, size }) => <Home color={color} size={size - 2} />,
          href: null,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: "Communauté",
          tabBarIcon: ({ color, size }) => <Users color={color} size={size - 2} />,
        }}
      />
      <Tabs.Screen
        name="savings"
        options={{
          title: "Épargne",
          tabBarIcon: ({ color, size }) => <PiggyBank color={color} size={size - 2} />,
        }}
      />
      <Tabs.Screen
        name="identity"
        options={{
          title: "Identité",
          tabBarIcon: ({ color, size }) => <Award color={color} size={size - 2} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, size }) => <User color={color} size={size - 2} />,
        }}
      />
    </Tabs>
  );
}
