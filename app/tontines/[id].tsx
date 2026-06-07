import { useLocalSearchParams } from "expo-router";
import { GroupDetailView } from "@/src/group-detail";

export default function TontineDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <GroupDetailView
      endpoint={`/tontines/${id}`}
      contributeEndpoint={`/tontines/${id}/contribute`}
      detailKey="tontine"
      testIDPrefix="tontine"
      showRotation
      advanceEndpoint={`/tontines/${id}/advance-cycle`}
    />
  );
}
