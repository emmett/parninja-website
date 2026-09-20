/**
 * Map pin labels — ported from parninja/components/hole/MapPinLabel.tsx
 * Keep string rules in sync with the app.
 */
(function (global) {
  'use strict';

  /** Lie colors for map pins (match Stroke / LieInput). */
  var LIE_PIN_COLORS = {
    Tee: '#4CAF50',
    Fairway: '#689F38',
    Rough: '#33691E',
    Sand: '#E0C097',
    Green: '#8BC34A',
    Recovery: '#FF7043',
  };

  /**
   * Map pin label text for a stroke.
   * - Non-putt: club + GPS shot distance from this pin to the next, e.g. "7i 142y".
   * - Putt: "2p 18'" (putt count + first putt distance in feet).
   */
  function getStrokePinLabel(stroke, shotDistanceYards) {
    var isPutt = stroke.club === 'PU' && stroke.lie === 'Green';
    if (isPutt) {
      var putts = stroke.strokeCount != null ? stroke.strokeCount : 1;
      var firstPuttFeet = Math.round((stroke.firstPuttDistance || 0) * 3);
      return putts + "p " + firstPuttFeet + "'";
    }
    var club = stroke.club || '';
    var clubLabel =
      club.length >= 2
        ? club[0].toUpperCase() + club.slice(1).toLowerCase()
        : club;
    if (
      typeof shotDistanceYards === 'number' &&
      Number.isFinite(shotDistanceYards) &&
      shotDistanceYards > 0
    ) {
      return clubLabel + ' ' + Math.round(shotDistanceYards) + 'y';
    }
    return clubLabel;
  }

  function lieColor(lie) {
    return LIE_PIN_COLORS[lie] || '#2e7d32';
  }

  /**
   * Great-circle distance in yards between two {latitude, longitude} points.
   */
  function distanceYards(a, b) {
    if (!a || !b) return null;
    var R = 6371000;
    var toRad = Math.PI / 180;
    var lat1 = a.latitude * toRad;
    var lat2 = b.latitude * toRad;
    var dLat = (b.latitude - a.latitude) * toRad;
    var dLng = (b.longitude - a.longitude) * toRad;
    var h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var meters = 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    return meters * 1.09361;
  }

  /**
   * Shot distance for stroke i: GPS yards to next stroke, or null for last.
   */
  function shotDistanceForStroke(strokes, index) {
    var stroke = strokes[index];
    var next = strokes[index + 1];
    if (!stroke || !stroke.position || !next || !next.position) return null;
    return distanceYards(stroke.position, next.position);
  }

  /**
   * True bearing in degrees from A to B (0 = north), matching parninja lib/utils/gps.ts.
   */
  function bearingDegrees(from, to) {
    if (!from || !to) return 0;
    var toRad = Math.PI / 180;
    var dLon = (to.longitude - from.longitude) * toRad;
    var lat1 = from.latitude * toRad;
    var lat2 = to.latitude * toRad;
    var y = Math.sin(dLon) * Math.cos(lat2);
    var x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    if (!Number.isFinite(y) || !Number.isFinite(x)) return 0;
    var bearing = (Math.atan2(y, x) * 180) / Math.PI;
    if (!Number.isFinite(bearing)) return 0;
    return (bearing + 360) % 360;
  }

  /** ~12 m cluster — matches MapPinLabel CROWD_CLUSTER_DEG */
  var CROWD_CLUSTER_DEG = 0.00012;
  var CROWD_OFFSETS = ['up', 'up-right', 'up-left'];

  /**
   * Crowd offsets for stacked pins (TF 192 MapStrokePin).
   * Cycles up / up-right / up-left within geographic clusters.
   */
  function mapPinOffsetsForCrowd(positions, clusterDeg) {
    clusterDeg = clusterDeg != null ? clusterDeg : CROWD_CLUSTER_DEG;
    var n = positions.length;
    var offsets = [];
    for (var zi = 0; zi < n; zi++) offsets.push('up');
    var parent = [];
    for (var pi = 0; pi < n; pi++) parent.push(pi);

    function find(i) {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    }
    function unite(a, b) {
      var ra = find(a);
      var rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    }

    for (var i = 0; i < n; i++) {
      var a = positions[i];
      if (!a) continue;
      for (var j = i + 1; j < n; j++) {
        var b = positions[j];
        if (!b) continue;
        if (
          Math.abs(a.latitude - b.latitude) <= clusterDeg &&
          Math.abs(a.longitude - b.longitude) <= clusterDeg
        ) {
          unite(i, j);
        }
      }
    }

    var groups = {};
    for (var gi = 0; gi < n; gi++) {
      if (!positions[gi]) continue;
      var root = find(gi);
      if (!groups[root]) groups[root] = [];
      groups[root].push(gi);
    }

    Object.keys(groups).forEach(function (key) {
      var members = groups[key];
      if (members.length < 2) return;
      members.sort(function (ia, ib) {
        var pa = positions[ia];
        var pb = positions[ib];
        return pa.longitude - pb.longitude || pa.latitude - pb.latitude;
      });
      members.forEach(function (idx, rank) {
        offsets[idx] = CROWD_OFFSETS[rank % CROWD_OFFSETS.length];
      });
    });
    return offsets;
  }

  /** Pixel offset for MapLibre Marker (anchor center); ~app MapStrokePin 62px fan. */
  function pinOffsetPixels(side) {
    if (side === 'up-left') return [-52, -30];
    if (side === 'up-right') return [52, -30];
    return [0, -36]; // up
  }

  global.PinLabel = {
    LIE_PIN_COLORS: LIE_PIN_COLORS,
    getStrokePinLabel: getStrokePinLabel,
    lieColor: lieColor,
    distanceYards: distanceYards,
    shotDistanceForStroke: shotDistanceForStroke,
    bearingDegrees: bearingDegrees,
    mapPinOffsetsForCrowd: mapPinOffsetsForCrowd,
    pinOffsetPixels: pinOffsetPixels,
    CROWD_OFFSETS: CROWD_OFFSETS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
