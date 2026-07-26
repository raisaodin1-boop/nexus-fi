import { useRouter } from "expo-router";
import { GroupCreateForm } from "@/src/group-forms";

export default function TontineCreate() {
  const router = useRouter();
  return (
    <GroupCreateForm
      title="Nouvelle tontine"
      subtitle="Groupe par défaut (visible sur Découvrir). Choisissez Personnelle seulement pour un cercle privé."
      endpoint="/tontines"
      showContribution
      showRotationMode
      testIDPrefix="tontine-create"
      onSuccess={() => router.replace("/manage" as any)}
    />
  );
}
