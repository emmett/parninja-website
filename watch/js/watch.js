/**
 * ParNinja /watch — Masters-style hole scanner (scorecard + map tracers).
 * Scan is primary; continuous play is out of scope for v1.
 */
(function () {
  'use strict';

  var TRAIL_SOURCE = 'hole-trail';
  var TRAIL_LAYER = 'hole-trail-line';
  var ESRI_SAT =
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

  var state = {
    round: null,
    holeIndex: 0,
    /** Index of the last revealed GPS stroke (inclusive). -1 = none yet. */
    strokeCursor: -1,
    map: null,
    markers: [],
  };

  function $(id) {
    return document.getElementById(id);
  }

  function gpsStrokes(hole) {
    if (!hole || !hole.strokes) return [];
    return hole.strokes.filter(function (s) {
      return s.position && s.position.latitude != null && s.position.longitude != null;
    });
  }

  function holesWithGps(round) {
    return (round.holes || []).filter(function (h) {
      return gpsStrokes(h).length > 0;
    });
  }

  function scoreToPar(score, par) {
    if (score == null || par == null) return null;
    return score - par;
  }

  function scoreShapeClass(diff) {
    if (diff == null) return '';
    if (diff <= -2) return 'eagle';
    if (diff === -1) return 'birdie';
    if (diff === 1) return 'bogey';
    if (diff >= 2) return 'double';
    return '';
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function formatSg(sg) {
    if (typeof sg !== 'number' || !Number.isFinite(sg)) return null;
    var sign = sg > 0 ? '+' : '';
    return sign + sg.toFixed(2) + ' SG';
  }

  function roundTotal(holes) {
    return holes.reduce(function (sum, h) {
      return sum + (h.score != null ? h.score : 0);
    }, 0);
  }

  function currentHole() {
    return state.round && state.round.holes[state.holeIndex];
  }

  /* —— Scorecard —— */

  function renderScorecard() {
    var root = $('scorecard');
    var holes = state.round.holes;
    var html = '';

    html += '<div class="scorecard-row labels" role="row">';
    html += '<div class="scorecard-cell label">Hole</div>';
    holes.forEach(function (h, i) {
      var active = i === state.holeIndex ? ' active' : '';
      html +=
        '<button type="button" class="scorecard-cell hole-num' +
        active +
        '" data-hole-index="' +
        i +
        '" aria-pressed="' +
        (i === state.holeIndex) +
        '">' +
        h.holeNumber +
        '</button>';
    });
    html += '<div class="scorecard-cell total">Tot</div>';
    html += '</div>';

    html += '<div class="scorecard-row labels" role="row">';
    html += '<div class="scorecard-cell label">Par</div>';
    holes.forEach(function (h, i) {
      var active = i === state.holeIndex ? ' active' : '';
      html +=
        '<div class="scorecard-cell par' + active + '">' + (h.par != null ? h.par : '—') + '</div>';
    });
    html +=
      '<div class="scorecard-cell total">' +
      holes.reduce(function (s, h) {
        return s + (h.par || 0);
      }, 0) +
      '</div>';
    html += '</div>';

    html += '<div class="scorecard-row labels" role="row">';
    html += '<div class="scorecard-cell label">Score</div>';
    holes.forEach(function (h, i) {
      var active = i === state.holeIndex ? ' active' : '';
      var diff = scoreToPar(h.score, h.par);
      var shape = scoreShapeClass(diff);
      var inner =
        h.score == null
          ? '—'
          : shape
            ? '<span class="score-shape ' + shape + '">' + h.score + '</span>'
            : String(h.score);
      html += '<div class="scorecard-cell score' + active + '">' + inner + '</div>';
    });
    html += '<div class="scorecard-cell total">' + roundTotal(holes) + '</div>';
    html += '</div>';

    root.innerHTML = html;

    root.querySelectorAll('[data-hole-index]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectHole(Number(btn.getAttribute('data-hole-index')), true);
      });
    });
  }

  /* —— Meta / transport —— */

  function updateMeta() {
    var meta = state.round.meta || {};
    var cfg = window.SITE_CONFIG || {};
    $('brand-name').textContent = cfg.siteName || 'ParNinja';
    $('meta-course').textContent = meta.course || 'Shared round';
    var parts = [];
    if (meta.tees) parts.push(meta.tees + ' tees');
    if (meta.datePlayed) parts.push(formatDate(meta.datePlayed));
    if (meta.playerDisplayName) parts.push(meta.playerDisplayName);
    $('meta-sub').textContent = parts.join(' · ');

    var app = (cfg.apps && cfg.apps[0]) || {};
    var cta = $('cta-app');
    if (app.iosUrl) {
      cta.href = app.iosUrl;
      cta.classList.remove('hidden');
    } else if (app.androidUrl) {
      cta.href = app.androidUrl;
      cta.classList.remove('hidden');
    } else {
      cta.href = '../';
    }
  }

  function updateShotMeta() {
    var hole = currentHole();
    var strokes = gpsStrokes(hole);
    var primary = $('shot-primary');
    var secondary = $('shot-secondary');

    if (!hole) {
      primary.textContent = '—';
      secondary.textContent = '';
      return;
    }

    var holeLine =
      'Hole ' +
      hole.holeNumber +
      ' · Par ' +
      hole.par +
      (hole.distance ? ' · ' + hole.distance + ' yds' : '');

    if (strokes.length === 0) {
      primary.textContent = holeLine;
      secondary.textContent =
        hole.score != null ? 'Score ' + hole.score + ' · No GPS' : 'No GPS strokes';
      return;
    }

    if (state.strokeCursor < 0) {
      primary.textContent = holeLine;
      secondary.textContent = 'Scan to reveal shots';
      return;
    }

    var stroke = strokes[state.strokeCursor];
    var dist = PinLabel.shotDistanceForStroke(strokes, state.strokeCursor);
    var label = PinLabel.getStrokePinLabel(stroke, dist);
    var sg = formatSg(stroke.SGA);

    primary.textContent =
      'Shot ' + (state.strokeCursor + 1) + ' of ' + strokes.length + ' · ' + label;
    var bits = [holeLine];
    if (sg) bits.push(sg);
    secondary.textContent = bits.join(' · ');
  }

  function updateButtons() {
    var hole = currentHole();
    var strokes = gpsStrokes(hole);
    var atFirstHole = state.holeIndex <= 0;
    var atLastHole = state.holeIndex >= state.round.holes.length - 1;
    var atFirstStroke = state.strokeCursor <= -1;
    var atLastStroke =
      strokes.length === 0 || state.strokeCursor >= strokes.length - 1;

    $('btn-prev-hole').disabled = atFirstHole;
    $('btn-next-hole').disabled = atLastHole;

    // Prev stroke: allow going back, or jump to previous hole's last stroke
    $('btn-prev-stroke').disabled = atFirstStroke && atFirstHole;
    // Next stroke: allow advance into next hole when at end
    $('btn-next-stroke').disabled = atLastStroke && atLastHole;
  }

  /* —— Map —— */

  function clearMarkers() {
    state.markers.forEach(function (m) {
      m.remove();
    });
    state.markers = [];
  }

  function ensureTrailLayers() {
    var map = state.map;
    if (!map.getSource(TRAIL_SOURCE)) {
      map.addSource(TRAIL_SOURCE, {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
      });
      map.addLayer({
        id: TRAIL_LAYER,
        type: 'line',
        source: TRAIL_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#1b5e20',
          'line-width': 4,
          'line-opacity': 0.92,
        },
      });
    }
  }

  function setTrail(coords) {
    ensureTrailLayers();
    state.map.getSource(TRAIL_SOURCE).setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coords.length ? coords : [] },
    });
  }

  function zoomForClub(club) {
    var c = (club || '').toUpperCase();
    if (c.indexOf('PU') === 0) return 17.5;
    if (c.indexOf('DR') === 0 || c.indexOf('DRIVER') >= 0) return 15.2;
    return 16.2;
  }

  function fitOrFly(strokes, focusIndex) {
    var map = state.map;
    if (!strokes.length) return;

    if (focusIndex >= 0 && strokes[focusIndex]) {
      var p = strokes[focusIndex].position;
      map.easeTo({
        center: [p.longitude, p.latitude],
        zoom: zoomForClub(strokes[focusIndex].club),
        duration: 450,
      });
      return;
    }

    var bounds = new maplibregl.LngLatBounds();
    strokes.forEach(function (s) {
      bounds.extend([s.position.longitude, s.position.latitude]);
    });
    map.fitBounds(bounds, { padding: 64, maxZoom: 16.5, duration: 500 });
  }

  function renderMapContent() {
    var hole = currentHole();
    var strokes = gpsStrokes(hole);
    var empty = $('map-empty');
    clearMarkers();

    if (!strokes.length) {
      setTrail([]);
      empty.classList.add('visible');
      updateShotMeta();
      updateButtons();
      return;
    }
    empty.classList.remove('visible');

    var revealed = state.strokeCursor < 0 ? [] : strokes.slice(0, state.strokeCursor + 1);
    var coords = revealed.map(function (s) {
      return [s.position.longitude, s.position.latitude];
    });
    setTrail(coords);

    revealed.forEach(function (stroke, i) {
      var dist = PinLabel.shotDistanceForStroke(strokes, i);
      var label = PinLabel.getStrokePinLabel(stroke, dist);
      var el = document.createElement('div');
      el.className = 'pin-pill';
      if (stroke.lie === 'Sand') el.classList.add('sand');
      if (i === state.strokeCursor) el.classList.add('current');
      el.style.backgroundColor = PinLabel.lieColor(stroke.lie);
      el.textContent = label;

      var marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([stroke.position.longitude, stroke.position.latitude])
        .addTo(state.map);
      state.markers.push(marker);
    });

    fitOrFly(strokes, state.strokeCursor >= 0 ? state.strokeCursor : -1);
    if (state.strokeCursor < 0 && strokes.length) {
      fitOrFly(strokes, -1);
    }

    updateShotMeta();
    updateButtons();
  }

  function initMap(cb) {
    var map = new maplibregl.Map({
      container: 'watch-map',
      style: {
        version: 8,
        sources: {
          esri: {
            type: 'raster',
            tiles: [ESRI_SAT],
            tileSize: 256,
            attribution: 'Tiles © Esri',
            maxzoom: 19,
          },
        },
        layers: [{ id: 'esri', type: 'raster', source: 'esri' }],
      },
      center: [-116.2135, 43.622],
      zoom: 15,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    state.map = map;

    map.on('load', function () {
      ensureTrailLayers();
      if (cb) cb();
    });
  }

  /* —— Navigation —— */

  function selectHole(index, resetStroke) {
    if (!state.round) return;
    if (index < 0 || index >= state.round.holes.length) return;
    state.holeIndex = index;
    if (resetStroke) {
      // Start with tee revealed if GPS exists
      var strokes = gpsStrokes(state.round.holes[index]);
      state.strokeCursor = strokes.length ? 0 : -1;
    }
    renderScorecard();
    renderMapContent();

    var activeBtn = document.querySelector(
      '.scorecard-cell.hole-num[data-hole-index="' + index + '"]'
    );
    if (activeBtn) {
      activeBtn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }

  function nextStroke() {
    var hole = currentHole();
    var strokes = gpsStrokes(hole);
    if (state.strokeCursor < strokes.length - 1) {
      state.strokeCursor += 1;
      renderMapContent();
      return;
    }
    // Advance to next hole first stroke
    if (state.holeIndex < state.round.holes.length - 1) {
      selectHole(state.holeIndex + 1, true);
    }
  }

  function prevStroke() {
    if (state.strokeCursor > 0) {
      state.strokeCursor -= 1;
      renderMapContent();
      return;
    }
    if (state.strokeCursor === 0) {
      state.strokeCursor = -1;
      renderMapContent();
      return;
    }
    // Jump to previous hole last stroke
    if (state.holeIndex > 0) {
      var prev = state.holeIndex - 1;
      var strokes = gpsStrokes(state.round.holes[prev]);
      state.holeIndex = prev;
      state.strokeCursor = strokes.length ? strokes.length - 1 : -1;
      renderScorecard();
      renderMapContent();
    }
  }

  function nextHole() {
    selectHole(state.holeIndex + 1, true);
  }

  function prevHole() {
    selectHole(state.holeIndex - 1, true);
  }

  /* —— Data load —— */

  function firstGpsHoleIndex(round) {
    for (var i = 0; i < round.holes.length; i++) {
      if (gpsStrokes(round.holes[i]).length) return i;
    }
    return 0;
  }

  function boot(round) {
    state.round = round;
    updateMeta();
    var start = firstGpsHoleIndex(round);
    state.holeIndex = start;
    var strokes = gpsStrokes(round.holes[start]);
    state.strokeCursor = strokes.length ? 0 : -1;
    renderScorecard();
    updateShotMeta();
    updateButtons();

    initMap(function () {
      state.map.resize();
      renderMapContent();
    });
  }

  function fixtureUrl() {
    var params = new URLSearchParams(window.location.search);
    var name = params.get('fixture') || 'sample-round';
    name = name.replace(/[^a-zA-Z0-9_-]/g, '');
    return 'fixtures/' + name + '.json';
  }

  function bindControls() {
    $('btn-next-stroke').addEventListener('click', nextStroke);
    $('btn-prev-stroke').addEventListener('click', prevStroke);
    $('btn-next-hole').addEventListener('click', nextHole);
    $('btn-prev-hole').addEventListener('click', prevHole);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextStroke();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevStroke();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        nextHole();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        prevHole();
      }
    });
  }

  bindControls();

  fetch(fixtureUrl())
    .then(function (res) {
      if (!res.ok) throw new Error('Failed to load fixture');
      return res.json();
    })
    .then(boot)
    .catch(function (err) {
      console.error(err);
      $('meta-course').textContent = 'Could not load round';
      $('meta-sub').textContent = 'Check the share link or try ?fixture=sample-round';
      $('map-empty').classList.add('visible');
      $('map-empty').querySelector('p').textContent =
        'Unable to load replay data.';
    });
})();
