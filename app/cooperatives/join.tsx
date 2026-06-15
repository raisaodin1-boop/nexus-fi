import { useRouter } from "expo-router";
import { GroupJoinForm } from "@/src/group-forms";

export default function CooperativeJoin() {
  const router = useRouter();
  return (
    <GroupJoinForm
      title="Rejoindre une coopérative"
      endpoint="/cooperatives/join"
      testIDPrefix="coop-join"
      onSuccess={(d) => router.replace(`/cooperatives/${d.cooperative_id}` as any)}
    />
  );
}
