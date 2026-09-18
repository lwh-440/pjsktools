/**
 * Exact-score SUS parsing for Project Sekai score charts.
 *
 * The timing and hold-score semantics were independently implemented from the
 * MIT-licensed cc004/SekaiCalculator reference (commit
 * b63e23d4c7d45cd20fe29790e574a2bd9c084e6e). Attribution and license details
 * are recorded in THIRD_PARTY_NOTICES.md.
 */

export type MusicScoreNoteBase = { time: number };
export type MusicScoreNote = MusicScoreNoteBase & { type: number; longId?: number };
export type MusicScore = { notes: MusicScoreNote[]; skills: MusicScoreNoteBase[]; fevers: MusicScoreNoteBase[] };

/** Bump whenever parsed score semantics change, so stale cache entries are rejected. */
export const musicScoreParserVersion = "sus-exact-v3";

type TimedPayload = {
  measure: number;
  kind: "short" | "direction" | "long";
  lane: number;
  longKey?: string;
  channel?: number;
  index: number;
  slots: number;
  value: string;
  order: number;
};

type Position = TimedPayload & { tick: number; width: number; valueKind: number };
type Flags = { critical: boolean; friction: boolean; flick: boolean };
type InternalScoreNote = MusicScoreNote & { tick: number; order: number };

const playableLaneMin = 2;
const playableLaneMax = 13;
const defaultTicksPerBeat = 480;
const defaultBeatsPerMeasure = 4;
const epsilon = 1e-8;

function laneValue(value: string) {
  return Number.parseInt(value, 17);
}

function payloadValues(raw: string, warnings: string[], context: string) {
  const payload = raw.replace(/\s+/g, "").toUpperCase();
  if (payload.length % 2 !== 0) {
    warnings.push(`${context} has an odd-length payload and was ignored`);
    return [];
  }
  return Array.from({ length: payload.length / 2 }, (_, index) => payload.slice(index * 2, index * 2 + 2));
}

function tickKey(tick: number) {
  return Math.round(tick * 1_000_000_000).toString();
}

function coordinateKey(tick: number, lane: number, width: number) {
  return `${tickKey(tick)}:${lane}:${width}`;
}

function laneTickKey(tick: number, lane: number) {
  return `${tickKey(tick)}:${lane}`;
}

function removeScoreEntriesAtLaneTick(entries: Map<string, InternalScoreNote>, tick: number, lane: number) {
  const key = laneTickKey(tick, lane);
  for (const entryKey of entries.keys()) {
    if (entryKey === key || entryKey.startsWith(`${key}:`)) entries.delete(entryKey);
  }
}

function parseTapFlags(valueKind: number): Omit<Flags, "flick"> | undefined {
  switch (valueKind) {
    case 1:
      return { critical: false, friction: false };
    case 2:
      return { critical: true, friction: false };
    case 5:
      return { critical: false, friction: true };
    case 6:
      return { critical: true, friction: true };
    // Cancel and hidden short-note variants deliberately produce no score event.
    case 7:
    case 8:
      return undefined;
    default:
      return undefined;
  }
}

function scoreType(flags: Flags): number {
  if (flags.friction) {
    if (flags.flick) return flags.critical ? 15 : 12;
    return flags.critical ? 13 : 10;
  }
  if (flags.flick) return flags.critical ? 8 : 4;
  return flags.critical ? 5 : 1;
}

function longStartType(flags: Pick<Flags, "critical" | "friction">) {
  if (flags.friction) return flags.critical ? 14 : 11;
  return flags.critical ? 6 : 2;
}

function longMidType(critical: boolean) {
  return critical ? 7 : 3;
}

function mergeFlags(left: Flags | undefined, right: Flags | undefined): Flags {
  return {
    critical: Boolean(left?.critical || right?.critical),
    friction: Boolean(left?.friction || right?.friction),
    flick: Boolean(left?.flick || right?.flick)
  };
}

function sortByPosition(left: Position, right: Position) {
  return left.tick - right.tick || right.valueKind - left.valueKind || left.order - right.order;
}

function splitLongs(nodes: Position[], warnings: string[], group: string) {
  const result: Position[][] = [];
  let active: Position[] | undefined;
  for (const node of [...nodes].sort(sortByPosition)) {
    if (node.valueKind === 1) {
      if (active?.length) warnings.push(`long ${group} started again before its prior end; prior segment was dropped`);
      active = [node];
      continue;
    }
    if (!active) {
      warnings.push(`long ${group} has a node without a start and was ignored`);
      continue;
    }
    if (node.tick <= active[active.length - 1].tick + epsilon) {
      warnings.push(`long ${group} has duplicate or reversed ticks and was ignored`);
      continue;
    }
    active.push(node);
    if (node.valueKind === 2) {
      result.push(active);
      active = undefined;
    }
  }
  if (active?.length) warnings.push(`long ${group} has no end and was ignored`);
  return result;
}

