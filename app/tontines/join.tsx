import { useRouter } from "expo-router";
import { GroupJoinForm } from "@/src/group-forms";

export default function TontineJoin() {
  const router = useRouter();
  return (
    <GroupJoinForm
      title="Rejoindre une tontine"
      endpoint="/tontines/join"
      testIDPrefix="tontine-join"
      onSuccess={(d) => router.replace(`/tontines/${d.tontine_id}`)}
    />
  );
}
