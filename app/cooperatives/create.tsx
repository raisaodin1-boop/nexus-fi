import { useRouter } from "expo-router";
import { GroupCreateForm } from "@/src/group-forms";

export default function CreateCooperative() {
  const router = useRouter();
  return (
    <GroupCreateForm
      title="Nouvelle coopérative"
      subtitle="Construisez un projet collectif durable."
      endpoint="/cooperatives"
      testIDPrefix="coop-create"
      onSuccess={(d) => router.replace(`/${d.id}`)}
    />
  );
}
