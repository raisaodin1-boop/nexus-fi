import { describe, expect, it } from "vitest";
import {
  isProfileActionReady,
  missingProfileActionFields,
} from "@/src/profile-completeness";
import {
  assertNotAiPhoto,
  AI_PHOTO_REJECT_MESSAGE,
} from "@/src/profile-photo-guard";

describe("isProfileActionReady", () => {
  it("requires phone, city, occupation and avatar", () => {
    expect(isProfileActionReady({})).toBe(false);
    expect(isProfileActionReady({
      phone: "+237600000000",
      city: "Douala",
      occupation: "Commerçante",
    })).toBe(false);
    expect(isProfileActionReady({
      phone: "+237600000000",
      city: "Douala",
      occupation: "Commerçante",
      avatar_kind: "generic",
      photo_url: "generic:1",
    })).toBe(true);
  });

  it("lists missing fields in French", () => {
    expect(missingProfileActionFields({})).toEqual([
      "téléphone",
      "ville de résidence",
      "profession",
      "photo de profil",
    ]);
  });
});

describe("assertNotAiPhoto", () => {
  it("rejects AI filenames", () => {
    try {
      assertNotAiPhoto({ base64: "AAAA", fileName: "midjourney_portrait.png" });
      expect.fail("should reject");
    } catch (e: any) {
      expect(e.detail).toBe(AI_PHOTO_REJECT_MESSAGE);
    }
  });

  it("rejects AI EXIF software tags", () => {
    try {
      assertNotAiPhoto({ base64: "AAAA", exif: { Software: "DALL-E 3" } });
      expect.fail("should reject");
    } catch (e: any) {
      expect(e.detail).toBe(AI_PHOTO_REJECT_MESSAGE);
    }
  });
});
