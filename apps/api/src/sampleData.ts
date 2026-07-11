import type { Card, EventInfo, Song } from "./types.js";

export const sampleSongs: Song[] = [
  {
    id: "1",
    title: "Tell Your World",
    unit: "Virtual Singer",
    difficulties: ["easy", "normal", "hard", "expert", "master"],
    publishedAt: "2020-09-30T00:00:00.000Z",
    assetbundleName: "jacket_s_001",
    difficultyDetails: [
      { difficulty: "easy", playLevel: 5, totalNoteCount: 220 },
      { difficulty: "normal", playLevel: 10, totalNoteCount: 492 },
      { difficulty: "hard", playLevel: 16, totalNoteCount: 719 },
      { difficulty: "expert", playLevel: 22, totalNoteCount: 961 },
      { difficulty: "master", playLevel: 26, totalNoteCount: 1147 }
    ]
  },
  {
    id: "2",
    title: "needLe",
    unit: "Leo/need",
    difficulties: ["easy", "normal", "hard", "expert", "master"],
    publishedAt: "2020-09-30T00:00:00.000Z"
  },
  {
    id: "3",
    title: "シネマ",
    unit: "Vivid BAD SQUAD",
    difficulties: ["easy", "normal", "hard", "expert", "master"],
    publishedAt: "2021-05-08T00:00:00.000Z"
  },
  {
    id: "4",
    title: "バグ",
    unit: "Wonderlands x Showtime",
    difficulties: ["easy", "normal", "hard", "expert", "master"],
    publishedAt: "2022-06-10T00:00:00.000Z"
  }
];

export const sampleCards: Card[] = [
  {
    id: "1",
    character: "初音ミク",
    title: "世界の歌姫",
    rarity: 4,
    attribute: "cool",
    assetbundleName: "res001_no001"
  },
  {
    id: "2",
    character: "星乃一歌",
    title: "仰望星空的旋律",
    rarity: 4,
    attribute: "pure"
  },
  {
    id: "3",
    character: "小豆沢こはね",
    title: "街头的第一步",
    rarity: 4,
    attribute: "happy"
  }
];

export const sampleCurrentEvent: EventInfo = {
  id: "sample-event",
  name: "连接世界的旋律",
  eventType: "marathon",
  startAt: "2026-07-01T15:00:00+09:00",
  endAt: "2026-07-09T20:59:59+09:00"
};
