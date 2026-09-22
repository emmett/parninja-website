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

  /** Putts on green — matches ExpandedMicroScorecard.getPutts. */
  function getPutts(hole) {
    if (!hole || !hole.strokes || !hole.strokes.length) return 0;
    var putts = 0;
    hole.strokes.forEach(function (stroke) {
      if (stroke.club !== 'PU' || stroke.lie !== 'Green') return;
      putts += stroke.strokeCount != null ? stroke.strokeCount : 1;
    });
    return putts;
  }

  function holeScore(hole) {
    if (!hole) return null;
    if (hole.blowup) return (hole.par || 0) * 2;
    if (hole.score != null) return hole.score;
    return null;
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

    var byNumber = {};
    state.round.holes.forEach(function (hole) {
      byNumber[hole.holeNumber] = hole;
    });

    function makeHoleCell(holeNumber) {
      var hole = byNumber[holeNumber];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'scorecard-cell';
      if (holeNumber === activeHole) btn.classList.add('active');
      btn.disabled = !hole || !playable[holeNumber];
      btn.setAttribute('data-hole', String(holeNumber));

      var num = document.createElement('span');
      num.className = 'hole-num';
      num.textContent = String(holeNumber);
      btn.appendChild(num);

      var parEl = document.createElement('span');
      parEl.className = 'hole-par';
      parEl.textContent = hole && hole.par != null ? String(hole.par) : '—';
      btn.appendChild(parEl);

      var score = hole ? holeScore(hole) : null;
      var putts = hole ? getPutts(hole) : 0;

      var scoreWrap = document.createElement('span');
      scoreWrap.className = 'score-stack';

      var val = document.createElement('span');
      val.className = 'score-val ' + scoreTone(score, hole && hole.par);
      var shape = scoreShapeClass(score, hole && hole.par);
      if (score != null && shape) {
        var shapeEl = document.createElement('span');
        shapeEl.className = 'score-shape ' + shape;
        shapeEl.textContent = String(score);
        val.appendChild(shapeEl);
      } else {
        val.textContent = score != null ? String(score) : '—';
      }
      scoreWrap.appendChild(val);

      var puttsEl = document.createElement('span');
      puttsEl.className = 'hole-putts';
      puttsEl.textContent = score != null ? String(putts) : '—';
      scoreWrap.appendChild(puttsEl);

      btn.appendChild(scoreWrap);

      btn.addEventListener('click', function () {
        if (!state.timeline) return;
        var target = state.timeline.holes.find(function (h) {
          return h.holeNumber === holeNumber;
        });
        if (!target) return;
        seekTo(target.startMs, { pause: true });
      });
      return btn;
    }

    function makeTotalCell(holes, label) {
      var played = holes.filter(function (hole) {
        return hole && (holeScore(hole) != null || (hole.strokes && hole.strokes.length));
      });
      var totalPar = played.reduce(function (sum, hole) {
        return sum + (hole.par || 0);
      }, 0);
      var totalScore = played.reduce(function (sum, hole) {
        return sum + (holeScore(hole) || 0);
      }, 0);
      var totalPutts = played.reduce(function (sum, hole) {
        return sum + getPutts(hole);
      }, 0);
      var net = totalScore - totalPar;

      var cell = document.createElement('div');
      cell.className = 'scorecard-total';
      cell.setAttribute('aria-label', label + ' total');

      var labelEl = document.createElement('span');
      labelEl.className = 'total-label';
      labelEl.textContent = label;
      cell.appendChild(labelEl);

      var parEl = document.createElement('span');
      parEl.className = 'total-par';
      parEl.textContent = played.length ? String(totalPar) : '—';
      cell.appendChild(parEl);

      var scoreEl = document.createElement('span');
      scoreEl.className = 'total-score';
      scoreEl.textContent = played.length ? String(totalScore) : '—';
      cell.appendChild(scoreEl);

      var puttsEl = document.createElement('span');
      puttsEl.className = 'total-putts';
      puttsEl.textContent = played.length ? String(totalPutts) : '—';
      cell.appendChild(puttsEl);

      var netEl = document.createElement('span');
      netEl.className =
        'total-net' +
        (played.length ? (net > 0 ? ' over' : net < 0 ? ' under' : '') : '');
      netEl.textContent = played.length
        ? (net > 0 ? '+' : '') + String(net)
        : '—';
      cell.appendChild(netEl);

      return cell;
    }

    function renderRow(start, end, totalLabel) {
      var row = document.createElement('div');
      row.className = 'scorecard-row';
      var holes = [];
      for (var n = start; n <= end; n++) {
        row.appendChild(makeHoleCell(n));
        if (byNumber[n]) holes.push(byNumber[n]);
      }
      row.appendChild(makeTotalCell(holes, totalLabel));
      return row;
    }

    el.appendChild(renderRow(1, 9, 'Out'));
    el.appendChild(renderRow(10, 18, 'In'));

    if (activeHole != null) {
      var activeBtn = el.querySelector(
        '.scorecard-cell[data-hole="' + activeHole + '"]'
      );
      if (activeBtn) {
        activeBtn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  function appStoreUrl() {
    var cfg =
      typeof window.SITE_CONFIG === 'object' && window.SITE_CONFIG
        ? window.SITE_CONFIG
        : null;
    var app = cfg && cfg.apps && cfg.apps[0];
    if (app && typeof app.iosUrl === 'string' && app.iosUrl) return app.iosUrl;
    if (typeof APP_STORE_URL === 'string' && APP_STORE_URL) return APP_STORE_URL;
    return '../';
  }

  function wireBrandLink() {
    var link = $('brand-link');
    if (!link) return;
    // No in-app deeplink yet — send visitors to the App Store (or site).
    link.href = appStoreUrl();
    if (/^https?:/i.test(link.href)) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    } else {
      link.removeAttribute('target');
      link.removeAttribute('rel');
    }
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
      var tickFrame = state.timeline
        ? ReplayEngine.getFrameAtTime(state.timeline, t)
        : null;
      var isPutt = tickFrame && tickFrame.pathKind === 'putt';
      var tickLabel = isPutt ? 'PU' : String(i + 1);
      var penalty =
        tickFrame && tickFrame.penalty > 0 ? Math.round(tickFrame.penalty) : 0;

      var b = document.createElement('button');
      b.type = 'button';
      b.className =
        'scrubber-tick' + (i === scrubber.activeStrokeIndex ? ' active' : '');
      b.textContent = tickLabel;
      if (penalty > 0) {
        var badge = document.createElement('span');
        badge.className = 'penalty-badge';
        badge.textContent = '+' + penalty;
        badge.setAttribute('aria-hidden', 'true');
        b.appendChild(badge);
      }
      b.setAttribute(
        'aria-label',
        penalty > 0
          ? 'Shot ' +
              (i + 1) +
              ', ' +
              penalty +
              ' penalty stroke' +
              (penalty === 1 ? '' : 's')
          : isPutt
            ? 'Putting'
            : 'Shot ' + (i + 1)
      );
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

  function makePinElement(label, lie, selected, offsetSide, penalty) {
    var stack = document.createElement('div');
    stack.className = 'pin-stack' + (selected ? ' selected' : '');

    var dot = document.createElement('div');
    dot.className = 'pin-dot';

    var pillWrap = document.createElement('div');
    pillWrap.className = 'pin-pill-wrap';

    var pill = document.createElement('div');
    pill.className = 'pin-pill' + (selected ? ' selected' : '');
    if (lie === 'Sand' && !selected) pill.classList.add('sand');
    if (!selected) pill.style.backgroundColor = PinLabel.lieColor(lie);
    pill.textContent = label;
    pillWrap.appendChild(pill);

    var penaltyCount = Math.round(penalty || 0);
    if (penaltyCount > 0) {
      var badge = document.createElement('span');
      badge.className = 'penalty-badge pin-penalty';
      badge.textContent = '+' + penaltyCount;
      badge.setAttribute('aria-hidden', 'true');
      pillWrap.appendChild(badge);
    }

    var px = PinLabel.pinOffsetPixels(offsetSide || 'up');
    stack.style.setProperty('--pin-ox', px[0] + 'px');
    stack.style.setProperty('--pin-oy', px[1] + 'px');

    stack.appendChild(dot);
    stack.appendChild(pillWrap);
    return stack;
  }

  function buildPuttTrackerEl(tracker) {
    var wrap = document.createElement('div');
    wrap.className = 'putt-tracker';
    // App: scale max = 1.5× first putt (puttTrackerMaxFeet).
    var maxFeet =
      tracker.maxFeet ||
      (ReplayEngine.puttTrackerMaxFeet
        ? ReplayEngine.puttTrackerMaxFeet(tracker.firstFeet || 0)
        : Math.max(1, Math.round((tracker.firstFeet || 0) * 1.5)));
    var clamp = function (ft) {
      return maxFeet <= 0 ? 0 : Math.max(0, Math.min(1, ft / maxFeet));
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
    if (tracker.phase === 'track' || tracker.phase === 'trackSecond') {
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

  function mapChromePadding() {
    var wrap = document.querySelector('.watch-map-wrap');
    var h = wrap ? wrap.clientHeight : 600;
    var w = wrap ? wrap.clientWidth : 400;
    // Chrome is off-map; region uses safeInset 0.08. Light pad for yards/putt card only.
    var side = Math.max(12, Math.round(w * 0.03));
    return {
      top: Math.max(12, Math.round(h * 0.04)),
      bottom: Math.max(12, Math.round(h * 0.04)),
      left: side,
      right: side,
    };
  }

  /** Hole frame: tee + green + swing GPS. Replay chrome is off-map → inset 0.08. */
  var REPLAY_MAP_SAFE_INSET = 0.08;

  function frameHoleCamera(holeNumber, force, opts) {
    if (!state.mapAdapter || !state.map || !state.timeline) return;
    opts = opts || {};
    if (!force && state.cameraHoleNumber === holeNumber) return;
    state.cameraHoleNumber = holeNumber;

    state.map.resize();

    var hole = holeByNumber(holeNumber);
    var region = ReplayEngine.getHoleCameraRegion(
      state.timeline,
      holeNumber,
      hole,
      { safeInset: REPLAY_MAP_SAFE_INSET }
    );
    if (!region) return;
    state.mapAdapter.fitRegion(region, {
      animated: opts.animated !== false,
      padding: mapChromePadding(),
    });
  }

  function scheduleReframe(animated) {
    var seg = currentHoleSeg();
    if (!seg) return;
    frameHoleCamera(seg.holeNumber, true, { animated: animated !== false });
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
      renderScorecard();
      // Scorecard height affects map box — frame after layout.
      requestAnimationFrame(function () {
        frameHoleCamera(holeNumber, true);
      });
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
        offsets[i],
        pin.penalty
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

    // Keep stable full-hole framing; putt chrome is a light top overlay only.
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

    // Dock layout changes map height — resize canvas only (refit on hole change).
    var resizeTimer = null;
    function onMapBoxChange() {
      if (state.map) state.map.resize();
      clearTimeout(resizeTimer);
      // One soft reframe after layout settles so first paint / rotate stays framed.
      // Contract: primary refit is hole change; this is web dock / orientation only.
      resizeTimer = setTimeout(function () {
        scheduleReframe(false);
      }, 80);
    }
    window.addEventListener('resize', onMapBoxChange);
    if (typeof ResizeObserver !== 'undefined') {
      var wrap = document.querySelector('.watch-map-wrap');
      if (wrap) {
        var lastH = 0;
        var ro = new ResizeObserver(function (entries) {
          var h = entries[0] && entries[0].contentRect
            ? entries[0].contentRect.height
            : 0;
          if (Math.abs(h - lastH) < 2) return;
          lastH = h;
          onMapBoxChange();
        });
        ro.observe(wrap);
      }
    }
  }

  function boot(doc) {
    var normalized = ReplayEngine.normalizeRoundForReplay(doc);
    state.round = normalized;
    state.timeline = ReplayEngine.buildRoundReplayTimeline(normalized);
    state.controller = ReplayEngine.createReplayController(state.timeline);
    syncFromController();
    state.cameraHoleNumber = null;
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

    wireBrandLink();

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
      // Scorecard dock settles map height — reframe after layout.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          scheduleReframe(false);
        });
      });
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
