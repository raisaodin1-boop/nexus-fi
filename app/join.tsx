// Associations - Join
import { useRouter } from "expo-router";
import { GroupJoinForm } from "@/src/group-forms";

export default function AssociationJoin() {
  const router = useRouter();
  return (
    <GroupJoinForm
      title="Rejoindre une association"
      endpoint="/associations/join"
      testIDPrefix="assoc-join"
      onSuccess={(d) => router.replace(`/associations/${d.association_id}`)}
    />
  );
}
