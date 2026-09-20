/**
 * Share codec: decode #r= blobs into a watch round document.
 *
 * Supported payloads (after base64url → optional gzip / raw DEFLATE):
 *   - v2 pack JSON: { v:2, m, C, L, h }  (app share format)
 *   - compact text: "2|course|tees|date|clubs|H...|T0|..."
 *   - compact binary: first byte === 2
 *   - verbose / slim JSON watch docs (v:1)
 */
(function (global) {
  'use strict';

  var LIE_FROM_CHAR = {
    T: 'Tee',
    F: 'Fairway',
    R: 'Rough',
    S: 'Sand',
    G: 'Green',
    X: 'Recovery',
  };
  var TEE_FROM_SHORT = {
    W: 'Whites',
    B: 'Blues',
    R: 'Reds',
    G: 'Golds',
    Y: 'Yellows',
    BK: 'Blacks',
    CH: 'Championship',
  };
  var CLUB_IX = '0123456789abcdefghijklmnopqrstuvwxyz';

  function b64UrlDecode(str) {
    if (!str || typeof str !== 'string') {
      throw new Error('Empty share blob');
    }
    // Strip whitespace/newlines messengers sometimes insert.
    var s = str.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin;
    try {
      bin = atob(s);
    } catch (e) {
      throw new Error('Share link looks truncated or corrupted');
    }
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function decompress(bytes, format) {
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('DecompressionStream not available'));
    }
    var ds = new DecompressionStream(format);
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (buf) {
      return new Uint8Array(buf);
    });
  }

  function inflateRaw(bytes) {
    return decompress(bytes, 'deflate-raw');
  }

  function inflateGzip(bytes) {
    return decompress(bytes, 'gzip');
  }

  function bytesToUtf8(bytes) {
    return new TextDecoder('utf-8').decode(bytes);
  }

  function fromMicro(m) {
    return m / 1e6;
  }

  function parseCompactText(text) {
    var parts = text.split('|');
    if (parts[0] !== '2') {
      throw new Error('Unsupported compact version: ' + parts[0]);
    }
    var meta = {
      course: parts[1] || '',
      tees: parts[2] || '',
      datePlayed: parts[3] || '',
    };
    var clubs = (parts[4] || '').split(',').filter(Boolean);
    var holes = [];
    var holeNumber = 0;
    var current = null;
    var prevLat = 0;
    var prevLng = 0;

    function finishHole() {
      if (current) holes.push(current);
      current = null;
    }

    for (var i = 5; i < parts.length; i++) {
      var tok = parts[i];
      if (!tok) continue;

      if (tok.charAt(0) === 'H') {
        finishHole();
        holeNumber += 1;
        var body = tok.slice(1).split(',');
        // Hpar,score  OR  Hpar,score,lat0,lng0,gΔlat,gΔlng
        var par = parseInt(body[0], 10) || 0;
        var score = parseInt(body[1], 10);
        current = {
          holeNumber: holeNumber,
          par: par,
          score: Number.isFinite(score) ? score : null,
          strokes: [],
        };
        if (body.length >= 6) {
          var oLat = fromMicro(parseInt(body[2], 10));
          var oLng = fromMicro(parseInt(body[3], 10));
          var gDlat = parseInt(body[4], 10) || 0;
          var gDlng = parseInt(body[5], 10) || 0;
          prevLat = oLat;
          prevLng = oLng;
          current.greenPosition = {
            latitude: oLat + fromMicro(gDlat),
            longitude: oLng + fromMicro(gDlng),
          };
          // first stroke emitted separately as T0 / etc.
        }
        continue;
      }

      if (!current) {
        throw new Error('Stroke token before hole header: ' + tok);
      }

      // LieChar + clubIx [:dlat,dlng] [*puttCount] [+penalty]
      var m = tok.match(/^([TFRSGX\?])([0-9a-z])(?::(-?\d+),(-?\d+))?(?:\*(\d+))?(?:\+(\d+))?$/);
      if (!m) {
        throw new Error('Bad stroke token: ' + tok);
      }
      var lie = LIE_FROM_CHAR[m[1]] || 'Fairway';
      var clubIdx = CLUB_IX.indexOf(m[2]);
      var club = clubs[clubIdx] || '?';
      var lat;
      var lng;
      if (m[3] != null) {
        lat = prevLat + fromMicro(parseInt(m[3], 10));
        lng = prevLng + fromMicro(parseInt(m[4], 10));
      } else {
        // first stroke of hole — origin already set from H header
        lat = prevLat;
        lng = prevLng;
      }
      prevLat = lat;
      prevLng = lng;

      var stroke = {
        club: club,
        lie: lie,
        position: { latitude: lat, longitude: lng },
      };
      if (m[5]) stroke.strokeCount = parseInt(m[5], 10);
      else if (club === 'PU') stroke.strokeCount = 1;
      if (m[6]) stroke.penalty = parseInt(m[6], 10);

      current.strokes.push(stroke);
    }
    finishHole();

    return { v: 1, meta: meta, holes: holes };
  }

  function readU8(view, o) {
    return view.getUint8(o.i++);
  }
  function readI16(view, o) {
    var v = view.getInt16(o.i, false);
    o.i += 2;
    return v;
  }
  function readI32(view, o) {
    var v = view.getInt32(o.i, false);
    o.i += 4;
    return v;
  }
  function readBytes(view, o, n) {
    var a = new Uint8Array(view.buffer, view.byteOffset + o.i, n);
    o.i += n;
    return a;
  }

  function parseCompactBin(bytes) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var o = { i: 0 };
    var ver = readU8(view, o);
    if (ver !== 2) throw new Error('Unsupported compact-bin version: ' + ver);

    var metaLen = readU8(view, o);
    var metaStr = bytesToUtf8(readBytes(view, o, metaLen));
    var metaParts = metaStr.split('|');
    var meta = {
      course: metaParts[0] || '',
      tees: metaParts[1] || '',
      datePlayed: metaParts[2] || '',
    };

    var nClubs = readU8(view, o);
    var clubs = [];
    for (var c = 0; c < nClubs; c++) {
      var cl = readU8(view, o);
      clubs.push(bytesToUtf8(readBytes(view, o, cl)));
    }

    var nHoles = readU8(view, o);
    var holes = [];
    for (var h = 0; h < nHoles; h++) {
      var par = readU8(view, o);
      var score = readU8(view, o);
      var flags = readU8(view, o);
      var hasGps = (flags & 1) !== 0;
      var hasGreen = (flags & 2) !== 0;
      var hole = {
        holeNumber: h + 1,
        par: par,
        score: score,
        strokes: [],
      };
      if (!hasGps) {
        holes.push(hole);
        continue;
      }
      var oLat = fromMicro(readI32(view, o));
      var oLng = fromMicro(readI32(view, o));
      var gDlat = readI16(view, o);
      var gDlng = readI16(view, o);
      if (hasGreen) {
        hole.greenPosition = {
          latitude: oLat + fromMicro(gDlat),
          longitude: oLng + fromMicro(gDlng),
        };
      }
      var nStrokes = readU8(view, o);
      var prevLat = oLat;
      var prevLng = oLng;
      for (var s = 0; s < nStrokes; s++) {
        var packed = readU8(view, o);
        var clubIdx = (packed >> 3) & 0x1f;
        var lieIdx = packed & 0x07;
        var lies = ['Tee', 'Fairway', 'Rough', 'Sand', 'Green', 'Recovery'];
        var lat = prevLat;
        var lng = prevLng;
        if (s > 0) {
          lat = prevLat + fromMicro(readI16(view, o));
          lng = prevLng + fromMicro(readI16(view, o));
        }
        var extras = readU8(view, o);
        var puttCount = extras & 0x0f;
        var penalty = (extras >> 4) & 0x0f;
        var stroke = {
          club: clubs[clubIdx] || '?',
          lie: lies[lieIdx] || 'Fairway',
          position: { latitude: lat, longitude: lng },
        };
        if (stroke.club === 'PU') stroke.strokeCount = puttCount || 1;
        else if (puttCount > 1) stroke.strokeCount = puttCount;
        if (penalty) stroke.penalty = penalty;
        hole.strokes.push(stroke);
        prevLat = lat;
        prevLng = lng;
      }
      holes.push(hole);
    }

    return { v: 1, meta: meta, holes: holes };
  }

  function looksLikeUtf8Text(bytes) {
    if (!bytes.length) return false;
    // printable / newlines
    var sample = Math.min(bytes.length, 32);
    for (var i = 0; i < sample; i++) {
      var b = bytes[i];
      if (b === 9 || b === 10 || b === 13) continue;
      if (b < 32 || b > 126) return false;
    }
    return true;
  }

  function fromE5(n) {
    return n / 1e5;
  }

  function expandTee(t) {
    if (!t) return '';
    if (TEE_FROM_SHORT[t]) return TEE_FROM_SHORT[t];
    return t;
  }

  function expandDate(d) {
    if (!d) return '';
    var s = String(d);
    if (/^\d{8}$/.test(s)) {
      return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
    }
    return s;
  }

  /**
   * App share pack v2:
   *   { v:2, m:[course,tees,YYYYMMDD], C:[clubs], L:["T","F",...], h:[
   *     [par, [teeLatE5,teeLngE5], [greenLatE5,greenLngE5], strokes]
   *   ] }
   * Stroke rows:
   *   first: [c] | [c, penalty] at tee (lie Tee)
   *          [c, lie] | [c, lie, penalty] if not from Tee
   *   later: [c, lie, dlat, dlng] (+ optional penalty)
   *   green putt: [c, G, puttCount, firstPuttFeet] — position = green
   */
  function parseV2Pack(doc) {
    var clubs = doc.C || [];
    var lieChars = doc.L || ['T', 'F', 'R', 'S', 'G', 'X'];
    var m = doc.m || [];
    var meta = {
      course: m[0] || '',
      tees: expandTee(m[1] || ''),
      datePlayed: expandDate(m[2] || ''),
    };
    var holes = [];
    var rows = doc.h || [];

    for (var hi = 0; hi < rows.length; hi++) {
      var row = rows[hi];
      var par = row[0] | 0;
      var tee = row[1];
      var green = row[2];
      var packed = row[3] || [];
      var teeLat = fromE5(tee[0]);
      var teeLng = fromE5(tee[1]);
      var greenLat = fromE5(green[0]);
      var greenLng = fromE5(green[1]);
      var prevLat = teeLat;
      var prevLng = teeLng;
      var strokes = [];
      var score = 0;

      for (var si = 0; si < packed.length; si++) {
        var s = packed[si];
        var club = clubs[s[0]] || '?';
        var lie;
        var lat;
        var lng;
        var penalty = 0;
        var strokeCount = null;
        var firstPuttDistance = null;
        var lastPuttDistance = null;

        if (si === 0) {
          // [c] | [c, pen] at Tee; [c, lie] | [c, lie, pen] otherwise
          if (s.length === 1) {
            lie = 'Tee';
          } else if (s.length === 2) {
            // Spec: [c, p] penalty on tee. Non-tee first shots use [c, lie, …]
            // Ambiguous when lie index == typical penalty (1); prefer penalty@Tee.
            lie = 'Tee';
            penalty = s[1] | 0;
          } else {
            lie = LIE_FROM_CHAR[lieChars[s[1]]] || 'Fairway';
            penalty = s[2] | 0;
          }
          lat = teeLat;
          lng = teeLng;
        } else {
          var lieIx = s[1] | 0;
          lie = LIE_FROM_CHAR[lieChars[lieIx]] || 'Fairway';
          var isPutt = club === 'PU' && lie === 'Green';
          if (isPutt) {
            // [c, G, puttCount, firstPuttFeet] optionally + lastPuttFeet (not penalty)
            strokeCount = Math.max(1, s[2] | 0);
            firstPuttDistance = (s[3] | 0) / 3; // feet → yards
            lat = greenLat;
            lng = greenLng;
            if (strokeCount > 1 && s.length > 4 && (s[4] | 0) > 0) {
              lastPuttDistance = (s[4] | 0) / 3;
            }
          } else {
            lat = prevLat + fromE5(s[2] | 0);
            lng = prevLng + fromE5(s[3] | 0);
            if (s.length > 4) penalty = s[4] | 0;
          }
        }

        var stroke = {
          club: club,
          lie: lie,
          position: { latitude: lat, longitude: lng },
        };
        if (strokeCount != null) stroke.strokeCount = strokeCount;
        if (firstPuttDistance != null) stroke.firstPuttDistance = firstPuttDistance;
        if (lastPuttDistance != null) stroke.lastPuttDistance = lastPuttDistance;
        if (penalty) stroke.penalty = penalty;

        var add = strokeCount != null ? strokeCount : 1;
        score += add + penalty;

        strokes.push(stroke);
        prevLat = lat;
        prevLng = lng;
      }

      holes.push({
        holeNumber: hi + 1,
        par: par,
        score: score,
        greenPosition: { latitude: greenLat, longitude: greenLng },
        strokes: strokes,
      });
    }

    return { v: 1, meta: meta, holes: holes };
  }

  function parsePayloadBytes(bytes) {
    if (bytes[0] === 2 && !looksLikeUtf8Text(bytes)) {
      return parseCompactBin(bytes);
    }
    var text = bytesToUtf8(bytes).trim();
    if (text.charAt(0) === '2' && text.indexOf('|') !== -1) {
      return parseCompactText(text);
    }
    if (text.charAt(0) === '{' || text.charAt(0) === '[') {
      var json = JSON.parse(text);
      if (Array.isArray(json)) {
        throw new Error('Array JSON share format not implemented in viewer yet');
      }
      if (json && json.v === 2 && Array.isArray(json.h) && Array.isArray(json.C)) {
        return parseV2Pack(json);
      }
      return json;
    }
    throw new Error('Unrecognized share payload');
  }

  function parseDecompressed(raw) {
    return parsePayloadBytes(raw);
  }

  /**
   * Decode a #r= blob (base64url, optionally gzip or raw-DEFLATE).
   * Always returns a Promise — never throws synchronously (so UI catch runs).
   * @returns {Promise<object>} watch round doc
   */
  function decodeShareBlob(blob) {
    return Promise.resolve().then(function () {
      var compressed = b64UrlDecode(blob);

      function tryPlain() {
        return parsePayloadBytes(compressed);
      }

      function afterInflate(raw) {
        try {
          return parseDecompressed(raw);
        } catch (e) {
          return null;
        }
      }

      function fail() {
        throw new Error('Could not decode share blob');
      }

      // Prefer gzip (v2 pack pipeline), then raw DEFLATE (compact encodings), then plain.
      return inflateGzip(compressed)
        .then(function (raw) {
          var doc = afterInflate(raw);
          if (doc) return doc;
          return inflateRaw(compressed).then(function (raw2) {
            var doc2 = afterInflate(raw2);
            if (doc2) return doc2;
            try {
              return tryPlain();
            } catch (e) {
              return fail();
            }
          });
        })
        .catch(function () {
          return inflateRaw(compressed)
            .then(function (raw) {
              var doc = afterInflate(raw);
              if (doc) return doc;
              try {
                return tryPlain();
              } catch (e) {
                return fail();
              }
            })
            .catch(function () {
              try {
                return tryPlain();
              } catch (e) {
                return fail();
              }
            });
        });
    });
  }

  /**
   * Load round from URL:
   *   1. #r=<blob>
   *   2. ?fixture=name
   * @returns {Promise<object>}
   */
  function loadRoundFromUrl() {
    var hash = (location.hash || '').replace(/^#/, '');
    if (hash.indexOf('r=') === 0) {
      var blob = hash.slice(2);
      // support #r=...&other by cutting at &
      var amp = blob.indexOf('&');
      if (amp !== -1) blob = blob.slice(0, amp);
      var decoded = blob;
      try {
        decoded = decodeURIComponent(blob);
      } catch (e) {
        // Keep raw blob if messengers mangled % sequences.
        decoded = blob;
      }
      return decodeShareBlob(decoded);
    }

    var params = new URLSearchParams(location.search);
    var name = params.get('fixture') || 'sample-round';
    name = name.replace(/[^a-zA-Z0-9_-]/g, '');
    return fetch('fixtures/' + name + '.json').then(function (res) {
      if (!res.ok) throw new Error('Failed to load fixture');
      return res.json();
    });
  }

  global.ShareCodec = {
    decodeShareBlob: decodeShareBlob,
    loadRoundFromUrl: loadRoundFromUrl,
    parseCompactText: parseCompactText,
    parseCompactBin: parseCompactBin,
    parseV2Pack: parseV2Pack,
  };
})(typeof window !== 'undefined' ? window : globalThis);
