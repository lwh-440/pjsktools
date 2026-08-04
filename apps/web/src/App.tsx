import {
  Activity,
  BadgePlus,
  Bell,
  BarChart3,
  BookOpen,
  Boxes,
  CalendarClock,
  Check,
  Clapperboard,
  Coins,
  Download,
  Gift,
  Gem,
  Images,
  Info,
  LogIn,
  Music,
  Package,
  Play,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Shirt,
  Sparkles,
  Star,
  Ticket,
  Trash2,
  Trophy,
  UserRound,
  Wand2,
  Zap
} from "lucide-react";
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router";
import { apiGet, apiGetWithSignal, apiPost, apiResourceUrl } from "./api";
import { loadCachedCatalog } from "./catalogCache";
import { useAuth } from "./AuthContext";
import type { DeckConfig, PlayerBinding } from "./accountTypes";
import { ArtImage, DetailDrawer, Pagination, SearchBox } from "./components/ui";
import { CatalogFilterPanel, type CatalogFilterMeta } from "./components/CatalogFilterPanel";
import { FavoriteButton } from "./components/FavoriteButton";
import { SiteFooter } from "./components/SiteFooter";
import type { StoryPlaybackContext } from "./components/StoryPlaybackPlayer";
import { BoundDeckPage, LegalAcceptancePage, LoginPage, MeHomePage, MeProfileAnalysisPage, QqCallbackPage, RegisterPage, RequireAuth, ScoresPage } from "./pages/account";
import { HarukiConnectionCenter } from "./components/HarukiConnectionCenter";
import { HARUKI_FEATURE_ENABLED } from "./features";
import { RealChartPreview } from "./RealChartPreview";
import type { RankingEntry, RankingPlayerDetail } from "./components/RankingDetailPanel";
import { RankingDetailPanel } from "./components/RankingDetailPanel";
import { VirtualLiveCatalogPage, VirtualLiveDetailPage } from "./pages/virtualLive";
import { Live2dCatalogPage } from "./pages/live2d";
import { LazyRouteBoundary } from "./components/LazyRouteBoundary";
import { StoryCatalogPage, StoryDetailPage } from "./pages/story";
import { FavoritesPage } from "./pages/favorites";
import { PrivacyPage, SecurityPage, TermsPage } from "./pages/legal";
import type { FavoriteType } from "./sharedTypes";

const LazyLive2dDetailPage = lazy(() => import("./pages/live2dDetail").then((module) => ({ default: module.Live2dDetailPage })));
const StoryPlaybackPlayer = lazy(() => import("./components/StoryPlaybackPlayer").then((module) => ({ default: module.StoryPlaybackPlayer })));
const LazyStoryPlayerPage = lazy(() => import("./pages/storyPlayerPage").then((module) => ({ default: module.StoryPlayerPage })));

type Region = { id: string; name: string };
type DifficultyDetail = { difficulty: string; playLevel: number; totalNoteCount: number };
type AssetInfo = Record<string, string | string[] | undefined>;
type Song = { id: string; title: string; unit: string; difficultyDetails?: DifficultyDetail[]; assets?: { jacketUrl?: string; imageCandidates?: string[] }; durationSeconds?: number; categories?: string[]; bpm?: number };
type Card = { id: string; characterId?: string; character: string; title: string; rarity: number; attribute: string; assets?: { normalUrl?: string; normalThumbnailUrl?: string; imageCandidates?: string[]; normalThumbnailCandidates?: string[] } };
type EventInfo = { id: string; name: string; eventType?: string; eventUnit?: string; bonusCharacterIds?: string[]; bonusAttributes?: string[]; bannerCharacterId?: string; startAt: string; endAt: string; storyOutline?: string; assets?: AssetInfo };
type CollectionItem = { id: string; type: string; name: string; title?: string; category?: string; rarity?: string; description?: string; startAt?: string; endAt?: string; assets?: AssetInfo; sourceMetadata?: unknown; designer?: string; gender?: string; source?: string; partTypes?: string[]; characterIds?: number[]; parts?: Record<string, Array<{ colorId?: number; colorName?: string; assetbundleName?: string }>>; extraParts?: Array<{ characterId?: number; partType?: string; variants?: Array<{ colorId?: number; colorName?: string; assetbundleName?: string }> }>; shopInfo?: unknown; assetStatus?: string };
type FullSong = { music: Song; assets: AssetInfo; relations: Record<string, any> };
type SkillInfo = { id: string; name?: string; description?: string; formattedDescriptions?: Record<"1" | "2" | "3" | "4", string>; skillFormatTrace?: { status?: string; missingFields?: string[] } };
type FullCard = { card: Card & { skill?: SkillInfo; specialTrainingSkill?: SkillInfo }; assets: AssetInfo; relations: { relatedEvents: EventInfo[]; relatedGachas: CollectionItem[] } };
type FullEvent = { event: EventInfo; assets: AssetInfo; relations: { relatedSongs: Song[]; relatedCards: Card[]; relatedGachas: CollectionItem[] } };
type CollectionResponse = { source?: string; unavailableReason?: string; sourceMetadata?: unknown; items: CollectionItem[] };
type CatalogResponse<T> = { items: T[]; page: number; pageSize: number; total: number; totalPages: number; hasNextPage?: boolean; hasPreviousPage?: boolean; masterVersion?: string; sourceHealth?: Record<string, unknown>; source?: string; filterMeta?: CatalogFilterMeta; appliedFilters?: Record<string, string[] | boolean> };
type ContentPreviewItem = { id: string; name: string; category?: string; description?: string; storyType?: string; raw?: any };
type ContentDisplayGroup = { key: string; label?: string; count?: number; previewItems?: ContentPreviewItem[] };
type SourceMetadata = { sourceType?: string; primaryUrl?: string; fallbackUrl?: string; sourceProject?: string; fetchedAt?: string; unavailableReason?: string };
type RankingBorder = { rank: number; score: number; updatedAt?: string };
type RankingSourceHealth = {
  status?: string;
  primarySource?: string;
  fallbackLine?: string;
  latestUpdatedAt?: string;
  cacheUpdatedAt?: string;
  stale?: boolean;
  errors?: string[];
};
type RankingBoardType = "overall" | "worldlink";
type WorldLinkCharacter = { id: number; name: string; imageCandidates?: string[] };
type LiveRankingResponse = {
  eventId?: string;
  currentEvent?: EventInfo;
  top100?: RankingEntry[];
  borderLines?: RankingBorder[];
  updatedAt?: string;
  sourceHealth?: RankingSourceHealth;
  boardType?: RankingBoardType;
  gameCharacterId?: number;
  worldLinkCharacters?: WorldLinkCharacter[];
  worldLinkAvailable?: boolean;
  staleRanks?: number[];
  warnings?: string[];
};
type ForecastLine = {
  rank: number;
  currentScore: number;
  updatedAt?: string;
  sampleCount?: number;
  sampleSpanHours?: number;
  sampleHours?: number;
  speedPerHour?: number | null;
  hourlyGrowth?: number | null;
  forecast1h?: number | null;
  forecast3h?: number | null;
  forecastEnd?: number | null;
  confidence?: string;
  confidenceReason?: string;
  unavailableReason?: string;
};
type Forecast = {
  source?: string;
  generatedAt?: string;
  experimental?: boolean;
  sampleCount?: number;
  windowHours?: string | number;
  lines: ForecastLine[];
  windows?: Record<string, ForecastLine[]>;
  windowSummaries?: Record<string, { lineCount: number; maxSampleCount: number; maxSampleSpanHours: number; confidence: string }>;
  sourceHealth?: Record<string, unknown>;
  retentionRecommendation?: string;
  warnings?: string[];
  unavailableReason?: string;
};
type RankingHistorySample = { rank: number; score: number; sampledAt: string; sampleType?: string; playerName?: string };
type RankingHistoryResponse = {
  sampleCount: number;
  items: RankingHistorySample[];
  sourceHealth?: Record<string, unknown>;
  retentionRecommendation?: string;
  warnings?: string[];
  unavailableReason?: string;
};
type RankingHistorySummary = {
  lines: Array<{ rank: number; sampleType?: string; sampleCount: number; latestScore?: number | null; latestSampledAt?: string | null; firstSampledAt?: string | null; sampleSpanHours?: number; speedPerHour?: number | null; predictability?: string; confidence?: string; confidenceReason?: string; sampleSource?: string; sourceHealth?: Record<string, unknown> }>;
  sourceHealth?: Record<string, unknown>;
  retentionRecommendation?: string;
  warnings?: string[];
  unavailableReason?: string;
};
type Profile = { region: string; userId: string; nickname: string; rank: number; comment?: string; titles?: string[]; source?: string };
type ShareCard = { type: string; id: string; title: string; imageUrl: string; summary: string };
type DeckCompareCandidateMode = "manual" | "cards" | "saved";
type DeckCompareCandidateForm = { id: string; name: string; mode: DeckCompareCandidateMode; power: string; effectiveness: string; cardIds: string; deckConfigId: string };
type DeckCompareTeammateForm = { power: string; effectiveness: string };
type DeckCompareHistoryItem = { id: string; createdAt: string; region: string; musicId: string; difficulty: string; scoreMode: string; candidates: string[]; winnerByScore?: string; winnerByEventPoint?: string; scoreDelta?: number; eventPointDelta?: number };
const deckCompareHistoryKey = "pjsktools-deck-compare-history-v1";
type SectionId =
  | "home"
  | "profile"
  | "currentEvent"
  | "forecast"
  | "historyEvents"
  | "songs"
  | "cards"
  | "gachas"
  | "honors"
  | "materials"
  | "costumes"
  | "stamps"
  | "comics"
  | "tools"
  | "deckCompare"
  | "share"
  | "information"
  | "exchanges"
  | "missions"
  | "virtualLives"
  | "live2d"
  | "mysekai"
  | "stories"
  | "about";

const navGroups: Array<{ title: string; items: Array<{ id: SectionId; label: string; icon: typeof Activity }> }> = [
  {
    title: "核心工具",
    items: [
      { id: "home", label: "工具台", icon: Activity },
      { id: "currentEvent", label: "当前分数线", icon: Trophy },
      { id: "forecast", label: "预测线", icon: Activity },
      { id: "tools", label: "计算工具", icon: Wand2 },
      { id: "deckCompare", label: "卡组比较", icon: BarChart3 },
      { id: "share", label: "分享卡", icon: Share2 }
    ]
  },
  {
    title: "图鉴资料",
    items: [
      { id: "songs", label: "歌曲", icon: Music },
      { id: "cards", label: "卡牌", icon: Star },
      { id: "gachas", label: "卡池", icon: Sparkles },
      { id: "honors", label: "称号", icon: BadgePlus },
      { id: "materials", label: "素材", icon: Package },
      { id: "costumes", label: "服装", icon: Shirt },
      { id: "stamps", label: "贴纸", icon: Images },
      { id: "comics", label: "漫画", icon: BookOpen }
    ]
  },
  {
    title: "玩家数据",
    items: [
      { id: "profile", label: "玩家档案", icon: UserRound },
      { id: "historyEvents", label: "往期活动", icon: CalendarClock }
    ]
  },
  {
    title: "内容资料",
    items: [
      { id: "information", label: "公告资讯", icon: Bell },
      { id: "exchanges", label: "兑换所", icon: Gift },
      { id: "missions", label: "任务", icon: Check },
      { id: "virtualLives", label: "虚拟 Live", icon: Clapperboard },
      { id: "live2d", label: "Live2D", icon: UserRound },
      { id: "mysekai", label: "MySekai", icon: Boxes },
      { id: "stories", label: "故事", icon: BookOpen }
    ]
  },
  {
    title: "项目",
    items: [
      { id: "about", label: "关于", icon: Info }
    ]
  }
];

const navItems = navGroups.flatMap((group) => group.items);

const collectionMeta = {
  gachas: { label: "卡池图鉴", type: "gachas" },
  honors: { label: "称号图鉴", type: "honors" },
  materials: { label: "素材图鉴", type: "materials" },
  costumes: { label: "服装图鉴", type: "costumes" },
  stamps: { label: "贴纸图鉴", type: "stamps" },
  comics: { label: "漫画图鉴", type: "comics" }
} as const;

const catalogFilterKeys = [
  "eventTypes", "eventUnits", "bonusCharacterIds", "bannerCharacterIds", "bonusAttributes",
  "musicTags", "categories", "characterIds", "units", "supportUnits", "attributes", "rarities",
  "supplyTypes", "skillTypes", "gachaTypes", "honorTypes", "materialTypes", "partTypes",
  "sources", "genders", "stampTypes", "comicTypes"
];

const catalogToggleKeys = ["groupOnce", "usableOnly", "relatedOnly"];

function favoriteTypeForCatalog(type: string): FavoriteType {
  return ({ songs: "song", cards: "card", events: "event", gachas: "gacha", honors: "honor", materials: "material", costumes: "costume", stamps: "stamp", comics: "comic" } as Record<string, FavoriteType>)[type];
}

