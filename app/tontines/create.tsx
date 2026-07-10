import { useRouter } from "expo-router";
import { GroupCreateForm } from "@/src/group-forms";

export default function TontineCreate() {
  const router = useRouter();
  return (
    <GroupCreateForm
      title="Nouvelle tontine"
      subtitle="Publique par défaut. Choisissez privée seulement si vous le souhaitez expressément."
      endpoint="/tontines"
      showContribution
      showRotationMode
      testIDPrefix="tontine-create"
      onSuccess={() => router.replace("/manage" as any)}
    />
  );
}
