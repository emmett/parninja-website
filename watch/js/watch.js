/**
 * /watch player — MapLibre shell over @parninja/replay (TF 192).
 * Engine/controller: watch/js/replayEngine.js (generated from app packages/replay).
 */
(function () {
  'use strict';

  var FRAME_MS = ReplayEngine.FRAME_MS || 33;
  var PATH = ReplayEngine.HOLE_PATH_POLYLINE || {
    outline: { color: 'rgba(255,255,255,0.94)', width: 9 },
    main: { color: '#14532d', width: 5 },
  };
  var ESRI_SAT =
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

  var SATELLITE_STYLE = {
    version: 8,
    name: 'parninja-satellite',
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
  };

  var state = {
    round: null,
    timeline: null,
    controller: null,
    map: null,
    mapAdapter: null,
    playTimer: null,
    cameraHoleNumber: null,
    markers: [],
    ballMarker: null,
    puttMarker: null,
    lastHoleNumber: null,
  };

  function ctrlState() {
    return state.controller ? state.controller.getState() : null;
  }

  function syncFromController() {
    var s = ctrlState();
    if (!s) return;
    // Keep aliases used by older helpers during render.
    state.currentTime = s.currentTime;
    state.playing = s.playing;
    state.speed = s.speed;
    state.timeline = s.timeline;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function scoreShapeClass(score, par) {
    if (score == null || par == null) return '';
    var diff = score - par;
    if (diff <= -2) return 'circle';
    if (diff === -1) return 'circle';
    if (diff === 1) return 'square';
    if (diff >= 2) return 'double-square';
    return '';
  }

  function scoreTone(score, par) {
    if (score == null || par == null) return '';
    var diff = score - par;
    if (diff < 0) return 'birdie';
    if (diff > 0) return 'bogey';
    return '';
  }

  function holeByNumber(n) {
    if (!state.round) return null;
    return (
      state.round.holes.find(function (h) {
        return h.holeNumber === n;
      }) || null
    );
  }

  function currentHoleSeg() {
    syncFromController();
    if (!state.timeline) return null;
    return ReplayEngine.getHoleAtTime(state.timeline, state.currentTime);
  }

  function holeStrokeTimes() {
    var seg = currentHoleSeg();
    if (!seg || !state.timeline) return [];
    return ReplayEngine.getHoleStrokeStartTimes(state.timeline, seg.holeNumber);
  }

  function pausePlayback() {
    if (state.controller) state.controller.setPlaying(false);
    syncFromController();
    clearPlayTimer();
    updateButtons();
  }

  function clearPlayTimer() {
    if (state.playTimer) {
      clearInterval(state.playTimer);
      state.playTimer = null;
    }
  }

  function seekTo(ms, opts) {
    opts = opts || {};
    if (!state.controller) return;
    state.controller.seekTo(ms, { pause: !!opts.pause });
    syncFromController();
    if (opts.pause) clearPlayTimer();
    renderFrame();
  }

  function renderScorecard() {
    var el = $('scorecard');
    el.innerHTML = '';
    if (!state.round) return;
    var seg = currentHoleSeg();
    var activeHole = seg ? seg.holeNumber : null;
    var playable = {};
    if (state.timeline) {
      state.timeline.holes.forEach(function (h) {
        playable[h.holeNumber] = true;
      });
    }

    state.round.holes.forEach(function (hole, index) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'scorecard-cell';
      if (hole.holeNumber === activeHole) btn.classList.add('active');
      btn.disabled = !playable[hole.holeNumber];
      btn.setAttribute('data-hole', String(hole.holeNumber));

      var num = document.createElement('span');
      num.className = 'hole-num';
      num.textContent = String(hole.holeNumber);

      var val = document.createElement('span');
      val.className = 'score-val ' + scoreTone(hole.score, hole.par);
      var shape = scoreShapeClass(hole.score, hole.par);
      if (hole.score != null && shape) {
        var wrap = document.createElement('span');
        wrap.className = 'score-shape ' + shape;
        wrap.textContent = String(hole.score);
        val.appendChild(wrap);
      } else {
        val.textContent = hole.score != null ? String(hole.score) : '—';
      }

      btn.appendChild(num);
      btn.appendChild(val);
      btn.addEventListener('click', function () {
        if (!state.timeline) return;
        var target = state.timeline.holes.find(function (h) {
          return h.holeNumber === hole.holeNumber;
        });
        if (!target) return;
        seekTo(target.startMs, { pause: true });
      });
      el.appendChild(btn);

      if (hole.holeNumber === activeHole) {
        btn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  function updateHeader() {
    syncFromController();
    var vm = state.controller
      ? state.controller.getFrameViewModel(state.round)
      : null;
    var seg = vm && vm.holeSegment;
    var hole = seg ? holeByNumber(seg.holeNumber) : null;
    if (seg) {
      var score = hole && hole.score != null ? hole.score : seg.score;
      $('meta-hole').textContent =
        'Hole ' + seg.holeNumber + ' · Par ' + seg.par + ' · ' + score;
    } else {
      $('meta-hole').textContent = '—';
    }

    var scrubber = (vm && vm.scrubber) || {
      label: '—',
      strokeTimes: [],
      activeStrokeIndex: -1,
    };
    $('scrubber-label').textContent = scrubber.label;

    var ticks = $('scrubber-ticks');
    ticks.innerHTML = '';
    scrubber.strokeTimes.forEach(function (t, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className =
        'scrubber-tick' + (i === scrubber.activeStrokeIndex ? ' active' : '');
      b.textContent = String(i + 1);
      b.setAttribute('aria-label', 'Shot ' + (i + 1));
      b.setAttribute(
        'aria-pressed',
        i === scrubber.activeStrokeIndex ? 'true' : 'false'
      );
      b.addEventListener('click', function () {
        seekTo(t, { pause: true });
      });
      ticks.appendChild(b);
    });

    var chip = $('yards-chip');
    var yardsVal = $('yards-value');
    if (vm && vm.yardsRemaining != null) {
      yardsVal.textContent = String(Math.round(vm.yardsRemaining));
      chip.classList.remove('hidden');
    } else {
      chip.classList.add('hidden');
    }
  }

  function updateButtons() {
    syncFromController();
    var playBtn = $('btn-play');
    var playIcon = playBtn.querySelector('.icon-play');
    var pauseIcon = playBtn.querySelector('.icon-pause');
    if (playIcon && pauseIcon) {
      if (state.playing) {
        playIcon.hidden = true;
        pauseIcon.hidden = false;
      } else {
        playIcon.hidden = false;
        pauseIcon.hidden = true;
      }
    }
    playBtn.title = state.playing ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
    $('btn-speed').textContent = state.speed + 'x';

    var vm = state.controller
      ? state.controller.getFrameViewModel(state.round)
      : null;
    $('btn-prev-stroke').disabled = !(vm && vm.canPrevStroke);
    $('btn-next-stroke').disabled = !(vm && vm.canNextStroke);
    $('btn-prev-hole').disabled = !(vm && vm.canPrevHole);
    $('btn-next-hole').disabled = !(vm && vm.canNextHole);
  }

  function clearMarkers() {
    state.markers.forEach(function (m) {
      m.remove();
    });
    state.markers = [];
    if (state.ballMarker) {
      state.ballMarker.remove();
      state.ballMarker = null;
    }
    if (state.puttMarker) {
      state.puttMarker.remove();
      state.puttMarker = null;
    }
    var puttEl = $('putt-overlay');
    if (puttEl) {
      puttEl.innerHTML = '';
      puttEl.classList.add('hidden');
    }
  }

  function setTrailSegments(segments) {
    if (!state.mapAdapter) return;
    state.mapAdapter.setPathSegments(segments || [], {
      outlineColor: PATH.outline.color,
      outlineWidth: PATH.outline.width,
      mainColor: PATH.main.color,
      mainWidth: PATH.main.width,
    });
  }

  function makePinElement(label, lie, selected, offsetSide) {
    var stack = document.createElement('div');
    stack.className = 'pin-stack' + (selected ? ' selected' : '');

    var dot = document.createElement('div');
    dot.className = 'pin-dot';

    var pill = document.createElement('div');
    pill.className = 'pin-pill' + (selected ? ' selected' : '');
    if (lie === 'Sand' && !selected) pill.classList.add('sand');
    if (!selected) pill.style.backgroundColor = PinLabel.lieColor(lie);
    pill.textContent = label;

    var px = PinLabel.pinOffsetPixels(offsetSide || 'up');
    stack.style.setProperty('--pin-ox', px[0] + 'px');
    stack.style.setProperty('--pin-oy', px[1] + 'px');

    stack.appendChild(dot);
    stack.appendChild(pill);
    return stack;
  }

  function buildPuttTrackerEl(tracker) {
    var wrap = document.createElement('div');
    wrap.className = 'putt-tracker';
    var maxFeet = tracker.maxFeet || ReplayEngine.PUTT_TRACKER_MAX_FEET;
    var clamp = function (ft) {
      return Math.max(0, Math.min(1, ft / maxFeet));
    };

    if (tracker.phase === 'result') {
      var result = document.createElement('div');
      result.className = 'putt-tracker-result';
      result.innerHTML =
        '<span class="count">' +
        tracker.puttCount +
        '</span><span class="label">' +
        (tracker.puttCount === 1 ? 'putt' : 'putts') +
        '</span>';
      wrap.appendChild(result);
    } else {
      var title = document.createElement('p');
      title.className = 'putt-tracker-title';
      title.textContent = 'Putting';
      wrap.appendChild(title);
    }

    var row = document.createElement('div');
    row.className = 'putt-track-row';

    var flag = document.createElement('div');
    flag.className = 'putt-flag';
    flag.innerHTML =
      '<div class="putt-flag-pole"></div><div class="putt-flag-cloth"></div><div class="putt-flag-cup"></div>';
    row.appendChild(flag);

    var track = document.createElement('div');
    track.className = 'putt-track';
    track.innerHTML = '<div class="putt-track-line"></div>';

    if (tracker.firstFeet > 0) {
      var f1 = document.createElement('div');
      f1.className = 'putt-frame';
      f1.style.left = clamp(tracker.firstFeet) * 100 + '%';
      f1.innerHTML =
        '<div class="putt-frame-box">' +
        Math.round(tracker.firstFeet) +
        "'</div><div class=\"putt-frame-point\"></div>";
      track.appendChild(f1);
    }
    if (tracker.puttCount > 1 && tracker.secondFeet > 0) {
      var f2 = document.createElement('div');
      f2.className = 'putt-frame';
      f2.style.left = clamp(tracker.secondFeet) * 100 + '%';
      f2.innerHTML =
        '<div class="putt-frame-box">' +
        Math.round(tracker.secondFeet) +
        "'</div><div class=\"putt-frame-point\"></div>";
      track.appendChild(f2);
    }
    if (tracker.phase === 'track') {
      var dot = document.createElement('div');
      dot.className = 'putt-dot';
      dot.style.left = clamp(tracker.currentFeet) * 100 + '%';
      track.appendChild(dot);
    }
    row.appendChild(track);

    var end = document.createElement('div');
    end.className = 'putt-scale-end';
    end.textContent = maxFeet + "'";
    row.appendChild(end);

    wrap.appendChild(row);
    return wrap;
  }

  function mapChromePadding(extraTop) {
    var wrap = document.querySelector('.watch-map-wrap');
    var h = wrap ? wrap.clientHeight : 600;
    var w = wrap ? wrap.clientWidth : 400;
    var inset = ReplayEngine.MAP_VIEWPORT_SAFE_INSET || 0.18;
    return {
      top: Math.max(extraTop || 24, Math.round(h * inset * 0.5)),
      bottom: Math.max(150, Math.round(h * inset) + 80),
      left: Math.max(28, Math.round(w * inset * 0.5)),
      right: Math.max(28, Math.round(w * inset * 0.5)),
    };
  }

  /** Hole frame: tee + green + swing GPS with shared safe-inset region. */
  function frameHoleCamera(holeNumber, force) {
    if (!state.mapAdapter || !state.timeline) return;
    if (!force && state.cameraHoleNumber === holeNumber) return;
    state.cameraHoleNumber = holeNumber;

    var hole = holeByNumber(holeNumber);
    var region = ReplayEngine.getHoleCameraRegion(state.timeline, holeNumber, hole);
    if (!region) return;
    // App animateToRegion(region) only — region already includes MAP_VIEWPORT_SAFE_INSET.
    // Extra chrome padding accounts for web scorecard/transport overlays.
    state.mapAdapter.fitRegion(region, {
      animated: true,
      padding: mapChromePadding(24),
    });
  }

  function showPuttOverlay(tracker) {
    var el = $('putt-overlay');
    if (!el) return;
    el.innerHTML = '';
    el.appendChild(buildPuttTrackerEl(tracker));
    el.classList.remove('hidden');
  }

  function renderFrame() {
    if (!state.map || !state.controller) return;
    syncFromController();
    var frame = ReplayEngine.getFrameAtTime(state.timeline, state.currentTime);
    var seg = currentHoleSeg();
    var holeNumber = seg ? seg.holeNumber : null;

    if (holeNumber != null && holeNumber !== state.lastHoleNumber) {
      if (state.lastHoleNumber != null && state.mapAdapter) {
        state.mapAdapter.clearHoleOverlays();
      }
      state.lastHoleNumber = holeNumber;
      state.cameraMode = null;
      frameHoleCamera(holeNumber, true);
      renderScorecard();
    }

    updateHeader();
    updateButtons();

    var empty = $('map-empty');
    if (!frame || holeNumber == null) {
      clearMarkers();
      setTrailSegments([]);
      empty.classList.add('visible');
      return;
    }
    empty.classList.remove('visible');

    var segments = ReplayEngine.getReplayPathSegments(
      state.timeline,
      state.currentTime
    ).filter(function (s) {
      return s.kind === 'swing' && s.holeNumber === holeNumber && s.coordinates.length >= 2;
    });
    setTrailSegments(segments);

    clearMarkers();

    var pins = ReplayEngine.getReplayPins(state.timeline, state.currentTime).filter(
      function (p) {
        return p.holeNumber === holeNumber;
      }
    );
    var positions = pins.map(function (p) {
      return p.position;
    });
    var offsets = PinLabel.mapPinOffsetsForCrowd(positions);
    var selectedStroke = frame.strokeNumber;

    pins.forEach(function (pin, i) {
      var selected = pin.strokeNumber === selectedStroke;
      var el = makePinElement(
        pin.pinLabel || pin.club || '',
        pin.lie,
        selected,
        offsets[i]
      );
      var marker = new maplibregl.Marker({
        element: el,
        anchor: 'center',
        offset: [0, 0],
      })
        .setLngLat([pin.position.longitude, pin.position.latitude])
        .addTo(state.map);
      state.markers.push(marker);
    });

    if (frame.position) {
      var ballEl = document.createElement('div');
      ballEl.className = 'ball-marker';
      state.ballMarker = new maplibregl.Marker({
        element: ballEl,
        anchor: 'center',
      })
        .setLngLat([frame.position.longitude, frame.position.latitude])
        .addTo(state.map);
    }

    // Match app: keep hole framing during putts; putt chrome is a screen overlay.
    if (frame.pathKind === 'putt' && frame.puttTracker) {
      showPuttOverlay(frame.puttTracker);
    }
  }

  function schedulePlay() {
    clearPlayTimer();
    syncFromController();
    if (!state.playing || !state.controller) return;
    state.playTimer = setInterval(function () {
      var cont = state.controller.playTick();
      syncFromController();
      renderFrame();
      if (!cont) clearPlayTimer();
    }, FRAME_MS);
  }

  function togglePlayback() {
    if (!state.controller) return;
    syncFromController();
    if (state.playing) {
      pausePlayback();
      return;
    }
    if (state.currentTime >= state.timeline.duration) {
      state.controller.seekTo(0);
    }
    state.controller.setPlaying(true);
    syncFromController();
    updateButtons();
    schedulePlay();
  }

  function cycleSpeed() {
    if (!state.controller) return;
    state.controller.cycleSpeed();
    syncFromController();
    updateButtons();
    if (state.playing) schedulePlay();
  }

  function skipNextStroke() {
    if (!state.controller) return;
    state.controller.nextStroke();
    syncFromController();
    clearPlayTimer();
    renderFrame();
  }

  function skipPrevStroke() {
    if (!state.controller) return;
    state.controller.prevStroke();
    syncFromController();
    clearPlayTimer();
    renderFrame();
  }

  function skipNextHole() {
    if (!state.controller) return;
    state.controller.nextHole();
    syncFromController();
    clearPlayTimer();
    renderFrame();
  }

  function skipPrevHole() {
    if (!state.controller) return;
    state.controller.prevHole();
    syncFromController();
    clearPlayTimer();
    renderFrame();
  }

  function bindControls() {
    $('btn-play').addEventListener('click', togglePlayback);
    $('btn-speed').addEventListener('click', cycleSpeed);
    $('btn-next-stroke').addEventListener('click', skipNextStroke);
    $('btn-prev-stroke').addEventListener('click', skipPrevStroke);
    $('btn-next-hole').addEventListener('click', skipNextHole);
    $('btn-prev-hole').addEventListener('click', skipPrevHole);

    document.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePlayback();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        skipNextStroke();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        skipPrevStroke();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        skipNextHole();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        skipPrevHole();
      }
    });
  }

  function initMap(cb) {
    var map = new maplibregl.Map({
      container: 'watch-map',
      style: SATELLITE_STYLE,
      center: [-116.1648, 43.5912],
      zoom: 15.5,
      attributionControl: true,
    });
    state.map = map;
    state.mapAdapter = MapLibreReplayAdapter.create(map, {
      onClear: clearMarkers,
    });
    map.on('load', function () {
      // Warm path layers via empty segments
      setTrailSegments([]);
      map.resize();
      if (cb) cb();
    });
  }

  function boot(doc) {
    var normalized = ReplayEngine.normalizeRoundForReplay(doc);
    state.round = normalized;
    state.timeline = ReplayEngine.buildRoundReplayTimeline(normalized);
    state.controller = ReplayEngine.createReplayController(state.timeline);
    syncFromController();
    state.cameraHoleNumber = null;
    state.cameraMode = null;
    state.lastHoleNumber = null;

    var meta = normalized.meta || {};
    $('meta-course').textContent = meta.course || 'Shared round';
    var bits = [];
    if (meta.tees) bits.push(meta.tees + (/\btees?\b/i.test(meta.tees) ? '' : ' tees'));
    if (meta.datePlayed) bits.push(formatDate(meta.datePlayed));
    if (meta.playerDisplayName) bits.push(meta.playerDisplayName);
    var durationEl = $('meta-duration');
    if (bits.length) {
      durationEl.textContent = bits.join(' · ');
      durationEl.hidden = false;
      $('meta-course').title = bits.join(' · ');
    } else {
      durationEl.textContent = '';
      durationEl.hidden = true;
    }

    var cta = $('cta-app');
    if (typeof APP_STORE_URL === 'string' && APP_STORE_URL) {
      cta.href = APP_STORE_URL;
    } else {
      cta.href = '../';
    }

    if (!state.timeline.frames.length) {
      $('map-empty').classList.add('visible');
      $('meta-hole').textContent = bits.join(' · ') || 'No GPS Data';
      renderScorecard();
      updateButtons();
      return;
    }

    function start() {
      renderScorecard();
      renderFrame();
      var firstSeg = state.timeline.holes[0];
      if (firstSeg) frameHoleCamera(firstSeg.holeNumber, true);
    }

    if (state.map && state.map.loaded()) start();
    else initMap(start);
  }

  bindControls();

  ShareCodec.loadRoundFromUrl()
    .then(function (doc) {
      try {
        boot(doc);
      } catch (err) {
        console.error(err);
        $('meta-course').textContent = 'Could not load round';
        var dur = $('meta-duration');
        if (dur) {
          dur.hidden = false;
          dur.textContent = (err && err.message) || 'Unable to load replay data.';
        }
        $('meta-hole').textContent = 'Use #r=… share link or ?fixture=sample-round';
        $('map-empty').classList.add('visible');
        $('map-empty').querySelector('p').textContent =
          (err && err.message) || 'Unable to load replay data.';
      }
    })
    .catch(function (err) {
      console.error(err);
      $('meta-course').textContent = 'Could not load round';
      var dur = $('meta-duration');
      if (dur) {
        dur.hidden = false;
        dur.textContent = (err && err.message) || 'Unable to load replay data.';
      }
      $('meta-hole').textContent = 'Use #r=… share link or ?fixture=sample-round';
      $('map-empty').classList.add('visible');
      $('map-empty').querySelector('p').textContent =
        (err && err.message) || 'Unable to load replay data.';
    });
})();
