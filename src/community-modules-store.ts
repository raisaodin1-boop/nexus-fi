import AsyncStorage from "@react-native-async-storage/async-storage";

export type CommunityModuleKey =
  | "tontine"
  | "treasury"
  | "projects"
  | "members"
  | "documents"
  | "meetings"
  | "votes"
  | "announcements"
  | "chat"
  | "accounting"
  | "reports";

export type CommunityModulesState = Record<CommunityModuleKey, boolean>;

export const DEFAULT_COMMUNITY_MODULES: CommunityModulesState = {
  tontine: true,
  treasury: true,
  projects: false,
  members: true,
  documents: false,
  meetings: false,
  votes: false,
  announcements: true,
  chat: false,
  accounting: false,
  reports: false,
};

const keyFor = (groupId: string) => `hodix:community-modules:${groupId}`;

export async function loadCommunityModules(groupId: string): Promise<CommunityModulesState> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(groupId));
    if (!raw) return { ...DEFAULT_COMMUNITY_MODULES };
    const parsed = JSON.parse(raw) as Partial<CommunityModulesState>;
    return { ...DEFAULT_COMMUNITY_MODULES, ...parsed };
  } catch {
    return { ...DEFAULT_COMMUNITY_MODULES };
  }
}

export async function saveCommunityModules(
  groupId: string,
  state: CommunityModulesState,
): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(groupId), JSON.stringify(state));
  } catch {
    // ignore
  }
}
