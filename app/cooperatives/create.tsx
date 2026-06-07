import { useRouter } from "expo-router";
import { GroupCreateForm } from "@/src/group-forms";

export default function CooperativeCreate() {
  const router = useRouter();
  return (
    <GroupCreateForm
      title="Nouvelle coopérative"
      subtitle="Gérez votre coopérative avec transparence."
      endpoint="/cooperatives"
      testIDPrefix="coop-create"
      onSuccess={(d) => router.replace(`/cooperatives/${d.id}` as any)}
    />
  );
}
