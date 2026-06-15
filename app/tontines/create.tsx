import { useRouter } from "expo-router";
import { GroupCreateForm } from "@/src/group-forms";

export default function TontineCreate() {
  const router = useRouter();
  return (
    <GroupCreateForm
      title="Nouvelle tontine"
      subtitle="Créez une tontine digitale sécurisée."
      endpoint="/tontines"
      showContribution
      showRotationMode
      testIDPrefix="tontine-create"
      onSuccess={(d) => router.replace(`/tontines/${d.id}` as any)}
    />
  );
}
