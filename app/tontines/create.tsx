import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { GroupCreateForm } from "@/src/group-forms";

export default function TontineCreate() {
  const router = useRouter();
  return (
    <GroupCreateForm
      title="Nouvelle tontine"
      subtitle="Groupe : sur Découvrir si le risque est faible. Montants élevés ou 1ʳᵉ tontine publique d’un compte neuf → revue HODIX."
      endpoint="/tontines"
      showContribution
      showRotationMode
      testIDPrefix="tontine-create"
      onSuccess={(data) => {
        if (data?.moderation_status === "pending_review") {
          Alert.alert(
            "Revue HODIX",
            `Votre tontine est créée mais pas encore sur Découvrir.\n${data.moderation_reason ?? "Contrôle risque en cours."}`,
            [{ text: "OK", onPress: () => router.replace("/manage" as any) }],
          );
          return;
        }
        router.replace("/manage" as any);
      }}
    />
  );
}
