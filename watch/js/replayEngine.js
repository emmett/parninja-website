/**
 * @parninja/replay — GENERATED FILE. Do not edit by hand.
 * Source: packages/replay (app repo). Rebuild: npm run build:watch-replay
 */

"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // packages/replay/src/index.ts
  var index_exports = {};
  __export(index_exports, {
    DEFAULT_REPLAY_CONFIG: () => DEFAULT_REPLAY_CONFIG,
    FRAME_MS: () => FRAME_MS,
    HOLE_PATH_POLYLINE: () => HOLE_PATH_POLYLINE,
    MAP_VIEWPORT_SAFE_INSET: () => MAP_VIEWPORT_SAFE_INSET,
    MIN_LATITUDE_DELTA: () => MIN_LATITUDE_DELTA,
    PLAYBACK_SPEEDS: () => PLAYBACK_SPEEDS,
    PUTT_TRACKER_SCALE: () => PUTT_TRACKER_SCALE,
    STYLIZED_LANDSCAPE: () => STYLIZED_LANDSCAPE,
    applyFrameToMapAdapter: () => applyFrameToMapAdapter,
    buildHoleReplayTimeline: () => buildHoleReplayTimeline,
    buildPuttTrackerDistances: () => buildPuttTrackerDistances,
    buildRoundReplayTimeline: () => buildRoundReplayTimeline,
    buildScrubberViewModel: () => buildScrubberViewModel,
    calculateProgress: () => calculateProgress,
    countGpsShots: () => countGpsShots,
    createReplayController: () => createReplayController,
    distanceBetweenYards: () => distanceBetweenYards,
    getCameraRegion: () => getCameraRegion,
    getFrameAtTime: () => getFrameAtTime,
    getHoleAtTime: () => getHoleAtTime,
    getHoleCameraRegion: () => getHoleCameraRegion,
    getHoleGreen: () => getHoleGreen,
    getHoleOrigin: () => getHoleOrigin,
    getHoleStrokeStartTimes: () => getHoleStrokeStartTimes,
    getNextHoleStartTime: () => getNextHoleStartTime,
    getNextStrokeTime: () => getNextStrokeTime,
    getPrevHoleStartTime: () => getPrevHoleStartTime,
    getPrevStrokeTime: () => getPrevStrokeTime,
    getReplayPathSegments: () => getReplayPathSegments,
    getReplayPins: () => getReplayPins,
    getStrokeStartTimes: () => getStrokeStartTimes,
    getZoomLevelForClub: () => getZoomLevelForClub,
    hasReplayableGpsData: () => hasReplayableGpsData,
    interpolateFlightPath: () => interpolateFlightPath,
    nextPlaybackSpeed: () => nextPlaybackSpeed,
    normalizeRoundForReplay: () => normalizeRoundForReplay,
    puttTrackerMaxFeet: () => puttTrackerMaxFeet,
    regionFramingPoints: () => regionFramingPoints,
    toReplayMapFrame: () => toReplayMapFrame
  });

  // packages/replay/src/tokens.ts
  var PUTT_TRACKER_SCALE = 1.5;
  function puttTrackerMaxFeet(firstFeet) {
    const first = Math.max(0, firstFeet);
    return Math.max(1, Math.round(first * PUTT_TRACKER_SCALE));
  }
  var MAP_VIEWPORT_SAFE_INSET = 0.18;
  var MIN_LATITUDE_DELTA = 25e-4;
  var FRAME_MS = 33;
  var PLAYBACK_SPEEDS = [1, 2, 4];
  function nextPlaybackSpeed(current) {
    if (current === 1) return 2;
    if (current === 2) return 4;
    return 1;
  }
  var HOLE_PATH_POLYLINE = {
    outline: { color: "rgba(255,255,255,0.94)", width: 9 },
    main: { color: "#14532d", width: 5 }
  };
  var STYLIZED_LANDSCAPE = {
    landscape: "#cfe8b8",
    landscapeNatural: "#b7d9a3",
    water: "#7eb8d4",
    park: "#9ccb7a",
    active: "#14532d"
  };
  var DEFAULT_REPLAY_CONFIG = {
    speedMultiplier: 1,
    msPerStroke: 2e3,
    msPerHoleTransition: 1500,
    flightFramesPerStroke: 10
  };

  // packages/replay/src/gps.ts
  var EARTH_RADIUS_M = 6371e3;
  var METERS_TO_YARDS = 1.09361;
  function haversineMeters(a, b) {
    const toRad = Math.PI / 180;
    const lat1 = a.latitude * toRad;
    const lat2 = b.latitude * toRad;
    const dLat = (b.latitude - a.latitude) * toRad;
    const dLng = (b.longitude - a.longitude) * toRad;
    const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function distanceBetweenYards(a, b) {
    return haversineMeters(a, b) * METERS_TO_YARDS;
  }
  function isValidGpsPosition(p) {
    return !!p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;
  }
  function getHoleTeeStrokeOrigin(hole) {
    var _a;
    for (const stroke of (_a = hole.strokes) != null ? _a : []) {
      if (stroke.lie !== "Tee") continue;
      if (isValidGpsPosition(stroke.position)) return stroke.position;
    }
    return null;
  }
  function getHoleOrigin(hole) {
    var _a;
    return (_a = getHoleTeeStrokeOrigin(hole)) != null ? _a : isValidGpsPosition(hole.teePosition) ? hole.teePosition : null;
  }
  function getHoleGreen(hole) {
    return isValidGpsPosition(hole.greenPosition) ? hole.greenPosition : null;
  }

  // packages/replay/src/framing.ts
  function regionFramingPoints(points, options) {
    var _a, _b;
    const valid = points.filter(
      (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180
    );
    if (valid.length === 0) return null;
    const safeInset = (_a = options == null ? void 0 : options.safeInset) != null ? _a : MAP_VIEWPORT_SAFE_INSET;
    const usable = Math.max(0.2, 1 - 2 * Math.max(0, Math.min(0.4, safeInset)));
    const minDelta = (_b = options == null ? void 0 : options.minLatitudeDelta) != null ? _b : MIN_LATITUDE_DELTA;
    let minLat = valid[0].latitude;
    let maxLat = valid[0].latitude;
    let minLng = valid[0].longitude;
    let maxLng = valid[0].longitude;
    for (const p of valid) {
      minLat = Math.min(minLat, p.latitude);
      maxLat = Math.max(maxLat, p.latitude);
      minLng = Math.min(minLng, p.longitude);
      maxLng = Math.max(maxLng, p.longitude);
    }
    const midLat = (minLat + maxLat) / 2;
    const midLng = (minLng + maxLng) / 2;
    const spanLat = maxLat - minLat;
    const spanLng = maxLng - minLng;
    let latitudeDelta = Math.max(spanLat / usable, minDelta);
    let longitudeDelta = Math.max(spanLng / usable, minDelta);
    const cosLat = Math.max(0.2, Math.cos(midLat * Math.PI / 180));
    const latAsLng = latitudeDelta * cosLat;
    if (longitudeDelta < latAsLng * 0.45) {
      longitudeDelta = latAsLng * 0.45;
    }
    if (latitudeDelta < longitudeDelta * cosLat * 0.45) {
      latitudeDelta = longitudeDelta * cosLat * 0.45 / cosLat;
    }
    return {
      latitude: midLat,
      longitude: midLng,
      latitudeDelta,
      longitudeDelta
    };
  }

  // packages/replay/src/engine.ts
  function countGpsShots(round) {
    var _a, _b, _c, _d;
    let count = 0;
    for (const hole of (_a = round.holes) != null ? _a : []) {
      if (hole.blowup) continue;
      for (const stroke of (_b = hole.strokes) != null ? _b : []) {
        if (((_c = stroke.position) == null ? void 0 : _c.latitude) && ((_d = stroke.position) == null ? void 0 : _d.longitude)) {
          count++;
        }
      }
    }
    return count;
  }
  function hasReplayableGpsData(round) {
    var _a, _b;
    const totalStrokes = (_b = (_a = round.holes) == null ? void 0 : _a.reduce(
      (sum, h) => {
        var _a2, _b2;
        return sum + ((_b2 = (_a2 = h.strokes) == null ? void 0 : _a2.length) != null ? _b2 : 0);
      },
      0
    )) != null ? _b : 0;
    if (totalStrokes === 0) return false;
    const gpsShots = countGpsShots(round);
    const gpsPercentage = gpsShots / totalStrokes;
    return gpsPercentage >= 0.25;
  }
  function formatReplayPinLabel(stroke, shotDistanceYards) {
    var _a, _b;
    const isPutt = stroke.club === "PU" && stroke.lie === "Green";
    if (isPutt) {
      const putts = (_a = stroke.strokeCount) != null ? _a : 1;
      const firstPuttFeet = Math.round(((_b = stroke.firstPuttDistance) != null ? _b : 0) * 3);
      return `${putts}p ${firstPuttFeet}'`;
    }
    const club = stroke.club || "Shot";
    const clubLabel = club.length >= 2 ? club[0].toUpperCase() + club.slice(1).toLowerCase() : club;
    if (typeof shotDistanceYards === "number" && Number.isFinite(shotDistanceYards) && shotDistanceYards > 0) {
      return `${clubLabel} ${Math.round(shotDistanceYards)}y`;
    }
    return clubLabel;
  }
  function interpolateFlightPath(start, end, progress, _arcHeight = 0.3) {
    const lat = start.latitude + (end.latitude - start.latitude) * progress;
    const lng = start.longitude + (end.longitude - start.longitude) * progress;
    return { latitude: lat, longitude: lng };
  }
  function generateFlightFrames(start, end, startTime, duration, strokeNumber, holeNumber, club, distance, sg, frameCount, pathKind, extra) {
    const frames = [];
    const walk = pathKind === "walk";
    for (let i = 0; i <= frameCount; i++) {
      const progress = i / frameCount;
      const position = interpolateFlightPath(start, end, progress);
      const timestamp = startTime + duration * progress;
      const isEnd = i === frameCount;
      const isStart = i === 0;
      frames.push({
        timestamp,
        position,
        strokeNumber,
        holeNumber,
        club,
        distance,
        sg,
        event: walk ? "hole-transition" : pathKind === "putt" ? isStart ? "putt" : isEnd ? "land" : "flight" : isStart ? "tee" : isEnd ? "land" : "flight",
        isKeyFrame: walk ? isStart || isEnd : isStart || isEnd,
        pathKind,
        ...extra
      });
    }
    return frames;
  }
  function isPuttStroke(stroke) {
    return stroke.club === "PU" && stroke.lie === "Green";
  }
  function buildPuttTrackerDistances(stroke) {
    var _a;
    const puttCount = Math.max(1, Math.round((_a = stroke.strokeCount) != null ? _a : 1));
    const firstYards = typeof stroke.firstPuttDistance === "number" && stroke.firstPuttDistance > 0 ? stroke.firstPuttDistance : typeof stroke.distanceRemaining === "number" && stroke.distanceRemaining > 0 ? stroke.distanceRemaining : 0;
    const firstFeet = Math.max(0, Math.round(firstYards * 3));
    const lastYards = typeof stroke.lastPuttDistance === "number" && stroke.lastPuttDistance > 0 ? stroke.lastPuttDistance : 0;
    const secondFeet = puttCount <= 1 ? 0 : Math.max(0, Math.round(lastYards * 3));
    return { firstFeet, secondFeet, puttCount, maxFeet: puttTrackerMaxFeet(firstFeet) };
  }
  function appendPuttReplayFrames(args) {
    var _a, _b, _c;
    const { frames, hole, puttStroke, strokeNumber, config } = args;
    let currentTime = args.startTime;
    const holdPos = (_c = ((_a = puttStroke.position) == null ? void 0 : _a.latitude) && ((_b = puttStroke.position) == null ? void 0 : _b.longitude) ? puttStroke.position : null) != null ? _c : getHoleGreen(hole);
    if (!holdPos) return currentTime;
    const { firstFeet, secondFeet, puttCount, maxFeet } = buildPuttTrackerDistances(puttStroke);
    const pinLabel = formatReplayPinLabel(puttStroke, null);
    const strokeDuration = config.msPerStroke / config.speedMultiplier;
    const trackFrames = Math.max(2, config.flightFramesPerStroke);
    const resultFrames = Math.max(2, Math.round(config.flightFramesPerStroke / 2));
    for (let i = 0; i <= trackFrames; i++) {
      const t = i / trackFrames;
      const currentFeet = firstFeet + (secondFeet - firstFeet) * t;
      frames.push({
        timestamp: currentTime + strokeDuration * t,
        position: holdPos,
        strokeNumber,
        holeNumber: hole.holeNumber,
        club: puttStroke.club || "PU",
        distance: currentFeet / 3,
        sg: puttStroke.SGA,
        event: i === 0 ? "putt" : i === trackFrames ? "land" : "flight",
        isKeyFrame: i === 0,
        pathKind: "putt",
        lie: puttStroke.lie,
        pinLabel,
        puttTracker: {
          maxFeet,
          firstFeet,
          secondFeet,
          puttCount,
          currentFeet,
          phase: "track"
        }
      });
    }
    currentTime += strokeDuration;
    const resultDuration = strokeDuration * 0.5;
    for (let i = 0; i <= resultFrames; i++) {
      const t = i / resultFrames;
      frames.push({
        timestamp: currentTime + resultDuration * t,
        position: holdPos,
        strokeNumber,
        holeNumber: hole.holeNumber,
        club: puttStroke.club || "PU",
        distance: secondFeet / 3,
        sg: puttStroke.SGA,
        event: "land",
        isKeyFrame: false,
        pathKind: "putt",
        lie: puttStroke.lie,
        pinLabel,
        puttTracker: {
          maxFeet,
          firstFeet,
          secondFeet,
          puttCount,
          currentFeet: secondFeet,
          phase: "result"
        }
      });
    }
    currentTime += resultDuration;
    return currentTime;
  }
  function buildHoleReplayTimeline(hole, config = DEFAULT_REPLAY_CONFIG) {
    var _a, _b, _c, _d;
    const frames = [];
    let currentTime = 0;
    const strokes = (_a = hole.strokes) != null ? _a : [];
    const gpsStrokes = strokes.filter(
      (s) => {
        var _a2, _b2;
        return ((_a2 = s.position) == null ? void 0 : _a2.latitude) && ((_b2 = s.position) == null ? void 0 : _b2.longitude);
      }
    );
    if (gpsStrokes.length === 0) {
      return {
        frames: [],
        holes: [],
        duration: 0,
        totalStrokes: 0
      };
    }
    const lastIdx = gpsStrokes.length - 1;
    const lastIsPutt = isPuttStroke(gpsStrokes[lastIdx]);
    for (let i = 0; i < lastIdx; i++) {
      const stroke = gpsStrokes[i];
      const nextStroke = gpsStrokes[i + 1];
      if (lastIsPutt && i === lastIdx - 1) {
        const shotYards2 = distanceBetweenYards(stroke.position, nextStroke.position);
        const strokeDuration2 = config.msPerStroke / config.speedMultiplier;
        const strokeFrames2 = generateFlightFrames(
          stroke.position,
          nextStroke.position,
          currentTime,
          strokeDuration2,
          i + 1,
          hole.holeNumber,
          stroke.club || "Unknown",
          (_b = stroke.distanceRemaining) != null ? _b : 0,
          stroke.SGA,
          config.flightFramesPerStroke,
          "swing",
          {
            lie: stroke.lie,
            shotDistanceYards: shotYards2,
            pinLabel: formatReplayPinLabel(stroke, shotYards2)
          }
        );
        frames.push(...strokeFrames2);
        currentTime += strokeDuration2;
        continue;
      }
      const shotYards = distanceBetweenYards(stroke.position, nextStroke.position);
      const strokeDuration = config.msPerStroke / config.speedMultiplier;
      const strokeFrames = generateFlightFrames(
        stroke.position,
        nextStroke.position,
        currentTime,
        strokeDuration,
        i + 1,
        hole.holeNumber,
        stroke.club || "Unknown",
        (_c = stroke.distanceRemaining) != null ? _c : 0,
        stroke.SGA,
        config.flightFramesPerStroke,
        "swing",
        {
          lie: stroke.lie,
          shotDistanceYards: shotYards,
          pinLabel: formatReplayPinLabel(stroke, shotYards)
        }
      );
      frames.push(...strokeFrames);
      currentTime += strokeDuration;
    }
    const lastStroke = gpsStrokes[lastIdx];
    if (lastIsPutt) {
      currentTime = appendPuttReplayFrames({
        frames,
        hole,
        puttStroke: lastStroke,
        strokeNumber: gpsStrokes.length,
        startTime: currentTime,
        config
      });
    } else if (lastStroke.position) {
      frames.push({
        timestamp: currentTime,
        position: lastStroke.position,
        strokeNumber: gpsStrokes.length,
        holeNumber: hole.holeNumber,
        club: lastStroke.club || "PU",
        distance: 0,
        sg: lastStroke.SGA,
        event: "putt",
        isKeyFrame: true,
        pathKind: "swing",
        lie: lastStroke.lie,
        pinLabel: formatReplayPinLabel(lastStroke, null)
      });
    }
    const holeSegment = {
      holeNumber: hole.holeNumber,
      par: hole.par,
      startMs: 0,
      endMs: currentTime,
      strokes: strokes.length,
      score: (_d = hole.score) != null ? _d : strokes.length
    };
    return {
      frames,
      holes: [holeSegment],
      duration: currentTime,
      totalStrokes: strokes.length
    };
  }
  function buildRoundReplayTimeline(round, config = DEFAULT_REPLAY_CONFIG) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const allFrames = [];
    const holeSegments = [];
    let currentTime = 0;
    let totalStrokes = 0;
    const playable = ((_a = round.holes) != null ? _a : []).filter((hole) => {
      var _a2;
      if (hole.blowup) return false;
      return ((_a2 = hole.strokes) != null ? _a2 : []).some(
        (s) => {
          var _a3, _b2;
          return ((_a3 = s.position) == null ? void 0 : _a3.latitude) && ((_b2 = s.position) == null ? void 0 : _b2.longitude);
        }
      );
    });
    for (let hi = 0; hi < playable.length; hi++) {
      const hole = playable[hi];
      const holeTimeline = buildHoleReplayTimeline(hole, config);
      if (holeTimeline.frames.length === 0) continue;
      const adjustedFrames = holeTimeline.frames.map((frame) => ({
        ...frame,
        timestamp: frame.timestamp + currentTime
      }));
      allFrames.push(...adjustedFrames);
      const holeSegment = {
        holeNumber: hole.holeNumber,
        par: hole.par,
        startMs: currentTime,
        endMs: currentTime + holeTimeline.duration,
        strokes: (_c = (_b = hole.strokes) == null ? void 0 : _b.length) != null ? _c : 0,
        score: (_f = hole.score) != null ? _f : (_e = (_d = hole.strokes) == null ? void 0 : _d.length) != null ? _e : 0
      };
      holeSegments.push(holeSegment);
      currentTime += holeTimeline.duration;
      totalStrokes += (_h = (_g = hole.strokes) == null ? void 0 : _g.length) != null ? _h : 0;
      if (playable[hi + 1]) {
        currentTime += 1;
      }
    }
    return {
      frames: allFrames,
      holes: holeSegments,
      duration: currentTime,
      totalStrokes
    };
  }
  function getFrameAtTime(timeline, timestamp) {
    if (timeline.frames.length === 0) return null;
    const clampedTime = Math.max(0, Math.min(timestamp, timeline.duration));
    let closestFrame = timeline.frames[0];
    let minDiff = Math.abs(closestFrame.timestamp - clampedTime);
    const strokePriority = (frame) => {
      if (frame.pathKind === "walk") return 0;
      if (frame.event === "tee" || frame.event === "putt") return 3;
      if (frame.isKeyFrame) return 2;
      return 1;
    };
    for (const frame of timeline.frames) {
      const diff = Math.abs(frame.timestamp - clampedTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestFrame = frame;
        continue;
      }
      if (diff === minDiff && strokePriority(frame) > strokePriority(closestFrame)) {
        closestFrame = frame;
      }
    }
    return closestFrame;
  }
  function getCameraRegion(position, zoomLevel = "medium") {
    const deltaMap = {
      close: 2e-3,
      // ~220 yards
      medium: 5e-3,
      // ~550 yards
      wide: 0.01
      // ~1100 yards
    };
    const delta = deltaMap[zoomLevel];
    return {
      latitude: position.latitude,
      longitude: position.longitude,
      latitudeDelta: delta,
      longitudeDelta: delta
    };
  }
  function getZoomLevelForClub(club) {
    const clubUpper = club.toUpperCase();
    if (clubUpper.includes("PU")) return "close";
    if (clubUpper.includes("W") || clubUpper.includes("WEDGE")) return "medium";
    if (clubUpper.includes("DR") || clubUpper.includes("DRIVER")) return "wide";
    return "medium";
  }
  function calculateProgress(currentTime, duration) {
    if (duration === 0) return 0;
    return Math.max(0, Math.min(1, currentTime / duration));
  }
  function getHoleAtTime(timeline, timestamp) {
    for (const hole of timeline.holes) {
      if (timestamp >= hole.startMs && timestamp <= hole.endMs) {
        return hole;
      }
    }
    for (let i = 0; i < timeline.holes.length - 1; i++) {
      const cur = timeline.holes[i];
      const next = timeline.holes[i + 1];
      if (timestamp > cur.endMs && timestamp < next.startMs) {
        return next;
      }
    }
    return timeline.holes[timeline.holes.length - 1] || null;
  }
  function getStrokeStartTimes(timeline) {
    const times = [];
    for (const frame of timeline.frames) {
      if (frame.pathKind === "walk") continue;
      if (frame.event !== "tee" && frame.event !== "putt") continue;
      if (times[times.length - 1] === frame.timestamp) continue;
      times.push(frame.timestamp);
    }
    return times;
  }
  function getHoleStrokeStartTimes(timeline, holeNumber) {
    const times = [];
    for (const frame of timeline.frames) {
      if (frame.holeNumber !== holeNumber) continue;
      if (frame.pathKind === "walk") continue;
      if (frame.event !== "tee" && frame.event !== "putt") continue;
      if (times[times.length - 1] === frame.timestamp) continue;
      times.push(frame.timestamp);
    }
    return times;
  }
  function getHoleCameraRegion(timeline, holeNumber, hole) {
    const pts = [];
    if (hole) {
      if (hole.teePosition) pts.push(hole.teePosition);
      else {
        const origin = getHoleOrigin(hole);
        if (origin) pts.push(origin);
      }
      if (hole.greenPosition) pts.push(hole.greenPosition);
      else {
        const green = getHoleGreen(hole);
        if (green) pts.push(green);
      }
    }
    for (const frame of timeline.frames) {
      if (frame.holeNumber !== holeNumber) continue;
      if (frame.pathKind === "walk") continue;
      pts.push(frame.position);
    }
    return regionFramingPoints(pts);
  }
  function getNextStrokeTime(timeline, currentTime) {
    const starts = getStrokeStartTimes(timeline);
    const next = starts.find((t) => t > currentTime + 1);
    return next != null ? next : null;
  }
  function getPrevStrokeTime(timeline, currentTime) {
    const starts = getStrokeStartTimes(timeline);
    let idx = -1;
    for (let i = 0; i < starts.length; i++) {
      if (starts[i] <= currentTime) idx = i;
    }
    if (idx <= 0) return null;
    return starts[idx - 1];
  }
  function getNextHoleStartTime(timeline, currentTime) {
    const next = timeline.holes.find((h) => h.startMs > currentTime);
    return next ? next.startMs : null;
  }
  function getPrevHoleStartTime(timeline, currentTime) {
    let idx = -1;
    for (let i = 0; i < timeline.holes.length; i++) {
      if (timeline.holes[i].startMs <= currentTime) idx = i;
    }
    if (idx <= 0) return null;
    return timeline.holes[idx - 1].startMs;
  }
  function getReplayPathSegments(timeline, upToTime) {
    const frames = timeline.frames.filter(
      (f) => f.timestamp <= upToTime && f.pathKind === "swing"
    );
    if (frames.length === 0) return [];
    const segments = [];
    let current = null;
    const sameCoord = (a, b) => a.latitude === b.latitude && a.longitude === b.longitude;
    const pushSegmentIfUseful = (segment) => {
      if (segment.coordinates.length < 2) return;
      const first = segment.coordinates[0];
      const moved = segment.coordinates.some((c) => !sameCoord(first, c));
      if (!moved) return;
      segments.push(segment);
    };
    const pushCoord = (frame) => {
      const coord = {
        latitude: frame.position.latitude,
        longitude: frame.position.longitude
      };
      if (!current) {
        current = {
          kind: frame.pathKind,
          holeNumber: frame.holeNumber,
          coordinates: [coord]
        };
        return;
      }
      if (current.kind !== frame.pathKind || current.holeNumber !== frame.holeNumber) {
        pushSegmentIfUseful(current);
        current = {
          kind: frame.pathKind,
          holeNumber: frame.holeNumber,
          coordinates: [coord]
        };
        return;
      }
      const last = current.coordinates[current.coordinates.length - 1];
      if (sameCoord(last, coord)) return;
      current.coordinates.push(coord);
    };
    for (const frame of frames) {
      pushCoord(frame);
    }
    if (current) pushSegmentIfUseful(current);
    return segments;
  }
  function getReplayPins(timeline, upToTime) {
    const pins = [];
    for (const frame of timeline.frames) {
      if (frame.timestamp > upToTime) break;
      if (frame.pathKind === "walk") continue;
      if (frame.event !== "tee" && frame.event !== "putt") continue;
      pins.push(frame);
    }
    return pins;
  }

  // packages/replay/src/normalize.ts
  function normalizeRoundForReplay(doc) {
    var _a;
    const holes = ((_a = doc.holes) != null ? _a : []).map((h) => {
      var _a2;
      const hole = { ...h };
      const strokes = (_a2 = hole.strokes) != null ? _a2 : [];
      if (!hole.teePosition) {
        for (let i = 0; i < strokes.length; i++) {
          const p = strokes[i].position;
          if (p && p.latitude != null && p.longitude != null) {
            hole.teePosition = { latitude: p.latitude, longitude: p.longitude };
            break;
          }
        }
      }
      if (!hole.greenPosition) {
        for (let i = strokes.length - 1; i >= 0; i--) {
          const s = strokes[i];
          const p = s.position;
          if (!p || p.latitude == null || p.longitude == null) continue;
          if (s.club === "PU" || s.lie === "Green") {
            hole.greenPosition = { latitude: p.latitude, longitude: p.longitude };
            break;
          }
        }
        if (!hole.greenPosition) {
          for (let i = strokes.length - 1; i >= 0; i--) {
            const p = strokes[i].position;
            if (p && p.latitude != null && p.longitude != null) {
              hole.greenPosition = { latitude: p.latitude, longitude: p.longitude };
              break;
            }
          }
        }
      }
      return hole;
    });
    return { ...doc, holes };
  }

  // packages/replay/src/mapAdapter.ts
  function buildScrubberViewModel(args) {
    const { strokeTimes, currentTime, frame } = args;
    let activeStrokeIndex = -1;
    for (let i = 0; i < strokeTimes.length; i++) {
      if (strokeTimes[i] <= currentTime) activeStrokeIndex = i;
    }
    const isPutting = (frame == null ? void 0 : frame.pathKind) === "putt";
    let label = "\u2014";
    if (isPutting && (frame == null ? void 0 : frame.puttTracker)) {
      const n = frame.puttTracker.puttCount;
      if (frame.puttTracker.phase === "result") {
        label = `${n} putt${n === 1 ? "" : "s"}`;
      } else {
        label = "Putting";
      }
    } else if (strokeTimes.length && activeStrokeIndex >= 0) {
      label = `Shot ${activeStrokeIndex + 1} of ${strokeTimes.length}`;
    } else if (strokeTimes.length) {
      label = `Shot 1 of ${strokeTimes.length}`;
    }
    return {
      label,
      strokeTimes,
      activeStrokeIndex,
      isPutting: !!isPutting
    };
  }

  // packages/replay/src/controller.ts
  function createReplayController(timeline, initial) {
    var _a, _b, _c;
    const state = {
      timeline,
      currentTime: (_a = initial == null ? void 0 : initial.currentTime) != null ? _a : 0,
      playing: (_b = initial == null ? void 0 : initial.playing) != null ? _b : false,
      speed: (_c = initial == null ? void 0 : initial.speed) != null ? _c : 1
    };
    function clamp(ms) {
      return Math.max(0, Math.min(ms, state.timeline.duration));
    }
    function holeStrokeTimes() {
      const seg = getHoleAtTime(state.timeline, state.currentTime);
      if (!seg) return [];
      return getHoleStrokeStartTimes(state.timeline, seg.holeNumber);
    }
    function seekTo(ms, opts) {
      state.currentTime = clamp(ms);
      if (opts == null ? void 0 : opts.pause) state.playing = false;
    }
    function nextHole() {
      const next = getNextHoleStartTime(state.timeline, state.currentTime);
      if (next == null) return;
      seekTo(next, { pause: true });
    }
    function prevHole() {
      const prev = getPrevHoleStartTime(state.timeline, state.currentTime);
      seekTo(prev != null ? prev : 0, { pause: true });
    }
    function nextStroke() {
      const times = holeStrokeTimes();
      const next = times.find((t) => t > state.currentTime + 1);
      if (next != null) {
        seekTo(next, { pause: true });
        return;
      }
      nextHole();
    }
    function prevStroke() {
      var _a2;
      const times = holeStrokeTimes();
      let idx = -1;
      for (let i = 0; i < times.length; i++) {
        if (times[i] <= state.currentTime) idx = i;
      }
      if (idx <= 0) {
        seekTo((_a2 = times[0]) != null ? _a2 : 0, { pause: true });
        return;
      }
      seekTo(times[idx - 1], { pause: true });
    }
    function jumpToHole(holeNumber) {
      const seg = state.timeline.holes.find((h) => h.holeNumber === holeNumber);
      if (!seg) return;
      seekTo(seg.startMs, { pause: true });
    }
    function playTick() {
      if (!state.playing) return false;
      const next = state.currentTime + FRAME_MS * state.speed;
      if (next >= state.timeline.duration) {
        state.currentTime = state.timeline.duration;
        state.playing = false;
        return false;
      }
      state.currentTime = next;
      return true;
    }
    function getFrameViewModel(round) {
      var _a2, _b2, _c2;
      const frame = getFrameAtTime(state.timeline, state.currentTime);
      const holeSegment = getHoleAtTime(state.timeline, state.currentTime);
      const holeNumber = (_a2 = holeSegment == null ? void 0 : holeSegment.holeNumber) != null ? _a2 : null;
      const times = holeNumber != null ? getHoleStrokeStartTimes(state.timeline, holeNumber) : [];
      const scrubber = buildScrubberViewModel({
        strokeTimes: times,
        currentTime: state.currentTime,
        frame
      });
      const pathSegments = holeNumber == null ? [] : getReplayPathSegments(state.timeline, state.currentTime).filter(
        (s) => s.kind === "swing" && s.holeNumber === holeNumber && s.coordinates.length >= 2
      );
      const pins = holeNumber == null ? [] : getReplayPins(state.timeline, state.currentTime).filter(
        (p) => p.holeNumber === holeNumber
      );
      const hole = holeNumber != null ? (_c2 = (_b2 = round == null ? void 0 : round.holes) == null ? void 0 : _b2.find((h) => h.holeNumber === holeNumber)) != null ? _c2 : null : null;
      const cameraRegion = holeNumber != null ? getHoleCameraRegion(state.timeline, holeNumber, hole) : null;
      const yardsRemaining = frame && frame.pathKind === "swing" && typeof frame.distance === "number" && frame.distance > 0 ? frame.distance : null;
      const nextHoleMs = getNextHoleStartTime(state.timeline, state.currentTime);
      const prevHoleMs = getPrevHoleStartTime(state.timeline, state.currentTime);
      const hasNextOnHole = times.some((t) => t > state.currentTime + 1);
      return {
        frame,
        holeNumber,
        holeSegment,
        scrubber,
        pathSegments,
        pins,
        yardsRemaining,
        cameraRegion,
        pathStyle: HOLE_PATH_POLYLINE,
        canPrevStroke: times.length > 0 && times[0] < state.currentTime,
        canNextStroke: hasNextOnHole || nextHoleMs != null,
        canPrevHole: prevHoleMs != null,
        canNextHole: nextHoleMs != null
      };
    }
    return {
      getState: () => ({ ...state }),
      setPlaying(playing) {
        state.playing = playing;
      },
      togglePlaying() {
        state.playing = !state.playing;
      },
      cycleSpeed() {
        state.speed = nextPlaybackSpeed(state.speed);
        return state.speed;
      },
      seekTo,
      playTick,
      nextStroke,
      prevStroke,
      nextHole,
      prevHole,
      jumpToHole,
      getFrameViewModel
    };
  }

  // packages/replay/src/applyFrame.ts
  function applyFrameToMapAdapter(adapter, vm, opts) {
    var _a, _b, _c, _d, _e;
    const holeChanged = vm.holeNumber != null && (opts == null ? void 0 : opts.previousHoleNumber) != null && vm.holeNumber !== opts.previousHoleNumber;
    if (holeChanged) {
      adapter.clearHoleOverlays();
    }
    if (vm.cameraRegion && (holeChanged || (opts == null ? void 0 : opts.previousHoleNumber) == null)) {
      adapter.fitRegion(vm.cameraRegion, { animated: true });
    }
    adapter.setPathSegments(vm.pathSegments, {
      outlineColor: HOLE_PATH_POLYLINE.outline.color,
      outlineWidth: HOLE_PATH_POLYLINE.outline.width,
      mainColor: HOLE_PATH_POLYLINE.main.color,
      mainWidth: HOLE_PATH_POLYLINE.main.width
    });
    const pins = vm.pins.map((pin, offsetIndex) => ({
      position: pin.position,
      label: pin.pinLabel || pin.club || "",
      lie: pin.lie,
      selected: vm.frame ? pin.strokeNumber === vm.frame.strokeNumber : false,
      offsetIndex
    }));
    adapter.setPins(pins);
    adapter.setBall((_b = (_a = vm.frame) == null ? void 0 : _a.position) != null ? _b : null);
    const tracker = ((_c = vm.frame) == null ? void 0 : _c.pathKind) === "putt" ? (_d = vm.frame.puttTracker) != null ? _d : null : null;
    adapter.setPuttOverlay(tracker, (_e = opts == null ? void 0 : opts.puttAnchor) != null ? _e : null);
    return { holeNumber: vm.holeNumber };
  }
  function toReplayMapFrame(vm, opts) {
    var _a, _b, _c, _d, _e;
    return {
      holeNumber: vm.holeNumber,
      cameraRegion: vm.cameraRegion,
      cameraHoleChanged: !!(opts == null ? void 0 : opts.cameraHoleChanged),
      pathSegments: vm.pathSegments,
      pins: vm.pins.map((pin, offsetIndex) => ({
        position: pin.position,
        label: pin.pinLabel || pin.club || "",
        lie: pin.lie,
        selected: vm.frame ? pin.strokeNumber === vm.frame.strokeNumber : false,
        offsetIndex
      })),
      ball: (_b = (_a = vm.frame) == null ? void 0 : _a.position) != null ? _b : null,
      yardsRemaining: vm.yardsRemaining,
      puttTracker: ((_c = vm.frame) == null ? void 0 : _c.pathKind) === "putt" ? (_d = vm.frame.puttTracker) != null ? _d : null : null,
      puttAnchor: (_e = opts == null ? void 0 : opts.puttAnchor) != null ? _e : null
    };
  }

  // packages/replay/src/browser.ts
  var g = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : {};
  g.ReplayEngine = index_exports;
  var browser_default = index_exports;
})();
