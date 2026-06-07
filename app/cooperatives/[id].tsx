import { useLocalSearchParams } from "expo-router";
import { GroupDetailView } from "@/src/group-detail";

export default function CooperativeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <GroupDetailView
      endpoint={`/cooperatives/${id}`}
      contributeEndpoint={`/cooperatives/${id}/contribute`}
      detailKey="cooperative"
      testIDPrefix="coop"
    />
  );
}