function timeConverter(bpmChanges: Array<{ tick: number; bpm: number }>, ticksPerBeat: number, baseBpm: number) {
  const changes = [...bpmChanges]
    .filter((change) => Number.isFinite(change.bpm) && change.bpm > 0)
    .sort((left, right) => left.tick - right.tick);
  const segments: Array<{ tick: number; seconds: number; bpm: number }> = [{ tick: 0, seconds: 0, bpm: baseBpm }];
  let currentTick = 0;
  let seconds = 0;
  let bpm = baseBpm;
  for (const change of changes) {
    if (change.tick < 0) continue;
    if (change.tick > currentTick + epsilon) {
      seconds += (change.tick - currentTick) * 60 / (bpm * ticksPerBeat);
      currentTick = change.tick;
    }
    bpm = change.bpm;
    const last = segments[segments.length - 1];
    if (Math.abs(last.tick - currentTick) <= epsilon) {
      last.bpm = bpm;
    } else {
      segments.push({ tick: currentTick, seconds, bpm });
    }
  }
  return (tick: number) => {
    let segment = segments[0];
    for (const candidate of segments) {
      if (candidate.tick > tick + epsilon) break;
      segment = candidate;
    }
    return segment.seconds + (tick - segment.tick) * 60 / (segment.bpm * ticksPerBeat);
  };
}

