import { useRouter } from "expo-router";
import { GroupCreateForm } from "@/src/group-forms";

export default function FundCreate() {
  const router = useRouter();
  return (
    <GroupCreateForm
      title="Nouveau fonds communautaire"
      subtitle="Collectez et gérez des fonds pour votre communauté."
      endpoint="/funds"
      testIDPrefix="fund-create"
      onSuccess={(d) => router.replace(`/funds/${d.id}` as any)}
    />
  );
}
