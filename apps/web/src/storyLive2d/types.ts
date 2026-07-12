export type MediaAsset = { kind: string; identifier: string; url?: string; proxiedUrl?: string; region?: string; status?: string };

export type StoryModel = {
  character2dId?: number;
  costumeType: string;
  modelId?: string;
  rewrittenModel3JsonUrl?: string;
  motions?: string[];
  expressions?: string[];
};

export type ScenarioAction = {
  index: number;
  action?: number;
  referenceIndex?: number;
  type: string;
  delay?: number;
  isWait?: boolean;
  body?: string;
  windowDisplayName?: string;
  talkCharacters?: unknown[];
  motions?: Array<{ Character2dId?: number; MotionName?: string; FacialName?: string }>;
  character2dId?: number;
  costumeType?: string;
  motionName?: string;
  facialName?: string;
  sideFrom?: number;
  sideTo?: number;
  sideFromOffsetX?: number;
  sideToOffsetX?: number;
  layoutType?: number;
  moveSpeedType?: number;
  characterLayoutMode?: number;
  effectType?: number;
  effectName?: string;
  resource?: MediaAsset;
  bgm?: MediaAsset;
  se?: MediaAsset;
  voice?: MediaAsset;
  playMode?: number;
  volume?: number;
  duration?: number;
  raw?: Record<string, unknown>;
};

export type StoryPlaybackContext = {
  region?: string;
  playbackVersion?: string;
  scenarioInfo?: { episodeTitle?: string; chapterTitle?: string; bannerUrl?: string; scenarioId?: string };
  scenarioData?: Record<string, unknown>;
  actions?: ScenarioAction[];
  mediaAssets?: MediaAsset[];
  essentialAssets?: MediaAsset[];
  deferredAssets?: MediaAsset[];
  initialActions?: ScenarioAction[];
  episodeId?: string;
  episodeIndex?: number;
  playbackStatus?: string;
  missingResources?: string[];
  live2dModels?: StoryModel[];
  scenarioResource?: { image?: MediaAsset[]; audio?: MediaAsset[]; video?: MediaAsset[] };
  modelQueue?: string[][];
  preloadPlan?: { region?: string; stages?: string[]; media?: MediaAsset[]; models?: StoryModel[] };
  unsupportedActions?: string[];
  actionSupport?: { supported?: string[]; unsupported?: string[]; status?: Record<string, string>; supportMatrix?: Record<string, string>; referenceSources?: string[] };
  preloadStatus?: { mediaAssets?: Array<{ kind?: string; identifier?: string; status?: string }>; live2dModels?: Array<{ costumeType?: string; modelId?: string; status?: string }> };
  runtimeRequirements?: string[];
  playbackDiagnostics?: Record<string, unknown>;
  renderAcceptance?: { status?: string; serverValidation?: string; matchedPolicy?: string };
  warnings?: string[];
  unavailableReason?: string;
};

export type PreloadProgress = { stage: string; completed: number; total: number; info?: string; status: "idle" | "loading" | "loaded" | "failed" | "cancelled" };

export type StoryOverlayState = {
  speaker?: string;
  body?: string;
  telop?: string;
  placeInfo?: string;
  fullText?: string;
  tone?: "black" | "white";
  wipe?: string;
  shakeScreen?: boolean;
  shakeWindow?: boolean;
  memory?: boolean;
  ambient?: "normal" | "evening" | "night";
  blur?: boolean;
  scenarioEffect?: string;
  movieUrl?: string;
};