function formatNumber(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatDate(value?: string) {
  if (!value) return "-";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "-";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(time);
}

function stringAsset(assets: AssetInfo | undefined, key: string) {
  const value = assets?.[key];
  return typeof value === "string" ? value : undefined;
}

function stringAssetList(assets: AssetInfo | undefined, key: string) {
  const value = assets?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function unique(values: Array<string | undefined>) {
  return values.filter((value): value is string => Boolean(value && value.trim())).filter((value, index, array) => array.indexOf(value) === index);
}

function imageCandidates(assets: AssetInfo | undefined, preferDetail = false) {
  const keys = preferDetail
    ? ["screenUrl", "imageUrl", "thumbnailUrl", "bannerUrl", "logoUrl", "degreeMainUrl", "model3Url", "scenarioUrl"]
    : ["imageUrl", "thumbnailUrl", "bannerUrl", "logoUrl", "degreeMainUrl"];
  return unique([...keys.map((key) => stringAsset(assets, key)), ...stringAssetList(assets, "imageCandidates")]);
}

function collectionImageCandidates(type: string, assets: AssetInfo | undefined, preferDetail = false) {
  if (type === "honors") {
    return unique([
      stringAsset(assets, "degreeMainUrl"),
      stringAsset(assets, "imageUrl"),
      stringAsset(assets, "thumbnailUrl"),
      stringAsset(assets, "rankMainUrl"),
      stringAsset(assets, "scrollUrl"),
      ...stringAssetList(assets, "imageCandidates")
    ]);
  }
  if (type === "gachas") {
    return unique([
      stringAsset(assets, "bannerUrl"),
      stringAsset(assets, "imageUrl"),
      stringAsset(assets, "thumbnailUrl"),
      stringAsset(assets, "logoUrl"),
      stringAsset(assets, "screenUrl"),
      ...stringAssetList(assets, "imageCandidates")
    ]);
  }
  return imageCandidates(assets, preferDetail);
}

function collectionImageVariant(type: string): "square" | "honor" | "gacha" | "comic" {
  if (type === "honors") return "honor";
  if (type === "gachas") return "gacha";
  if (type === "comics") return "comic";
  return "square";
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return { page: safePage, totalPages, items: items.slice((safePage - 1) * pageSize, safePage * pageSize) };
}

function flattenObjectItems(value: any, limit = 160): CollectionItem[] {
  const groups = value?.groups ?? value?.items ?? value?.models ?? value?.entries ?? value;
  const arrays: any[] = [];
  const collect = (node: any, prefix = "") => {
    if (!node) return;
    if (Array.isArray(node)) {
      arrays.push(...node.map((item) => ({ ...item, __group: prefix })));
      return;
    }
    if (typeof node === "object") Object.entries(node).forEach(([key, child]) => collect(child, prefix ? `${prefix}/${key}` : key));
  };
  collect(groups);
  return arrays.slice(0, limit).map((item, index) => ({
    id: String(item.id ?? item.modelId ?? item.assetbundleName ?? item.name ?? index),
    type: item.__group ?? "content",
    name: String(item.name ?? item.title ?? item.modelName ?? item.assetbundleName ?? item.id ?? `Item ${index + 1}`),
    category: item.__group,
    description: item.description ?? item.summary,
    assets: item.assets ?? item
  }));
}

function HighlightSkillValues({ text }: { text: string }) {
  const parts = text.split(/(\d+(?:\.\d+)?(?:%|秒)?)/g);
  return <>{parts.map((part, index) => /^\d+(?:\.\d+)?(?:%|秒)?$/.test(part) ? <mark className="skill-value-highlight" key={`${part}-${index}`}>{part}</mark> : part)}</>;
}

function asArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

function ExchangeResourceIcon({ resource }: { resource: any }) {
  const iconByType: Record<string, typeof Gift> = {
    coin: Coins,
    jewel: Gem,
    virtual_coin: Coins,
    practice_ticket: Ticket,
    skill_practice_ticket: Ticket,
    gacha_ticket: Ticket,
    boost_item: Zap,
    avatar_coordinate: UserRound,
    mysekai_item: Package,
    mysekai_tool: Wand2
  };
  const Icon = iconByType[String(resource?.resourceType ?? "")] ?? Gift;
  const fallback = <span className="exchange-resource-fallback" title={resource?.name || "奖励素材"}><Icon size={18} aria-hidden="true" /></span>;
  return <ArtImage src={resource?.imageUrl} srcCandidates={asArray(resource?.imageCandidates)} label={resource?.name || "奖励素材"} fallback={fallback} />;
}

const missionTypeLabels: Record<string, string> = {
  live_clear: "完成 Live",
  clear_live: "完成 Live",
  play_live: "进行 Live",
  clear_solo_challenge_live: "完成挑战 Live",
  clear_virtual_live: "参加虚拟 Live",
  use_virtual_item: "使用虚拟道具",
  make_friend: "添加好友",
  set_honor: "设置称号",
  make_rare_costume_3d: "制作稀有服装",
  make_another_color_costume_3d: "制作异色服装",
  buy_avatar_skin: "兑换虚拟形象服装",
  read_card_episode_first: "阅读前篇卡牌剧情",
  read_card_episode_second: "阅读后篇卡牌剧情",
  read_character_profile_episode: "阅读角色档案",
  character_rank_3: "提升角色 Rank",
  master_rank: "提升 Master Rank",
  skill_level_2: "提升技能等级",
  clear_live_another_vocal: "使用 Another Vocal 完成 Live",
  inherit_platform: "完成账号继承",
  waiting_room: "成员进入休息室",
  collect_costume_3d: "收集服装",
  collect_stamp: "收集贴纸",
  read_area_talk: "阅读区域对话",
  skill_level_up: "提升技能等级",
  collect_another_vocal: "收集 Another Vocal",
  area_item_level_up_character: "升级角色区域道具",
  area_item_level_up_unit: "升级组合区域道具",
  area_item_level_up_reality_world: "升级现实世界区域道具",
  collect_member: "收集成员"
};

function missionTypeLabel(type: unknown) {
  const key = String(type ?? "unknown");
  return missionTypeLabels[key] ?? key.replaceAll("_", " ");
}

function StatefulRenderBoundary({ render }: { render: () => any }) {
  return render();
}

function rawRecord(value: any): Record<string, any> {
  return value && typeof value === "object" ? value : {};
}

function contentId(value: any, fallback: string) {
  const raw = rawRecord(value);
  return String(raw.id ?? raw.storyId ?? raw.scenarioId ?? raw.assetbundleName ?? raw.seq ?? fallback);
}

function contentName(value: any, fallback: string) {
  const raw = rawRecord(value);
  return String(raw.name ?? raw.title ?? raw.missionName ?? raw.liveName ?? raw.assetbundleName ?? raw.id ?? fallback);
}

function contentDate(value: any) {
  if (value === undefined || value === null || value === "") return "-";
  const numeric = typeof value === "number" ? value : Number(value);
  const time = Number.isFinite(numeric)
    ? numeric > 1_000_000_000_000 ? numeric : numeric * 1000
    : Date.parse(String(value));
  if (!Number.isFinite(time)) return "-";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(time);
}

function rankingRequestKey(region: string, board: RankingBoardType, gameCharacterId: number | null) {
  return `${region}:${board}:${board === "worldlink" ? gameCharacterId ?? "missing" : "overall"}`;
}

function contentGroups(data: any): ContentDisplayGroup[] {
  if (Array.isArray(data?.displayGroups)) return data.displayGroups;
  if (Array.isArray(data?.storyGroups)) return data.storyGroups;
  const groups = rawRecord(data?.groups);
  return Object.entries(groups).map(([key, value]) => {
    const list = asArray(value);
    return {
      key,
      label: key,
      count: list.length,
      previewItems: list.slice(0, 12).map((item, index) => ({
        id: contentId(item, `${key}-${index + 1}`),
        name: contentName(item, `${key} #${index + 1}`),
        category: key,
        raw: item
      }))
    };
  });
}

function sourceMetadata(data: any): SourceMetadata {
  return rawRecord(data?.sourceMetadata) as SourceMetadata;
}

function groupItems(data: any, groupKey: string) {
  const groups = rawRecord(data?.groups);
  const group = contentGroups(data).find((item) => item.key === groupKey);
  const rawList = asArray(groups[groupKey]);
  if (rawList.length) return rawList;
  return asArray(group?.previewItems).map((item) => item.raw ?? item);
}

export function App() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<SectionId>("home");
  const [regions, setRegions] = useState<Region[]>([]);
  const [region, setRegion] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get("region");
    if (requested && /^[a-z]{2,3}$/i.test(requested)) return requested.toLowerCase();
    return window.sessionStorage.getItem("pjsktools:region") ?? "jp";
  });
  const [songs, setSongs] = useState<Song[]>([]);
  const [toolSongsStatus, setToolSongsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [toolSongsError, setToolSongsError] = useState("");
  const [toolDataLoading, setToolDataLoading] = useState(false);
  const [toolDataError, setToolDataError] = useState("");
  const [toolSongSearch, setToolSongSearch] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [catalogTotals, setCatalogTotals] = useState<{ songs: number | null; cards: number | null }>({ songs: null, cards: null });
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [borders, setBorders] = useState<RankingBorder[]>([]);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [forecastWindow, setForecastWindow] = useState<"all" | "1" | "3" | "6">("all");
  const [rankingHistorySummary, setRankingHistorySummary] = useState<RankingHistorySummary | null>(null);
  const [rankingHistory, setRankingHistory] = useState<RankingHistoryResponse | null>(null);
  const [rankingSourceHealth, setRankingSourceHealth] = useState<RankingSourceHealth | null>(null);
  const [rankingUpdatedAt, setRankingUpdatedAt] = useState<string | null>(null);
  const [rankingWarnings, setRankingWarnings] = useState<string[]>([]);
  const [rankingRefreshing, setRankingRefreshing] = useState(false);
  const [rankingLoadError, setRankingLoadError] = useState("");
  const [rankingBoard, setRankingBoard] = useState<RankingBoardType>("overall");
  const [worldLinkCharacterId, setWorldLinkCharacterId] = useState<number | null>(null);
  const [worldLinkCharacters, setWorldLinkCharacters] = useState<WorldLinkCharacter[]>([]);
  const [worldLinkAvailable, setWorldLinkAvailable] = useState(false);
  const [rankingNextRefreshAt, setRankingNextRefreshAt] = useState<number | null>(null);
  const [rankingCountdown, setRankingCountdown] = useState(10);
  const regionRef = useRef(region);
  const baseRequest = useRef<{ id: number; region: string; controller: AbortController } | null>(null);
  const baseRequestId = useRef(0);
  const toolSongsRequestId = useRef(0);
  const toolDataRequestId = useRef(0);
  const toolSongsRegion = useRef("");
  const toolCardsRegion = useRef("");
  const rankingRequests = useRef(new Map<string, AbortController>());
  const rankingDetailRequest = useRef(0);
  const rankingBoardRef = useRef<RankingBoardType>("overall");
  const worldLinkCharacterRef = useRef<number | null>(null);
  const [message, setMessage] = useState("准备就绪");
  const [filter, setFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [catalogFilters, setCatalogFilters] = useState<Record<string, string[]>>({});
  const [catalogToggles, setCatalogToggles] = useState<Record<string, boolean>>({});
  const [collections, setCollections] = useState<Record<string, CollectionResponse>>({});
  const [catalogs, setCatalogs] = useState<Record<string, CatalogResponse<any>>>({});
  const catalogAborts = useRef(new Map<string, AbortController>());
  const [contentData, setContentData] = useState<Record<string, any>>({});
  const [selectedInformation, setSelectedInformation] = useState<any>(null);
  const informationDetailRequest = useRef(0);
  const [informationPage, setInformationPage] = useState(1);
  const [informationPageSize, setInformationPageSize] = useState(12);
  const [exchangeSearch, setExchangeSearch] = useState("");
  const [exchangeStatus, setExchangeStatus] = useState("");
  const [exchangeSummaryId, setExchangeSummaryId] = useState("");
  const [exchangePage, setExchangePage] = useState(1);
  const [exchangePageSize, setExchangePageSize] = useState(24);
  const [exchangeDetail, setExchangeDetail] = useState<any>(null);
  const exchangeDetailRequest = useRef(0);
  const [virtualLiveDetail, setVirtualLiveDetail] = useState<any>(null);
  const [mysekaiCatalogKind, setMysekaiCatalogKind] = useState<"fixtures" | "materials" | "blueprints">("fixtures");
  const [mysekaiCatalog, setMysekaiCatalog] = useState<any>(null);
  const [mysekaiCatalogQuery, setMysekaiCatalogQuery] = useState("");
  const [mysekaiCatalogCategory, setMysekaiCatalogCategory] = useState("");
  const [mysekaiCatalogPage, setMysekaiCatalogPage] = useState(1);
  const [mysekaiDetail, setMysekaiDetail] = useState<any>(null);
  const [profileId, setProfileId] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [historyEventId, setHistoryEventId] = useState("");
  const [selectedSong, setSelectedSong] = useState<FullSong | null>(null);
  const [selectedCard, setSelectedCard] = useState<FullCard | null>(null);
  const [skillLevel, setSkillLevel] = useState<1 | 2 | 3 | 4>(4);
  const [selectedEvent, setSelectedEvent] = useState<FullEvent | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<{ item: CollectionItem; assets: AssetInfo; relations?: { relatedCards?: Card[] } } | null>(null);
  const [selectedChart, setSelectedChart] = useState<{ musicId: string; title: string; detail: DifficultyDetail } | null>(null);
  const [rankingDetail, setRankingDetail] = useState<RankingPlayerDetail | null>(null);
  const [rankingDetailMode, setRankingDetailMode] = useState<"player" | "line">("player");
  const [rankingDetailOpen, setRankingDetailOpen] = useState(false);
  const [rankingDetailLoading, setRankingDetailLoading] = useState(false);
  const [shareType, setShareType] = useState("profile");
  const [shareId, setShareId] = useState("");
  const [shareCard, setShareCard] = useState<ShareCard | null>(null);
  const [controlForm, setControlForm] = useState({ currentPt: "0", targetPt: "1000000", remainingMinutes: "180", ptPerRun: "25000", availableRuns: "50" });
  const [controlResult, setControlResult] = useState<any>(null);
  const [deckOwnedIds, setDeckOwnedIds] = useState("");
  const [deckResult, setDeckResult] = useState<any>(null);
  const [musicRecommendResult, setMusicRecommendResult] = useState<any>(null);
  const [musicRecommendForm, setMusicRecommendForm] = useState({ targetPt: "1000000", currentPt: "0", eventBonusPercent: "150", preferredDifficulty: "expert", maxDurationSeconds: "150", minNoteCount: "", limit: "5", liveType: "multi", boost: "3", baseScore: "2000000" });
  const [areaRecommendResult, setAreaRecommendResult] = useState<any>(null);
  const [areaRecommendForm, setAreaRecommendForm] = useState({ cardIds: "", sortBy: "coin-efficiency", includeUnaffordable: true, limit: "5" });
  const [boundToolResult, setBoundToolResult] = useState<any>(null);
  const [boundPlanResult, setBoundPlanResult] = useState<any>(null);
  const [normalPlanForm, setNormalPlanForm] = useState({ targetPt: "1000000", currentPt: "0", remainingMinutes: "180", boost: "3", musicId: "1", difficulty: "expert", liveType: "multi", baseScore: "", eventBonusPercent: "", ownedCardIds: "1,2,3,4,5" });
  const [normalPlanResult, setNormalPlanResult] = useState<any>(null);
  const [deckCompareForm, setDeckCompareForm] = useState({
    musicId: "1",
    difficulty: "expert",
    liveType: "multi",
    boost: "3",
    eventBonusPercent: "150",
    skill15Strategy: "expected",
    skill6Mode: "team-average",
    scoreMode: "aggregate",
    unifiedTeammates: true,
    teammatePower: "200000",
    teammateEffectiveness: "200",
    exactSkills: "250,250,250,250,250,250"
  });
  const [deckCompareCandidates, setDeckCompareCandidates] = useState<DeckCompareCandidateForm[]>([
    { id: "a", name: "方案 A", mode: "manual", power: "280000", effectiveness: "250", cardIds: "", deckConfigId: "" },
    { id: "b", name: "方案 B", mode: "manual", power: "300000", effectiveness: "230", cardIds: "", deckConfigId: "" }
  ]);
  const [deckCompareTeammates, setDeckCompareTeammates] = useState<DeckCompareTeammateForm[]>([
    { power: "200000", effectiveness: "200" },
    { power: "200000", effectiveness: "200" },
    { power: "200000", effectiveness: "200" },
    { power: "200000", effectiveness: "200" }
  ]);
  const [deckCompareResult, setDeckCompareResult] = useState<any>(null);
  const [deckCompareError, setDeckCompareError] = useState("");
  const [deckCompareHistory, setDeckCompareHistory] = useState<DeckCompareHistoryItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const parsed = JSON.parse(window.localStorage.getItem(deckCompareHistoryKey) ?? "[]");
      return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
    } catch {
      return [];
    }
  });
  const [forecastPlanForm, setForecastPlanForm] = useState({ targetRank: "1000", currentPt: "0", ptPerRun: "25000", remainingMinutes: "180", availableRuns: "50" });
  const [forecastPlanResult, setForecastPlanResult] = useState<any>(null);
  const [mysekaiCalcInput, setMysekaiCalcInput] = useState(`{
  "cards": [{ "cardId": "1", "level": 60, "masterRank": 0, "skillLevel": 1 }],
  "playerAssets": {
    "area-items": [],
    "character-ranks": [],
    "mysekai-canvas": [],
    "mysekai-gates": [],
    "mysekai-fixtures": []
  }
}`);
  const [mysekaiSearchForm, setMysekaiSearchForm] = useState({
    algorithm: "ga",
    eventBonus: "0",
    supportDeckBonus: "0",
    candidatePoolSize: "120",
    beamWidth: "24",
    uniqueCharacter: true,
    seed: "-1",
    maxIter: "1000",
    maxIterNoImprove: "10",
    popSize: "8000",
    parentSize: "800",
    eliteSize: "10",
    crossoverRate: "1",
    baseMutationRate: "0.1",
    noImproveIterToMutationRate: "0.02",
    timeoutMs: "15000"
  });
  const [mysekaiCalcResult, setMysekaiCalcResult] = useState<any>(null);
  const [storyForm, setStoryForm] = useState({ storyType: "event", storyId: "1" });
  const [storyDetail, setStoryDetail] = useState<any>(null);
  const [storyPlayback, setStoryPlayback] = useState<StoryPlaybackContext | null>(null);
  const [virtualLivePlayback, setVirtualLivePlayback] = useState<any>(null);
  const [virtualLiveSearch, setVirtualLiveSearch] = useState("");
  const [virtualLiveSort, setVirtualLiveSort] = useState<"desc" | "asc">("desc");
  const [virtualLiveDisplayCount, setVirtualLiveDisplayCount] = useState(60);
  const [virtualLiveQueue, setVirtualLiveQueue] = useState<{ index: number; title: string; url: string }[]>([]);
  const [virtualLiveQueueIndex, setVirtualLiveQueueIndex] = useState(-1);
  const [virtualLiveQueueWarnings, setVirtualLiveQueueWarnings] = useState<string[]>([]);

  regionRef.current = region;
  rankingBoardRef.current = rankingBoard;
  worldLinkCharacterRef.current = worldLinkCharacterId;

  function changeRegion(nextRegion: string) {
    if (nextRegion === region) return;
    // Update request guards synchronously so the next region can never be
    // combined with a World Link selection from the previous region.
    regionRef.current = nextRegion;
    rankingBoardRef.current = "overall";
    worldLinkCharacterRef.current = null;
    setRankingBoard("overall");
    setWorldLinkCharacterId(null);
    setWorldLinkCharacters([]);
    setWorldLinkAvailable(false);
    resetRankingBoardContent();
    setRegion(nextRegion);
    if (/^\/section\/stories\/.+/.test(location.pathname)) navigate("/section/stories", { replace: true });
  }

  useEffect(() => { window.sessionStorage.setItem("pjsktools:region", region); }, [region]);

  const routeSection = useMemo(() => {
    if (location.pathname === "/") return "home";
    const match = location.pathname.match(/^\/section\/([^/]+)/);
    const id = match?.[1] as SectionId | undefined;
    return id && navItems.some((item) => item.id === id) ? id : undefined;
  }, [location.pathname]);

  useLayoutEffect(() => {
    if (routeSection) {
      setActiveSection(routeSection);
      const params = new URLSearchParams(location.search);
      setFilter(params.get("q") ?? "");
      setPage(Math.max(1, Number(params.get("page") ?? 1) || 1));
      setPageSize(Math.max(1, Number(params.get("pageSize") ?? 24) || 24));
      setCatalogFilters(Object.fromEntries(catalogFilterKeys.flatMap((key) => {
        const values = params.getAll(key).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
        return values.length ? [[key, [...new Set(values)]]] : [];
      })));
      setCatalogToggles(Object.fromEntries(catalogToggleKeys.map((key) => [key, params.get(key) === "true"])));
    }
  }, [routeSection, location.search]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedFilter(filter), 250);
    return () => window.clearTimeout(timer);
  }, [filter]);

  useEffect(() => {
    const isCatalog = activeSection === "historyEvents" || activeSection === "songs" || activeSection === "cards" || activeSection in collectionMeta;
    if (!isCatalog || !location.pathname.startsWith("/section/")) return;
    const params = new URLSearchParams();
    if (filter.trim()) params.set("q", filter.trim());
    if (page > 1) params.set("page", String(page));
    if (pageSize !== 24) params.set("pageSize", String(pageSize));
    for (const [key, values] of Object.entries(catalogFilters)) if (values.length) params.set(key, values.join(","));
    for (const [key, value] of Object.entries(catalogToggles)) if (value) params.set(key, "true");
    const next = params.toString() ? `?${params}` : "";
    if (next !== location.search) navigate(`${location.pathname}${next}`, { replace: true });
  }, [activeSection, filter, page, pageSize, catalogFilters, catalogToggles, location.pathname, location.search, navigate]);

  useEffect(() => {
    loadBase(region).catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
    informationDetailRequest.current += 1;
    exchangeDetailRequest.current += 1;
    setSelectedInformation(null);
    setExchangeDetail(null);
    setExchangePage(1);
    setInformationPage(1);
    setVirtualLiveDetail(null);
    setVirtualLivePlayback(null);
    setMysekaiDetail(null);
    return () => {
      if (baseRequest.current?.region === region) baseRequest.current.controller.abort();
    };
  }, [region]);

  useEffect(() => {
    if (rankingBoard === "worldlink" && worldLinkCharacterId == null) return;
    loadRankings(region, rankingBoard, worldLinkCharacterId).catch(() => undefined);
    setRankingNextRefreshAt(Date.now() + 10_000);
    const timer = window.setInterval(() => {
      loadRankings(region, rankingBoard, worldLinkCharacterId).catch(() => undefined);
      setRankingNextRefreshAt(Date.now() + 10_000);
    }, 10_000);
    return () => {
      window.clearInterval(timer);
      const requestKey = rankingRequestKey(region, rankingBoard, worldLinkCharacterId);
      rankingRequests.current.get(requestKey)?.abort();
      rankingRequests.current.delete(requestKey);
    };
  }, [region, rankingBoard, worldLinkCharacterId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRankingCountdown(rankingNextRefreshAt ? Math.max(0, Math.ceil((rankingNextRefreshAt - Date.now()) / 1000)) : 10);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [rankingNextRefreshAt]);

  useEffect(() => {
    if (rankingBoard !== "worldlink") return;
    const validWorldLinkContext = event?.eventType === "world_bloom"
      && worldLinkAvailable
      && worldLinkCharacters.length > 0
      && worldLinkCharacterId != null
      && worldLinkCharacters.some((character) => character.id === worldLinkCharacterId);
    if (!validWorldLinkContext) selectRankingBoard("overall");
  }, [event?.id, event?.eventType, rankingBoard, worldLinkAvailable, worldLinkCharacters, worldLinkCharacterId]);

  useEffect(() => {
    if (activeSection in collectionMeta) {
      const type = collectionMeta[activeSection as keyof typeof collectionMeta].type;
      loadCatalog(type).catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
    }
    if (activeSection === "songs" || activeSection === "cards") loadCatalog(activeSection).catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
    if (["tools", "deckCompare"].includes(activeSection)) ensureFullToolData().catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
    if (activeSection === "historyEvents") loadCatalog("events").catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
    if (["information", "exchanges", "missions", "mysekai"].includes(activeSection)) {
      loadContent(activeSection).catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
    }
  }, [activeSection, region, page, pageSize, debouncedFilter, catalogFilters, catalogToggles]);

  useEffect(() => {
    if (activeSection === "mysekai") {
      loadMysekaiCatalog(mysekaiCatalogKind, mysekaiCatalogPage, mysekaiCatalogQuery).catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
    }
  }, [activeSection, region, mysekaiCatalogKind, mysekaiCatalogPage, mysekaiCatalogCategory]);

  useEffect(() => {
    if (activeSection === "forecast" && event?.id && event.id !== "none") {
      loadRankingExtras(event.id).catch(() => undefined);
    }
  }, [forecastWindow, event?.id, region]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(deckCompareHistoryKey, JSON.stringify(deckCompareHistory.slice(0, 20)));
    }
  }, [deckCompareHistory]);

  useEffect(() => { setVirtualLiveDisplayCount(60); }, [region, virtualLiveSearch, virtualLiveSort]);

  async function loadBase(nextRegion: string) {
    baseRequest.current?.controller.abort();
    const controller = new AbortController();
    const requestId = ++baseRequestId.current;
    baseRequest.current = { id: requestId, region: nextRegion, controller };
    setSongs([]);
    toolSongsRegion.current = "";
    toolCardsRegion.current = "";
    setToolSongsStatus("idle");
    setToolSongsError("");
    setToolDataError("");
    setToolSongSearch("");
    setNormalPlanForm((current) => ({ ...current, musicId: "" }));
    setCards([]);
    setEvents([]);
    setEvent(null);
    setRanking([]);
    setBorders([]);
    setForecast(null);
    setRankingHistorySummary(null);
    setRankingHistory(null);
    setRankingSourceHealth(null);
    setRankingUpdatedAt(null);
    setRankingWarnings([]);
    setRankingLoadError("");
    setRankingBoard("overall");
    setWorldLinkCharacterId(null);
    setWorldLinkCharacters([]);
    setWorldLinkAvailable(false);
    rankingDetailRequest.current += 1;
    setRankingDetail(null);
    setRankingDetailOpen(false);
    setRankingDetailLoading(false);
    setCatalogTotals({ songs: null, cards: null });
    setCatalogs({});
    setCollections({});
    try {
      const [nextRegions, currentEvent, songPage, cardPage] = await Promise.all([
        apiGetWithSignal<Region[]>("/api/regions", controller.signal),
        apiGetWithSignal<EventInfo>(`/api/events/${nextRegion}/current`, controller.signal).catch(() => null),
        apiGetWithSignal<CatalogResponse<Song>>(`/api/master/${nextRegion}/catalogs/songs?page=1&pageSize=1`, controller.signal).catch(() => null),
        apiGetWithSignal<CatalogResponse<Card>>(`/api/master/${nextRegion}/catalogs/cards?page=1&pageSize=1`, controller.signal).catch(() => null)
      ]);
      if (controller.signal.aborted || baseRequest.current?.id !== requestId || regionRef.current !== nextRegion) return;
      setRegions(nextRegions);
      if (currentEvent) setEvent((current) => current ?? currentEvent);
      setCatalogTotals({ songs: songPage?.total ?? null, cards: cardPage?.total ?? null });
      setHistoryEventId("");
      setMessage("基础数据已就绪，图鉴将在打开时加载");
    } catch (error) {
      if ((error as Error).name !== "AbortError") throw error;
    }
  }

  async function loadToolSongs(force = false) {
    if (!force && songs.length && toolSongsRegion.current === region) {
      setToolSongsStatus("ready");
      return songs;
    }
    const requestRegion = region;
    const requestId = ++toolSongsRequestId.current;
    setToolSongsStatus("loading");
    setToolSongsError("");
    try {
      const nextSongs = await apiGet<Song[]>(`/api/master/${requestRegion}/songs`);
      if (requestId !== toolSongsRequestId.current || regionRef.current !== requestRegion) return [];
      setSongs(nextSongs);
      toolSongsRegion.current = requestRegion;
      setNormalPlanForm((current) => nextSongs.some((song) => song.id === current.musicId) ? current : { ...current, musicId: "" });
      setToolSongsStatus("ready");
      return nextSongs;
    } catch (error) {
      if (requestId !== toolSongsRequestId.current || regionRef.current !== requestRegion) return [];
      const text = error instanceof Error ? error.message : String(error);
      setToolSongsError(text);
      setToolSongsStatus("error");
      throw error;
    }
  }

  async function ensureFullToolData(forceSongs = false) {
    const requestId = ++toolDataRequestId.current;
    const requestRegion = region;
    setToolDataLoading(true);
    setToolDataError("");
    try {
      const nextSongs = await loadToolSongs(forceSongs);
      const nextCards = cards.length && toolCardsRegion.current === requestRegion ? cards : await apiGet<Card[]>(`/api/master/${requestRegion}/cards`);
      if (requestId !== toolDataRequestId.current || regionRef.current !== requestRegion) return;
      setSongs(nextSongs);
      setCards(nextCards);
      toolCardsRegion.current = requestRegion;
    } catch (error) {
      if (requestId !== toolDataRequestId.current || regionRef.current !== requestRegion) return;
      const text = error instanceof Error ? error.message : String(error);
      setToolDataError(text);
      throw error;
    } finally {
      if (requestId === toolDataRequestId.current && regionRef.current === requestRegion) setToolDataLoading(false);
    }
  }

  async function ensureEvents() {
    if (events.length) return events;
    const nextEvents = await apiGet<EventInfo[]>(`/api/events/${region}`);
    setEvents(nextEvents);
    setHistoryEventId(nextEvents[0]?.id ?? "");
    return nextEvents;
  }

  async function loadCatalog(type: string) {
    catalogAborts.current.get(type)?.abort();
    const controller = new AbortController();
    catalogAborts.current.set(type, controller);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort: "id-desc" });
    if (debouncedFilter.trim()) params.set("q", debouncedFilter.trim());
    for (const [key, values] of Object.entries(catalogFilters)) if (values.length) params.set(key, values.join(","));
    for (const [key, value] of Object.entries(catalogToggles)) if (value) params.set(key, "true");
    const path = `/api/master/${region}/catalogs/${type}?${params}`;
    const apply = (data: CatalogResponse<any>) => setCatalogs((current) => ({ ...current, [type]: data }));
    try {
      const data = await loadCachedCatalog<CatalogResponse<any>>(path, { signal: controller.signal, onCached: apply });
      if (!controller.signal.aborted) apply(data);
    } catch (error) {
      if ((error as Error).name !== "AbortError") throw error;
    }
  }

  async function loadRankingExtras(eventId: string, nextRegion = region) {
    if (!eventId || eventId === "none") return;
    const windowParam = forecastWindow === "all" ? "" : `?windowHours=${forecastWindow}`;
    const historyQuery = `sampleType=border&limit=5000${forecastWindow === "all" ? "" : `&windowHours=${forecastWindow}`}`;
    const [nextForecast, nextHistorySummary, nextHistory] = await Promise.all([
      apiGet<Forecast>(`/api/events/${nextRegion}/${eventId}/ranking-forecast${windowParam}`).catch(() => null),
      apiGet<RankingHistorySummary>(`/api/events/${nextRegion}/${eventId}/ranking-history/summary?sampleType=border${forecastWindow === "all" ? "" : `&windowHours=${forecastWindow}`}`).catch(() => null),
      apiGet<RankingHistoryResponse>(`/api/events/${nextRegion}/${eventId}/ranking-history?${historyQuery}`).catch(() => null)
    ]);
    if (regionRef.current !== nextRegion) return;
    setForecast(nextForecast);
    setRankingHistorySummary(nextHistorySummary);
    setRankingHistory(nextHistory);
  }

  function resetRankingBoardContent() {
    rankingRequests.current.forEach((controller) => controller.abort());
    rankingRequests.current.clear();
    rankingDetailRequest.current += 1;
    setRanking([]);
    setBorders([]);
    setRankingSourceHealth(null);
    setRankingUpdatedAt(null);
    setRankingWarnings([]);
    setRankingLoadError("");
    setRankingDetail(null);
    setRankingDetailOpen(false);
    setRankingDetailLoading(false);
    setRankingRefreshing(true);
  }

  function selectRankingBoard(nextBoard: RankingBoardType) {
    if (nextBoard === rankingBoard) return;
    if (nextBoard === "worldlink") {
      const firstCharacterId = worldLinkCharacterId ?? worldLinkCharacters[0]?.id ?? null;
      if (firstCharacterId == null) {
        setRankingLoadError("当前活动暂未返回可选的 World Link 角色。");
        return;
      }
      worldLinkCharacterRef.current = firstCharacterId;
      setWorldLinkCharacterId(firstCharacterId);
    } else {
      worldLinkCharacterRef.current = null;
      setWorldLinkCharacterId(null);
    }
    rankingBoardRef.current = nextBoard;
    setRankingBoard(nextBoard);
    resetRankingBoardContent();
  }

  function selectWorldLinkCharacter(characterId: number) {
    if (rankingBoard === "worldlink" && worldLinkCharacterId === characterId) return;
    rankingBoardRef.current = "worldlink";
    worldLinkCharacterRef.current = characterId;
    setRankingBoard("worldlink");
    setWorldLinkCharacterId(characterId);
    resetRankingBoardContent();
  }

  async function loadRankings(
    nextRegion = region,
    nextBoard: RankingBoardType = rankingBoard,
    nextCharacterId: number | null = worldLinkCharacterId
  ) {
    if (nextBoard === "worldlink" && nextCharacterId == null) {
      setRankingLoadError("请先选择角色，再加载单角色榜。");
      return;
    }
    const requestKey = rankingRequestKey(nextRegion, nextBoard, nextCharacterId);
    if (rankingRequests.current.has(requestKey)) return;
    const controller = new AbortController();
    rankingRequests.current.set(requestKey, controller);
    setRankingRefreshing(true);
    setRankingLoadError("");
    try {
      if (nextBoard === "worldlink") {
        const confirmedEvent = await apiGetWithSignal<EventInfo>(`/api/events/${nextRegion}/current`, controller.signal);
        const eventChanged = Boolean(event?.id && confirmedEvent.id !== event.id);
        if (controller.signal.aborted
          || regionRef.current !== nextRegion
          || rankingBoardRef.current !== nextBoard
          || worldLinkCharacterRef.current !== nextCharacterId) return;
        if (confirmedEvent.eventType !== "world_bloom" || eventChanged) {
          setEvent(confirmedEvent);
          rankingBoardRef.current = "overall";
          worldLinkCharacterRef.current = null;
          setRankingBoard("overall");
          setWorldLinkCharacterId(null);
          setWorldLinkCharacters([]);
          setWorldLinkAvailable(false);
          resetRankingBoardContent();
          return;
        }
      }
      const params = new URLSearchParams({ boardType: nextBoard });
      if (nextBoard === "worldlink" && nextCharacterId != null) params.set("gameCharacterId", String(nextCharacterId));
      const live = await apiGetWithSignal<LiveRankingResponse>(`/api/events/${nextRegion}/live-ranking?${params}`, controller.signal);
      const contextChanged = regionRef.current !== nextRegion
        || rankingBoardRef.current !== nextBoard
        || (nextBoard === "worldlink" && worldLinkCharacterRef.current !== nextCharacterId);
      if (controller.signal.aborted || contextChanged) return;
      if ((live.boardType ?? "overall") !== nextBoard || (nextBoard === "worldlink" && live.gameCharacterId !== nextCharacterId)) {
        throw new Error("榜单响应与当前选择不一致，已拒绝显示可能串榜的数据。");
      }
      if (live.currentEvent?.id) {
        const liveHasDetails = Boolean(live.currentEvent.startAt && live.currentEvent.endAt && !/^活动\s*#/u.test(live.currentEvent.name));
        const currentEvent = !liveHasDetails
          ? await apiGetWithSignal<EventInfo>(`/api/events/${nextRegion}/current`, controller.signal).catch(() => null)
          : null;
        if (controller.signal.aborted
          || regionRef.current !== nextRegion
          || rankingBoardRef.current !== nextBoard
          || (nextBoard === "worldlink" && worldLinkCharacterRef.current !== nextCharacterId)) return;
        const resolvedEvent = currentEvent ?? (liveHasDetails ? live.currentEvent : null);
        if (resolvedEvent) setEvent(resolvedEvent);
      }
      setRanking(live.top100 ?? []);
      setBorders(live.borderLines ?? []);
      setRankingSourceHealth(live.sourceHealth ?? null);
      setRankingUpdatedAt(live.updatedAt ?? live.sourceHealth?.latestUpdatedAt ?? null);
      setRankingWarnings(live.warnings ?? []);
      setWorldLinkCharacters(live.worldLinkCharacters ?? []);
      setWorldLinkAvailable(Boolean(live.worldLinkAvailable));
      setRankingNextRefreshAt(Date.now() + 10_000);
      const activeEventId = live.currentEvent?.id;
      if (activeEventId && activeEventId !== "none") void loadRankingExtras(activeEventId, nextRegion);
    } catch (error) {
      if ((error as Error).name !== "AbortError"
        && regionRef.current === nextRegion
        && rankingBoardRef.current === nextBoard
        && (nextBoard !== "worldlink" || worldLinkCharacterRef.current === nextCharacterId)) {
        setRankingLoadError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (rankingRequests.current.get(requestKey) === controller) rankingRequests.current.delete(requestKey);
      if (regionRef.current === nextRegion
        && rankingBoardRef.current === nextBoard
        && (nextBoard !== "worldlink" || worldLinkCharacterRef.current === nextCharacterId)) {
        setRankingRefreshing(false);
      }
    }
  }

  async function loadCollection(type: keyof typeof collectionMeta | "comics") {
    const data = await apiGet<CollectionResponse>(`/api/master/${region}/${type}`);
    setCollections((current) => ({ ...current, [type]: data }));
  }

  async function loadContent(section: string) {
    const paths: Record<string, string> = {
      information: `/api/master/${region}/information`,
      exchanges: `/api/master/${region}/exchanges/context`,
      missions: `/api/master/${region}/missions/context`,
      virtualLives: `/api/master/${region}/virtual-lives/context`,
      live2d: `/api/master/${region}/live2d/models`,
      mysekai: `/api/master/${region}/mysekai/context/full`,
      stories: `/api/master/${region}/stories/context`
    };
    const data = await apiGet<any>(paths[section]);
    setContentData((current) => ({ ...current, [section]: data }));
  }

  async function openInformation(id: string, title: string) {
    const requestId = ++informationDetailRequest.current;
    setSelectedInformation({ id, title, embedStatus: "loading" });
    try {
      const detail = await apiGet(`/api/master/${region}/information/${encodeURIComponent(id)}`);
      if (requestId === informationDetailRequest.current) setSelectedInformation(detail);
    } catch {
      if (requestId === informationDetailRequest.current) {
        setSelectedInformation({ id, title, embedStatus: "error", detailError: "公告详情加载失败，请稍后重试。" });
      }
    }
  }

  function closeInformation() {
    informationDetailRequest.current += 1;
    setSelectedInformation(null);
  }

  async function openExchange(id: string, name: string) {
    const requestId = ++exchangeDetailRequest.current;
    setExchangeDetail({ item: { id, name }, loading: true });
    try {
      const detail = await apiGet(`/api/master/${region}/exchanges/${encodeURIComponent(id)}`);
      if (requestId === exchangeDetailRequest.current) setExchangeDetail(detail);
    } catch {
      if (requestId === exchangeDetailRequest.current) setExchangeDetail({ item: { id, name }, error: "兑换项详情加载失败，请稍后重试。" });
    }
  }

  function closeExchange() {
    exchangeDetailRequest.current += 1;
    setExchangeDetail(null);
  }

  async function loadMysekaiCatalog(kind = mysekaiCatalogKind, nextPage = mysekaiCatalogPage, query = mysekaiCatalogQuery) {
    const params = new URLSearchParams({ page: String(nextPage), pageSize: "24", sort: "id-desc" });
    if (query.trim()) params.set("q", query.trim());
    if (mysekaiCatalogCategory) params.set("category", mysekaiCatalogCategory);
    setMysekaiCatalog(await apiGet(`/api/master/${region}/mysekai/catalog/${kind}?${params}`));
  }

  async function openMysekaiItem(kind: "fixtures" | "materials" | "blueprints", id: string) {
    setMysekaiDetail(await apiGet(`/api/master/${region}/mysekai/catalog/${kind}/${encodeURIComponent(id)}`));
  }

  function goSection(section: SectionId) {
    navigate(section === "home" ? "/" : `/section/${section}`);
  }

  async function openSong(id: string) {
    const detail = await apiGet<FullSong>(`/api/master/${region}/music/${id}/full`);
    setSelectedCard(null);
    setSelectedEvent(null);
    setSelectedCollection(null);
    setSelectedSong(detail);
  }

  async function openCard(id: string, preserveParent = false) {
    setSkillLevel(4);
    const detail = await apiGet<FullCard>(`/api/master/${region}/cards/${id}/full`);
    if (!preserveParent) {
      setSelectedSong(null);
      setSelectedEvent(null);
      setSelectedCollection(null);
    }
    setSelectedCard(detail);
  }

  async function openEvent(id: string) {
    const detail = await apiGet<FullEvent>(`/api/master/${region}/events/${id}/full`);
    setSelectedSong(null);
    setSelectedCard(null);
    setSelectedCollection(null);
    setSelectedEvent(detail);
  }

  async function openCollection(type: string, id: string) {
    const detail = await apiGet<{ item: CollectionItem; assets: AssetInfo; relations?: { relatedCards?: Card[] } }>(`/api/master/${region}/${type}/${id}/full`);
    setSelectedSong(null);
    setSelectedCard(null);
    setSelectedEvent(null);
    setSelectedCollection(detail);
  }

  async function openRankingDetail(rank: number) {
    if (!event?.id || event.id === "none") return;
    const requestId = ++rankingDetailRequest.current;
    const requestRegion = region;
    const requestEventId = event.id;
    const requestBoard = rankingBoard;
    const requestCharacterId = worldLinkCharacterId;
    if (requestBoard === "worldlink" && requestCharacterId == null) return;
    setRankingDetailOpen(true);
    setRankingDetailLoading(true);
    const listEntry = ranking.find((entry) => entry.rank === rank);
    if (listEntry) setRankingDetail(listEntry as RankingPlayerDetail);
    try {
      const params = new URLSearchParams({ boardType: requestBoard });
      if (requestBoard === "worldlink" && requestCharacterId != null) params.set("gameCharacterId", String(requestCharacterId));
      const detail = await apiGet<RankingPlayerDetail>(`/api/events/${requestRegion}/${requestEventId}/ranking-player/${rank}?${params}`);
      if (rankingDetailRequest.current !== requestId
        || regionRef.current !== requestRegion
        || rankingBoardRef.current !== requestBoard
        || (requestBoard === "worldlink" && worldLinkCharacterRef.current !== requestCharacterId)) return;
      setRankingDetail({ ...listEntry, ...detail });
    } finally {
      if (rankingDetailRequest.current === requestId
        && regionRef.current === requestRegion
        && rankingBoardRef.current === requestBoard
        && (requestBoard !== "worldlink" || worldLinkCharacterRef.current === requestCharacterId)) setRankingDetailLoading(false);
    }
  }

  async function loadProfile() {
    setProfile(await apiGet<Profile>(`/api/players/${region}/${profileId}/profile`));
  }

  async function loadShareCard() {
    setShareCard(await apiGet<ShareCard>(`/api/share/cards/${shareType}/${encodeURIComponent(shareId)}?region=${region}`));
  }

  async function calculateControl() {
    setControlResult(await apiPost("/api/tools/score-control", {
      currentPt: Number(controlForm.currentPt),
      targetPt: Number(controlForm.targetPt),
      remainingMinutes: Number(controlForm.remainingMinutes),
      ptPerRun: Number(controlForm.ptPerRun),
      availableRuns: Number(controlForm.availableRuns)
    }));
  }

  async function calculateDeck() {
    setDeckResult(await apiPost("/api/tools/deck-recommend", {
      region,
      eventId: event?.id === "none" ? undefined : event?.id,
      ownedCardIds: deckOwnedIds.split(/[,\s]+/).filter(Boolean)
    }));
  }

  async function calculateMusicRecommend() {
    setMusicRecommendResult(await apiPost("/api/tools/music-recommend", {
      region,
      eventId: event?.id === "none" ? undefined : event?.id,
      targetPt: Number(musicRecommendForm.targetPt),
      currentPt: Number(musicRecommendForm.currentPt),
      eventBonusPercent: Number(musicRecommendForm.eventBonusPercent),
      preferredDifficulties: [musicRecommendForm.preferredDifficulty],
      maxDurationSeconds: musicRecommendForm.maxDurationSeconds ? Number(musicRecommendForm.maxDurationSeconds) : undefined,
      minNoteCount: musicRecommendForm.minNoteCount ? Number(musicRecommendForm.minNoteCount) : undefined,
      limit: Number(musicRecommendForm.limit),
      liveType: musicRecommendForm.liveType,
      boost: Number(musicRecommendForm.boost),
      baseScore: musicRecommendForm.baseScore ? Number(musicRecommendForm.baseScore) : undefined
    }));
  }

  async function calculateAreaRecommend() {
    const cardIds = areaRecommendForm.cardIds.split(/[,\s]+/).filter(Boolean).slice(0, 5);
    setAreaRecommendResult(await apiPost("/api/tools/area-item-recommend", {
      region,
      cardIds: cardIds.length ? cardIds : undefined,
      sortBy: areaRecommendForm.sortBy,
      includeUnaffordable: areaRecommendForm.includeUnaffordable,
      limit: Number(areaRecommendForm.limit)
    }));
  }

  function renderRelatedCardTile(card: Card, key: string) {
    const candidates = card.assets?.normalThumbnailCandidates ?? card.assets?.imageCandidates ?? [];
    return <button key={key} type="button" className="related-card related-card-visual" onClick={() => openCard(card.id, true)}>
      <ArtImage src={card.assets?.normalThumbnailUrl ?? card.assets?.normalUrl} srcCandidates={candidates} label={card.title} variant="square" />
      <span className="related-card-copy"><strong>{card.title}</strong><span>{card.character}</span><small>星级 {card.rarity} · {card.attribute} · ID {card.id}</small></span>
    </button>;
  }

  function defaultBinding(): PlayerBinding | undefined {
    return auth.meProfile?.bindings.find((item) => item.isDefault) ?? auth.meProfile?.bindings[0];
  }

  function savedDeckConfigsForBinding(binding = defaultBinding()): DeckConfig[] {
    if (!binding) return [];
    return (auth.meProfile?.deckConfigs ?? []).filter((config) => config.region === binding.region && (!config.bindingId || config.bindingId === binding.id));
  }

  function updateDeckCompareCandidate(id: string, patch: Partial<DeckCompareCandidateForm>) {
    setDeckCompareCandidates((current) => current.map((candidate) => candidate.id === id ? { ...candidate, ...patch } : candidate));
  }

  function addDeckCompareCandidate() {
    setDeckCompareCandidates((current) => {
      if (current.length >= 5) return current;
      const nextIndex = current.length + 1;
      return [...current, { id: `c${Date.now()}`, name: `方案 ${nextIndex}`, mode: "manual", power: "280000", effectiveness: "250", cardIds: "", deckConfigId: "" }];
    });
  }

  function removeDeckCompareCandidate(id: string) {
    setDeckCompareCandidates((current) => current.length <= 2 ? current : current.filter((candidate) => candidate.id !== id));
  }

  function buildDeckCompareCandidatePayload(candidate: DeckCompareCandidateForm, binding?: PlayerBinding) {
    const base = { id: candidate.id, name: candidate.name.trim() || candidate.id };
    if (candidate.mode === "saved") {
      if (!binding) throw new Error("公开模式不能引用保存卡组，请改用手动综合力或 cardIds。");
      if (!candidate.deckConfigId) throw new Error(`${base.name} 未选择保存卡组。`);
      return { ...base, deckConfigId: candidate.deckConfigId };
    }
    if (candidate.mode === "cards") {
      const cardIds = candidate.cardIds.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
      if (!cardIds.length) throw new Error(`${base.name} 未填写 cardIds。`);
      return { ...base, cardIds };
    }
    const power = Number(candidate.power);
    const effectiveness = Number(candidate.effectiveness);
    if (!Number.isFinite(power) || !Number.isFinite(effectiveness)) throw new Error(`${base.name} 的综合力或技能值不是有效数字。`);
    return { ...base, power, effectiveness };
  }

  function buildDeckCompareTeammates() {
    const source = deckCompareForm.unifiedTeammates
      ? Array.from({ length: 4 }, () => ({ power: deckCompareForm.teammatePower, effectiveness: deckCompareForm.teammateEffectiveness }))
      : deckCompareTeammates;
    return source.map((item) => ({ power: Number(item.power), effectiveness: Number(item.effectiveness) }));
  }

  async function calculateDeckCompare() {
    const binding = defaultBinding();
    const useAuthenticated = Boolean(auth.token && binding && deckCompareCandidates.some((candidate) => candidate.mode === "saved"));
    const endpoint = useAuthenticated ? "/api/me/tools/deck-compare" : "/api/tools/deck-compare";
    try {
      setDeckCompareError("");
      const candidates = deckCompareCandidates.map((candidate) => buildDeckCompareCandidatePayload(candidate, useAuthenticated ? binding : undefined));
      const teammates = buildDeckCompareTeammates();
      if (teammates.some((item) => !Number.isFinite(item.power) || !Number.isFinite(item.effectiveness))) throw new Error("队友综合力或技能值不是有效数字。");
      const payload: Record<string, any> = {
        region: useAuthenticated && binding ? binding.region : region,
        bindingId: useAuthenticated && binding ? binding.id : undefined,
        musicId: deckCompareForm.musicId || songs[0]?.id,
        difficulty: deckCompareForm.difficulty,
        liveType: deckCompareForm.liveType,
        boost: Number(deckCompareForm.boost),
        eventBonusPercent: Number(deckCompareForm.eventBonusPercent),
        skill15Strategy: deckCompareForm.skill15Strategy,
        skill6Mode: deckCompareForm.skill6Mode,
        scoreMode: deckCompareForm.scoreMode,
        teammates,
        candidates
      };
      if (deckCompareForm.scoreMode === "exact") {
        payload.skills = deckCompareForm.exactSkills.split(/[,\s]+/).map((item) => Number(item)).filter((item) => Number.isFinite(item));
      }
      const result = await apiPost<any>(endpoint, payload, useAuthenticated ? auth.token : undefined);
      setDeckCompareResult(result);
      setDeckCompareHistory((current) => [{
        id: `${Date.now()}`,
        createdAt: new Date().toISOString(),
        region: payload.region,
        musicId: payload.musicId,
        difficulty: payload.difficulty,
        scoreMode: payload.scoreMode,
        candidates: candidates.map((candidate: any) => candidate.name ?? candidate.id),
        winnerByScore: result.winnerByScore?.name ?? result.winnerByScore?.id,
        winnerByEventPoint: result.winnerByEventPoint?.name ?? result.winnerByEventPoint?.id,
        scoreDelta: result.scoreDelta,
        eventPointDelta: result.eventPointDelta
      }, ...current].slice(0, 20));
    } catch (error) {
      setDeckCompareError(error instanceof Error ? error.message : String(error));
    }
  }

  async function calculateBoundTool(tool: "event-point" | "music" | "area" | "mysekai") {
    const binding = defaultBinding();
    if (!binding) return;
    if (tool === "event-point" && binding.region !== region) return;
    if (tool === "event-point" && !normalPlanForm.musicId) return;
    const eventId = event?.id === "none" ? undefined : event?.id;
    const eventPointPayload = {
      region: binding.region,
      bindingId: binding.id,
      eventId,
      musicId: normalPlanForm.musicId,
      difficulty: normalPlanForm.difficulty,
      liveType: normalPlanForm.liveType,
      boost: Number(normalPlanForm.boost),
      targetPt: Number(normalPlanForm.targetPt),
      currentPt: Number(normalPlanForm.currentPt),
      baseScore: normalPlanForm.baseScore ? Number(normalPlanForm.baseScore) : undefined,
      eventBonusPercent: normalPlanForm.eventBonusPercent ? Number(normalPlanForm.eventBonusPercent) : undefined,
      limit: 5
    };
    const musicPayload = {
      region: binding.region,
      bindingId: binding.id,
      eventId,
      targetPt: Number(musicRecommendForm.targetPt),
      currentPt: Number(musicRecommendForm.currentPt),
      eventBonusPercent: musicRecommendForm.eventBonusPercent ? Number(musicRecommendForm.eventBonusPercent) : undefined,
      preferredDifficulties: [musicRecommendForm.preferredDifficulty],
      maxDurationSeconds: musicRecommendForm.maxDurationSeconds ? Number(musicRecommendForm.maxDurationSeconds) : undefined,
      minNoteCount: musicRecommendForm.minNoteCount ? Number(musicRecommendForm.minNoteCount) : undefined,
      limit: Number(musicRecommendForm.limit),
      liveType: musicRecommendForm.liveType,
      boost: Number(musicRecommendForm.boost),
      baseScore: musicRecommendForm.baseScore ? Number(musicRecommendForm.baseScore) : undefined
    };
    const areaCardIds = areaRecommendForm.cardIds.split(/[,\s]+/).filter(Boolean).slice(0, 5);
    const areaPayload = {
      region: binding.region,
      bindingId: binding.id,
      cardIds: areaCardIds.length ? areaCardIds : undefined,
      sortBy: areaRecommendForm.sortBy,
      includeUnaffordable: areaRecommendForm.includeUnaffordable,
      limit: Number(areaRecommendForm.limit)
    };
    const payload = tool === "music" ? musicPayload : tool === "area" ? areaPayload : eventPointPayload;
    const endpoint = tool === "event-point"
      ? "/api/me/tools/event-point-calc"
      : tool === "music"
        ? "/api/me/tools/music-recommend"
        : tool === "area"
          ? "/api/me/tools/area-item-recommend"
          : "/api/me/tools/mysekai-calc";
    setBoundToolResult({ tool, result: await apiPost(endpoint, payload, auth.token) });
  }

  async function calculateBoundPlan() {
    const binding = defaultBinding();
    if (!binding || binding.region !== region || !normalPlanForm.musicId) return;
    const eventId = event?.id === "none" ? undefined : event?.id;
    const payload = {
      region: binding.region,
      bindingId: binding.id,
      eventId,
      musicId: normalPlanForm.musicId,
      difficulty: normalPlanForm.difficulty,
      liveType: normalPlanForm.liveType,
      targetPt: Number(normalPlanForm.targetPt),
      currentPt: Number(normalPlanForm.currentPt),
      remainingMinutes: Number(normalPlanForm.remainingMinutes),
      boost: Number(normalPlanForm.boost),
      baseScore: normalPlanForm.baseScore ? Number(normalPlanForm.baseScore) : undefined,
      eventBonusPercent: normalPlanForm.eventBonusPercent ? Number(normalPlanForm.eventBonusPercent) : undefined,
      limit: 5
    };
    const result = await apiPost("/api/me/tools/normal-event-plan", payload, auth.token);
    setBoundPlanResult(result);
    setNormalPlanResult(result);
  }

  async function calculatePublicNormalPlan() {
    if (!normalPlanForm.musicId) return;
    const eventId = event?.id === "none" ? undefined : event?.id;
    const payload = {
      region,
      eventId,
      musicId: normalPlanForm.musicId,
      difficulty: normalPlanForm.difficulty,
      liveType: normalPlanForm.liveType,
      targetPt: Number(normalPlanForm.targetPt),
      currentPt: Number(normalPlanForm.currentPt),
      remainingMinutes: Number(normalPlanForm.remainingMinutes),
      boost: Number(normalPlanForm.boost),
      baseScore: normalPlanForm.baseScore ? Number(normalPlanForm.baseScore) : undefined,
      eventBonusPercent: normalPlanForm.eventBonusPercent ? Number(normalPlanForm.eventBonusPercent) : undefined,
      ownedCardIds: normalPlanForm.ownedCardIds.split(/[,\s]+/).filter(Boolean),
      limit: 5
    };
    setNormalPlanResult(await apiPost("/api/tools/normal-event-plan", payload));
  }

  async function calculateMysekai() {
    const payload = JSON.parse(mysekaiCalcInput);
    setMysekaiCalcResult(await apiPost("/api/tools/mysekai-calc", {
      region,
      ...payload,
      eventBonus: Number(mysekaiSearchForm.eventBonus),
      supportDeckBonus: Number(mysekaiSearchForm.supportDeckBonus),
      search: buildMysekaiSearchPayload()
    }));
  }

  async function calculateBoundMysekai() {
    const binding = defaultBinding();
    if (!binding) return;
    setMysekaiCalcResult(await apiPost("/api/me/tools/mysekai-calc", {
      region: binding.region,
      bindingId: binding.id,
      eventBonus: Number(mysekaiSearchForm.eventBonus),
      supportDeckBonus: Number(mysekaiSearchForm.supportDeckBonus),
      search: buildMysekaiSearchPayload()
    }, auth.token));
  }

  function buildMysekaiSearchPayload() {
    return {
      algorithm: mysekaiSearchForm.algorithm,
      beamWidth: Number(mysekaiSearchForm.beamWidth),
      candidatePoolSize: Number(mysekaiSearchForm.candidatePoolSize),
      uniqueCharacter: mysekaiSearchForm.uniqueCharacter,
      gaConfig: {
        seed: Number(mysekaiSearchForm.seed),
        maxIter: Number(mysekaiSearchForm.maxIter),
        maxIterNoImprove: Number(mysekaiSearchForm.maxIterNoImprove),
        popSize: Number(mysekaiSearchForm.popSize),
        parentSize: Number(mysekaiSearchForm.parentSize),
        eliteSize: Number(mysekaiSearchForm.eliteSize),
        crossoverRate: Number(mysekaiSearchForm.crossoverRate),
        baseMutationRate: Number(mysekaiSearchForm.baseMutationRate),
        noImproveIterToMutationRate: Number(mysekaiSearchForm.noImproveIterToMutationRate),
        timeoutMs: Number(mysekaiSearchForm.timeoutMs),
        target: "score"
      }
    };
  }


  async function loadStory() {
    const detail = await apiGet(`/api/master/${region}/stories/${storyForm.storyType}/${storyForm.storyId}/full`);
    setStoryDetail(detail);
    setStoryPlayback(null);
  }

  async function openStoryFromList(storyType: string, storyId: string) {
    setStoryForm({ storyType, storyId });
    setStoryDetail(await apiGet(`/api/master/${region}/stories/${storyType}/${storyId}/full`));
    setStoryPlayback(null);
  }

  async function loadStoryPlayback(storyType = storyForm.storyType, storyId = storyForm.storyId) {
    setStoryPlayback(await apiGet<StoryPlaybackContext>(`/api/master/${region}/stories/${encodeURIComponent(storyType)}/${encodeURIComponent(storyId)}/playback`));
  }

  async function loadVirtualLivePlayback(virtualLiveId: string) {
    stopVirtualLiveQueue();
    setVirtualLivePlayback(await apiGet(`/api/master/${region}/virtual-lives/${encodeURIComponent(virtualLiveId)}/playback`));
  }

  async function openVirtualLive(virtualLiveId: string) {
    stopVirtualLiveQueue();
    setVirtualLivePlayback(null);
    setVirtualLiveDetail(await apiGet(`/api/master/${region}/virtual-lives/${encodeURIComponent(virtualLiveId)}/full`));
  }

  function buildVirtualLiveQueue(playback = virtualLivePlayback) {
    const queue: { index: number; title: string; url: string }[] = [];
    const warnings: string[] = [];
    asArray(playback?.steps).forEach((step: any, stepIndex: number) => {
      const label = `#${stepIndex + 1} ${String(step.type ?? "step")}`;
      if (step.proxiedAudioUrl) {
        queue.push({
          index: queue.length,
          title: `${label} · ${step.music?.title ?? step.musicVocal?.assetbundleName ?? "歌曲音频"}`,
          url: step.proxiedAudioUrl
        });
      }
      const talkEvents = asArray(step.events).filter((event: any) => event.type === "talk");
      talkEvents.forEach((event: any, eventIndex: number) => {
        const url = event.voice?.proxiedUrl;
        if (url) {
          queue.push({
            index: queue.length,
            title: `${label} · ${event.serif ? String(event.serif).slice(0, 24) : `语音 ${eventIndex + 1}`}`,
            url
          });
        }
      });
      if (!step.proxiedAudioUrl && !talkEvents.some((event: any) => event.voice?.proxiedUrl)) {
        warnings.push(`${label} 没有可连续播放的音频资源，已跳过。`);
      }
    });
    setVirtualLiveQueue(queue);
    setVirtualLiveQueueWarnings(warnings);
    return queue;
  }

  function startVirtualLiveQueue() {
    const queue = buildVirtualLiveQueue();
    setVirtualLiveQueueIndex(queue.length ? 0 : -1);
  }

  function stopVirtualLiveQueue() {
    setVirtualLiveQueue([]);
    setVirtualLiveQueueIndex(-1);
    setVirtualLiveQueueWarnings([]);
  }

  function nextVirtualLiveQueueItem() {
    setVirtualLiveQueueIndex((current) => {
      const next = current + 1;
      return next < virtualLiveQueue.length ? next : -1;
    });
  }

  function sectionTitle() {
    if (location.pathname.startsWith("/login")) return "登录";
    if (location.pathname.startsWith("/register")) return "注册";
    if (location.pathname.startsWith("/me")) return "个人信息管理";
    if (location.pathname.startsWith("/privacy")) return "隐私政策";
    if (location.pathname.startsWith("/terms")) return "用户协议";
    if (location.pathname.startsWith("/security")) return "安全与举报";
    return navItems.find((item) => item.id === activeSection)?.label ?? "Project Sekai 工具台";
  }

  function HomePage() {
    const topRanks = ranking.slice(0, 3);
    return (
      <section className="workspace">
        <div className="dashboard-hero">
          <div>
            <span className="home-kicker">连接每一次 Live 与成长</span>
            <h2>Project Sekai 工具台</h2>
            <p>快速查看活动、图鉴与个人资料，在清晰顺手的工作台里完成计算和比较。</p>
          </div>
          <div className="hero-metrics">
            <div><span>区服</span><strong>{region.toUpperCase()}</strong></div>
            <div><span>歌曲</span><strong>{catalogTotals.songs === null ? "-" : formatNumber(catalogTotals.songs)}</strong></div>
            <div><span>卡牌</span><strong>{catalogTotals.cards === null ? "-" : formatNumber(catalogTotals.cards)}</strong></div>
          </div>
        </div>
        <div className="dashboard-grid">
          <article className="panel status-panel">
            <div className="panel-heading"><div><h2>当前活动</h2><p>{event?.id === "none" ? "当前没有正在进行的活动" : `${formatDate(event?.startAt)} - ${formatDate(event?.endAt)}`}</p></div><button type="button" onClick={() => goSection("currentEvent")}>查看分数线</button></div>
            <strong className="feature-title">{event?.name ?? "正在加载活动"}</strong>
            <div className="mini-rank-list">{topRanks.map((entry) => <div key={entry.rank}><span>#{entry.rank}</span><strong>{entry.playerName ?? entry.name}</strong><small>{formatNumber(entry.score)} pt</small></div>)}{topRanks.length === 0 && <p className="empty-state">等待分数线数据。</p>}</div>
          </article>
          <article className="panel status-panel">
            <div className="panel-heading"><div><h2>账号状态</h2><p>{auth.isAuthenticated ? (HARUKI_FEATURE_ENABLED ? "可使用玩家绑定与跨端快照" : "可同步收藏、成绩、卡组与账号设置") : "登录后同步账号设置"}</p></div></div>
            <Link className="feature-link" to={auth.isAuthenticated ? "/me" : "/login"}>{auth.isAuthenticated ? "进入个人信息管理" : "登录 / 注册"}</Link>
          </article>
          <article className="panel android-download-panel">
            <div className="android-download-copy"><span className="tool-icon"><Download size={22} /></span><div><h2>Android 客户端</h2><p>在手机上使用图鉴、活动与玩家工具。</p></div></div>
            <a className="feature-link android-download-link" href="/download/pjsktools-android-0.1.0.apk" download>下载 APK</a>
          </article>
          <article className="panel wide">
            <div className="panel-heading"><div><h2>常用入口</h2><p>按工作流分组，减少来回切换。</p></div></div>
            <div className="tool-grid compact-tools">
              {["songs", "cards", "gachas", "tools", "deckCompare", "mysekai"].map((id) => {
                const item = navItems.find((entry) => entry.id === id)!;
                const Icon = item.icon;
                return <button key={item.id} type="button" className="tool-card" onClick={() => goSection(item.id)}><span className="tool-icon"><Icon size={20} /></span><strong>{item.label}</strong><small>打开模块</small></button>;
              })}
            </div>
          </article>
        </div>
      </section>
    );
  }

  function RankingPage() {
    const keyword = filter.trim().toLowerCase();
    const filteredRanking = keyword ? ranking.filter((entry) => `${entry.rank} ${entry.playerName ?? entry.name ?? ""} ${entry.userId ?? ""}`.toLowerCase().includes(keyword)) : ranking;
    const selectedWorldLinkCharacter = worldLinkCharacters.find((character) => character.id === worldLinkCharacterId);
    const boardLabel = rankingBoard === "worldlink"
      ? `${selectedWorldLinkCharacter?.name ?? `角色 ${worldLinkCharacterId ?? "-"}`}单角色榜`
      : "总榜";
    const showWorldLinkControls = event?.eventType === "world_bloom"
      && worldLinkAvailable
      && worldLinkCharacters.length > 0;
    const sourceStatus = rankingSourceHealth?.status ?? "waiting";
    const sourceLabel = sourceStatus === "fresh"
      ? "已更新"
      : sourceStatus === "stale-refreshing"
        ? "旧缓存刷新中"
        : sourceStatus === "fallback-haruki"
          ? "备用数据"
          : sourceStatus === "source-unavailable"
            ? "暂时不可用"
            : "等待数据";
    return (
      <section className="rank-page">
        <div className="rank-hero">
          <div><span className="home-kicker">活动排名每 10 秒更新 · 当前查看 {boardLabel}</span><h2>{event?.name ?? "正在加载活动"}</h2><div className="rank-meta"><span>{event?.id === "none" ? "当前没有正在进行的活动" : `${formatDate(event?.startAt)} - ${formatDate(event?.endAt)}`}</span><span>{ranking.length} 条 T100 数据</span><span>{borders.length} 条{rankingBoard === "worldlink" ? "角色" : "总榜"}分数线</span><span>{sourceLabel}</span><span>更新 {formatDate(rankingUpdatedAt ?? undefined)}</span><span>{rankingRefreshing ? "刷新中" : `${rankingCountdown}s 后刷新`}</span></div></div>
          <div className="rank-actions"><button type="button" onClick={() => loadRankings(region, rankingBoard, worldLinkCharacterId)} disabled={rankingRefreshing}><RefreshCw size={16} />{rankingRefreshing ? "刷新中" : "立即刷新"}</button><button type="button" className="secondary" onClick={() => goSection("forecast")}>预测线</button></div>
        </div>
        {showWorldLinkControls && <article className="panel wide ranking-board-controls" aria-label="榜单类型和角色选择">
          <div className="panel-heading"><div><h2>榜单范围</h2><p>总榜与单角色榜完全独立；切换角色后只显示该角色的 World Link 数据。</p></div></div>
          <div className="ranking-board-switch" role="group" aria-label="榜单类型">
            <button type="button" className={rankingBoard === "overall" ? "" : "secondary"} aria-pressed={rankingBoard === "overall"} onClick={() => selectRankingBoard("overall")}>总榜</button>
            <button type="button" className={rankingBoard === "worldlink" ? "" : "secondary"} aria-pressed={rankingBoard === "worldlink"} onClick={() => selectRankingBoard("worldlink")}>单角色榜</button>
          </div>
          {rankingBoard === "worldlink" && (
            <div className="world-link-character-list" role="group" aria-label="选择 World Link 角色">
              {worldLinkCharacters.map((character) => (
                <button type="button" key={character.id} className={worldLinkCharacterId === character.id ? "world-link-character active" : "world-link-character"} aria-pressed={worldLinkCharacterId === character.id} onClick={() => selectWorldLinkCharacter(character.id)}>
                  <ArtImage src={character.imageCandidates?.[0]} srcCandidates={character.imageCandidates} label={character.name} variant="avatar" />
                  <span>{character.name}</span>
                </button>
              ))}
              {worldLinkCharacters.length === 0 && <p className="empty-state">当前活动暂未返回可选的 World Link 角色。</p>}
            </div>
          )}
        </article>}
        {rankingLoadError && <div className="notice compact error"><strong>榜单加载失败</strong><span>{rankingLoadError}</span></div>}
        {(rankingWarnings.length > 0 || rankingSourceHealth?.fallbackLine || rankingSourceHealth?.stale) && <div className="notice compact"><strong>更新状态</strong><span>{rankingSourceHealth?.stale ? "当前内容可能稍有延迟，正在刷新。" : "部分内容正在恢复。"}</span></div>}
        <div className="rank-stat-grid">{borders.map((line) => <div key={line.rank}><span>T{line.rank}</span><strong>{formatNumber(line.score)} pt</strong><small>{formatDate(line.updatedAt)}</small></div>)}{borders.length === 0 && <div><span>状态</span><strong>暂无分数线</strong><small>无活动或上游不可用</small></div>}</div>
        <article className="panel wide">
          <div className="panel-heading"><h2>{boardLabel} Top 1-100</h2><SearchBox value={filter} onChange={setFilter} placeholder="搜索排名、玩家名或 ID" /></div>
          <div className="ranking-table">
            <div className="ranking-head"><span>排名</span><span>玩家</span><span>分数</span><span>增长</span><span>更新时间</span></div>
            {filteredRanking.map((entry) => (
              <button key={`${region}:${rankingBoard}:${worldLinkCharacterId ?? "overall"}:${entry.userId || entry.rank}`} type="button" className="ranking-row" onClick={() => openRankingDetail(entry.rank)}>
                <strong>#{entry.rank}</strong>
                <span className="ranking-player-cell"><ArtImage src={entry.leaderCardImageUrl} srcCandidates={[...(entry.leaderCardImageCandidates ?? []), ...(entry.leaderCharacterImageCandidates ?? [])]} label={`${entry.playerName ?? entry.name} 当前队长`} variant="avatar" eager={entry.rank <= 10} /><span>{entry.playerName ?? entry.name}<small>{entry.userId}</small></span></span>
                <b>{formatNumber(entry.score)}</b><em>{entry.hourlyGrowth ? `+${formatNumber(entry.hourlyGrowth)}/h` : "-"}</em><small>{formatDate(entry.updatedAt)}</small>
              </button>
            ))}
            {!rankingRefreshing && filteredRanking.length === 0 && <p className="empty-state">{rankingBoard === "worldlink" ? "该角色榜当前没有可显示的真实排名数据。" : "当前没有可显示的排名数据。"}</p>}
          </div>
        </article>
      </section>
    );
  }

  function HistoryTrendChart({ samples, lines }: { samples: RankingHistorySample[]; lines: ForecastLine[] }) {
    const ranks = lines.slice(0, 6).map((line) => line.rank);
    const visible = samples
      .filter((sample) => ranks.includes(Number(sample.rank)))
      .sort((a, b) => Date.parse(a.sampledAt) - Date.parse(b.sampledAt));
    if (visible.length < 2) return <p className="empty-state">样本不足，至少需要两个采样点才会显示趋势图。</p>;
    const times = visible.map((sample) => Date.parse(sample.sampledAt));
    const scores = visible.map((sample) => Number(sample.score));
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const width = 720;
    const height = 260;
    const pad = 34;
    const x = (time: number) => pad + ((time - minTime) / Math.max(1, maxTime - minTime)) * (width - pad * 2);
    const y = (score: number) => height - pad - ((score - minScore) / Math.max(1, maxScore - minScore)) * (height - pad * 2);
    const palette = ["#2f6f88", "#71a45a", "#b56b38", "#6d6bb8", "#c0528a", "#427a99"];
    return (
      <div className="forecast-chart">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="分数线历史趋势图">
          <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} />
          <line x1={pad} y1={pad} x2={pad} y2={height - pad} />
          {ranks.map((rank, index) => {
            const points = visible.filter((sample) => Number(sample.rank) === rank).map((sample) => `${x(Date.parse(sample.sampledAt))},${y(Number(sample.score))}`).join(" ");
            return points ? <polyline key={rank} points={points} stroke={palette[index % palette.length]} /> : null;
          })}
        </svg>
        <div className="forecast-legend">
          {ranks.map((rank, index) => <span key={rank}><i style={{ background: palette[index % palette.length] }} />T{rank}</span>)}
        </div>
      </div>
    );
  }

  async function estimateForecastPlanPtPerRun() {
    const binding = defaultBinding();
    if (!binding || !event?.id || event.id === "none") return;
    if (binding.region !== region) {
      setForecastPlanResult({ note: `当前页面区服 ${region.toUpperCase()} 与绑定区服 ${binding.region.toUpperCase()} 不一致，请先切换区服。` });
      return;
    }
    if (!normalPlanForm.musicId) {
      setForecastPlanResult({ note: "请先在计算工具中明确选择歌曲，再使用绑定 UID 估算单局收益。" });
      return;
    }
    const result: any = await apiPost("/api/me/tools/event-point-calc", {
      region: binding.region,
      bindingId: binding.id,
      eventId: event.id,
      musicId: normalPlanForm.musicId,
      difficulty: "expert",
      targetPt: Number(forecastPlanForm.currentPt)
    }, auth.token);
    const estimated = result.estimatedPt ?? result.eventPointBreakdown?.estimatedPt ?? result.ptPerRun;
    if (Number.isFinite(Number(estimated))) {
      setForecastPlanForm((current) => ({ ...current, ptPerRun: String(Math.round(Number(estimated))) }));
    }
    setForecastPlanResult({ eventPointEstimate: result, note: "已使用绑定 UID 数据估算每局收益，请再运行目标规划。" });
  }

  async function calculateForecastPlan() {
    if (!event?.id || event.id === "none") return;
    const targetRank = Number(forecastPlanForm.targetRank);
    const targetLine = (forecast?.lines ?? []).find((line) => line.rank === targetRank) ?? (borders as any[]).find((line) => Number(line.rank) === targetRank);
    const targetPt = Number(targetLine?.forecast3h ?? targetLine?.currentScore ?? targetLine?.score ?? 0);
    const result = await apiPost("/api/tools/score-control", {
      region,
      eventId: event.id,
      targetRank,
      currentPt: Number(forecastPlanForm.currentPt),
      targetPt,
      remainingMinutes: Number(forecastPlanForm.remainingMinutes),
      ptPerRun: Number(forecastPlanForm.ptPerRun),
      availableRuns: Number(forecastPlanForm.availableRuns)
    });
    setForecastPlanResult(result);
  }

  function ForecastPage() {
    const forecastBinding = defaultBinding();
    const forecastBindingRegionMatches = !forecastBinding || forecastBinding.region === region;
    const activeLines = forecastWindow === "all" ? forecast?.lines ?? [] : forecast?.windows?.[`${forecastWindow}h`] ?? forecast?.lines ?? [];
    const windowSummary = forecast?.windowSummaries?.[forecastWindow === "all" ? "all" : `${forecastWindow}h`];
    const warnings = [...(forecast?.warnings ?? []), ...(rankingHistorySummary?.warnings ?? []), ...(rankingHistory?.warnings ?? [])];
    return (
      <section className="rank-page forecast-page">
        <div className="rank-hero forecast-hero"><div><span className="home-kicker">实验性预测</span><h2>{event?.name ? `${event.name} 预测线` : "预测线"}</h2><div className="rank-meta"><span>基于真实采样</span><span>样本 {formatNumber(forecast?.sampleCount ?? rankingHistory?.sampleCount)}</span><span>与当前分数线分开显示</span></div></div><button type="button" className="secondary" onClick={() => goSection("currentEvent")}>返回分数线</button></div>
        <div className="button-row">
          {(["all", "1", "3", "6"] as const).map((window) => <button key={window} type="button" className={forecastWindow === window ? "" : "secondary"} onClick={() => setForecastWindow(window)}>{window === "all" ? "全部样本" : `近 ${window}h`}</button>)}
        </div>
        {warnings.length > 0 && <p className="warning-text">{warnings.slice(0, 3).join(" / ")}</p>}
        <section className="forecast-layout">
          <article className="panel">
            <div className="panel-heading"><div><h2>窗口健康</h2><p>{forecast?.retentionRecommendation ?? rankingHistorySummary?.retentionRecommendation ?? "真实样本保留用于预测，不自动造点。"}</p></div></div>
            <div className="summary-grid compact-summary">
              <div><span>窗口</span><strong>{forecastWindow === "all" ? "全部" : `${forecastWindow}h`}</strong></div>
              <div><span>档线</span><strong>{formatNumber(windowSummary?.lineCount ?? activeLines.length)}</strong></div>
              <div><span>最大样本</span><strong>{formatNumber(windowSummary?.maxSampleCount ?? 0)}</strong></div>
              <div><span>可信度</span><strong>{windowSummary?.confidence ?? "unavailable"}</strong></div>
            </div>
          </article>
          <article className="panel">
            <h2>目标规划</h2>
            <div className="two-col">
              <select value={forecastPlanForm.targetRank} onChange={(event) => setForecastPlanForm({ ...forecastPlanForm, targetRank: event.target.value })}>
                {activeLines.map((line) => <option key={line.rank} value={line.rank}>T{line.rank}</option>)}
                {!activeLines.length && borders.map((line) => <option key={line.rank} value={line.rank}>T{line.rank}</option>)}
              </select>
              <input value={forecastPlanForm.currentPt} onChange={(event) => setForecastPlanForm({ ...forecastPlanForm, currentPt: event.target.value })} placeholder="当前 pt" />
              <input value={forecastPlanForm.ptPerRun} onChange={(event) => setForecastPlanForm({ ...forecastPlanForm, ptPerRun: event.target.value })} placeholder="每局收益" />
              <input value={forecastPlanForm.remainingMinutes} onChange={(event) => setForecastPlanForm({ ...forecastPlanForm, remainingMinutes: event.target.value })} placeholder="剩余分钟" />
              <input value={forecastPlanForm.availableRuns} onChange={(event) => setForecastPlanForm({ ...forecastPlanForm, availableRuns: event.target.value })} placeholder="可打局数" />
            </div>
            <div className="button-row">
              <button type="button" onClick={calculateForecastPlan}>计算路径</button>
              <button type="button" className="secondary" disabled={!forecastBinding || !forecastBindingRegionMatches || !normalPlanForm.musicId} onClick={estimateForecastPlanPtPerRun}>用绑定 UID 估算收益</button>
            </div>
            {forecastBinding && !forecastBindingRegionMatches && <p className="warning-text">当前页面区服 {region.toUpperCase()} 与绑定区服 {forecastBinding.region.toUpperCase()} 不一致，请先切换区服。</p>}
            {forecastPlanResult && <pre className="json-preview">{JSON.stringify(forecastPlanResult, null, 2)}</pre>}
          </article>
        </section>
        <article className="panel wide">
          <div className="panel-heading"><div><h2>档线趋势图</h2><p>{rankingHistory?.unavailableReason ?? "折线只使用真实持久化样本，不插值、不补假点。"}</p></div></div>
          <HistoryTrendChart samples={rankingHistory?.items ?? []} lines={activeLines} />
        </article>
        <article className="panel wide">
          <div className="panel-heading"><div><h2>历史样本摘要</h2><p>{rankingHistorySummary?.unavailableReason ?? "持久化历史用于计算近期速度和预测可信度。"}</p></div></div>
          <div className="forecast-grid">{(rankingHistorySummary?.lines ?? []).slice(0, 12).map((line) => <div key={`${line.sampleType}-${line.rank}`} className="forecast-card"><span>T{line.rank}</span><strong>{formatNumber(line.latestScore)} pt</strong><small>样本 {formatNumber(line.sampleCount)} / {line.confidence ?? line.predictability ?? "unavailable"}</small><small>跨度: {formatNumber(line.sampleSpanHours)}h</small><small>速度: {formatNumber(line.speedPerHour)} pt/h</small><em>{line.confidenceReason ?? formatDate(line.latestSampledAt ?? undefined)}</em></div>)}</div>
          {(!rankingHistorySummary || rankingHistorySummary.lines.length === 0) && <p className="empty-state">暂无持久化历史样本。刷新分数线后会逐步积累。</p>}
        </article>
        <div className="forecast-grid">{activeLines.map((line) => <div key={line.rank} className="forecast-card"><span>T{line.rank}</span><strong>{formatNumber(line.currentScore)} pt</strong><small>速度: {formatNumber(line.speedPerHour ?? line.hourlyGrowth)} pt/h</small><small>1h: {formatNumber(line.forecast1h)} pt / 3h: {formatNumber(line.forecast3h)} pt</small><small>样本 {formatNumber(line.sampleCount)} / 跨度 {formatNumber(line.sampleSpanHours ?? line.sampleHours)}h</small><em>{line.unavailableReason ?? line.confidenceReason ?? "实验性预测"}</em></div>)}</div>
        {(!forecast || activeLines.length === 0) && <p className="empty-state">暂无可预测数据。</p>}
      </section>
    );
  }

  function toggleCatalogFilter(key: string, value: string) {
    setPage(1);
    setCatalogFilters((current) => {
      const values = current[key] ?? [];
      const next = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
      return { ...current, [key]: next };
    });
  }

  function renderCatalogFilters(data: CatalogResponse<any>) {
    return <CatalogFilterPanel
      meta={data.filterMeta}
      selected={catalogFilters}
      toggles={catalogToggles}
      total={data.total}
      onToggle={toggleCatalogFilter}
      onToggleBoolean={(key) => { setPage(1); setCatalogToggles((current) => ({ ...current, [key]: !current[key] })); }}
      onClear={() => { setPage(1); setCatalogFilters({}); setCatalogToggles({}); }}
    />;
  }

  function CatalogPage({ type }: { type: "events" | "songs" | "cards" | keyof typeof collectionMeta }) {
    if (type === "events") {
      const pageData = catalogs.events ?? { items: [], page, pageSize, total: 0, totalPages: 1 };
      return <section className="panel wide"><div className="panel-heading"><div><h2>活动图鉴</h2><p>浏览历次活动、加成角色与相关资料。</p></div><SearchBox value={filter} onChange={(value) => { setFilter(value); setPage(1); }} placeholder="搜索活动名称或 ID" /></div>{renderCatalogFilters(pageData)}<div className="catalog-grid event-grid">{pageData.items.map((eventItem: EventInfo) => { const candidates = imageCandidates(eventItem.assets); return <article key={`${region}:event:${eventItem.id}`} className="catalog-card event-card"><button type="button" className="catalog-card-main" onClick={() => openEvent(eventItem.id)}><ArtImage src={candidates[0]} srcCandidates={candidates} label={eventItem.name} variant="event" /><strong>{eventItem.name}</strong><span>{eventItem.eventType ?? "活动"}{eventItem.eventUnit ? ` · ${eventItem.eventUnit}` : ""}</span><small>{formatDate(eventItem.startAt)} · ID {eventItem.id}</small></button><FavoriteButton compact type="event" region={region} targetId={eventItem.id} label={eventItem.name} /></article>; })}</div><Pagination page={pageData.page} totalPages={pageData.totalPages} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} /></section>;
    }
    if (type === "songs") {
      const pageData = catalogs.songs ?? { items: [], page, pageSize, total: 0, totalPages: 1 };
      return <section className="panel wide"><div className="panel-heading"><div><h2>歌曲图鉴</h2><p>浏览歌曲封面、难度与谱面信息。</p></div><SearchBox value={filter} onChange={(value) => { setFilter(value); setPage(1); }} placeholder="搜索歌曲、ID、分类" /></div>{renderCatalogFilters(pageData)}<div className="catalog-grid songs">{pageData.items.map((song: Song, index: number) => <article key={`${region}:song:${song.id}`} className="catalog-card song-card"><button type="button" className="catalog-card-main" onClick={() => openSong(song.id)}><ArtImage src={song.assets?.jacketUrl} srcCandidates={song.assets?.imageCandidates} label={song.title} eager={index < 6} /><span className="song-card-copy"><strong>{song.title}</strong><span>{song.unit} · ID {song.id}</span><small>{song.durationSeconds ? `时长 ${song.durationSeconds}s` : "时长待同步"}</small></span></button><FavoriteButton compact type="song" region={region} targetId={song.id} label={song.title} /></article>)}</div><Pagination page={pageData.page} totalPages={pageData.totalPages} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} /></section>;
    }
    if (type === "cards") {
      const pageData = catalogs.cards ?? { items: [], page, pageSize, total: 0, totalPages: 1 };
      return <section className="panel wide"><div className="panel-heading"><div><h2>卡牌图鉴</h2><p>浏览卡面、角色信息与各等级技能效果。</p></div><SearchBox value={filter} onChange={(value) => { setFilter(value); setPage(1); }} placeholder="搜索角色、卡名、属性" /></div>{renderCatalogFilters(pageData)}<div className="catalog-grid cards">{pageData.items.map((card: Card, index: number) => <article key={`${region}:card:${card.id}`} className="catalog-card card-card"><button type="button" className="catalog-card-main" onClick={() => openCard(card.id)}><ArtImage src={card.assets?.normalThumbnailUrl ?? card.assets?.normalUrl} srcCandidates={card.assets?.normalThumbnailCandidates ?? card.assets?.imageCandidates} label={card.title} variant="square" eager={index < 8} /><strong>{card.title}</strong><span>{card.character}</span><small>星级 {card.rarity} / {card.attribute} / ID {card.id}</small></button><FavoriteButton compact type="card" region={region} targetId={card.id} label={card.title} /></article>)}</div><Pagination page={pageData.page} totalPages={pageData.totalPages} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} /></section>;
    }
    const collectionType = collectionMeta[type].type;
    const activeCollection = catalogs[collectionType];
    const pageData = activeCollection ?? { items: [], page, pageSize, total: 0, totalPages: 1 };
    return (
      <section className="panel wide">
        <div className="panel-heading"><div><h2>{collectionMeta[type].label}</h2><p>按名称、分类和 ID 浏览。</p></div><SearchBox value={filter} onChange={(value) => { setFilter(value); setPage(1); }} placeholder="搜索名称、分类、ID" /></div>
        {renderCatalogFilters(pageData)}
        <div className={`catalog-grid collection-grid collection-grid-${collectionType}`}>{pageData.items.map((item: CollectionItem) => {
          const candidates = collectionImageCandidates(collectionType, item.assets);
          return <article key={`${region}:${collectionType}:${item.id}`} className={`catalog-card collection-card collection-card-${collectionType}`}><button type="button" className="catalog-card-main" onClick={() => openCollection(collectionType, item.id)}><ArtImage src={candidates[0]} srcCandidates={candidates} label={item.name} variant={collectionImageVariant(collectionType)} /><strong>{item.name}</strong><span>{collectionType === "costumes" ? `${item.partTypes?.join(" / ") || "部件信息缺失"} · ${item.source ?? "获取方式未知"}` : item.category ?? item.rarity ?? "详细资料"}</span>{collectionType === "costumes" && <small>{item.designer ? `设计：${item.designer} · ` : ""}{item.rarity ?? "稀有度未知"}</small>}<small>ID {item.id}</small></button><FavoriteButton compact type={favoriteTypeForCatalog(collectionType)} region={region} targetId={item.id} label={item.name} /></article>;
        })}</div>
        <Pagination page={pageData.page} totalPages={pageData.totalPages} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </section>
    );
  }

  function ProfilePage() {
    return (
      <section className="panel wide">
        <div className="panel-heading"><div><h2>玩家档案查询</h2><p>公开 UID 仅展示公开资料；已有绑定数据可用于完整分析。</p></div><Link className="button-link" to="/me/profile">打开我的档案分析</Link></div>
        <div className="inline-form"><input value={profileId} onChange={(event) => setProfileId(event.target.value)} placeholder="玩家 UID" /><button type="button" onClick={loadProfile}><Search size={16} />查询</button></div>
        {profile && <div className="profile"><strong>{profile.nickname}</strong><span>Lv.{profile.rank} / {profile.region.toUpperCase()} / {profile.source}</span><p>{profile.comment || "暂无公开签名"}</p></div>}
      </section>
    );
  }

  function HistoryPage() {
    return (
      <section className="grid">
        <article className="panel"><h2>往期活动</h2><select value={historyEventId} onChange={(event) => setHistoryEventId(event.target.value)}>{events.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" onClick={() => openEvent(historyEventId || events[0]?.id)}>查看详情</button></article>
        <article className="panel"><h2>活动资料</h2><p>选择活动后可查看剧情简介、相关歌曲与登场卡牌。</p></article>
      </section>
    );
  }

  function DeckComparePage() {
    const binding = defaultBinding();
    const savedDeckConfigs = savedDeckConfigsForBinding(binding);
    const selectedSongForCompare = songs.find((song) => song.id === deckCompareForm.musicId) ?? songs[0];
    const difficulties = selectedSongForCompare?.difficultyDetails?.length ? selectedSongForCompare.difficultyDetails.map((item) => item.difficulty) : ["easy", "normal", "hard", "expert", "master", "append"];
    const comparisons = asArray(deckCompareResult?.comparisons);
    const bestScore = Math.max(1, ...comparisons.map((item: any) => Number(item.score ?? item.totalScore ?? item.multiLiveTrace?.score ?? 0)).filter(Number.isFinite));
    const bestPoint = Math.max(1, ...comparisons.map((item: any) => Number(item.eventPoint ?? item.estimatedPt ?? item.eventCalculatorTrace?.estimatedPt ?? 0)).filter(Number.isFinite));
    const missingFields = [...asArray(deckCompareResult?.missingFields), ...comparisons.flatMap((item: any) => asArray(item.missingFields))].slice(0, 16);
    const estimatedFields = [...asArray(deckCompareResult?.estimatedFieldsUsed), ...comparisons.flatMap((item: any) => asArray(item.estimatedFieldsUsed))].slice(0, 16);
    const exactTrace = deckCompareResult?.liveExactTrace ?? deckCompareResult?.noteScoreSummary;
    return (
      <section className="deck-compare-workspace">
        <article className="panel wide deck-compare-hero">
          <div className="panel-heading">
            <div>
              <h2>卡组比较</h2>
              <p>比较 2-5 个卡组方案的多人 Live 分数与活动 PT；登录态可引用当前 binding 的保存卡组。</p>
            </div>
            <Link className="text-link" to={auth.isAuthenticated ? "/me/deck" : "/login"}>{auth.isAuthenticated ? "管理保存卡组" : "登录后使用保存卡组"}</Link>
          </div>
          <div className="summary-grid compact-summary">
            <div><span>区服</span><strong>{(binding?.region ?? region).toUpperCase()}</strong></div>
            <div><span>模式</span><strong>{deckCompareForm.scoreMode}</strong></div>
            <div><span>保存卡组</span><strong>{formatNumber(savedDeckConfigs.length)}</strong></div>
            <div><span>比较方案</span><strong>{formatNumber(deckCompareCandidates.length)}</strong></div>
          </div>
        </article>

        <div className="deck-compare-layout">
          <article className="panel deck-compare-controls">
            <div className="panel-heading compact-heading"><div><h3>Live 参数</h3><p>{binding ? `当前绑定 ${binding.region.toUpperCase()} / ${binding.displayName || binding.playerUid}` : "公开模式使用当前页面区服。"}</p></div></div>
            <div className="two-col">
              <select value={deckCompareForm.musicId} onChange={(event) => setDeckCompareForm({ ...deckCompareForm, musicId: event.target.value })}>
                {songs.map((song) => <option key={song.id} value={song.id}>{song.id} · {song.title}</option>)}
              </select>
              <select value={deckCompareForm.difficulty} onChange={(event) => setDeckCompareForm({ ...deckCompareForm, difficulty: event.target.value })}>
                {difficulties.map((difficulty) => <option key={difficulty} value={difficulty}>{difficulty}</option>)}
              </select>
              <select value={deckCompareForm.liveType} onChange={(event) => setDeckCompareForm({ ...deckCompareForm, liveType: event.target.value })}>
                <option value="multi">Multi</option>
                <option value="cheerful">Cheerful</option>
                <option value="solo">Solo</option>
                <option value="challenge">Challenge</option>
              </select>
              <select value={deckCompareForm.scoreMode} onChange={(event) => setDeckCompareForm({ ...deckCompareForm, scoreMode: event.target.value })}>
                <option value="aggregate">Aggregate</option>
                <option value="exact">Exact</option>
              </select>
              <input value={deckCompareForm.boost} onChange={(event) => setDeckCompareForm({ ...deckCompareForm, boost: event.target.value })} placeholder="火量" />
              <input value={deckCompareForm.eventBonusPercent} onChange={(event) => setDeckCompareForm({ ...deckCompareForm, eventBonusPercent: event.target.value })} placeholder="活动加成 %" />
              <select value={deckCompareForm.skill15Strategy} onChange={(event) => setDeckCompareForm({ ...deckCompareForm, skill15Strategy: event.target.value })}>
                <option value="expected">Skill 1-5 期望</option>
                <option value="best">Skill 1-5 最佳</option>
                <option value="worst">Skill 1-5 最差</option>
              </select>
              <select value={deckCompareForm.skill6Mode} onChange={(event) => setDeckCompareForm({ ...deckCompareForm, skill6Mode: event.target.value })}>
                <option value="team-average">Skill 6 队伍均值</option>
                <option value="highest-power">Skill 6 最高综合力</option>
              </select>
            </div>
            {deckCompareForm.scoreMode === "exact" && <textarea value={deckCompareForm.exactSkills} onChange={(event) => setDeckCompareForm({ ...deckCompareForm, exactSkills: event.target.value })} placeholder="Exact 模式技能值，例如 250,250,250,250,250,250" />}
            <label className="check-line"><input type="checkbox" checked={deckCompareForm.unifiedTeammates} onChange={(event) => setDeckCompareForm({ ...deckCompareForm, unifiedTeammates: event.target.checked })} /> 四名队友使用统一参数</label>
            {deckCompareForm.unifiedTeammates ? (
              <div className="two-col">
                <input value={deckCompareForm.teammatePower} onChange={(event) => setDeckCompareForm({ ...deckCompareForm, teammatePower: event.target.value })} placeholder="队友综合力" />
                <input value={deckCompareForm.teammateEffectiveness} onChange={(event) => setDeckCompareForm({ ...deckCompareForm, teammateEffectiveness: event.target.value })} placeholder="队友技能值" />
              </div>
            ) : (
              <div className="deck-compare-teammates">
                {deckCompareTeammates.map((teammate, index) => <div key={index}><span>队友 {index + 1}</span><input value={teammate.power} onChange={(event) => setDeckCompareTeammates((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, power: event.target.value } : item))} placeholder="综合力" /><input value={teammate.effectiveness} onChange={(event) => setDeckCompareTeammates((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, effectiveness: event.target.value } : item))} placeholder="技能值" /></div>)}
              </div>
            )}
          </article>

          <article className="panel deck-compare-candidates">
            <div className="panel-heading compact-heading">
              <div><h3>比较方案</h3><p>手动综合力、cardIds 与登录态保存卡组可以混合比较。</p></div>
              <button type="button" className="secondary" disabled={deckCompareCandidates.length >= 5} onClick={addDeckCompareCandidate}><Plus size={16} />新增</button>
            </div>
            {deckCompareCandidates.map((candidate, index) => (
              <section className="deck-compare-candidate-card" key={candidate.id}>
                <div className="deck-compare-candidate-head">
                  <strong>{candidate.name || `方案 ${index + 1}`}</strong>
                  <button type="button" className="icon-button" disabled={deckCompareCandidates.length <= 2} onClick={() => removeDeckCompareCandidate(candidate.id)} aria-label="删除方案"><Trash2 size={16} /></button>
                </div>
                <div className="two-col">
                  <input value={candidate.name} onChange={(event) => updateDeckCompareCandidate(candidate.id, { name: event.target.value })} placeholder="方案名称" />
                  <select value={candidate.mode} onChange={(event) => updateDeckCompareCandidate(candidate.id, { mode: event.target.value as DeckCompareCandidateMode })}>
                    <option value="manual">手动 power/effectiveness</option>
                    <option value="cards">输入 cardIds</option>
                    <option value="saved" disabled={!binding}>保存卡组</option>
                  </select>
                </div>
                {candidate.mode === "manual" && <div className="two-col"><input value={candidate.power} onChange={(event) => updateDeckCompareCandidate(candidate.id, { power: event.target.value })} placeholder="综合力" /><input value={candidate.effectiveness} onChange={(event) => updateDeckCompareCandidate(candidate.id, { effectiveness: event.target.value })} placeholder="技能值" /></div>}
                {candidate.mode === "cards" && <textarea value={candidate.cardIds} onChange={(event) => updateDeckCompareCandidate(candidate.id, { cardIds: event.target.value })} placeholder="cardIds，例如 1,2,3,4,5" />}
                {candidate.mode === "saved" && <select value={candidate.deckConfigId} onChange={(event) => updateDeckCompareCandidate(candidate.id, { deckConfigId: event.target.value })}><option value="">选择保存卡组</option>{savedDeckConfigs.map((config) => <option key={config.id} value={config.id}>{config.name} · {config.cardIds.length} 张</option>)}</select>}
              </section>
            ))}
            <div className="button-row">
              <button type="button" onClick={calculateDeckCompare}><BarChart3 size={16} />运行比较</button>
              <button type="button" className="secondary" onClick={() => setDeckCompareResult(null)}>清空结果</button>
            </div>
            {deckCompareError && <p className="warning-text">{deckCompareError}</p>}
          </article>
        </div>

        {deckCompareResult && (
          <article className="panel wide deck-compare-result">
            <div className="panel-heading">
              <div><h2>比较结果</h2><p>{deckCompareResult.multiLiveVersion ?? "-"} · {deckCompareResult.liveExactVersion ?? deckCompareResult.scoreMode ?? deckCompareForm.scoreMode}</p></div>
              <span className="status-pill">{deckCompareResult.referenceFormulaId ?? "Deck Comparator"}</span>
            </div>
            <div className="deck-compare-result-grid">
              <div><span>分数胜出</span><strong>{deckCompareResult.winnerByScore?.name ?? deckCompareResult.winnerByScore?.id ?? "-"}</strong></div>
              <div><span>PT 胜出</span><strong>{deckCompareResult.winnerByEventPoint?.name ?? deckCompareResult.winnerByEventPoint?.id ?? "-"}</strong></div>
              <div><span>分数差</span><strong>{formatNumber(deckCompareResult.scoreDelta)}</strong></div>
              <div><span>PT 差</span><strong>{formatNumber(deckCompareResult.eventPointDelta)}</strong></div>
            </div>
            <div className="deck-compare-table-wrap">
              <div className="deck-compare-table">
                <div className="deck-compare-table-head"><span>方案</span><span>来源</span><span>综合力</span><span>技能值</span><span>分数</span><span>活动 PT</span><span>状态</span></div>
                {comparisons.map((item: any, index: number) => {
                  const score = Number(item.score ?? item.totalScore ?? item.multiLiveTrace?.score ?? 0);
                  const point = Number(item.eventPoint ?? item.estimatedPt ?? item.eventCalculatorTrace?.estimatedPt ?? 0);
                  return (
                    <div className="deck-compare-table-row" key={item.id ?? index}>
                      <strong>{item.name ?? item.id ?? `方案 ${index + 1}`}</strong>
                      <span>{item.source ?? item.inputMode ?? "-"}</span>
                      <span>{formatNumber(item.power ?? item.deckDetail?.power?.total ?? item.multiLiveTrace?.self?.power)}</span>
                      <span>{formatNumber(item.effectiveness ?? item.multiLiveTrace?.self?.effectiveness)}</span>
                      <span><b>{formatNumber(score)}</b><i style={{ width: `${Math.min(100, (score / bestScore) * 100)}%` }} /></span>
                      <span><b>{formatNumber(point)}</b><i style={{ width: `${Math.min(100, (point / bestPoint) * 100)}%` }} /></span>
                      <span>{item.referenceParity?.status ?? item.status ?? "ok"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {exactTrace && <div className="deck-compare-exact-trace"><strong>Exact Trace</strong><span>notes {formatNumber(exactTrace.noteCount ?? exactTrace.notes?.length)}</span><span>active {formatNumber(exactTrace.activeBonus)}</span><span>fever {exactTrace.feverWindow?.status ?? exactTrace.feverWindow ? "available" : "-"}</span><span>{deckCompareResult.musicScoreTrace?.status ?? deckCompareResult.musicScoreTrace?.source ?? ""}</span></div>}
            <div className="result-tags"><span>缺失字段</span>{missingFields.map((item: string) => <code key={item}>{item}</code>)}</div>
            <div className="result-tags"><span>估算字段</span>{estimatedFields.map((item: string) => <code key={item}>{item}</code>)}</div>
          </article>
        )}

        <article className="panel wide deck-compare-history">
          <div className="panel-heading compact-heading"><div><h3>本地比较历史</h3><p>仅保存在当前浏览器 localStorage，不写入服务器。</p></div><button type="button" className="secondary" onClick={() => setDeckCompareHistory([])}>清空</button></div>
          <div className="deck-compare-history-list">
            {deckCompareHistory.map((item) => <div key={item.id}><span>{formatDate(item.createdAt)} · {item.region.toUpperCase()} · {item.musicId}/{item.difficulty}</span><strong>{item.candidates.join(" vs ")}</strong><small>Score: {item.winnerByScore ?? "-"} · PT: {item.winnerByEventPoint ?? "-"} · Δ {formatNumber(item.scoreDelta)} / {formatNumber(item.eventPointDelta)}</small><button type="button" className="secondary" onClick={() => setDeckCompareHistory((current) => current.filter((entry) => entry.id !== item.id))}>删除</button></div>)}
            {!deckCompareHistory.length && <p className="empty-state">暂无本地比较历史。</p>}
          </div>
        </article>
      </section>
    );
  }

  function ToolsPage() {
    const binding = defaultBinding();
    const bindingRegionMatches = !binding || binding.region === region;
    const plan = normalPlanResult ?? boundPlanResult;
    const planDeckCards = plan?.deck?.recommendedDecks?.[0]?.cards ?? plan?.deck?.recommendedCards ?? [];
    const boostRates = [1, 5, 10, 15, 20, 25, 27, 29, 31, 33, 35];
    const difficulties = ["easy", "normal", "hard", "expert", "master", "append"];
    const liveTypes = [["solo", "单人 Live"], ["multi", "多人 Live"], ["cheerful", "欢乐嘉年华"], ["auto", "AUTO Live"], ["challenge", "挑战 Live"]];
    const songQuery = toolSongSearch.trim().toLowerCase();
    const filteredToolSongs = songQuery ? songs.filter((song) => `${song.title} ${song.id}`.toLowerCase().includes(songQuery)) : songs;
    const selectedToolSong = songs.find((song) => song.id === normalPlanForm.musicId);
    const songSelectionReady = toolSongsStatus === "ready" && !toolDataLoading && !toolDataError && songs.length > 0 && Boolean(selectedToolSong);
    const Field = ({ label, unit, help, children }: { label: string; unit?: string; help: string; children: any }) => <label className="tool-field"><span className="tool-field-label">{label}{unit && <small>{unit}</small>}</span>{children}<small className="tool-field-help">{help}</small></label>;
    const JsonDetails = ({ value }: { value: any }) => value ? <details className="tool-json-details"><summary>查看完整计算详情（JSON）</summary><pre className="json-preview">{JSON.stringify(value, null, 2)}</pre></details> : null;
    function ResultWarnings({ result }: { result: any }) {
      const missing = result?.missingFields ?? [];
      const warnings = result?.warnings ?? [];
      if (!missing.length && !warnings.length) return null;
      return <div className="tool-notice"><strong>数据完整性提示</strong><span>缺失数据会使用估算或使部分结果不可用，详细字段保留在完整结果中。</span>{missing.length > 0 && <p>缺失：{missing.slice(0, 8).join(" / ")}</p>}{warnings.length > 0 && <p>警告：{warnings.slice(0, 8).join(" / ")}</p>}</div>;
    }
    function PlanResultView({ result }: { result: any }) {
      if (!result) return null;
      const sections = result.sections ?? {};
      return (
        <article className="panel wide normal-plan-result">
          <div className="panel-heading">
            <div>
              <h2>普通活动规划结果</h2>
              <p>公式 {result.sharedFormulaVersion ?? "-"} · 活动加成 {formatNumber(result.derivedEventBonusPercent)}%</p>
            </div>
            <span className="status-pill">{result.realDataRequired ? "真实数据" : "估算"}</span>
          </div>
          <div className="normal-plan-grid">
            <section>
              <h3>推荐卡组</h3>
              {planDeckCards.slice(0, 5).map((entry: any) => (
                <div key={entry.card?.id ?? entry.cardId}>
                  <strong>{entry.card?.title ?? entry.card?.id ?? entry.cardId}</strong>
                  <span>加成 {formatNumber(entry.eventBonus)}% · 贡献 {formatNumber(entry.contributionScore)}</span>
                </div>
              ))}
              {!planDeckCards.length && <p className="empty-state">缺少持有卡，暂不能推荐卡组。</p>}
            </section>
            <section>
              <h3>活动 PT</h3>
              <strong>{formatNumber(result.eventPoint?.estimatedPt)} pt / 局</strong>
              <span>{result.eventPoint?.eventPointBreakdown?.exactness ?? sections.eventPoint?.missingFields?.slice(0, 3).join(" / ") ?? "基础收益可估算"}</span>
              <small>{result.eventPoint?.eventPointBreakdown?.referenceFormulaId ?? ""}</small>
            </section>
            <section>
              <h3>控分 / 目标</h3>
              <strong>{formatNumber(result.scoreControl?.requiredRuns)} 局</strong>
              <span>剩余 {formatNumber(result.scoreControl?.remainingPt)} pt · {formatNumber(result.scoreControl?.requiredPtPerHour)} pt/h</span>
            </section>
            <section>
              <h3>歌曲推荐</h3>
              <strong>{result.music?.recommendations?.[0]?.music?.title ?? "暂无候选"}</strong>
              <span>{formatNumber(result.music?.recommendations?.[0]?.estimatedPtPerMinute)} pt/min</span>
            </section>
            <section>
              <h3>道具建议</h3>
              <strong>{result.area?.recommendations?.[0]?.areaItem?.name ?? "暂无候选"}</strong>
              <span>优先级 {formatNumber(result.area?.recommendations?.[0]?.priorityScore)}</span>
            </section>
          </div>
          <div className="result-tags">
            <span>缺失字段</span>
            {(result.missingFields ?? []).slice(0, 12).map((item: string) => <code key={item}>{item}</code>)}
          </div>
           <div className="result-tags">
             <span>风险提示</span>
             {(result.warnings ?? []).slice(0, 12).map((item: string) => <code key={item}>{item}</code>)}
           </div>
           <JsonDetails value={result} />
         </article>
       );
     }
    function BoundToolResultView() {
      if (!boundToolResult) return null;
      const result = boundToolResult.result;
      const labels: Record<string, string> = { "event-point": "活动 PT", music: "歌曲推荐", area: "区域道具", mysekai: "MySekai" };
      return <section className="bound-tool-result"><div className="panel-heading compact-heading"><div><h3>{labels[boundToolResult.tool] ?? boundToolResult.tool}结果</h3><p>先展示主要结论，未确认或缺失字段不会隐藏。</p></div></div>
        {boundToolResult.tool === "event-point" && <div className="tool-result-metrics"><div><span>预计单局 PT</span><strong>{formatNumber(result?.estimatedPt)} pt</strong></div><div><span>到目标还需</span><strong>{formatNumber(result?.estimatedRunsToTarget)} 局</strong></div><div><span>当前火量倍率</span><strong>x{formatNumber(boostRates[Number(normalPlanForm.boost)] ?? 1)}</strong></div></div>}
        {boundToolResult.tool === "music" && <RecommendationList items={result?.recommendations} type="music" />}
        {boundToolResult.tool === "area" && <RecommendationList items={result?.recommendations} type="area" />}
        {boundToolResult.tool === "mysekai" && <p className="empty-state">MySekai 计算完成，展开完整结果可查看所有字段。</p>}
        <ResultWarnings result={result} /><JsonDetails value={result} /></section>;
    }
    function RecommendationList({ items = [], type }: { items?: any[]; type: "music" | "area" }) {
      if (!items.length) return <p className="empty-state">当前没有可展示的候选，请查看数据完整性提示。</p>;
      return <div className="tool-ranking-list">{items.map((item: any, index: number) => type === "music"
        ? <div key={`${item.music?.id}-${item.difficulty?.difficulty}`}><b>#{index + 1}</b><strong>{item.music?.title ?? item.music?.id ?? "未知歌曲"}</strong><span>{String(item.difficulty?.difficulty ?? "-").toUpperCase()} · {formatNumber(item.music?.durationSeconds)} 秒 · {formatNumber(item.estimatedPt)} pt/局 · {formatNumber(item.estimatedPtPerMinute)} pt/min · 约 {formatNumber(item.estimatedRunsToTarget)} 局</span></div>
        : <div key={item.areaItemId ?? index}><b>#{index + 1}</b><strong>{item.name ?? item.areaItem?.name ?? item.areaItemId}</strong><span>Lv.{formatNumber(item.fromLevel)} → Lv.{formatNumber(item.toLevel)} · 综合力 +{formatNumber(item.powerGain)} · 金币 {formatNumber(item.cost?.coin)} · {item.affordable === true ? "材料足够" : item.affordable === false ? "材料不足" : "成本未知"}</span></div>)}</div>;
    }
    return (
      <section className="tool-workspace">
        <article className="panel wide tools-intro"><div><span className="home-kicker">按游戏结算页填写</span><h2>活动计算工具</h2><p>字段下方会说明数值从哪里获取。可留空的项目会由绑定资产或公式默认值估算，并在结果中明确标记。</p></div><div className="boost-reference"><strong>火量倍率表</strong><div>{boostRates.map((rate, fires) => <span key={fires} className={Number(normalPlanForm.boost) === fires ? "active" : ""}><b>{fires} 火</b>x{rate}</span>)}</div><small>火量是开始 Live 前选择的消耗量；这里显示的是活动 PT 倍率。</small></div></article>
        <article className="panel wide">
          <div className="panel-heading">
            <div>
              <h2>登录态资产联动</h2>
              <p>{binding ? `当前使用 ${binding.region.toUpperCase()} / ${binding.displayName || binding.playerUid}` : (HARUKI_FEATURE_ENABLED ? "连接玩家数据后，可直接用跨端玩家快照驱动计算工具。" : "玩家数据连接功能暂未开放；仍可手动填写参数使用计算工具。")}</p>
            </div>
            <Link className="text-link" to={auth.isAuthenticated ? (HARUKI_FEATURE_ENABLED ? "/me/assets" : "/me") : "/login"}>{auth.isAuthenticated ? (HARUKI_FEATURE_ENABLED ? "连接玩家数据" : "账号中心") : "登录 / 注册"}</Link>
          </div>
          <div className="button-row">
            <button type="button" disabled={!binding || !bindingRegionMatches || !songSelectionReady} onClick={calculateBoundPlan}>绑定数据普通活动规划</button>
            <button type="button" className="secondary" disabled={!binding || !bindingRegionMatches || !songSelectionReady} onClick={() => calculateBoundTool("event-point")}>绑定数据活动 PT</button>
            <button type="button" className="secondary" disabled={!binding} onClick={() => calculateBoundTool("music")}>绑定数据歌曲推荐</button>
            <button type="button" className="secondary" disabled={!binding} onClick={() => calculateBoundTool("area")}>绑定数据道具建议</button>
            <button type="button" className="secondary" disabled={!binding} onClick={() => calculateBoundTool("mysekai")}>绑定数据 MySekai</button>
          </div>
          {binding && !bindingRegionMatches && <p className="warning-text">当前页面区服 {region.toUpperCase()} 与绑定区服 {binding.region.toUpperCase()} 不一致，请先切换区服。</p>}
          <BoundToolResultView />
        </article>
        <article className="panel wide normal-plan-panel">
          <div className="panel-heading compact-heading"><div><h2>普通活动规划</h2><p>一次计算推荐卡组、单局 PT、到目标所需局数、歌曲效率和区域道具建议。</p></div><span className="status-pill">当前区服 {region.toUpperCase()}</span></div>
          {toolDataLoading && <div className="tool-data-state"><RefreshCw size={16} className="spin" /><span>正在加载完整歌曲与卡牌数据…</span></div>}
          {toolSongsStatus === "error" && <div className="tool-data-state error"><span>歌曲列表加载失败：{toolSongsError || toolDataError || "未知错误"}</span><button type="button" className="secondary" onClick={() => ensureFullToolData(true).catch((error) => setMessage(error instanceof Error ? error.message : String(error)))}>重试加载</button></div>}
          {toolDataError && toolSongsStatus !== "error" && <div className="tool-data-state error"><span>完整工具数据加载失败：{toolDataError}</span><button type="button" className="secondary" onClick={() => ensureFullToolData().catch((error) => setMessage(error instanceof Error ? error.message : String(error)))}>重试加载</button></div>}
          {toolSongsStatus === "ready" && songs.length === 0 && <div className="tool-data-state"><span>当前区服暂无歌曲数据，暂不能进行普通活动规划或活动 PT 计算。</span><button type="button" className="secondary" onClick={() => ensureFullToolData(true).catch((error) => setMessage(error instanceof Error ? error.message : String(error)))}>重新检查</button></div>}
          <div className="tool-form-grid">
            <Field label="目标活动 PT" unit="pt" help="活动页面右上角的目标总分，例如 1,000,000 PT。"><input type="number" min="0" value={normalPlanForm.targetPt} onChange={(event) => setNormalPlanForm({ ...normalPlanForm, targetPt: event.target.value })} placeholder="例如 1000000" /></Field>
            <Field label="当前活动 PT" unit="pt" help="活动页面当前已获得的累计 PT。"><input type="number" min="0" value={normalPlanForm.currentPt} onChange={(event) => setNormalPlanForm({ ...normalPlanForm, currentPt: event.target.value })} placeholder="例如 250000" /></Field>
            <Field label="剩余时间" unit="分钟" help="从现在到活动结束还能游玩的时间，例如 3 小时填 180。"><input type="number" min="0" value={normalPlanForm.remainingMinutes} onChange={(event) => setNormalPlanForm({ ...normalPlanForm, remainingMinutes: event.target.value })} placeholder="例如 180" /></Field>
            <Field label="每局消耗火量" help={`Live 开始前选择的火量；当前对应活动 PT x${boostRates[Number(normalPlanForm.boost)] ?? 1}。`}><select value={normalPlanForm.boost} onChange={(event) => setNormalPlanForm({ ...normalPlanForm, boost: event.target.value })}>{boostRates.map((rate, fires) => <option key={fires} value={fires}>{fires} 火（PT x{rate}）</option>)}</select></Field>
            <Field label="歌曲" help="必须明确选择准备周回的歌曲；可按歌名或 musicId 搜索，不会自动用曲库第一首代替。"><div className="song-picker"><input type="search" value={toolSongSearch} onChange={(event) => setToolSongSearch(event.target.value)} placeholder="搜索歌名或歌曲 ID" disabled={toolSongsStatus !== "ready" || songs.length === 0} /><select value={normalPlanForm.musicId} onChange={(event) => setNormalPlanForm({ ...normalPlanForm, musicId: event.target.value })} disabled={toolSongsStatus !== "ready" || songs.length === 0}><option value="">{toolSongsStatus === "loading" || toolSongsStatus === "idle" ? "歌曲列表加载中…" : toolSongsStatus === "error" ? "歌曲列表加载失败" : songs.length === 0 ? "暂无歌曲" : filteredToolSongs.length === 0 ? "没有匹配的歌曲" : "请选择歌曲"}</option>{selectedToolSong && !filteredToolSongs.some((song) => song.id === selectedToolSong.id) && <option value={selectedToolSong.id}>{selectedToolSong.title}（ID {selectedToolSong.id}，当前选择）</option>}{filteredToolSongs.map((song) => <option key={song.id} value={song.id}>{song.title}（ID {song.id}）</option>)}</select><small>{toolSongsStatus === "ready" && songs.length > 0 ? `已加载 ${formatNumber(songs.length)} 首，当前筛选 ${formatNumber(filteredToolSongs.length)} 首。` : "歌曲加载完成后才能选择。"}</small></div></Field>
            <Field label="难度" help="选择实际游玩的谱面难度。"><select value={normalPlanForm.difficulty} onChange={(event) => setNormalPlanForm({ ...normalPlanForm, difficulty: event.target.value })}>{difficulties.map((difficulty) => <option key={difficulty} value={difficulty}>{difficulty.toUpperCase()}</option>)}</select></Field>
            <Field label="Live 类型" help="多人/欢乐嘉年华会考虑队友得分与 Fever。"><select value={normalPlanForm.liveType} onChange={(event) => setNormalPlanForm({ ...normalPlanForm, liveType: event.target.value })}>{liveTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="预计结算分数" unit="分" help="可留空。填最近相同队伍、歌曲和模式的结算分数；留空时由卡组或默认值估算。"><input type="number" min="0" value={normalPlanForm.baseScore} onChange={(event) => setNormalPlanForm({ ...normalPlanForm, baseScore: event.target.value })} placeholder="可留空，例如 2000000" /></Field>
            <Field label="活动加成" unit="%" help="可留空。编成页面显示 621% 就填 621；绑定资产时可自动推导。"><input type="number" min="0" value={normalPlanForm.eventBonusPercent} onChange={(event) => setNormalPlanForm({ ...normalPlanForm, eventBonusPercent: event.target.value })} placeholder="可留空，例如 621" /></Field>
            <Field label="持有卡牌 ID" help="公开模式用于推荐卡组，以逗号或空格分隔；登录后建议使用绑定 UID。"><textarea value={normalPlanForm.ownedCardIds} onChange={(event) => setNormalPlanForm({ ...normalPlanForm, ownedCardIds: event.target.value })} placeholder="例如 1, 2, 3, 4, 5" /></Field>
          </div>
          <div className="button-row">
            <button type="button" disabled={!songSelectionReady} onClick={calculatePublicNormalPlan}><Wand2 size={16} />使用手动数据规划</button>
            <button type="button" className="secondary" disabled={!binding || !bindingRegionMatches || !songSelectionReady} onClick={calculateBoundPlan}>使用绑定 UID 数据</button>
          </div>
          {toolSongsStatus === "ready" && songs.length > 0 && !normalPlanForm.musicId && <p className="warning-text">请先明确选择一首歌曲，规划和活动 PT 按钮才会启用。</p>}
        </article>
        <PlanResultView result={plan} />
        <article className="panel tool-card-panel"><div className="panel-heading compact-heading"><div><h2>周回 / 控分</h2><p>已有可靠的单局 PT 时，计算还需局数和每小时进度要求。</p></div></div><div className="tool-form-grid compact">
          <Field label="当前活动 PT" unit="pt" help="活动页面当前累计 PT。"><input type="number" min="0" value={controlForm.currentPt} onChange={(event) => setControlForm({ ...controlForm, currentPt: event.target.value })} /></Field>
          <Field label="目标活动 PT" unit="pt" help="希望最终达到的累计 PT。"><input type="number" min="0" value={controlForm.targetPt} onChange={(event) => setControlForm({ ...controlForm, targetPt: event.target.value })} /></Field>
          <Field label="剩余时间" unit="分钟" help="例如 3 小时填 180。"><input type="number" min="0" value={controlForm.remainingMinutes} onChange={(event) => setControlForm({ ...controlForm, remainingMinutes: event.target.value })} /></Field>
          <Field label="单局活动 PT" unit="pt/局" help="填一局结算画面的活动 PT；不确定时先用上方规划估算。"><input type="number" min="0" value={controlForm.ptPerRun} onChange={(event) => setControlForm({ ...controlForm, ptPerRun: event.target.value })} placeholder="例如 55875" /></Field>
          <Field label="最多可打局数" unit="局" help="按体力、时间或预算估算的局数上限。"><input type="number" min="0" value={controlForm.availableRuns} onChange={(event) => setControlForm({ ...controlForm, availableRuns: event.target.value })} /></Field>
        </div><button type="button" onClick={calculateControl}><Check size={16} />计算目标路径</button>{controlResult && <><div className="tool-result-metrics"><div><span>还差 PT</span><strong>{formatNumber(controlResult.remainingPt)}</strong></div><div><span>所需局数</span><strong>{formatNumber(controlResult.requiredRuns)} 局</strong></div><div><span>每小时需打</span><strong>{typeof controlResult.requiredRunsPerHour === "number" ? controlResult.requiredRunsPerHour.toFixed(1) : "-"} 局</strong></div><div><span>计划状态</span><strong>{controlResult.feasible ? "可行" : "需调整"}</strong></div></div><ResultWarnings result={controlResult} /><JsonDetails value={controlResult} /></>}</article>
        <article className="panel tool-card-panel"><div className="panel-heading compact-heading"><div><h2>组卡推荐</h2><p>卡牌 ID 可在卡牌图鉴详情中查看，公开模式只使用手动填写的持有卡。</p></div></div><Field label="持有卡牌 ID" help="以逗号或空格分隔，只填写真正持有的卡。"><textarea value={deckOwnedIds} onChange={(event) => setDeckOwnedIds(event.target.value)} placeholder="例如 1, 2, 109, 325" /></Field><button type="button" onClick={calculateDeck}><Wand2 size={16} />推荐卡组</button>{deckResult && <><p className="empty-state">推荐已生成；若候选为空，请查看缺失字段。</p><ResultWarnings result={deckResult} /><JsonDetails value={deckResult} /></>}</article>
        <article className="panel wide tool-card-panel"><div className="panel-heading compact-heading"><div><h2>周回歌曲推荐</h2><p>按共享活动 PT 公式计算候选歌曲，再按每分钟 PT 排序。</p></div></div><div className="tool-form-grid">
          <Field label="目标 / 当前 PT" help="用于估算每首歌到目标还需多少局。"><div className="inline-pair"><input type="number" min="0" value={musicRecommendForm.targetPt} onChange={(event) => setMusicRecommendForm({ ...musicRecommendForm, targetPt: event.target.value })} placeholder="目标 PT" /><input type="number" min="0" value={musicRecommendForm.currentPt} onChange={(event) => setMusicRecommendForm({ ...musicRecommendForm, currentPt: event.target.value })} placeholder="当前 PT" /></div></Field>
          <Field label="活动加成" unit="%" help="编成页面显示 621% 就填 621。"><input type="number" min="0" value={musicRecommendForm.eventBonusPercent} onChange={(event) => setMusicRecommendForm({ ...musicRecommendForm, eventBonusPercent: event.target.value })} /></Field>
          <Field label="预计结算分数" unit="分" help="填最近同队伍、同模式的结算分数；可留空。"><input type="number" min="0" value={musicRecommendForm.baseScore} onChange={(event) => setMusicRecommendForm({ ...musicRecommendForm, baseScore: event.target.value })} /></Field>
          <Field label="Live 类型 / 火量" help="火量按页面上方倍率表计算。"><div className="inline-pair"><select value={musicRecommendForm.liveType} onChange={(event) => setMusicRecommendForm({ ...musicRecommendForm, liveType: event.target.value })}>{liveTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={musicRecommendForm.boost} onChange={(event) => setMusicRecommendForm({ ...musicRecommendForm, boost: event.target.value })}>{boostRates.map((rate, fires) => <option key={fires} value={fires}>{fires} 火（x{rate}）</option>)}</select></div></Field>
          <Field label="难度 / 最长时长" help="只比较指定难度且不超过该时长的谱面。"><div className="inline-pair"><select value={musicRecommendForm.preferredDifficulty} onChange={(event) => setMusicRecommendForm({ ...musicRecommendForm, preferredDifficulty: event.target.value })}>{difficulties.map((difficulty) => <option key={difficulty} value={difficulty}>{difficulty.toUpperCase()}</option>)}</select><input type="number" min="1" value={musicRecommendForm.maxDurationSeconds} onChange={(event) => setMusicRecommendForm({ ...musicRecommendForm, maxDurationSeconds: event.target.value })} placeholder="最长秒数" /></div></Field>
        </div><button type="button" onClick={calculateMusicRecommend}><Music size={16} />计算歌曲效率</button>{musicRecommendResult && <><RecommendationList items={musicRecommendResult.recommendations} type="music" /><ResultWarnings result={musicRecommendResult} /><JsonDetails value={musicRecommendResult} /></>}</article>
        <article className="panel wide tool-card-panel"><div className="panel-heading compact-heading"><div><h2>区域道具升级建议</h2><p>对照 Moesekai 区域道具公式，比较目标卡组升级前后的综合力变化；成本数据缺失时明确标记。</p></div></div><div className="tool-form-grid"><Field label="目标卡组 ID" help="填写正在使用的 1–5 张卡牌 ID；绑定资产可结合当前区域道具等级与素材。"><textarea value={areaRecommendForm.cardIds} onChange={(event) => setAreaRecommendForm({ ...areaRecommendForm, cardIds: event.target.value })} placeholder="例如 101, 205, 309, 410, 512" /></Field><Field label="排序方式" help="选择更看重金币效率、绝对综合力提升或当前材料是否足够。"><select value={areaRecommendForm.sortBy} onChange={(event) => setAreaRecommendForm({ ...areaRecommendForm, sortBy: event.target.value })}><option value="coin-efficiency">金币效率优先</option><option value="power-gain">综合力提升优先</option><option value="affordable">当前可升级优先</option></select></Field><label className="tool-check-field"><input type="checkbox" checked={areaRecommendForm.includeUnaffordable} onChange={(event) => setAreaRecommendForm({ ...areaRecommendForm, includeUnaffordable: event.target.checked })} /><span><strong>显示材料不足的项目</strong><small>材料数据缺失时仍会保留候选并标明成本未知。</small></span></label></div><div className="button-row"><button type="button" onClick={calculateAreaRecommend}><Package size={16} />用手动卡组生成建议</button><button type="button" className="secondary" disabled={!binding} onClick={() => calculateBoundTool("area")}>使用绑定 UID 资产</button></div>{areaRecommendResult && <><RecommendationList items={areaRecommendResult.recommendations} type="area" /><ResultWarnings result={areaRecommendResult} /><JsonDetails value={areaRecommendResult} /></>}</article>
      </section>
    );
  }

  function MysekaiPage() {
    const data = contentData.mysekai;
    const binding = defaultBinding();
    const groups = data?.groups ?? {};
    const groupCards = [
      ["mysekaiFixtures", "家具", "可摆放物与基础信息"],
      ["mysekaiBlueprints", "蓝图", "制作与解锁数据"],
      ["mysekaiMaterials", "素材", "MySekai 素材 master"],
      ["mysekaiGates", "大门", "单位/角色加成入口"],
      ["mysekaiGateLevels", "大门等级", "大门等级加成表"],
      ["mysekaiFixtureGameCharacterGroupPerformanceBonuses", "角色家具加成", "家具对角色/分组的加成"],
      ["cardMysekaiCanvasBonuses", "画布加成", "卡牌画布相关加成"],
      ["eventMysekaiFixtureGameCharacterPerformanceBonusLimits", "家具加成上限", "活动或规则限制表"]
    ];
    const resultCards = mysekaiCalcResult?.recommendedDeck ?? mysekaiCalcResult?.recommendedCards ?? [];
    const deckCandidates = mysekaiCalcResult?.mysekaiDeckSearch?.decks ?? [];
    const mysekaiPoint = mysekaiCalcResult?.mysekaiEventPoint;
    const recommendations = mysekaiCalcResult?.mysekaiRecommendations ?? {};
    return (
      <section className="mysekai-workspace">
        <article className="panel wide">
          <div className="panel-heading">
            <div>
              <h2>MySekai 玩家助手</h2>
              <p>浏览 MySekai 家具、素材与蓝图，也可结合个人资产进行计算。</p>
            </div>
            <button type="button" onClick={() => loadContent("mysekai")}><RefreshCw size={16} />刷新</button>
          </div>
          {data?.sourceMetadata?.unavailableReason && <p className="warning-text">{data.sourceMetadata.unavailableReason}</p>}
        </article>
        <article className="panel wide mysekai-catalog-panel">
          <div className="panel-heading">
            <div><h3>MySekai 图鉴</h3><p>浏览家具、素材与制作蓝图；计算工具保留在下方。</p></div>
            <span>{formatNumber(mysekaiCatalog?.total ?? 0)} 条</span>
          </div>
          <div className="mission-tabs mysekai-catalog-tabs">
            {(["fixtures", "materials", "blueprints"] as const).map((kind) => (
              <button type="button" className={kind === mysekaiCatalogKind ? "active" : ""} key={kind} onClick={() => { setMysekaiCatalogKind(kind); setMysekaiCatalogPage(1); setMysekaiCatalogCategory(""); }}>
                {kind === "fixtures" ? "家具" : kind === "materials" ? "素材" : "蓝图"}
              </button>
            ))}
          </div>
          <form className="mysekai-catalog-toolbar" onSubmit={(event) => { event.preventDefault(); setMysekaiCatalogPage(1); void loadMysekaiCatalog(mysekaiCatalogKind, 1, mysekaiCatalogQuery); }}>
            <label><Search size={16} /><input value={mysekaiCatalogQuery} onChange={(event) => setMysekaiCatalogQuery(event.target.value)} placeholder="搜索名称或 ID" /></label>
            <select value={mysekaiCatalogCategory} onChange={(event) => { setMysekaiCatalogCategory(event.target.value); setMysekaiCatalogPage(1); }}>
              <option value="">全部分类</option>
              {asArray(mysekaiCatalog?.facets?.categories).map((category: string) => <option value={category} key={category}>{category}</option>)}
            </select>
            <button type="submit">搜索</button>
          </form>
          <div className="mysekai-catalog-grid">
            {asArray(mysekaiCatalog?.items).map((item: any) => (
              <button type="button" className="mysekai-catalog-card" key={`${item.kind}:${item.id}`} onClick={() => openMysekaiItem(item.kind, item.id)}>
                <ArtImage src={item.imageUrl} srcCandidates={asArray(item.imageCandidates)} label={item.name} />
                <span>{item.category ?? item.rarity ?? item.kind}</span>
                <strong>{item.name}</strong>
                <small>ID {item.id}</small>
              </button>
            ))}
          </div>
          {!asArray(mysekaiCatalog?.items).length && <p className="empty-state">当前筛选没有可展示内容；缺失集合会按区服单独报告。</p>}
          <div className="catalog-pagination">
            <button type="button" className="secondary" disabled={(mysekaiCatalog?.page ?? 1) <= 1} onClick={() => setMysekaiCatalogPage((current) => Math.max(1, current - 1))}>上一页</button>
            <span>{mysekaiCatalog?.page ?? 1} / {mysekaiCatalog?.totalPages ?? 1}</span>
            <button type="button" className="secondary" disabled={(mysekaiCatalog?.page ?? 1) >= (mysekaiCatalog?.totalPages ?? 1)} onClick={() => setMysekaiCatalogPage((current) => current + 1)}>下一页</button>
          </div>
        </article>
        <section className="mysekai-summary-grid wide">
          {groupCards.map(([key, label, desc]) => {
            const rows = Array.isArray(groups[key]) ? groups[key] : key === "mysekaiFixtures" && Array.isArray(groups.mysekaiFixtureInfos) ? groups.mysekaiFixtureInfos : [];
            const count = rows.length;
            return <article className="panel" key={key}><span>{label}</span><strong>{formatNumber(count)}</strong><small>{desc}</small></article>;
          })}
        </section>
        <article className="panel mysekai-master-panel">
          <h3>分组预览</h3>
          <div className="mysekai-group-list">
            {groupCards.map(([key, label]) => {
              const sourceRows = Array.isArray(groups[key]) ? groups[key] : key === "mysekaiFixtures" && Array.isArray(groups.mysekaiFixtureInfos) ? groups.mysekaiFixtureInfos : [];
              const rows = sourceRows.slice(0, 4);
              return <section key={key}><h4>{label}</h4>{rows.length ? rows.map((row: any, index: number) => <code key={`${key}:${index}`}>{String(row.name ?? row.assetbundleName ?? row.id ?? `Item ${index + 1}`)}</code>) : <p className="empty-state">暂无可展示样本</p>}</section>;
            })}
          </div>
        </article>
        <article className="panel mysekai-calc-panel">
          <h3>MySekai 计算器</h3>
          <p className="warning-text">结果会区分真实字段、估算字段和缺失字段；未确认公式不会标为精确结果。</p>
          <div className="two-col">
            <input value={mysekaiSearchForm.eventBonus} onChange={(event) => setMysekaiSearchForm({ ...mysekaiSearchForm, eventBonus: event.target.value })} placeholder="活动加成 %" />
            <input value={mysekaiSearchForm.supportDeckBonus} onChange={(event) => setMysekaiSearchForm({ ...mysekaiSearchForm, supportDeckBonus: event.target.value })} placeholder="支援加成 %" />
            <select value={mysekaiSearchForm.algorithm} onChange={(event) => setMysekaiSearchForm({ ...mysekaiSearchForm, algorithm: event.target.value })}>
              <option value="ga">GA 搜索</option>
              <option value="beam">兼容 Beam</option>
            </select>
            <input value={mysekaiSearchForm.candidatePoolSize} onChange={(event) => setMysekaiSearchForm({ ...mysekaiSearchForm, candidatePoolSize: event.target.value })} placeholder="候选池大小" />
            {mysekaiSearchForm.algorithm === "beam" && <input value={mysekaiSearchForm.beamWidth} onChange={(event) => setMysekaiSearchForm({ ...mysekaiSearchForm, beamWidth: event.target.value })} placeholder="Beam 宽度" />}
          </div>
          {mysekaiSearchForm.algorithm === "ga" && (
            <div className="two-col">
              <input value={mysekaiSearchForm.seed} onChange={(event) => setMysekaiSearchForm({ ...mysekaiSearchForm, seed: event.target.value })} placeholder="Seed" />
              <input value={mysekaiSearchForm.timeoutMs} onChange={(event) => setMysekaiSearchForm({ ...mysekaiSearchForm, timeoutMs: event.target.value })} placeholder="超时 ms" />
              <input value={mysekaiSearchForm.maxIter} onChange={(event) => setMysekaiSearchForm({ ...mysekaiSearchForm, maxIter: event.target.value })} placeholder="最大迭代" />
              <input value={mysekaiSearchForm.maxIterNoImprove} onChange={(event) => setMysekaiSearchForm({ ...mysekaiSearchForm, maxIterNoImprove: event.target.value })} placeholder="无提升停止" />
              <input value={mysekaiSearchForm.popSize} onChange={(event) => setMysekaiSearchForm({ ...mysekaiSearchForm, popSize: event.target.value })} placeholder="种群大小" />
              <input value={mysekaiSearchForm.parentSize} onChange={(event) => setMysekaiSearchForm({ ...mysekaiSearchForm, parentSize: event.target.value })} placeholder="父代池" />
              <input value={mysekaiSearchForm.eliteSize} onChange={(event) => setMysekaiSearchForm({ ...mysekaiSearchForm, eliteSize: event.target.value })} placeholder="精英保留" />
              <input value={mysekaiSearchForm.crossoverRate} onChange={(event) => setMysekaiSearchForm({ ...mysekaiSearchForm, crossoverRate: event.target.value })} placeholder="交叉率" />
              <input value={mysekaiSearchForm.baseMutationRate} onChange={(event) => setMysekaiSearchForm({ ...mysekaiSearchForm, baseMutationRate: event.target.value })} placeholder="基础变异率" />
              <input value={mysekaiSearchForm.noImproveIterToMutationRate} onChange={(event) => setMysekaiSearchForm({ ...mysekaiSearchForm, noImproveIterToMutationRate: event.target.value })} placeholder="无提升变异增量" />
            </div>
          )}
          <label className="check-line"><input type="checkbox" checked={mysekaiSearchForm.uniqueCharacter} onChange={(event) => setMysekaiSearchForm({ ...mysekaiSearchForm, uniqueCharacter: event.target.checked })} /> 优先唯一角色</label>
          <textarea className="json-editor" value={mysekaiCalcInput} onChange={(event) => setMysekaiCalcInput(event.target.value)} />
          <div className="button-row">
            <button type="button" onClick={calculateMysekai}><Wand2 size={16} />手动输入计算</button>
            <button type="button" className="secondary" disabled={!binding} onClick={calculateBoundMysekai}>使用绑定 UID 数据</button>
          </div>
          {!binding && <p className="empty-state">{HARUKI_FEATURE_ENABLED ? "连接并同步 UID 后，可直接使用跨端 MySekai 数据计算。" : "玩家数据连接功能暂未开放；请手动填写计算参数。"}</p>}
        </article>
        <article className="panel wide mysekai-result-panel">
          <h3>计算结果</h3>
          {mysekaiCalcResult ? (
            <div className="mysekai-result-grid">
              <div className="result-metric"><span>推荐总综合力</span><strong>{formatNumber(mysekaiCalcResult.totalEstimatedPower)}</strong></div>
              <div className="result-metric"><span>MySekai 活动 PT</span><strong>{formatNumber(mysekaiPoint?.mysekaiEventPoint)}</strong><small>内部值 {formatNumber(mysekaiPoint?.mysekaiInternalPoint)}</small></div>
              <div className="result-metric"><span>搜索模式</span><strong>{mysekaiCalcResult.mysekaiDeckSearch?.searchMode ?? "-"}</strong><small>候选 {formatNumber(mysekaiCalcResult.mysekaiDeckSearch?.candidateCount)} / 池 {formatNumber(mysekaiCalcResult.mysekaiDeckSearch?.candidatePoolSize)}</small></div>
              <div className="result-metric"><span>GA 状态</span><strong>{mysekaiCalcResult.mysekaiDeckSearch?.stoppedReason ?? "-"}</strong><small>迭代 {formatNumber(mysekaiCalcResult.mysekaiDeckSearch?.iterations)} / 缓存 {formatNumber(mysekaiCalcResult.mysekaiDeckSearch?.fitnessCacheSize)}</small></div>
              <div className="result-metric"><span>GA Fitness</span><strong>{formatNumber(mysekaiCalcResult.mysekaiDeckSearch?.gaTrace?.bestFitness)}</strong><small>变异率 {formatNumber(mysekaiCalcResult.mysekaiDeckSearch?.gaTrace?.mutationRate)} / {formatNumber(mysekaiCalcResult.mysekaiDeckSearch?.gaTrace?.elapsedMs)} ms</small></div>
              <div className="result-tags"><span>真实字段</span>{(mysekaiCalcResult.officialFieldsUsed ?? []).map((item: string) => <code key={item}>{item}</code>)}</div>
              <div className="result-tags"><span>估算字段</span>{(mysekaiCalcResult.estimatedFieldsUsed ?? []).map((item: string) => <code key={item}>{item}</code>)}</div>
              <div className="result-tags"><span>缺失字段</span>{(mysekaiCalcResult.missingFields ?? []).map((item: string) => <code key={item}>{item}</code>)}</div>
              <section className="wide mysekai-deck-candidates">
                <h4>推荐卡组候选</h4>
                {deckCandidates.slice(0, 3).map((deck: any) => (
                  <div key={deck.rank}>
                    <strong>#{deck.rank} · {formatNumber(deck.totalPower)} 综合力 · {formatNumber(deck.mysekaiEventPoint?.mysekaiEventPoint)} PT</strong>
                    <small>{(deck.cards ?? []).map((entry: any) => entry.card?.title ?? entry.card?.id).filter(Boolean).join(" / ")}</small>
                  </div>
                ))}
                {!deckCandidates.length && <p className="empty-state">当前输入不足以生成完整 5 人候选卡组。</p>}
              </section>
              <div className="mysekai-card-table">
                {resultCards.map((entry: any) => (
                  <div key={entry.card.id}>
                    <strong>{entry.card.title ?? entry.card.id}</strong>
                    <span>{entry.card.character} / {entry.characterId}</span>
                    <small>基础 {formatNumber(entry.breakdown.basePower)} + 区域 {formatNumber(entry.breakdown.areaItemBonus)} + Rank {formatNumber(entry.breakdown.characterRankBonus)} + MySekai {formatNumber(entry.breakdown.mysekaiCanvasBonus + entry.breakdown.mysekaiGateBonus + entry.breakdown.mysekaiFixtureBonus)}</small>
                    <b>{formatNumber(entry.breakdown.totalPower)}</b>
                  </div>
                ))}
              </div>
              <section className="wide mysekai-recommendation-grid">
                <div>
                  <h4>Canvas 缺口</h4>
                  {(recommendations.canvas ?? []).slice(0, 5).map((item: any) => <code key={item.cardId}>{item.cardId}: {item.reason}</code>)}
                  {!(recommendations.canvas ?? []).length && <small>推荐卡未发现 canvas 缺口。</small>}
                </div>
                <div>
                  <h4>Gate 缺口</h4>
                  {(recommendations.gates ?? []).slice(0, 5).map((item: any) => <code key={item.unit}>{item.unit}: {item.reason}</code>)}
                  {!(recommendations.gates ?? []).length && <small>推荐卡未发现 gate 缺口。</small>}
                </div>
                <div>
                  <h4>Fixture / Limit</h4>
                  {(recommendations.fixtureLimitHits ?? []).slice(0, 5).map((item: any) => <code key={item.cardId}>{item.cardId}: limit {formatNumber(item.limit)} / 截断 {formatNumber(item.truncatedRate)}</code>)}
                  {(recommendations.fixtures ?? []).slice(0, 5).map((item: any) => <code key={item.characterId}>{item.characterId}: {item.reason}</code>)}
                  {!(recommendations.fixtureLimitHits ?? []).length && !(recommendations.fixtures ?? []).length && <small>推荐卡未发现 fixture 缺口或上限截断。</small>}
                </div>
              </section>
              <section className="wide mysekai-deck-candidates">
                <h4>替换候选</h4>
                {(mysekaiCalcResult.replacementCandidates ?? []).slice(0, 5).map((item: any) => (
                  <div key={item.replaceCardId}>
                    <strong>替换 {item.replaceTitle ?? item.replaceCardId}</strong>
                    <small>{(item.alternatives ?? []).map((alt: any) => `${alt.title ?? alt.cardId} (${formatNumber(alt.deltaPower)})`).join(" / ") || "暂无更优候选"}</small>
                  </div>
                ))}
              </section>
              <section className="wide mysekai-deck-candidates">
                <h4>补资产优先级</h4>
                {(mysekaiCalcResult.assetGapRanking ?? []).slice(0, 8).map((item: any) => (
                  <div key={`${item.type}:${item.key}`}>
                    <strong>{item.type} · {item.key} · 优先级 {formatNumber(item.priorityScore)}</strong>
                    <small>{item.reason}</small>
                  </div>
                ))}
                {!(mysekaiCalcResult.assetGapRanking ?? []).length && <p className="empty-state">推荐卡组暂无明显资产缺口。</p>}
              </section>
            </div>
          ) : <p className="empty-state">输入卡牌和 MySekai 资产后生成分项贡献。</p>}
        </article>
        {mysekaiDetail && (
          <div className="modal-backdrop content-detail-backdrop" role="presentation" onMouseDown={() => setMysekaiDetail(null)}>
            <article className="content-detail-modal mysekai-detail-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
              <div className="panel-heading"><div><h2>{mysekaiDetail.item?.name}</h2><p>{mysekaiDetail.item?.category ?? mysekaiDetail.item?.kind}</p></div><button type="button" className="icon-button" aria-label="关闭详情" onClick={() => setMysekaiDetail(null)}>×</button></div>
              <div className="mysekai-detail-layout">
                <ArtImage src={mysekaiDetail.item?.imageUrl} srcCandidates={asArray(mysekaiDetail.item?.imageCandidates)} label={mysekaiDetail.item?.name ?? "MySekai"} />
                <div><p>{mysekaiDetail.item?.description ?? "暂无说明"}</p><small>ID {mysekaiDetail.item?.id}</small></div>
              </div>
              {asArray(mysekaiDetail.materialCosts).length > 0 && <section><h3>制作素材</h3><div className="mysekai-cost-grid">{asArray(mysekaiDetail.materialCosts).map((cost: any, index: number) => <div key={`${cost.id ?? index}`}><ArtImage src={cost.material?.imageUrl} srcCandidates={asArray(cost.material?.imageCandidates)} label={cost.material?.name ?? "素材"} /><strong>{cost.material?.name ?? cost.mysekaiMaterialId}</strong><span>× {cost.quantity}</span></div>)}</div></section>}
            </article>
          </div>
        )}
      </section>
    );
  }
  function SourcePanel({ data }: { data: any }) {
    const source = sourceMetadata(data);
    const warnings = asArray(data?.warnings);
    const unavailableGroups = asArray(data?.unavailableGroups);
    return (
      <article className="source-panel-card">
        <div><strong>数据状态</strong><span>{source.fetchedAt ? `更新于 ${formatDate(source.fetchedAt)}` : "等待同步"}</span></div>
        {(source.unavailableReason || data?.unavailableReason) && <p className="warning-text">{source.unavailableReason ?? data.unavailableReason}</p>}
        {warnings.length > 0 && <p className="warning-text">{warnings.slice(0, 3).join(" / ")}</p>}
        {unavailableGroups.length > 0 && <small>缺失分组：{unavailableGroups.map((item: any) => item.group).join("、")}</small>}
      </article>
    );
  }

  function InformationPage({ data }: { data: any }) {
    const items = [...asArray(data?.items)].sort((left, right) => {
      const leftRaw = rawRecord(left.raw ?? left);
      const rightRaw = rawRecord(right.raw ?? right);
      const leftTime = Number(leftRaw.startAt ?? 0) || Date.parse(String(left.startAt ?? "")) || 0;
      const rightTime = Number(rightRaw.startAt ?? 0) || Date.parse(String(right.startAt ?? "")) || 0;
      return rightTime - leftTime || Number(rightRaw.id ?? 0) - Number(leftRaw.id ?? 0);
    });
    const informationPages = Math.max(1, Math.ceil(items.length / informationPageSize));
    const safeInformationPage = Math.min(informationPage, informationPages);
    const visibleItems = items.slice((safeInformationPage - 1) * informationPageSize, safeInformationPage * informationPageSize);
    return (
      <section className="content-workspace">
        <article className="panel wide">
          <div className="panel-heading"><div><h2>公告资讯</h2><p>按时间线浏览游戏公告。</p></div><button type="button" onClick={() => loadContent("information")}><RefreshCw size={16} />刷新</button></div>
          <div className="timeline-list">
            {visibleItems.map((item: any, index: number) => {
              const raw = rawRecord(item.raw ?? item);
              const title = contentName(item, `公告 #${index + 1}`);
              const bannerUrl = String(item.bannerUrl ?? raw.bannerUrl ?? "");
              const bannerCandidates = asArray(item.bannerImageCandidates ?? raw.bannerImageCandidates);
              return (
                <button type="button" className="timeline-card timeline-card-button" key={`${contentId(item, String(index))}:${index}`} onClick={() => openInformation(contentId(item, String(index)), title)}>
                  {bannerUrl && <ArtImage src={bannerUrl} srcCandidates={bannerCandidates.length ? bannerCandidates : [bannerUrl]} label={title} />}
                  <div>
                    <strong>{title}</strong>
                    <span>{String(raw.informationType ?? raw.informationTag ?? raw.browseType ?? "information")}</span>
                    <small>{contentDate(raw.startAt ?? item.startAt)} - {contentDate(raw.endAt ?? item.endAt)}</small>
                    <span className="text-link">查看详情</span>
                  </div>
                </button>
              );
            })}
          </div>
          {items.length > 0 && <Pagination page={safeInformationPage} totalPages={informationPages} pageSize={informationPageSize} onPageChange={setInformationPage} onPageSizeChange={(size) => { setInformationPageSize(size); setInformationPage(1); }} />}
          {items.length === 0 && <p className="empty-state">当前区服暂时没有可展示的公告。</p>}
        </article>
        {selectedInformation && (
          <div className="modal-backdrop content-detail-backdrop" role="presentation" onMouseDown={closeInformation}>
            <article className="content-detail-modal announcement-detail-modal" role="dialog" aria-modal="true" aria-label={selectedInformation.title} onMouseDown={(event) => event.stopPropagation()}>
              <div className="panel-heading">
                <div><h2>{selectedInformation.title}</h2><p>{contentDate(selectedInformation.startAt)}</p></div>
                <button type="button" className="icon-button" aria-label="关闭公告详情" onClick={closeInformation}>×</button>
              </div>
              {selectedInformation.embedStatus === "ready" ? (
                <iframe
                  className="announcement-frame"
                  src={apiResourceUrl(selectedInformation.embeddedDetailUrl ?? selectedInformation.detailUrl)}
                  title={selectedInformation.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  sandbox="allow-same-origin allow-popups"
                />
              ) : selectedInformation.embedStatus === "loading" ? (
                <p className="empty-state">正在加载公告详情...</p>
              ) : selectedInformation.embedStatus === "error" ? (
                <p className="warning-text">{selectedInformation.detailError}</p>
              ) : selectedInformation.embedStatus === "missing-resource" ? (
                <p className="empty-state">该公告正文暂不可用，请尝试外部打开。</p>
              ) : <p className="empty-state">该公告需要使用外部应用或新窗口打开。</p>}
              {selectedInformation.detailUrl && <a className="text-link" href={selectedInformation.detailUrl} target="_blank" rel="noreferrer">在新窗口打开</a>}
            </article>
          </div>
        )}
      </section>
    );
  }

  function ExchangePage({ data }: { data: any }) {
    const normalizedSearch = exchangeSearch.trim().toLowerCase();
    const filteredItems = asArray(data?.items).filter((item: any) => {
      if (exchangeStatus && item.status !== exchangeStatus) return false;
      if (exchangeSummaryId && String(item.summaryId) !== exchangeSummaryId) return false;
      if (!normalizedSearch) return true;
      return [item.id, item.name, item.summaryName, item.category, ...asArray(item.rewards).map((reward: any) => reward.name), ...asArray(item.costs).map((cost: any) => cost.name)]
        .some((value) => String(value ?? "").toLowerCase().includes(normalizedSearch));
    });
    const totalPages = Math.max(1, Math.ceil(filteredItems.length / exchangePageSize));
    const safePage = Math.min(exchangePage, totalPages);
    const visibleItems = filteredItems.slice((safePage - 1) * exchangePageSize, safePage * exchangePageSize);
    const statusLabels: Record<string, string> = { active: "进行中", permanent: "常驻", upcoming: "即将开放", ended: "已结束" };
    return (
      <section className="content-workspace">
        <article className="panel wide">
          <div className="panel-heading"><div><h2>兑换所</h2><p>按分类查看商品、素材和兑换要求。</p></div><button type="button" onClick={() => loadContent("exchanges")}><RefreshCw size={16} />刷新</button></div>
          <div className="exchange-summary-row">
            <div><span>兑换所</span><strong>{formatNumber(asArray(data?.summaries).length)}</strong></div>
            <div><span>兑换项</span><strong>{formatNumber(data?.total ?? 0)}</strong></div>
            <div><span>当前结果</span><strong>{formatNumber(filteredItems.length)}</strong></div>
          </div>
          <div className="exchange-toolbar">
            <label><Search size={16} /><input value={exchangeSearch} onChange={(event) => { setExchangeSearch(event.target.value); setExchangePage(1); }} placeholder="搜索商品、素材或 ID" /></label>
            <select value={exchangeStatus} onChange={(event) => { setExchangeStatus(event.target.value); setExchangePage(1); }}>
              <option value="">全部状态</option>
              {asArray(data?.facets?.statuses).map((status: string) => <option value={status} key={status}>{statusLabels[status] ?? status}</option>)}
            </select>
            <select value={exchangeSummaryId} onChange={(event) => { setExchangeSummaryId(event.target.value); setExchangePage(1); }}>
              <option value="">全部兑换所</option>
              {asArray(data?.summaries).map((summary: any) => <option value={String(summary.id)} key={summary.id}>{summary.name}（{summary.count}）</option>)}
            </select>
          </div>
          <div className="exchange-grid">
            {visibleItems.map((item: any) => (
              <button type="button" className="exchange-card" key={`${region}:exchange:${item.id}`} onClick={() => openExchange(String(item.id), item.name)}>
                <div className="exchange-card-head">
                  <ExchangeResourceIcon resource={asArray(item.rewards)[0] ?? item} />
                  <div><span>{statusLabels[item.status] ?? item.status}</span><strong>{item.name}</strong><small>{item.summaryName} · ID {item.id}</small></div>
                </div>
                <div className="exchange-resource-line"><span>获得</span>{asArray(item.rewards).slice(0, 3).map((reward: any) => <div key={`${reward.resourceType}:${reward.resourceId ?? reward.seq}`}><ExchangeResourceIcon resource={reward} /><small>{reward.name} ×{reward.quantity}</small></div>)}</div>
                <div className="exchange-resource-line"><span>需要</span>{asArray(item.costs).slice(0, 3).map((cost: any) => <div key={`${cost.costGroupId}:${cost.resourceType}:${cost.resourceId}`}><ExchangeResourceIcon resource={cost} /><small>{cost.name} ×{cost.quantity}</small></div>)}</div>
              </button>
            ))}
          </div>
          {filteredItems.length > 0 && <Pagination page={safePage} totalPages={totalPages} pageSize={exchangePageSize} onPageChange={setExchangePage} onPageSizeChange={(size) => { setExchangePageSize(size); setExchangePage(1); }} />}
          {!filteredItems.length && <p className="empty-state">当前筛选没有可展示的兑换项。</p>}
        </article>
        {exchangeDetail && (
          <div className="modal-backdrop content-detail-backdrop" role="presentation" onMouseDown={closeExchange}>
            <article className="content-detail-modal exchange-detail-modal" role="dialog" aria-modal="true" aria-label={exchangeDetail.item?.name ?? "兑换项详情"} onMouseDown={(event) => event.stopPropagation()}>
              <div className="panel-heading"><div><h2>{exchangeDetail.item?.name}</h2><p>{exchangeDetail.item?.summaryName ?? `ID ${exchangeDetail.item?.id}`}</p></div><button type="button" className="icon-button" aria-label="关闭兑换项详情" onClick={closeExchange}>×</button></div>
              {exchangeDetail.loading ? <p className="empty-state">正在加载兑换项详情...</p> : exchangeDetail.error ? <p className="warning-text">{exchangeDetail.error}</p> : (
                <>
                  <div className="exchange-detail-meta"><span>{statusLabels[exchangeDetail.item?.status] ?? exchangeDetail.item?.status}</span><span>{exchangeDetail.item?.refreshCycle === "monthly" ? "每月刷新" : "不定期刷新"}</span>{exchangeDetail.item?.exchangeLimit != null && <span>限购 {exchangeDetail.item.exchangeLimit} 次</span>}</div>
                  <section><h3>兑换奖励</h3><div className="exchange-detail-resources">{asArray(exchangeDetail.item?.rewards).map((reward: any) => <div key={`${reward.seq}:${reward.resourceType}`}><ExchangeResourceIcon resource={reward} /><div><strong>{reward.name}</strong><span>× {reward.quantity}</span></div></div>)}</div></section>
                  <section><h3>兑换成本</h3><div className="exchange-detail-resources">{asArray(exchangeDetail.item?.costs).map((cost: any) => <div key={`${cost.costGroupId}:${cost.seq}:${cost.resourceType}`}><ExchangeResourceIcon resource={cost} /><div><strong>{cost.name}</strong><span>× {cost.quantity}</span></div></div>)}</div></section>
                </>
              )}
            </article>
          </div>
        )}
      </section>
    );
  }

  function MissionPage({ data }: { data: any }) {
    const groups = contentGroups(data);
    const [missionTab, setMissionTab] = useState(groups[0]?.key ?? "normal");
    const [missionSearch, setMissionSearch] = useState("");
    const [missionType, setMissionType] = useState("all");
    const [missionCharacter, setMissionCharacter] = useState("all");
    const [missionCategory, setMissionCategory] = useState("all");
    const [missionSort, setMissionSort] = useState("seq");
    const [missionPage, setMissionPage] = useState(1);
    const [missionPageSize, setMissionPageSize] = useState(24);
    const [expandedMissionId, setExpandedMissionId] = useState<string | null>(null);
    const selected = groups.find((group) => group.key === missionTab) ?? groups[0];
    const allItems = selected ? groupItems(data, selected.key) : [];
    const types = Array.from(new Set(allItems.map((item: any) => String(item.missionType ?? "unknown")))).sort();
    const characters = Array.from(new Map(allItems.filter((item: any) => item.character).map((item: any) => [String(item.character.id), item.character])).values()) as any[];
    const categories = Array.from(new Set(allItems.map((item: any) => item.category).filter(Boolean).map(String))).sort();
    const normalizedSearch = missionSearch.trim().toLowerCase();
    const filteredItems = allItems.filter((item: any) => {
      if (missionType !== "all" && String(item.missionType) !== missionType) return false;
      if (missionCharacter !== "all" && String(item.character?.id) !== missionCharacter) return false;
      if (missionCategory !== "all" && String(item.category) !== missionCategory) return false;
      if (!normalizedSearch) return true;
      return [item.id, item.sentence, item.missionType, item.character?.name].filter(Boolean).join(" ").toLowerCase().includes(normalizedSearch);
    }).sort((left: any, right: any) => {
      if (missionSort === "id") return Number(left.id) - Number(right.id);
      if (missionSort === "requirement") return Number(left.requirement ?? 0) - Number(right.requirement ?? 0);
      if (missionSort === "stages") return asArray(right.stages).length - asArray(left.stages).length;
      return Number(left.seq ?? left.id ?? 0) - Number(right.seq ?? right.id ?? 0);
    });
    const totalPages = Math.max(1, Math.ceil(filteredItems.length / missionPageSize));
    const items = filteredItems.slice((missionPage - 1) * missionPageSize, missionPage * missionPageSize);
    useEffect(() => {
      if (groups.length && !groups.some((group) => group.key === missionTab)) setMissionTab(groups[0].key);
    }, [groups.map((group) => group.key).join("|")]);
    useEffect(() => {
      setMissionPage(1);
      setExpandedMissionId(null);
    }, [missionTab, missionSearch, missionType, missionCharacter, missionCategory, missionSort]);
    useEffect(() => {
      if (missionPage > totalPages) setMissionPage(totalPages);
    }, [missionPage, totalPages]);
    return (
      <section className="content-workspace">
        <article className="panel wide">
          <div className="panel-heading"><div><h2>任务</h2><p>查看普通、新手、角色和称号任务的条件、阶段与奖励。</p></div><button type="button" onClick={() => loadContent("missions")}><RefreshCw size={16} />刷新</button></div>
          {data?.capabilityStatus === "partial" && <p className="status-note">部分任务资料缺失，其他分组仍可正常浏览。</p>}
          <div className="mission-tabs">
            {groups.map((group) => <button type="button" className={group.key === selected?.key ? "active" : ""} key={group.key} onClick={() => setMissionTab(group.key)}>{group.label ?? group.key}<span>{formatNumber(group.count ?? 0)}</span></button>)}
          </div>
          <div className="mission-toolbar">
            <SearchBox value={missionSearch} onChange={setMissionSearch} placeholder="搜索任务、角色或 ID" />
            <select value={missionType} onChange={(event) => setMissionType(event.target.value)} aria-label="任务类型"><option value="all">全部类型</option>{types.map((type) => <option key={type} value={type}>{missionTypeLabel(type)}</option>)}</select>
            {characters.length > 0 && <select value={missionCharacter} onChange={(event) => setMissionCharacter(event.target.value)} aria-label="角色"><option value="all">全部角色</option>{characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select>}
            {categories.length > 0 && <select value={missionCategory} onChange={(event) => setMissionCategory(event.target.value)} aria-label="新手任务分类"><option value="all">全部分类</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select>}
            <select value={missionSort} onChange={(event) => setMissionSort(event.target.value)} aria-label="任务排序"><option value="seq">任务顺序</option><option value="id">任务 ID</option><option value="requirement">要求值</option><option value="stages">阶段数量</option></select>
          </div>
          <p className="catalog-result-count">共 {formatNumber(filteredItems.length)} 条任务</p>
          <div className="mission-card-grid">
            {items.map((item: any, index: number) => {
              const stages = asArray(item.stages);
              const expanded = expandedMissionId === String(item.id);
              return (
                <article className="mission-card" key={`${selected?.key}:${contentId(item, String(index))}`}>
                  <div className="mission-card-heading"><span className="mission-kind-chip">{missionTypeLabel(item.missionType)}</span><small>ID {item.id}</small></div>
                  {item.character && <strong className="mission-character-name">{item.character.name}</strong>}
                  <p>{item.sentence || "任务文本缺失"}</p>
                  <div className="mission-card-meta">
                    {item.requirement != null && <span>初始目标 {formatNumber(item.requirement)}</span>}
                    {item.maxRequirement != null && <span>最高目标 {formatNumber(item.maxRequirement)}</span>}
                    {stages.length > 0 && <span>{formatNumber(stages.length)} 个阶段</span>}
                  </div>
                  {asArray(item.rewards).length > 0 && <div className="mission-rewards">{asArray(item.rewards).map((reward: any, rewardIndex: number) => <div key={`${reward.resourceType}:${reward.resourceId}:${rewardIndex}`}><span className={`mission-reward-art resource-${String(reward.resourceType ?? "unknown").replace(/[^a-z0-9_-]/gi, "-")}`}><ExchangeResourceIcon resource={reward} /></span><span>{reward.name}<small>× {formatNumber(reward.quantity)}</small></span></div>)}</div>}
                  {stages.length > 0 && <button type="button" className="mission-stage-toggle" onClick={() => setExpandedMissionId(expanded ? null : String(item.id))}>{expanded ? "收起阶段" : "查看阶段"}</button>}
                  {expanded && <div className="mission-stage-list">{stages.map((stage: any) => <div key={stage.seq}><span>阶段 {stage.seq}</span><strong>{formatNumber(stage.requirement)}</strong><small>Rank EXP +{formatNumber(stage.exp)}{stage.quantity ? ` · 数量 ${formatNumber(stage.quantity)}` : ""}</small></div>)}</div>}
                  {item.lookupStatus === "missing-data" && <small className="warning-text">部分关联资料缺失</small>}
                </article>
              );
            })}
          </div>
          {items.length === 0 && <p className="empty-state">当前任务分组没有可展示记录。</p>}
          {filteredItems.length > missionPageSize && <Pagination page={missionPage} totalPages={totalPages} pageSize={missionPageSize} onPageChange={setMissionPage} onPageSizeChange={setMissionPageSize} />}
        </article>
      </section>
    );
  }

  function VirtualLivePage({ data }: { data: any }) {
    const lives = asArray(data?.items).map(rawRecord);
    const normalizedSearch = virtualLiveSearch.trim().toLowerCase();
    const selectedLiveId = String(virtualLiveDetail?.live?.id ?? virtualLivePlayback?.virtualLiveId ?? "");
    const filteredLives = lives
      .filter((live, index) => {
        if (!normalizedSearch) return true;
        const haystack = [
          contentId(live, String(index)),
          contentName(live, `Virtual Live #${index + 1}`),
          live.virtualLiveType,
          live.assetbundleName
        ].join(" ").toLowerCase();
        return haystack.includes(normalizedSearch);
      })
      .sort((a, b) => {
        const aTime = Date.parse(String(a.startAt ?? a.startTime ?? a.startDate ?? 0)) || Number(a.startAt ?? a.startTime ?? 0) || 0;
        const bTime = Date.parse(String(b.startAt ?? b.startTime ?? b.startDate ?? 0)) || Number(b.startAt ?? b.startTime ?? 0) || 0;
        return virtualLiveSort === "desc" ? bTime - aTime : aTime - bTime;
      });
    const displayedLives = filteredLives.slice(0, virtualLiveDisplayCount);
    const activeQueueItem = virtualLiveQueueIndex >= 0 ? virtualLiveQueue[virtualLiveQueueIndex] : null;
    const playbackWarnings = [
      ...asArray(virtualLivePlayback?.warnings),
      ...virtualLiveQueueWarnings
    ];
    function renderStep(step: any, index: number) {
      const events = asArray(step.events);
      const talkCount = events.filter((event: any) => event.type === "talk").length;
      return (
        <article className="virtual-setlist-card" key={`${step.index ?? index}:${step.type}:${step.assetbundleName ?? index}`}>
          <div className="virtual-setlist-head">
            <div>
              <span>#{index + 1} · {String(step.type ?? "unknown")}</span>
              <strong>{step.music?.title ?? step.musicVocal?.assetbundleName ?? step.assetbundleName ?? "真实资源步骤"}</strong>
            </div>
            <small>{events.length ? `${events.length} 事件 / ${talkCount} 句台词` : step.unavailableReason ?? "资源候选"}</small>
          </div>
          {step.type === "music" && (
            <div className="virtual-audio-card">
              <div>
                <strong>{step.music?.title ?? "歌曲音频"}</strong>
                <span>Vocal: {step.musicVocal?.assetbundleName ?? step.raw?.musicVocalId ?? "-"}</span>
              </div>
              {step.proxiedAudioUrl ? <audio controls src={step.proxiedAudioUrl} /> : <p className="warning-text">{step.unavailableReason ?? "未找到歌曲音频候选。"}</p>}
            </div>
          )}
          {(step.type === "mc" || step.type === "mc_timeline") && (
            <div className="virtual-mc-timeline">
              {events.slice(0, 160).map((event: any, eventIndex: number) => (
                <div className={`virtual-mc-event ${event.type}`} key={`${event.id ?? eventIndex}:${event.time}:${event.type}`}>
                  <time>{Number(event.time ?? 0).toFixed(2)}s</time>
                  <div>
                    <strong>{event.type === "talk" ? "Talk" : event.type === "spawn" ? "Spawn" : "Unspawn"} · 角色 {String(event.character3dId ?? "-")}</strong>
                    {event.serif && <p>{String(event.serif)}</p>}
                    <small>动作 {String(event.motionKey ?? "-")} · 表情 {String(event.facialKey ?? "-")} · 服装 {String(event.bodyCostume3dId ?? "-")}</small>
                    {event.voice?.proxiedUrl && <audio controls src={event.voice.proxiedUrl} />}
                  </div>
                </div>
              ))}
              {!events.length && <p className="empty-state">{step.unavailableReason ?? "该 MC 步骤暂未解析出可播放事件。"}</p>}
            </div>
          )}
          {asArray(step.warnings).map((warning: string) => <p className="warning-text" key={warning}>{warning}</p>)}
        </article>
      );
    }
    return (
      <section className="virtual-live-workspace">
        <article className="panel virtual-live-list-panel">
          <div className="panel-heading">
            <div>
              <h2>虚拟 Live</h2>
              <p>参考 Sekai Viewer 的 setlist 工作流，展开 MC、语音和歌曲音频。</p>
            </div>
            <button type="button" onClick={() => loadContent("virtualLives")}><RefreshCw size={16} />刷新</button>
          </div>
          <div className="virtual-live-tools">
            <label>
              <Search size={16} />
              <input value={virtualLiveSearch} onChange={(event) => setVirtualLiveSearch(event.target.value)} placeholder="搜索 Live 名称、ID、资源名" />
            </label>
            <button type="button" className="secondary" onClick={() => setVirtualLiveSort((current) => current === "desc" ? "asc" : "desc")}>
              {virtualLiveSort === "desc" ? "时间新到旧" : "时间旧到新"}
            </button>
          </div>
          <div className="virtual-live-list">
            {displayedLives.map((live, index) => {
              const id = contentId(live, String(index));
              return (
                <button type="button" className={id === selectedLiveId ? "active" : ""} key={`${id}:${index}`} onClick={() => openVirtualLive(id)}>
                  <strong>{contentName(live, `Virtual Live #${index + 1}`)}</strong>
                  <span>{contentDate(live.startAt ?? live.startTime ?? live.startDate)} - {contentDate(live.endAt ?? live.endTime ?? live.endDate)}</span>
                  <small>ID {id} · {String(live.virtualLiveType ?? live.assetbundleName ?? "virtual live")}</small>
                </button>
              );
            })}
          </div>
          {!filteredLives.length && <p className="empty-state">没有匹配的虚拟 Live。</p>}
          {displayedLives.length < filteredLives.length && <button type="button" className="secondary" onClick={() => setVirtualLiveDisplayCount((current) => current + 60)}>加载更多（{displayedLives.length} / {filteredLives.length}）</button>}
        </article>
        <article className="panel virtual-playback-panel">
          {virtualLiveDetail && !virtualLivePlayback && (
            <>
              <div className="virtual-live-hero">
                {asArray(virtualLiveDetail.live?.imageCandidates).length > 0 && <ArtImage src={virtualLiveDetail.live.imageUrl} srcCandidates={virtualLiveDetail.live.imageCandidates} label={virtualLiveDetail.live.name} />}
                <div><span>{virtualLiveDetail.live?.virtualLiveType ?? "virtual live"}</span><h3>{virtualLiveDetail.live?.name}</h3><p>{contentDate(virtualLiveDetail.live?.startAt)} - {contentDate(virtualLiveDetail.live?.endAt)}</p></div>
              </div>
              <div className="story-summary-row">
                <div><span>日程</span><strong>{formatNumber(asArray(virtualLiveDetail.schedules).length)}</strong></div>
                <div><span>Setlist</span><strong>{formatNumber(asArray(virtualLiveDetail.setlists).length)}</strong></div>
                <div><span>奖励</span><strong>{formatNumber(asArray(virtualLiveDetail.rewards).length)}</strong></div>
              </div>
              <div className="virtual-live-meta-grid">
                <section><h4>日程</h4>{asArray(virtualLiveDetail.schedules).slice(0, 12).map((item: any, index: number) => <p key={index}>{contentDate(item.startAt ?? item.startTime)} - {contentDate(item.endAt ?? item.endTime)}</p>)}</section>
                <section><h4>奖励</h4>{asArray(virtualLiveDetail.rewards).slice(0, 12).map((item: any, index: number) => <p key={index}>{String(item.resourceBoxId ?? item.rewardId ?? `奖励 ${index + 1}`)}</p>)}</section>
              </div>
              <div className="button-row"><button type="button" onClick={() => loadVirtualLivePlayback(String(virtualLiveDetail.live.id))}><Play size={16} />加载音频与 MC 回放</button></div>
              <p className="empty-state">增强播放资源按需加载，不阻塞资料详情。</p>
            </>
          )}
          {virtualLivePlayback ? (
            <>
              <div className="virtual-live-hero">
                {virtualLivePlayback.assets?.bannerProxiedUrl && <img src={virtualLivePlayback.assets.bannerProxiedUrl} alt="" />}
                {virtualLivePlayback.assets?.logoProxiedUrl && <img className="virtual-live-logo" src={virtualLivePlayback.assets.logoProxiedUrl} alt="" />}
                <div>
                  <span>{virtualLivePlayback.live?.virtualLiveType ?? "virtual live"}</span>
                  <h3>{virtualLivePlayback.live?.name ?? virtualLivePlayback.live?.title ?? "虚拟 Live 播放工作流"}</h3>
                  <p>{contentDate(virtualLivePlayback.live?.startAt ?? virtualLivePlayback.live?.startTime)} - {contentDate(virtualLivePlayback.live?.endAt ?? virtualLivePlayback.live?.endTime)}</p>
                </div>
              </div>
              <div className="story-summary-row">
                <div><span>Setlist</span><strong>{formatNumber(virtualLivePlayback.playbackReadiness?.setlistCount ?? 0)}</strong></div>
                <div><span>MC 事件</span><strong>{formatNumber(virtualLivePlayback.playbackReadiness?.mcEventCount ?? 0)}</strong></div>
                <div><span>可播音频</span><strong>{formatNumber(virtualLivePlayback.playbackReadiness?.playableAudioCount ?? 0)}</strong></div>
              </div>
              <div className="virtual-continuous-player">
                <div>
                  <strong>连续播放</strong>
                  <span>{activeQueueItem ? activeQueueItem.title : "按 setlist 顺序播放歌曲音频和 MC 语音；缺失资源会跳过。"}</span>
                </div>
                <div className="button-row">
                  <button type="button" onClick={startVirtualLiveQueue}><Play size={16} />开始</button>
                  <button type="button" className="secondary" disabled={!virtualLiveQueue.length} onClick={nextVirtualLiveQueueItem}>下一段</button>
                  <button type="button" className="secondary" onClick={stopVirtualLiveQueue}>停止</button>
                </div>
                {activeQueueItem && <audio controls autoPlay src={activeQueueItem.url} onEnded={nextVirtualLiveQueueItem} />}
              </div>
              <div className="virtual-live-meta-grid">
                <section>
                  <h4>日程</h4>
                  {asArray(virtualLivePlayback.schedules).slice(0, 8).map((item: any, index: number) => <p key={index}>{contentDate(item.startAt ?? item.startTime)} - {contentDate(item.endAt ?? item.endTime)}</p>)}
                  {!asArray(virtualLivePlayback.schedules).length && <p className="empty-state">没有独立日程记录。</p>}
                </section>
                <section>
                  <h4>奖励</h4>
                  {asArray(virtualLivePlayback.rewards).slice(0, 8).map((item: any, index: number) => <p key={index}>{String(item.resourceBoxId ?? item.rewardId ?? item.itemId ?? `奖励 ${index + 1}`)} × {String(item.quantity ?? item.amount ?? "-")}</p>)}
                  {!asArray(virtualLivePlayback.rewards).length && <p className="empty-state">没有独立奖励记录。</p>}
                </section>
              </div>
              <div className="virtual-setlist-list">
                {asArray(virtualLivePlayback.steps).map(renderStep)}
              </div>
              {virtualLivePlayback.unavailableReason && <p className="warning-text">{virtualLivePlayback.unavailableReason}</p>}
              {playbackWarnings.length > 0 && (
                <details className="virtual-warning-box" open>
                  <summary>资源诊断与跳过记录</summary>
                  {playbackWarnings.map((warning: string, index: number) => <p key={`${warning}:${index}`}>{warning}</p>)}
                </details>
              )}
            </>
          ) : !virtualLiveDetail ? (
            <div className="empty-state">从左侧选择一个虚拟 Live，加载真实 setlist、MC timeline、语音和歌曲音频。</div>
          ) : null}
        </article>
      </section>
    );
  }

  function ContentPage({ section }: { section: "information" | "exchanges" | "missions" | "virtualLives" | "live2d" | "mysekai" }) {
    if (section === "live2d") return null;
    if (section === "mysekai") return <MysekaiPage />;
    const data = contentData[section];
    if (section === "information") return <InformationPage data={data} />;
    if (section === "exchanges") return <ExchangePage data={data} />;
    if (section === "missions") return <MissionPage data={data} />;
    if (section === "virtualLives") return <VirtualLivePage data={data} />;
    const items = flattenObjectItems(data);
    const labels: Record<string, string> = {
      information: "公告资讯",
      exchanges: "兑换所",
      missions: "任务",
      virtualLives: "虚拟 Live",
      live2d: "Live2D 模型索引",
      mysekai: "MySekai Context"
    };
    const descriptions: Record<string, string> = {
      information: "浏览游戏公告资讯。",
      exchanges: "查看兑换所商品与兑换要求。",
      missions: "查看任务分类和完成条件。",
      virtualLives: "查看虚拟 Live 日程、奖励与曲目。",
      live2d: "预览角色模型、动作和表情。",
      mysekai: "查看 MySekai 内容与计算上下文。"
    };
    return (
      <section className="panel wide content-page">
        <div className="panel-heading"><div><h2>{labels[section]}</h2><p>{descriptions[section]}</p></div><button type="button" onClick={() => loadContent(section)}><RefreshCw size={16} />刷新</button></div>
        {data?.unavailableReason && <p className="warning-text">{data.unavailableReason}</p>}
        <div className="catalog-grid cards">
          {items.map((item) => {
            const candidates = imageCandidates(item.assets);
            return <article className="catalog-card card-card" key={`${section}:${item.id}:${item.category ?? ""}`}><ArtImage src={candidates[0]} srcCandidates={candidates} label={item.name} /><strong>{item.name}</strong><span>{item.category ?? item.type}</span><small>ID {item.id}</small></article>;
          })}
        </div>
        {items.length === 0 && <p className="empty-state">暂无可展示数据；若上游不可用，请查看返回的 unavailableReason。</p>}
      </section>
    );
  }

  function StoriesPage() {
    const data = contentData.stories;
    const groups = contentGroups(data);
    const firstGroup = groups[0]?.key ?? "eventStories";
    const [storyGroup, setStoryGroup] = useState(firstGroup);
    const selected = groups.find((group) => group.key === storyGroup) ?? groups[0];
    const storyItems = asArray(selected?.previewItems).slice(0, 80);
    const resourceCandidates = asArray(storyDetail?.resourceCandidates ?? storyDetail?.scenarioAssetCandidates);
    const chapters = asArray(storyDetail?.chapters);
    useEffect(() => {
      if (groups.length && !groups.some((group) => group.key === storyGroup)) setStoryGroup(groups[0].key);
    }, [groups.map((group) => group.key).join("|")]);
    return (
      <section className="story-workspace">
        <article className="panel story-selector-panel">
          <div className="panel-heading"><div><h2>故事列表</h2><p>按故事分类选择并播放章节。</p></div><button type="button" onClick={() => loadContent("stories")}><RefreshCw size={16} />刷新</button></div>
          <div className="mission-tabs">
            {groups.map((group) => <button type="button" className={group.key === selected?.key ? "active" : ""} key={group.key} onClick={() => setStoryGroup(group.key)}>{group.label ?? group.key}<span>{formatNumber(group.count ?? 0)}</span></button>)}
          </div>
          <div className="content-detail-list story-list">
            {storyItems.map((item: any, index: number) => (
              <button type="button" key={`${selected?.key}:${item.id}:${index}`} onClick={() => openStoryFromList(item.storyType ?? selected?.key ?? storyGroup, String(item.id))}>
                <strong>{item.name}</strong>
                <span>{item.storyType ?? selected?.key}</span>
                <small>ID {item.id}</small>
              </button>
            ))}
          </div>
          {storyItems.length === 0 && <p className="empty-state">故事上下文暂不可用，仍可使用手动读取。</p>}
          <details className="advanced-story-form">
            <summary>手动读取 story full</summary>
            <div className="two-col"><input value={storyForm.storyType} onChange={(event) => setStoryForm({ ...storyForm, storyType: event.target.value })} placeholder="storyType，例如 eventStories" /><input value={storyForm.storyId} onChange={(event) => setStoryForm({ ...storyForm, storyId: event.target.value })} placeholder="storyId" /></div>
            <button type="button" onClick={loadStory}><BookOpen size={16} />读取故事</button>
          </details>
        </article>
        <article className="panel story-detail-panel">
          <h2>章节详情</h2>
          {storyDetail ? (
            <div className="story-detail-grid">
              {storyDetail.unavailableReason && <p className="warning-text">{storyDetail.unavailableReason}</p>}
              <div className="story-summary-row">
                <div><span>匹配记录</span><strong>{formatNumber(storyDetail.relationHints?.matchCount ?? asArray(storyDetail.matches).length)}</strong></div>
                <div><span>章节/记录</span><strong>{formatNumber(chapters.length)}</strong></div>
                <div><span>可用资源</span><strong>{formatNumber(resourceCandidates.length)}</strong></div>
              </div>
              <div className="button-row">
                <button type="button" onClick={() => loadStoryPlayback()}><Play size={16} />进入播放模式</button>
              </div>
              {storyPlayback && <StoryPlaybackPlayer playback={storyPlayback} />}
              <div className="episode-list">
                {chapters.slice(0, 40).map((chapter: any, index: number) => (
                  <div key={`${chapter.id ?? index}:${index}`}>
                    <span>{chapter.storyType ?? storyForm.storyType}</span>
                    <strong>{chapter.name ?? chapter.title ?? `章节 ${index + 1}`}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="empty-state">从左侧选择故事，或手动输入故事类型和 ID。</p>}
        </article>
      </section>
    );
  }

  function SharePage() {
    return <section className="panel wide share-page"><div className="panel-heading"><div><h2>分享卡</h2><p>生成适合社交平台展示的 1200 × 630 图片。</p></div></div><div className="inline-form"><select value={shareType} onChange={(event) => setShareType(event.target.value)}><option value="profile">玩家档案</option><option value="score">成绩</option><option value="event">活动</option><option value="card">卡牌</option><option value="song">歌曲</option></select><input value={shareId} onChange={(event) => setShareId(event.target.value)} placeholder="分享对象 ID" /><button type="button" onClick={loadShareCard} disabled={!shareId.trim()}><Share2 size={16} />生成</button></div>{shareCard && <div className="share-card-result"><img src={apiResourceUrl(shareCard.imageUrl)} alt={shareCard.title} /><div><strong>{shareCard.title}</strong><span>{shareCard.summary}</span><a className="button secondary" href={apiResourceUrl(shareCard.imageUrl)} download={`pjsktools-${shareCard.type}-${shareCard.id}.png`}>保存 PNG</a></div></div>}</section>;
  }

  function AboutPage() {
    return <section className="panel wide about-page">
      <div className="panel-heading"><div><h2>关于 Project Sekai 工具台</h2><p>为五个区服提供图鉴、活动数据、玩家资产分析和计算工具。</p></div></div>
      <div className="about-source-grid">
        <article><strong>Sekai.best</strong><p>提供游戏资产、公开资料和部分基础数据。</p></article>
        <article><strong>Moesekai Metadata</strong><p>提供公式计算所需的参考数据、歌曲 Meta 与聚合目录。</p></article>
        <article><strong>Haruki</strong><p>提供公开玩家数据、排名详情和数据补充。</p></article>
        <article><strong>Uni / Haruki</strong><p>提供同区游戏资产镜像与备用加载。</p></article>
        <article><strong>rks-n</strong><p>提供实时排名、档线、时序和周回统计。</p></article>
      </div>
      <div className="notice"><strong>区服与缓存原则</strong><span>JP、EN、TW、KR、CN 数据与资产独立加载，不跨区借用。可用缓存会先展示，再在后台刷新。</span></div>
    </section>;
  }
  function LegacySections() {
    if (activeSection === "home") return <HomePage />;
    if (activeSection === "currentEvent") return <RankingPage />;
    if (activeSection === "forecast") return <ForecastPage />;
    if (activeSection === "profile") return <ProfilePage />;
    if (activeSection === "historyEvents") return CatalogPage({ type: "events" });
    if (activeSection === "songs" || activeSection === "cards" || activeSection in collectionMeta) return CatalogPage({ type: activeSection as any });
    if (activeSection === "tools") return <ToolsPage />;
    if (activeSection === "deckCompare") return <DeckComparePage />;
    if (activeSection === "share") return <SharePage />;
    if (activeSection === "information") return InformationPage({ data: contentData.information });
    if (activeSection === "mysekai") return MysekaiPage();
    if (activeSection === "exchanges") return ExchangePage({ data: contentData.exchanges });
    if (activeSection === "missions") {
      return <StatefulRenderBoundary key="missions" render={() => MissionPage({ data: contentData.missions })} />;
    }
    if (["virtualLives", "live2d"].includes(activeSection)) return <ContentPage section={activeSection as any} />;
    if (activeSection === "stories") return null;
    if (activeSection === "about") return <AboutPage />;
    return <HomePage />;
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <Link className="brand" to="/">Project Sekai 工具台</Link>
        <nav>
          {navGroups.map((group) => (
            <div className="nav-group" key={group.title}>
              <span className="nav-group-title">{group.title}</span>
              {group.items.map((item) => {
                const Icon = item.icon;
                return <NavLink key={item.id} to={item.id === "home" ? "/" : `/section/${item.id}`} className={({ isActive }) => `nav-item ${isActive || activeSection === item.id ? "active" : ""}`}><Icon size={18} />{item.label}</NavLink>;
              })}
            </div>
          ))}
          <div className="nav-group">
            <span className="nav-group-title">账号</span>
            {auth.isAuthenticated ? (
              <>
                <NavLink to="/me" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><UserRound size={18} />个人信息管理</NavLink>
                <NavLink to="/me/favorites" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><Star size={18} />我的收藏</NavLink>
              </>
            ) : (
              <>
                <NavLink to="/login" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><LogIn size={18} />登录</NavLink>
                <NavLink to="/register" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><BadgePlus size={18} />注册</NavLink>
              </>
            )}
          </div>
        </nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <div><h1>{sectionTitle()}</h1><p>{location.pathname.startsWith("/me") ? auth.message : message}</p></div>
          <div className="top-actions"><select value={region} onChange={(event) => changeRegion(event.target.value)}>{regions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" onClick={() => loadBase(region)}><RefreshCw size={16} />刷新</button></div>
        </header>

        <div className="route-content">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/qq/callback" element={<QqCallbackPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/legal-acceptance" element={<RequireAuth><LegalAcceptancePage /></RequireAuth>} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/me" element={<RequireAuth><MeHomePage /></RequireAuth>} />
          <Route path="/me/profile" element={<RequireAuth><MeProfileAnalysisPage /></RequireAuth>} />
          {HARUKI_FEATURE_ENABLED && <Route path="/me/bindings" element={<RequireAuth><HarukiConnectionCenter /></RequireAuth>} />}
          {HARUKI_FEATURE_ENABLED && <Route path="/me/assets" element={<RequireAuth><HarukiConnectionCenter /></RequireAuth>} />}
          <Route path="/me/deck" element={<RequireAuth><BoundDeckPage eventId={event?.id === "none" ? undefined : event?.id} /></RequireAuth>} />
          <Route path="/me/scores" element={<RequireAuth><ScoresPage songs={songs} region={region} /></RequireAuth>} />
          <Route path="/me/favorites" element={<RequireAuth><FavoritesPage /></RequireAuth>} />
          <Route path="/" element={LegacySections()} />
          <Route path="/section/virtualLives" element={<VirtualLiveCatalogPage region={region} />} />
          <Route path="/section/virtualLives/:virtualLiveId" element={<VirtualLiveDetailPage region={region} />} />
          <Route path="/section/live2d" element={<Live2dCatalogPage region={region} />} />
          <Route path="/section/live2d/:modelId" element={<LazyRouteBoundary label="Live2D 详情"><Suspense fallback={<p className="empty-state">正在加载 Live2D 运行时...</p>}><LazyLive2dDetailPage region={region} /></Suspense></LazyRouteBoundary>} />
          <Route path="/section/stories" element={<StoryCatalogPage key={region} region={region} />} />
          <Route path="/section/stories/:storyType/:storyId" element={<StoryDetailPage key={`${region}:detail`} region={region} />} />
          <Route path="/section/stories/:storyType/:storyId/:episodeId/play" element={<LazyRouteBoundary label="故事播放器"><Suspense fallback={<p className="empty-state">正在加载故事播放器...</p>}><LazyStoryPlayerPage region={region} /></Suspense></LazyRouteBoundary>} />
          <Route path="/section/:sectionId" element={LegacySections()} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </div>
        <SiteFooter />
      </section>

      {rankingDetailOpen && (
        <DetailDrawer title="排名详情" onClose={() => setRankingDetailOpen(false)}>
          {rankingDetail ? <RankingDetailPanel detail={rankingDetail} mode={rankingDetailMode} leaderCardFallbackUrl={rankingDetail.leaderCardImageUrl} onModeChange={setRankingDetailMode} /> : <p className="empty-state">{rankingDetailLoading ? "正在加载真实排名详情..." : "暂无排名详情。"}</p>}
        </DetailDrawer>
      )}

      {selectedSong && (
        <DetailDrawer title={selectedSong.music.title} onClose={() => setSelectedSong(null)}>
          <FavoriteButton type="song" region={region} targetId={selectedSong.music.id} label={selectedSong.music.title} />
          <div className="detail-hero"><ArtImage src={stringAsset(selectedSong.assets, "jacketUrl")} label={selectedSong.music.title} /><div><strong>{selectedSong.music.title}</strong><span>ID {selectedSong.music.id}</span><p>{selectedSong.music.categories?.join(" / ") || selectedSong.music.unit}</p><small>时长 {selectedSong.music.durationSeconds ?? "-"}s / BPM {selectedSong.music.bpm ?? "-"}</small></div></div>
          <h3>谱面</h3><div className="difficulty-grid">{(selectedSong.music.difficultyDetails ?? []).map((detail) => <button key={detail.difficulty} type="button" className="difficulty-card" onClick={() => setSelectedChart({ musicId: selectedSong.music.id, title: selectedSong.music.title, detail })}><span>{detail.difficulty}</span><strong>Lv.{detail.playLevel}</strong><small>{formatNumber(detail.totalNoteCount)} notes</small></button>)}</div>
        </DetailDrawer>
      )}
      {selectedChart && <DetailDrawer title={`${selectedChart.title} / ${selectedChart.detail.difficulty}`} onClose={() => setSelectedChart(null)}><RealChartPreview region={region} musicId={selectedChart.musicId} difficulty={selectedChart.detail.difficulty} fallbackTitle={selectedChart.title} fallbackLevel={selectedChart.detail.playLevel} fallbackNotes={selectedChart.detail.totalNoteCount} formatNumber={(value) => formatNumber(value)} /></DetailDrawer>}
      {selectedCard && (
        <DetailDrawer title={selectedCard.card.title} onClose={() => setSelectedCard(null)} elevated={Boolean(selectedCollection || selectedEvent)}>
          <FavoriteButton type="card" region={region} targetId={selectedCard.card.id} label={selectedCard.card.title} />
          <div className="detail-hero card-detail"><div><strong>{selectedCard.card.character}</strong><span>ID {selectedCard.card.id}</span><p>{selectedCard.card.title}</p><small>星级 {selectedCard.card.rarity} / {selectedCard.card.attribute}</small></div></div>
          <section className="card-art-grid">
            <article>
              <h3>特训前</h3>
              <ArtImage src={stringAsset(selectedCard.assets, "normalUrl")} srcCandidates={[stringAsset(selectedCard.assets, "normalThumbnailUrl"), ...stringAssetList(selectedCard.assets, "imageCandidates")]} label={`${selectedCard.card.title} 特训前`} variant="card" />
            </article>
            {selectedCard.card.rarity >= 3 && (
              <article>
                <h3>特训后</h3>
                <ArtImage src={stringAsset(selectedCard.assets, "afterTrainingUrl")} srcCandidates={[stringAsset(selectedCard.assets, "afterTrainingThumbnailUrl"), ...stringAssetList(selectedCard.assets, "imageCandidates")]} label={`${selectedCard.card.title} 特训后`} variant="card" />
              </article>
            )}
          </section>
          <section className="skill-detail"><div className="skill-detail-heading"><h3>技能详情 <span className="current-skill-level">当前 Lv.{skillLevel}</span></h3><div className="segmented skill-levels">{([1, 2, 3, 4] as const).map((level) => <button key={level} type="button" aria-pressed={skillLevel === level} className={skillLevel === level ? "active" : ""} onClick={() => setSkillLevel(level)}>Lv.{level}</button>)}</div></div>{selectedCard.card.skill ? <><article><strong>{selectedCard.card.skill.name ?? selectedCard.card.skill.id}</strong><p><HighlightSkillValues text={selectedCard.card.skill.formattedDescriptions?.[String(skillLevel) as "1" | "2" | "3" | "4"] ?? (selectedCard.card.skill.skillFormatTrace?.status === "missing-data" ? "技能参数缺失" : "暂无技能描述")} /></p>{selectedCard.card.skill.skillFormatTrace?.missingFields?.length ? <small>缺少：{selectedCard.card.skill.skillFormatTrace.missingFields.join("、")}</small> : null}</article>{selectedCard.card.specialTrainingSkill && <article><strong>特训后 · {selectedCard.card.specialTrainingSkill.name ?? selectedCard.card.specialTrainingSkill.id}</strong><p><HighlightSkillValues text={selectedCard.card.specialTrainingSkill.formattedDescriptions?.[String(skillLevel) as "1" | "2" | "3" | "4"] ?? "技能参数缺失"} /></p></article>}</> : <p className="empty-state">真实技能数据暂不可用。</p>}</section>
        </DetailDrawer>
      )}
      {selectedEvent && (
        <DetailDrawer title={selectedEvent.event.name} onClose={() => setSelectedEvent(null)}>
          <FavoriteButton type="event" region={region} targetId={selectedEvent.event.id} label={selectedEvent.event.name} />
          <div className="detail-hero"><ArtImage src={stringAsset(selectedEvent.assets, "bannerUrl")} label={selectedEvent.event.name} variant="event" /><div><strong>{selectedEvent.event.name}</strong><span>{formatDate(selectedEvent.event.startAt)} - {formatDate(selectedEvent.event.endAt)}</span><p>{selectedEvent.event.storyOutline ?? "真实剧情简介暂不可用。"}</p></div></div>
          <section className="compact-list"><h3>相关歌曲</h3>{selectedEvent.relations.relatedSongs.map((song) => <div key={song.id}><span>{song.title}</span><button type="button" onClick={() => openSong(song.id)}>歌曲详情</button></div>)}</section>
          <section className="related-card-grid">{selectedEvent.relations.relatedCards.map((card) => renderRelatedCardTile(card, `${region}:event-card:${card.id}`))}</section>
        </DetailDrawer>
      )}
      {selectedCollection && (
        <DetailDrawer title={selectedCollection.item.name} onClose={() => setSelectedCollection(null)}>
          <FavoriteButton type={favoriteTypeForCatalog(selectedCollection.item.type)} region={region} targetId={selectedCollection.item.id} label={selectedCollection.item.name} />
          <div className={`detail-hero ${selectedCollection.item.type === "honors" ? "honor-detail" : selectedCollection.item.type === "gachas" ? "gacha-detail" : ""}`}><ArtImage src={collectionImageCandidates(selectedCollection.item.type, selectedCollection.assets, true)[0]} srcCandidates={collectionImageCandidates(selectedCollection.item.type, selectedCollection.assets, true)} label={selectedCollection.item.name} variant={collectionImageVariant(selectedCollection.item.type)} /><div><strong>{selectedCollection.item.name}</strong><span>ID {selectedCollection.item.id}</span><p>{selectedCollection.item.description ?? selectedCollection.item.category ?? "暂无更多说明"}</p><small>{formatDate(selectedCollection.item.startAt)} - {formatDate(selectedCollection.item.endAt)}</small></div></div>
          {selectedCollection.item.type === "costumes" && <section className="costume-detail-grid"><div><h3>服装信息</h3><p>部件：{selectedCollection.item.partTypes?.join(" / ") || "缺失"}</p><p>来源：{selectedCollection.item.source ?? "未知"} / 稀有度：{selectedCollection.item.rarity ?? "未知"}</p><p>性别：{selectedCollection.item.gender ?? "未知"}{selectedCollection.item.designer ? ` / 设计：${selectedCollection.item.designer}` : ""}</p><p>适用角色：{selectedCollection.item.characterIds?.join("、") || "未提供"}</p></div><div><h3>颜色与部件</h3>{Object.entries(selectedCollection.item.parts ?? {}).map(([partType, variants]) => <div key={partType} className="costume-part"><strong>{partType}</strong><span>{variants.map((variant) => variant.colorName || `Color ${variant.colorId ?? "-"}`).join("、")}</span></div>)}{(selectedCollection.item.extraParts ?? []).map((part, index) => <div key={`${part.characterId}-${part.partType}-${index}`} className="costume-part"><strong>{part.partType ?? "extra"} / 角色 {part.characterId ?? "-"}</strong><span>{(part.variants ?? []).map((variant) => variant.colorName || `Color ${variant.colorId ?? "-"}`).join("、")}</span></div>)}</div></section>}
          <section className="related-card-grid">{(selectedCollection.relations?.relatedCards ?? []).slice(0, 30).map((card) => renderRelatedCardTile(card, `${region}:collection-card:${card.id}`))}</section>
        </DetailDrawer>
      )}    </main>
  );
}




