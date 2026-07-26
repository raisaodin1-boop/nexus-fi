import { useRouter } from "expo-router";
import { GroupCreateForm } from "@/src/group-forms";

export default function TontineCreate() {
  const router = useRouter();
  return (
    <GroupCreateForm
      title="Nouvelle tontine"
      subtitle="Par défaut Groupe : visible immédiatement sur Découvrir pour tous les membres HODIX."
      endpoint="/tontines"
      showContribution
      showRotationMode
      testIDPrefix="tontine-create"
      onSuccess={() => router.replace("/manage" as any)}
    />
  );
}
