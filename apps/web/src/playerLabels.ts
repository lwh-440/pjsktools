const fieldLabels: Record<string, string> = {
  assets: "图片资料",
  card: "卡牌资料",
  cards: "卡牌资料",
  character: "角色资料",
  characterId: "角色资料",
  difficulty: "谱面难度",
  event: "活动资料",
  eventBonus: "活动加成",
  eventPoint: "活动 PT",
  music: "歌曲资料",
  musicId: "歌曲资料",
  ownedCards: "持有卡牌",
  playerData: "玩家资料",
  profile: "玩家档案",
  ranking: "排名资料",
  rewards: "奖励资料",
  skill: "技能资料"
};

const statusLabels: Record<string, string> = {
  active: "进行中",
  available: "可用",
  completed: "已完成",
  full: "资料完整",
  fallback: "备用资料",
  loading: "正在加载",
  "missing-data": "资料未完整同步",
  partial: "部分资料可用",
  ready: "可用",
  "source-unavailable": "暂时不可用",
  "stale-refreshing": "正在更新",
  unavailable: "暂时不可用",
  waiting: "等待资料"
};

const cardAttributeLabels: Record<string, string> = {
  cool: "冷静",
  cute: "可爱",
  happy: "欢乐",
  mysterious: "神秘",
  pure: "纯真"
};

const supplyTypeLabels: Record<string, string> = {
  birthday: "生日限定",
  bloom_festival_limited: "Bloom Festival 限定",
  collaboration_limited: "联动限定",
  colorful_festival_limited: "Colorful Festival 限定",
  normal: "常驻",
  term_limited: "期间限定",
  unit_event_limited: "组合活动限定"
};

const skillTypeLabels: Record<string, string> = {
  judgment_up: "判定强化",
  life_recovery: "生命回复",
  other_member_score_up_reference_rate: "队友分数加成",
  score_up: "分数加成",
  score_up_condition_life: "生命条件分数加成",
  score_up_keep: "持续分数加成",
  score_up_unit_count: "组合人数分数加成"
};

const eventTypeLabels: Record<string, string> = {
  cheerful_carnival: "欢乐嘉年华活动",
  marathon: "马拉松活动",
  world_bloom: "World Link 活动"
};

const eventUnitLabels: Record<string, string> = {
  mixed: "混合组合",
  light_sound: "Leo/need",
  idol: "MORE MORE JUMP!",
  street: "Vivid BAD SQUAD",
  theme_park: "Wonderlands×Showtime",
  school_refusal: "25时，在Nightcord。",
  piapro: "Virtual Singer",
  ln: "Leo/need",
  mmj: "MORE MORE JUMP!",
  vbs: "Vivid BAD SQUAD",
  ws: "Wonderlands×Showtime",
  "25ji": "25时，在Nightcord。",
  vs: "Virtual Singer"
};

const forecastConfidenceLabels: Record<string, string> = {
  high: "较高",
  medium: "中等",
  low: "较低",
  unavailable: "样本不足"
};

function readNestedMessage(value: string) {
  let current = value.trim();
  for (let depth = 0; depth < 2; depth += 1) {
    try {
      const parsed = JSON.parse(current);
      if (!parsed || typeof parsed !== "object") break;
      const next = (parsed as { message?: unknown; error?: unknown }).message ?? (parsed as { error?: unknown }).error;
      if (typeof next !== "string") break;
      current = next.trim();
    } catch {
      break;
    }
  }
  return current;
}

export function technicalDiagnosticMessage(value: unknown) {
  return readNestedMessage(value instanceof Error ? value.message : String(value ?? ""));
}

export function playerErrorMessage(error: unknown) {
  const raw = technicalDiagnosticMessage(error);
  if (/[㐀-鿿]/.test(raw)) return raw;
  if (/abort/i.test(raw)) return "请求已取消。";
  if (/network|fetch|failed to fetch|offline|econn/i.test(raw)) return "暂时无法连接服务，请检查网络后重试。";
  if (/not found|404/i.test(raw)) return "当前区服暂未找到这项资料。";
  if (/timeout|timed out|504/i.test(raw)) return "服务响应较慢，请稍后重试。";
  return "暂时无法加载资料，请稍后重试。";
}

export function playerWarningMessage(warning: unknown) {
  const raw = technicalDiagnosticMessage(warning);
  if (/complete target deck is required for exact power gain/i.test(raw)) return "需要完整的目标卡组，才能准确计算综合力提升。";
  if (/missing|required|insufficient|incomplete/i.test(raw)) return "部分输入或资料尚未完整，结果可能使用估算。";
  if (/[㐀-鿿]/.test(raw)) return raw;
  return "部分资料仍待确认；可展开技术字段查看原始说明。";
}

export function playerFieldLabel(field: unknown) {
  const value = String(field ?? "");
  return fieldLabels[value] ?? "资料字段";
}

export function playerStatusLabel(status: unknown) {
  const value = String(status ?? "");
  return statusLabels[value] ?? "资料状态待确认";
}

export function cardAttributeLabel(attribute: unknown) {
  const value = String(attribute ?? "");
  return cardAttributeLabels[value.toLowerCase()] ?? (value ? "属性待确认" : "属性未提供");
}

export function catalogFilterOptionLabel(key: string, value: string, fallback: string) {
  if (key === "attributes") return cardAttributeLabel(value);
  if (key === "supplyTypes") return supplyTypeLabels[value] ?? fallback;
  if (key === "skillTypes") return skillTypeLabels[value] ?? fallback;
  return fallback === "birthday" ? "生日限定" : fallback === "none" ? "不限定组合" : fallback;
}

export function eventTypeLabel(value: unknown) {
  const key = String(value ?? "");
  return eventTypeLabels[key] ?? "活动";
}

export function eventUnitLabel(value: unknown) {
  const key = String(value ?? "");
  return eventUnitLabels[key] ?? key;
}

export function collectionCategoryLabel(type: string, category: unknown) {
  const value = String(category ?? "");
  if (type === "gachas") return value === "normal" ? "普通卡池" : "卡池资料";
  return value || "详细资料";
}

export function forecastConfidenceLabel(value: unknown) {
  const key = String(value ?? "").toLowerCase();
  return forecastConfidenceLabels[key] ?? (key ? "待确认" : "样本不足");
}

export function forecastSamplingReason(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "采样说明待同步";
  if (/[㐀-鿿]/.test(raw)) return raw;
  if (/enough samples across at least one hour for a basic trend estimate/i.test(raw)) return "样本覆盖至少 1 小时，可用于基础趋势估算。";
  return "采样说明已记录";
}
