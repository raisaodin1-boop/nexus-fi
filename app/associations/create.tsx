import { useRouter } from "expo-router";
import { GroupCreateForm } from "@/src/group-forms";

export default function CreateAssociation() {
  const router = useRouter();
  return (
    <GroupCreateForm
      title="Nouvelle association"
      subtitle="Animez votre communauté autour d'une cause commune."
      endpoint="/associations"
      testIDPrefix="assoc-create"
      onSuccess={(d) => router.replace(`/${d.id}`)}
    />
  );
}
