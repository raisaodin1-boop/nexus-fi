import { useRouter } from "expo-router";
import { GroupCreateForm } from "@/src/group-forms";

export default function AssociationCreate() {
  const router = useRouter();
  return (
    <GroupCreateForm
      title="Nouvelle association"
      subtitle="Publique par défaut. Choisissez privée seulement si vous le souhaitez expressément."
      endpoint="/associations"
      testIDPrefix="assoc-create"
      onSuccess={() => router.replace("/manage" as any)}
    />
  );
}
