import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { getGenericAvatar } from "@/src/generic-avatars";

type Props = {
  photoUrl?: string | null;
  avatarKind?: string | null;
  name?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function ProfileAvatar({ photoUrl, avatarKind, name, size = 72, style }: Props) {
  const letter = (name?.trim()?.[0] ?? "?").toUpperCase();
  const generic = avatarKind === "generic" || photoUrl?.startsWith("generic:")
    ? getGenericAvatar(photoUrl)
    : null;

  if (generic) {
    return (
      <View style={[styles.base, { width: size, height: size, borderRadius: size / 2, backgroundColor: generic.bg }, style]}>
        <Text style={{ color: generic.fg, fontSize: size * 0.4, fontWeight: "900" }}>{letter}</Text>
      </View>
    );
  }

  if (photoUrl && !photoUrl.startsWith("generic:")) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: "rgba(255,255,255,0.2)" }, style as any]}
      />
    );
  }

  return (
    <View style={[styles.base, { width: size, height: size, borderRadius: size / 2, backgroundColor: "rgba(255,255,255,0.2)" }, style]}>
      <Text style={{ color: "#fff", fontSize: size * 0.4, fontWeight: "900" }}>{letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(255,255,255,0.4)" },
});
