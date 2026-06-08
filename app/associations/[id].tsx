import { useLocalSearchParams } from "expo-router";
import { GroupDetailView } from "@/src/group-detail";

export default function AssociationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <GroupDetailView
      endpoint={`/associations/${id}`}
      contributeEndpoint={`/associations/${id}/contribute`}
      detailKey="association"
      testIDPrefix="assoc"
    />
  );
}
