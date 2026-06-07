import { Tabs } from "expo-router";
import { Platform, View } from "react-native";
import { Home, Users, ShieldCheck, User, PiggyBank } from "lucide-react-native";
import { Colors } from "@/src/theme";

function TabIcon({ Icon, focused }: { Icon: any; focused: boolean }) {
  return (
    <View style={{
      alignItems: "center", justifyContent: "center",
      width: 48, height: 32, borderRadius: 16,
      backgroundColor: focused ? Colors.primaryLight : "transparent",
    }}>
      <Icon size={22} color={focused ? Colors.primary : Colors.textMuted} strokeWidth={focused ? 2.5 : 1.8} />
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 84 : 64,
          paddingBottom: Platform.OS === "ios" ? 28 : 8,
          paddingTop: 8,
          ...(Platform.OS === "web" ? { boxShadow: "0 -1px 12px rgba(0,0,0,0.06)" } : {}),
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Accueil",
          tabBarIcon: ({ focused }) => <TabIcon Icon={Home} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: "Groupes",
          tabBarIcon: ({ focused }) => <TabIcon Icon={Users} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="savings"
        options={{
          title: "Épargne",
          tabBarIcon: ({ focused }) => <TabIcon Icon={PiggyBank} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="identity"
        options={{
          title: "Identité",
          tabBarIcon: ({ focused }) => <TabIcon Icon={ShieldCheck} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ focused }) => <TabIcon Icon={User} focused={focused} />,
        }}
      />
    </Tabs>
  );
}
