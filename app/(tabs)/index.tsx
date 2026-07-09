// Tab home — role-aware dashboard
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/auth-context";
import { useAuth } from "@/src/auth-context";
import { Colors } from "@/src/theme";
import { MemberDashboard } from "@/src/member-dashboard";
import { DiasporaMemberDashboard } from "@/src/diaspora-member-dashboard";
import { isDiasporaMember } from "@/src/diaspora-enrollment-config";
import { ManagerDashboard } from "@/src/manager-dashboard";
import { AdminDashboard } from "@/src/admin-dashboard";

export default function HomeTab() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/onboarding");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (user.role === "super_admin" || (user.role as string) === "admin") return <AdminDashboard />;
  if (user.role === "tontine_manager") return <ManagerDashboard />;
  if (isDiasporaMember(user)) return <DiasporaMemberDashboard embeddedInTabs skipGuard />;
  return <MemberDashboard />;
}