export function parseSusMusicScore(susText: string): { score?: MusicScore; warnings: string[]; unsupportedReason?: string } {
  const warnings: string[] = [];
  let ticksPerBeat = defaultTicksPerBeat;
  let baseBpm = 120;
  const bpmDefinitions = new Map<string, number>();
  const measureBeats = new Map<number, number>();
  const bpmReferences: Array<{ measure: number; index: number; slots: number; value: string }> = [];
  const payloads: TimedPayload[] = [];
  let order = 0;

  for (const rawLine of susText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("#")) continue;
    const request = line.match(/^#REQUEST\s+\"?([^\"]*)/i);
    if (request) {
      const requestedTicks = request[1].match(/\bticks_per_beat\s+(\d+)/i);
      if (requestedTicks) {
        const parsed = Number(requestedTicks[1]);
        if (Number.isInteger(parsed) && parsed > 0) ticksPerBeat = parsed;
      }
      continue;
    }
    const base = line.match(/^#BPM\s+([0-9]+(?:\.[0-9]+)?)/i);
    if (base) {
      const parsed = Number(base[1]);
      if (Number.isFinite(parsed) && parsed > 0) baseBpm = parsed;
      continue;
    }
    const definition = line.match(/^#BPM([0-9A-Z]{2})\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (definition) {
      const parsed = Number(definition[2]);
      if (Number.isFinite(parsed) && parsed > 0) bpmDefinitions.set(definition[1].toUpperCase(), parsed);
      continue;
    }
    const barLength = line.match(/^#(\d{3})02\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (barLength) {
      const parsed = Number(barLength[2]);
      if (Number.isFinite(parsed) && parsed > 0) measureBeats.set(Number(barLength[1]), parsed);
      continue;
    }
    const bpmLine = line.match(/^#(\d{3})08\s*:\s*(.+)$/i);
    if (bpmLine) {
      for (const [index, value] of payloadValues(bpmLine[2], warnings, `BPM line ${line.slice(0, 6)}`).entries()) {
        if (value !== "00") bpmReferences.push({ measure: Number(bpmLine[1]), index, slots: bpmLine[2].replace(/\s+/g, "").length / 2, value });
      }
      continue;
    }
// Haruki channel 9 is a decorative slide: it contributes no independent start/end/auto score event. Its attached 1xx/5xx attributes remain available through the separately parsed tap and directional channels.
    const note = line.match(/^#(\d{3})([1-5])([0-9A-G])([0-9A-Z])?\s*:\s*(.+)$/i);
    if (!note) continue;
    const type = note[2];
    const lane = laneValue(note[3]);
    if (!Number.isFinite(lane)) {
      warnings.push(`note line ${line.slice(0, 6)} has an invalid lane`);
      continue;
    }
    const kind = type === "1" ? "short" : type === "5" ? "direction" : "long";
    if (kind === "long" && !note[4]) {
      warnings.push(`long note line ${line.slice(0, 6)} has no long key and was ignored`);
      continue;
    }
    const values = payloadValues(note[5], warnings, `note line ${line.slice(0, 6)}`);
    for (const [index, value] of values.entries()) {
      if (value === "00") continue;
      payloads.push({ measure: Number(note[1]), kind, lane, longKey: note[4]?.toUpperCase(), channel: Number(type), index, slots: values.length, value, order: order++ });
    }
  }

  if (!payloads.length) return { warnings, unsupportedReason: "SUS contains no parsable timed events" };

  const lastMeasure = Math.max(
    0,
    ...payloads.map((payload) => payload.measure),
    ...bpmReferences.map((payload) => payload.measure),
    ...measureBeats.keys()
  );
  const measureStartTicks = new Map<number, number>();
  const measureTicks = new Map<number, number>();
  let startTick = 0;
  let activeBeats = defaultBeatsPerMeasure;
  for (let measure = 0; measure <= lastMeasure; measure += 1) {
    activeBeats = measureBeats.get(measure) ?? activeBeats;
    const ticks = activeBeats * ticksPerBeat;
    measureStartTicks.set(measure, startTick);
    measureTicks.set(measure, ticks);
    startTick += ticks;
  }

  const toTick = (payload: Pick<TimedPayload, "measure" | "index" | "slots">) =>
    (measureStartTicks.get(payload.measure) ?? 0) + (measureTicks.get(payload.measure) ?? defaultBeatsPerMeasure * ticksPerBeat) * payload.index / payload.slots;
  const positions: Position[] = [];
  for (const payload of payloads) {
    const width = laneValue(payload.value[1]);
    const valueKind = laneValue(payload.value[0]);
    if (!Number.isFinite(width) || !Number.isFinite(valueKind) || width <= 0) {
      warnings.push(`note at measure ${payload.measure} has an invalid SUS value ${payload.value}`);
      continue;
    }
    positions.push({ ...payload, tick: toTick(payload), width, valueKind });
  }
  const timeForTick = timeConverter(
    bpmReferences.map((reference) => ({ tick: toTick(reference), bpm: bpmDefinitions.get(reference.value.toUpperCase()) ?? Number.NaN })),
    ticksPerBeat,
    baseBpm
  );

  const coordinateFlags = new Map<string, Flags>();
  const shortPositions: Position[] = [];
  const directionalPositions: Position[] = [];
  const longGroups = new Map<string, Position[]>();
  const skills: MusicScoreNoteBase[] = [];
  const fevers: MusicScoreNoteBase[] = [];

  for (const position of positions) {
    if (position.kind === "long") {
      // SUS groups long notes by channel and long key. Channel 2 contains ordinary holds
      // and is further separated by start lane; channels 3/4 may move between lanes.
      const sourceGroup = `${position.channel}:${position.longKey}:${position.channel === 2 ? position.lane : ""}`;
      const bucket = longGroups.get(sourceGroup) ?? [];
      bucket.push(position);
      longGroups.set(sourceGroup, bucket);
      continue;
    }
    if (position.kind === "short") {
      if (position.lane === 0) {
        skills.push({ time: timeForTick(position.tick) });
        continue;
      }
      if (position.lane === 15) {
        fevers.push({ time: timeForTick(position.tick) });
        continue;
      }
      shortPositions.push(position);
    } else {
      directionalPositions.push(position);
    }
  }

  // Tap values control critical/friction. Channel 5 stores only flick direction (1-6),
  // so it attaches to an equal tick/lane/width without changing the tap attributes.
  const directionalCoordinates = new Set<string>();
  for (const position of shortPositions) {
    if (position.lane < playableLaneMin || position.lane > playableLaneMax) continue;
    const parsed = parseTapFlags(position.valueKind);
    if (!parsed) continue;
    const key = coordinateKey(position.tick, position.lane, position.width);
    coordinateFlags.set(key, mergeFlags(coordinateFlags.get(key), { ...parsed, flick: false }));
  }
  for (const position of directionalPositions) {
    if (position.lane < playableLaneMin || position.lane > playableLaneMax) continue;
    if (position.valueKind < 1 || position.valueKind > 6) continue;
    directionalCoordinates.add(coordinateKey(position.tick, position.lane, position.width));
  }

  const scoreEntries = new Map<string, InternalScoreNote>();
  const suppressedShortLaneTicks = new Set<string>();
  for (const position of shortPositions) {
    if (position.lane < playableLaneMin || position.lane > playableLaneMax) continue;
    const coordinate = coordinateKey(position.tick, position.lane, position.width);
    const key = laneTickKey(position.tick, position.lane);
    const ownFlags = parseTapFlags(position.valueKind);
    // Modern SUS uses 7/8 to cancel or hide a tap. They remove a coincident event.
    if (!ownFlags && (position.valueKind === 7 || position.valueKind === 8)) {
      suppressedShortLaneTicks.add(laneTickKey(position.tick, position.lane));
      scoreEntries.delete(key);
      continue;
    }
    const flags = coordinateFlags.get(coordinate);
    if (!flags || !ownFlags) continue;
    scoreEntries.set(key, {
      time: timeForTick(position.tick),
      tick: position.tick,
      type: scoreType({ ...flags, flick: directionalCoordinates.has(coordinate) }),
      order: position.order
    });
  }

  let nextLongId = 1;
  const seenLongStarts = new Set<string>();
  for (const [group, nodes] of longGroups) {
    // Width can move inside a slide, so only the explicit long key plus lane grouping is stable.
    for (const segment of splitLongs(nodes, warnings, group)) {
      const first = segment[0];
      const last = segment[segment.length - 1];
      if (first.lane < playableLaneMin || first.lane > playableLaneMax) continue;
      const longStartKey = `${first.valueKind}:${coordinateKey(first.tick, first.lane, first.width)}`;
      if (seenLongStarts.has(longStartKey)) continue;
      seenLongStarts.add(longStartKey);
      const longId = nextLongId++;
      const firstKey = laneTickKey(first.tick, first.lane);
      const firstFlags = coordinateFlags.get(coordinateKey(first.tick, first.lane, first.width)) ?? { critical: false, friction: false, flick: false };
      removeScoreEntriesAtLaneTick(scoreEntries, first.tick, first.lane);
      scoreEntries.set(firstKey, {
        time: timeForTick(first.tick), tick: first.tick, type: longStartType(firstFlags), longId, order: first.order
      });

      for (const node of segment.slice(1, -1)) {
        const key = laneTickKey(node.tick, node.lane);
        // A hidden relay is not scored, but it still replaces a coincident tap.
        removeScoreEntriesAtLaneTick(scoreEntries, node.tick, node.lane);
        if (node.valueKind === 5 || node.lane < playableLaneMin || node.lane > playableLaneMax) continue;
        scoreEntries.set(key, {
          time: timeForTick(node.tick), tick: node.tick, type: longMidType(firstFlags.critical), longId, order: node.order
        });
      }

      const lastKey = laneTickKey(last.tick, last.lane);
      const lastFlags = coordinateFlags.get(coordinateKey(last.tick, last.lane, last.width)) ?? { critical: false, friction: false, flick: false };
      removeScoreEntriesAtLaneTick(scoreEntries, last.tick, last.lane);
      scoreEntries.set(lastKey, {
        time: timeForTick(last.tick),
        tick: last.tick,
        type: scoreType({
          ...lastFlags,
          critical: firstFlags.critical || lastFlags.critical,
          flick: directionalCoordinates.has(coordinateKey(last.tick, last.lane, last.width))
        }),
        longId,
        order: last.order
      });

      const autoStep = ticksPerBeat / 2;
      for (let tick = (Math.floor(first.tick / autoStep) + 1) * autoStep; tick < last.tick - epsilon; tick += autoStep) {
        const autoKey = `auto:${longId}:${tickKey(tick)}`;
        scoreEntries.set(autoKey, { time: timeForTick(tick), tick, type: 9, longId, order: first.order });
      }
    }
  }

  for (const [key, entry] of scoreEntries) {
    if (!key.startsWith("auto:") && suppressedShortLaneTicks.has(laneTickKey(entry.tick, Number(key.split(":" )[1] ?? -1)))) scoreEntries.delete(key);
  }

  const notes = [...scoreEntries.values()]
    .sort((left, right) => left.tick - right.tick || left.order - right.order || left.type - right.type)
    .map(({ tick: _tick, order: _order, ...note }) => note);
  skills.sort((left, right) => left.time - right.time);
  fevers.sort((left, right) => left.time - right.time);
  if (!notes.length) return { warnings, unsupportedReason: "SUS contains no parsable playable notes" };
  return { score: { notes, skills, fevers }, warnings };
}
