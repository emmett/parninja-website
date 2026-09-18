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

  global.PinLabel = {
    LIE_PIN_COLORS: LIE_PIN_COLORS,
    getStrokePinLabel: getStrokePinLabel,
    lieColor: lieColor,
    distanceYards: distanceYards,
    shotDistanceForStroke: shotDistanceForStroke,
  };
})(typeof window !== 'undefined' ? window : globalThis);
