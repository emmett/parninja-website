/**
 * MapLibre implementation of @parninja/replay ReplayMapAdapter.
 * Used by /watch; Expo web can reuse the same pattern later.
 */
(function (global) {
  'use strict';

  var TRAIL_SOURCE = 'replay-trail';
  var TRAIL_OUTLINE = 'replay-trail-outline';
  var TRAIL_MAIN = 'replay-trail-main';

  function ensureTrailLayers(map, style) {
    if (!map.getSource(TRAIL_SOURCE)) {
      map.addSource(TRAIL_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: TRAIL_OUTLINE,
        type: 'line',
        source: TRAIL_SOURCE,
        paint: {
          'line-color': style.outlineColor,
          'line-width': style.outlineWidth,
          'line-opacity': 1,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.addLayer({
        id: TRAIL_MAIN,
        type: 'line',
        source: TRAIL_SOURCE,
        paint: {
          'line-color': style.mainColor,
          'line-width': style.mainWidth,
          'line-opacity': 1,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
    }
  }

  /**
   * @param {maplibregl.Map} map
   * @param {{ onPins?: Function, onBall?: Function, onPutt?: Function, onClear?: Function }} hooks
   *   Marker DOM is still owned by watch.js (PinLabel + putt tracker); adapter drives path + camera.
   */
  function createMapLibreReplayAdapter(map, hooks) {
    hooks = hooks || {};
    return {
      fitRegion: function (region, opts) {
        opts = opts || {};
        var halfLat = region.latitudeDelta / 2;
        var halfLng = region.longitudeDelta / 2;
        var bounds = new maplibregl.LngLatBounds(
          [region.longitude - halfLng, region.latitude - halfLat],
          [region.longitude + halfLng, region.latitude + halfLat]
        );
        map.fitBounds(bounds, {
          padding: opts.padding || 0,
          bearing: 0,
          pitch: 0,
          duration: opts.animated === false ? 0 : 400,
          maxZoom: opts.maxZoom != null ? opts.maxZoom : 18.5,
        });
      },
      setPathSegments: function (segments, style) {
        ensureTrailLayers(map, style);
        var features = (segments || []).map(function (seg) {
          return {
            type: 'Feature',
            properties: { holeNumber: seg.holeNumber },
            geometry: {
              type: 'LineString',
              coordinates: seg.coordinates.map(function (c) {
                return [c.longitude, c.latitude];
              }),
            },
          };
        });
        map.getSource(TRAIL_SOURCE).setData({
          type: 'FeatureCollection',
          features: features,
        });
      },
      setPins: function (pins) {
        if (hooks.onPins) hooks.onPins(pins);
      },
      setBall: function (position) {
        if (hooks.onBall) hooks.onBall(position);
      },
      setPuttOverlay: function (tracker, anchor) {
        if (hooks.onPutt) hooks.onPutt(tracker, anchor);
      },
      clearHoleOverlays: function () {
        if (hooks.onClear) hooks.onClear();
        if (map.getSource(TRAIL_SOURCE)) {
          map.getSource(TRAIL_SOURCE).setData({
            type: 'FeatureCollection',
            features: [],
          });
        }
      },
    };
  }

  global.MapLibreReplayAdapter = {
    create: createMapLibreReplayAdapter,
  };
})(typeof window !== 'undefined' ? window : globalThis);
