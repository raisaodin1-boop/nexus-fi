import { useLocalSearchParams } from "expo-router";
import { TontineDetailView } from "@/src/tontine-detail";

export default function TontineDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TontineDetailView id={id} />;
}
