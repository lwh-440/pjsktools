import { describe, expect, it } from "vitest";
import { isPublicEvent } from "./masterData.js";

describe("public event catalog", () => {
  it("hides the 166 and 186 cheerful-carnival QA records without altering ordinary cheerful events", () => {
    expect(isPublicEvent({ eventType: "cheerful_carnival", name: "第1回チアフルカーニバルイベントテストイベント", assetbundleName: "event_cheerfutest_2024" })).toBe(false);
    expect(isPublicEvent({ eventType: "cheerful_carnival", name: "第2回チアフルカーニバルイベントテストイベント", assetbundleName: "event_cheerfutest2_2025" })).toBe(false);
    expect(isPublicEvent({ eventType: "cheerful_carnival", name: "Cheerful Carnival Event Test Event", assetbundleName: "event_cheerfutest2_2025" })).toBe(false);
    expect(isPublicEvent({ eventType: "cheerful_carnival", name: "普通的欢乐嘉年华活动", assetbundleName: "event_cheerful_123" })).toBe(true);
    expect(isPublicEvent({ eventType: "marathon", name: "テストイベント", assetbundleName: "event_cheerfutest_2024" })).toBe(true);
    expect(isPublicEvent({ eventType: "cheerful_carnival", name: "テストイベント", assetbundleName: "event_cheerfutest_2024", storyEpisodes: [{ id: "1", episodeNo: 1, title: "正式故事" }] })).toBe(true);
  });
});
