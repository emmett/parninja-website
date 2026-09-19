/**
 * ParNinja /watch — Masters-style hole scanner (scorecard + map tracers).
 * Scan manually or Play to auto-advance strokes through the round.
 */
(function () {
  'use strict';

  var TRAIL_SOURCE = 'hole-trail';
  var TRAIL_LAYER = 'hole-trail-line';
  var TRAIL_OUTLINE = 'hole-trail-outline';
  var POINTS_SOURCE = 'hole-points';
  var POINTS_LAYER = 'hole-points-circle';
  var MS_PER_STROKE = 1600;
  var ESRI_SAT =
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

  var state = {
    round: null,
    holeIndex: 0,
    /** Index of the last revealed GPS stroke (inclusive). -1 = none yet. */
    strokeCursor: -1,
    map: null,
    markers: [],
    playing: false,
    speed: 1,
    playTimer: null,
    /** Hole index the camera was last framed for — reframe only on hole change (app behavior). */
    cameraHoleIndex: -1,
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
        pausePlayback();
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
      secondary.textContent = 'Press Play or scan to reveal shots';
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
    $('btn-prev-stroke').disabled = atFirstStroke && atFirstHole;
    $('btn-next-stroke').disabled = atLastStroke && atLastHole;

    var playBtn = $('btn-play');
    playBtn.textContent = state.playing ? '❚❚ Pause' : '▶ Play';
    playBtn.title = state.playing ? 'Pause' : 'Play round';
    playBtn.setAttribute('aria-label', state.playing ? 'Pause' : 'Play round');
    playBtn.classList.toggle('is-playing', state.playing);
    playBtn.disabled = atLastStroke && atLastHole && !state.playing;

    $('btn-speed').textContent = state.speed + 'x';
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
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [] },
          properties: {},
        },
      });
      map.addLayer({
        id: TRAIL_OUTLINE,
        type: 'line',
        source: TRAIL_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#1b5e20',
          'line-width': 7,
          'line-opacity': 0.85,
        },
      });
      map.addLayer({
        id: TRAIL_LAYER,
        type: 'line',
        source: TRAIL_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': 3.5,
          'line-opacity': 0.98,
        },
      });
    }
    if (!map.getSource(POINTS_SOURCE)) {
      map.addSource(POINTS_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: POINTS_LAYER,
        type: 'circle',
        source: POINTS_SOURCE,
        paint: {
          'circle-radius': 6,
          'circle-color': [
            'case',
            ['==', ['get', 'current'], 1],
            '#c62828',
            '#ffffff',
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#1b5e20',
          'circle-opacity': [
            'case',
            ['==', ['get', 'revealed'], 1],
            1,
            0.35,
          ],
        },
      });
    }
  }

  function setTrail(coords) {
    ensureTrailLayers();
    state.map.getSource(TRAIL_SOURCE).setData({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: coords.length >= 2 ? coords : [],
      },
    });
  }

  function setPoints(strokes, revealedCount, currentIndex) {
    ensureTrailLayers();
    var features = strokes.map(function (stroke, i) {
      return {
        type: 'Feature',
        properties: {
          revealed: i < revealedCount ? 1 : 0,
          current: i === currentIndex ? 1 : 0,
        },
        geometry: {
          type: 'Point',
          coordinates: [stroke.position.longitude, stroke.position.latitude],
        },
      };
    });
    state.map.getSource(POINTS_SOURCE).setData({
      type: 'FeatureCollection',
      features: features,
    });
  }

  /**
   * Frame camera for a hole — matches app round map:
   * fitToCoordinates(path) + heading (bearing first→last).
   * Only call when the hole changes, not on every stroke.
   */
  function frameHoleCamera(strokes, force) {
    var map = state.map;
    if (!map || !strokes.length) return;
    if (!force && state.cameraHoleIndex === state.holeIndex) return;
    state.cameraHoleIndex = state.holeIndex;

    var bearing =
      strokes.length >= 2
        ? PinLabel.bearingDegrees(
            strokes[0].position,
            strokes[strokes.length - 1].position
          )
        : 0;

    if (strokes.length === 1) {
      var only = strokes[0].position;
      map.easeTo({
        center: [only.longitude, only.latitude],
        zoom: 17.2,
        bearing: bearing,
        pitch: 0,
        duration: 400,
      });
      return;
    }

    var bounds = new maplibregl.LngLatBounds();
    strokes.forEach(function (s) {
      bounds.extend([s.position.longitude, s.position.latitude]);
    });

    // Same edgePadding as app fitToCoordinates — fit the path itself, don't inflate deltas
    map.fitBounds(bounds, {
      padding: { top: 80, right: 50, bottom: 80, left: 50 },
      bearing: bearing,
      pitch: 0,
      duration: 400,
      maxZoom: 18.5,
    });
  }

  function makePinElement(stroke, label, isCurrent, isGhost) {
    var stack = document.createElement('div');
    stack.className =
      'pin-stack' +
      (isCurrent ? ' current' : '') +
      (isGhost ? ' ghost' : '');

    var pill = document.createElement('div');
    pill.className = 'pin-pill' + (isCurrent ? ' current' : '');
    if (stroke.lie === 'Sand') pill.classList.add('sand');
    pill.style.backgroundColor = PinLabel.lieColor(stroke.lie);
    pill.textContent = label;

    stack.appendChild(pill);
    return stack;
  }

  function renderMapContent(opts) {
    opts = opts || {};
    var hole = currentHole();
    var strokes = gpsStrokes(hole);
    var empty = $('map-empty');
    clearMarkers();

    if (!strokes.length) {
      setTrail([]);
      setPoints([], 0, -1);
      empty.classList.add('visible');
      updateShotMeta();
      updateButtons();
      return;
    }
    empty.classList.remove('visible');

    var revealedCount = state.strokeCursor < 0 ? 0 : state.strokeCursor + 1;
    var revealed = strokes.slice(0, revealedCount);
    var coords = revealed.map(function (s) {
      return [s.position.longitude, s.position.latitude];
    });
    setTrail(coords);
    setPoints(strokes, revealedCount, state.strokeCursor);

    // Full hole pins: ghosts for not-yet-played, solid for revealed
    strokes.forEach(function (stroke, i) {
      var dist = PinLabel.shotDistanceForStroke(strokes, i);
      var label = PinLabel.getStrokePinLabel(stroke, dist);
      var isRevealed = i < revealedCount;
      var isCurrent = i === state.strokeCursor;
      var el = makePinElement(stroke, label, isCurrent, !isRevealed);

      var marker = new maplibregl.Marker({
        element: el,
        anchor: 'bottom',
        offset: [0, -12],
      })
        .setLngLat([stroke.position.longitude, stroke.position.latitude])
        .addTo(state.map);
      state.markers.push(marker);
    });

    if (opts.reframeCamera) {
      frameHoleCamera(strokes, true);
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
      center: [-116.1648, 43.5912],
      zoom: 15.5,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    state.map = map;

    map.on('load', function () {
      ensureTrailLayers();
      map.resize();
      if (cb) cb();
    });
  }

  /* —— Playback —— */

  function clearPlayTimer() {
    if (state.playTimer) {
      clearTimeout(state.playTimer);
      state.playTimer = null;
    }
  }

  function pausePlayback() {
    state.playing = false;
    clearPlayTimer();
    updateButtons();
  }

  function scheduleNextPlayTick() {
    clearPlayTimer();
    if (!state.playing) return;
    var delay = MS_PER_STROKE / state.speed;
    state.playTimer = setTimeout(function () {
      var advanced = advanceStroke(false);
      if (!advanced) {
        pausePlayback();
        return;
      }
      scheduleNextPlayTick();
    }, delay);
  }

  function togglePlayback() {
    if (state.playing) {
      pausePlayback();
      return;
    }
    var hole = currentHole();
    var strokes = gpsStrokes(hole);
    var atEnd =
      state.holeIndex >= state.round.holes.length - 1 &&
      (strokes.length === 0 || state.strokeCursor >= strokes.length - 1);
    if (atEnd) {
      // Restart from first GPS hole
      var start = firstGpsHoleIndex(state.round);
      selectHole(start, true);
    }
    state.playing = true;
    updateButtons();
    scheduleNextPlayTick();
  }

  function cycleSpeed() {
    state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 4 : 1;
    updateButtons();
    if (state.playing) scheduleNextPlayTick();
  }

  /* —— Navigation —— */

  function selectHole(index, resetStroke) {
    if (!state.round) return;
    if (index < 0 || index >= state.round.holes.length) return;
    var holeChanged = index !== state.holeIndex;
    state.holeIndex = index;
    if (resetStroke) {
      var strokes = gpsStrokes(state.round.holes[index]);
      state.strokeCursor = strokes.length ? 0 : -1;
    }
    renderScorecard();
    renderMapContent({ reframeCamera: holeChanged || resetStroke });

    var activeBtn = document.querySelector(
      '.scorecard-cell.hole-num[data-hole-index="' + index + '"]'
    );
    if (activeBtn) {
      activeBtn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }

  /** @returns {boolean} true if advanced */
  function advanceStroke(fromManual) {
    if (fromManual) pausePlayback();
    var hole = currentHole();
    var strokes = gpsStrokes(hole);
    if (state.strokeCursor < strokes.length - 1) {
      state.strokeCursor += 1;
      // Stay framed on the hole — do not re-zoom per stroke (app behavior)
      renderMapContent({ reframeCamera: false });
      return true;
    }
    if (state.holeIndex < state.round.holes.length - 1) {
      selectHole(state.holeIndex + 1, true);
      return true;
    }
    return false;
  }

  function nextStroke() {
    advanceStroke(true);
  }

  function prevStroke() {
    pausePlayback();
    if (state.strokeCursor > 0) {
      state.strokeCursor -= 1;
      renderMapContent({ reframeCamera: false });
      return;
    }
    if (state.strokeCursor === 0) {
      state.strokeCursor = -1;
      renderMapContent({ reframeCamera: false });
      return;
    }
    if (state.holeIndex > 0) {
      var prev = state.holeIndex - 1;
      var strokes = gpsStrokes(state.round.holes[prev]);
      state.holeIndex = prev;
      state.strokeCursor = strokes.length ? strokes.length - 1 : -1;
      renderScorecard();
      renderMapContent({ reframeCamera: true });
    }
  }

  function nextHole() {
    pausePlayback();
    selectHole(state.holeIndex + 1, true);
  }

  function prevHole() {
    pausePlayback();
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
      renderMapContent({ reframeCamera: true });
    });
  }

  function bindControls() {
    $('btn-next-stroke').addEventListener('click', nextStroke);
    $('btn-prev-stroke').addEventListener('click', prevStroke);
    $('btn-next-hole').addEventListener('click', nextHole);
    $('btn-prev-hole').addEventListener('click', prevHole);
    $('btn-play').addEventListener('click', togglePlayback);
    $('btn-speed').addEventListener('click', cycleSpeed);

    document.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePlayback();
      } else if (e.key === 'ArrowRight') {
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

  ShareCodec.loadRoundFromUrl()
    .then(boot)
    .catch(function (err) {
      console.error(err);
      $('meta-course').textContent = 'Could not load round';
      $('meta-sub').textContent =
        'Use #r=… share link or ?fixture=sample-round';
      $('map-empty').classList.add('visible');
      $('map-empty').querySelector('p').textContent =
        (err && err.message) || 'Unable to load replay data.';
    });
})();
