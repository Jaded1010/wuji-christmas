/**
 * Part 2, "What would you get me for Christmas?" — every scene of the film (docs/christmas-game/gift/
 * DIRECTORS-SCRIPT.md), on the shared engine window.XM (core.js). Built on the tree game's scenes (tree.js stays as it
 * is): the same room and painted tree, the same panel, cast, sharing, board and answers drawer.
 *
 * The idea the whole film follows: the better you know them, the better the gift you wrap. The friend shops at a snowy
 * Christmas market, one stall per question; their gift box re-wraps itself one step fancier at 5, 7 and 9 right
 * (brown paper → knitted → red ribbon → gold); a wrong answer drops something silly in. On Christmas morning the
 * creator unwraps it: the ending. The board is the pile of presents under the creator's tree.
 */
(function () {
  'use strict';

  var X = window.XM, C = X.C, h = X.h, t = X.t, tn = X.tn;
  var KEY_CREATOR = 'XM_gift_creator';
  var notifiedFriend = null;                             // a notification's ?friend={id}: their answers open over the tree
  var KEY_FROM = 'XM_gift_from';                         // the play a comeback wish list came from: {quiz, player, key, at}
  var FROM_DAYS = 3;                                     // a list written later than that is the friend's own idea
  function comebackFrom() {
    var from = X.store(KEY_FROM);
    return from && from.at && Date.now() - from.at < FROM_DAYS * 864e5 ? { quiz: from.quiz, player: from.player, key: from.key } : undefined;
  }
  var QUESTIONS = C.rules.questions, PERFECT = C.rules.perfect;
  var GIFT_QUESTIONS_FROM = 3001;                        // the gift game's own questions (ChristmasGame::GIFT_QUESTIONS_FROM)
  var FRIENDS_QUESTIONS_FROM = 4001;                     // the Christmas pool, drawn as ans-… (ChristmasGame::FRIENDS_QUESTIONS_FROM)

  // ══════════════════════════════════════ the wrappings ════════════════════════════════════════════════════
  /** The ending of a score (the server's rule, GiftStory::ending): top 9–10 · front 7–8 · bottom 5–6 · box 0–4. */
  function zoneOf(score) { return score >= 9 ? 'top' : score >= 7 ? 'front' : score >= 5 ? 'bottom' : 'box'; }
  /** The paper each ending's gift wears: gold foil, red ribbon, knitted wool, brown paper. */
  var WRAP = { top: 'gold', front: 'red', bottom: 'knit', box: 'brown' };
  function wrapOf(score) { return WRAP[zoneOf(score)]; }
  /** The silly things a wrong answer drops in the box, one after another. */
  var VIBE_EMOJI = { surprise: '🎉', food: '🍫', handmade: '✂️', cosy: '🧦', sparkle: '✨', practical: '🔧', books: '📚', games: '🎮',
    pamper: '💅', room: '🪴', time: '🫂', beach: '🏖️' };
  var SILLY = ['socks', 'fruitcake', 'duck', 'toothbrush', 'mug', 'lights', 'glove', 'soap'];

  // ══════════════════════════════════════ the gift shop (GiftStory::GIFTS) ═════════════════════════════════
  /** Every gift: {key, tier, emoji, moods, countries}. The friend picks one from the shelf their score earned. */
  var GIFTS = {};
  (C.gifts || []).forEach(function (g) { GIFTS[g[0]] = { key: g[0], tier: g[1], emoji: g[2], moods: g[3], countries: g[4] }; });
  /** Gifts drawn as another picture (the open empty box is the morning's prop). */
  var GIFT_ART = { emptybox: 'gf-prop-box-empty' };
  var SHELF_SIZE = 6;
  function giftArt(key) { return GIFT_ART[key] || 'gf-gift-' + key; }
  function giftName(key) { return t('gift.item.' + key); }
  /** A gift's picture, or its emoji on a soft disc until one is drawn. */
  function giftPic(key, cls) {
    if (X.hasArt(giftArt(key))) { return X.artPic(giftArt(key), cls); }
    var el = h('span.xm-gift-emoji', { 'aria-hidden': 'true' }, (GIFTS[key] || {}).emoji || '🎁');
    if (cls) { el.className += ' ' + cls; }
    return el;
  }
  /**
   * The shelf a friend browses, page by page: the local treat of their country first, then up to two gifts in the
   * creator's vibe, then the rest of the tier shuffled. Each gift knows why it is there (`local`, `vibe`).
   */
  function shelfPages(tier, mood, country) {
    country = String(country || '').toUpperCase();
    var all = Object.keys(GIFTS).map(function (k) { return GIFTS[k]; }).filter(function (g) { return g.tier === tier; });
    var local = X.shuffle(all.filter(function (g) { return g.countries.length && g.countries.indexOf(country) !== -1; }));
    var vibe = X.shuffle(all.filter(function (g) { return !g.countries.length && mood !== 'surprise' && g.moods.indexOf(mood) !== -1; }));
    var rest = all.filter(function (g) { return !g.countries.length && vibe.indexOf(g) === -1; });
    var order = local.slice(0, 1).concat(vibe.slice(0, 2), X.shuffle(rest.concat(vibe.slice(2), local.slice(1))));
    var items = order.map(function (g) { return { key: g.key, local: local.indexOf(g) !== -1, vibe: vibe.indexOf(g) !== -1 }; });
    var pages = [];
    for (var i = 0; i < items.length; i += SHELF_SIZE) { pages.push(items.slice(i, i + SHELF_SIZE)); }
    // a short last page is topped up from the first gifts (a full shelf every time)
    var last = pages[pages.length - 1];
    for (var j = 0; last && pages.length > 1 && last.length < SHELF_SIZE; j++) { last.push(items[j]); }
    return pages;
  }
  /** The gift in a box nobody picked from (the page closed on the shelf): GiftStory::giftOf's choice. */
  function defaultGift(zone, mood) {
    var fixed = { front: 'scarf', bottom: 'sweater', box: 'coal' }[zone];
    if (fixed) { return fixed; }
    var keys = Object.keys(GIFTS);
    for (var i = 0; i < keys.length; i++) {
      var g = GIFTS[keys[i]];
      if (g.tier === zone && !g.countries.length && g.moods.indexOf(mood) !== -1) { return g.key; }
    }
    return 'bigteddy';
  }
  /** Share a line and a link: the phone's share sheet, else WhatsApp; copied if the sheet fails. */
  function shareLine(text, link) {
    var waUrl = 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + link);
    var copied = function () { X.copy(text + ' ' + link).then(function (ok) { if (ok) { X.toast(t('ui.copied')); } else { location.href = waUrl; } }); };
    if (navigator.share) { navigator.share({ text: text, url: link }).catch(function (e) { if (!(e && e.name === 'AbortError')) { copied(); } }); }
    else { window.open(waUrl, '_blank', 'noopener'); }
  }
  /** The friend's own play, kept in this browser (core.js sendPlay): its gift added once picked. */
  function rememberGift(quizId, gift) {
    var key = 'XM_' + C.game + '_played_' + quizId, mine = X.store(key);
    if (mine) { mine.gift = gift; X.store(key, mine); }
  }
  /**
   * The pick, kept in this browser until it is in their box: it can only be sent once the play is saved (it is proved
   * with the key that save gives them), and a slow or failed save is finished later by core.js (on a tap, back online,
   * the next visit) — so a waiting pick is sent as soon as the play has its id and key. Retried like the play save
   * (a lost connection, a 419/429), never after a refusal.
   */
  var PICK_KEY = 'XM_gift_pick_', PICK_WAIT_MS = 10 * 60 * 1000;
  function sendPick(quizId, gift, saved) {
    // the save's own answer when it is at hand (private mode keeps nothing in this browser), else the play kept here
    var mine = saved && saved.player ? { id: saved.player.id, key: saved.playerKey } : X.played(quizId);
    if (!mine || !mine.id || !mine.key) { return Promise.reject({ waiting: true }); }
    return (function pickIt(n) {
      return X.api('POST', '/quizzes/' + quizId + '/players/' + mine.id + '/gift', { gift: gift, playerKey: mine.key })
        // one quick retry (a dropped connection), then the patient loop takes over (resendPick)
        .catch(function (e) { if (n < 1 && !e.refused) { return X.wait(Math.max(2000, (e.retryAfter || 0) * 1000)).then(function () { return pickIt(n + 1); }); } throw e; });
    })(0).then(function (r) {
      X.store(PICK_KEY + quizId, null);
      rememberGift(quizId, (r && r.player && r.player.gift) || gift);   // what is really in the box
    }, function (e) {
      if (e && e.refused) { X.store(PICK_KEY + quizId, null); }   // not theirs to give any more: the box keeps its gift
      throw e;
    });
  }
  /** A waiting pick: tried now, then every few seconds while the page is open (until its play is saved). */
  var picking = {};                                       // one waiting loop per list, however often the result is shown
  function resendPick(quizId) {
    var gift = X.store(PICK_KEY + quizId), started = Date.now();
    if (gift === null || picking[quizId]) { return; }
    if (typeof gift !== 'string' || !GIFTS[gift]) { X.store(PICK_KEY + quizId, null); return; }
    picking[quizId] = true;
    var round = 0;
    (function tryIt() {
      sendPick(quizId, gift).then(function () { delete picking[quizId]; }, function (e) {
        if ((e && e.refused) || Date.now() - started >= PICK_WAIT_MS) { delete picking[quizId]; return; }
        // patient: 5 s, 10 s, 20 s, 40 s, then every minute — or what the server asks for (a busy server at launch
        // must not be hammered by thousands of waiting picks)
        var wait = e && e.waiting ? 5000 : Math.min(60000, 5000 * Math.pow(2, round++));
        setTimeout(tryIt, Math.max(wait, (e && e.retryAfter || 0) * 1000));
      });
    })();
  }

  // ══════════════════════════════════════ the tree in its room (the tree game's, read here) ═══════════════
  var W = 320, H = 640, CX = 160;
  var TREE_BOX = { left: -1.4, top: 30.8, width: 322.8, height: 582.5 };
  var PROFILE = [1, 8, 11, 14, 18, 23, 31, 36, 31, 35, 46, 53, 50, 44, 52, 63, 64, 57, 59, 68, 77, 79, 73, 70, 79, 90, 93, 91, 80, 90,
    100, 101, 97, 88, 95, 105, 117, 119, 115, 101, 110, 122, 130, 131, 128, 122, 112, 120, 132, 142, 144, 142, 137, 142, 147, 150, 150, 149, 145, 137, 109, 101];
  function halfWidth(y) {
    var i = (y - 40) / 8, a = Math.floor(i);
    if (a < 0 || a >= PROFILE.length - 1) { return 0; }
    return PROFILE[a] + (PROFILE[a + 1] - PROFILE[a]) * (i - a);
  }
  var TIER_Y = [517, 477, 432, 374, 327, 278, 241, 198, 157, 121];
  var DECO_SIDE = [-.08, -.52, .48, -.5, .52, -.46, .5, -.5, .44, -.42];
  var DECOS = ['bell', 'candy-cane', 'bow', 'gingerbread', 'snowflake', 'red', 'present', 'pinecone', 'heart', 'icicle'];
  function decoration(n) { return X.artPic('ornament-' + DECOS[n - 1], 'xm-deco'); }
  function decoPoint(n) { var y = TIER_Y[n - 1] - 16; return [CX + DECO_SIDE[n - 1] * halfWidth(y + 8), y]; }
  var BULB_COLORS = ['#FF5A55', '#FFD34D', '#7FD1AE', '#FF7EB0', '#7FB6FF'];
  var STAR_Y = 26;
  function f(n) { return Math.round(n * 10) / 10; }
  function roomArt() { return C.season === 'summer' && X.hasArt('bg-living-room-summer') ? 'bg-living-room-summer' : 'bg-living-room-winter'; }
  function treeArt(opts, cls) {
    var box = h('div.xm-tree-art' + (cls ? '.' + cls : ''));
    if (opts.room) { box.appendChild(X.artPic(roomArt(), 'xm-room-bg')); }
    var tree = X.artPic('tree-bare', 'xm-tree-pic');
    tree.style.cssText = 'left:' + f(TREE_BOX.left / W * 100) + '%;top:' + f(TREE_BOX.top / H * 100) + '%;width:' + f(TREE_BOX.width / W * 100) + '%';
    box.appendChild(tree);
    box.appendChild(X.svg(treeMarkup(opts)));
    box.appendChild(X.artPic('prop-star', 'xm-star-pic'));
    return box;
  }
  function treeMarkup(opts) {
    var s = '<svg class="xm-tree-svg" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true" preserveAspectRatio="xMidYMax meet"><defs>'
      + '<radialGradient id="xmGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF3B0" stop-opacity=".95"/><stop offset=".4" stop-color="#FFD34D" stop-opacity=".45"/><stop offset="1" stop-color="#FFD34D" stop-opacity="0"/></radialGradient></defs>';
    if (opts.room) { s += '<rect class="xm-dimmer" width="' + W + '" height="' + H + '" fill="#0B0F24"/>'; }
    for (var n = 1; n <= 10; n++) {
      var y = TIER_Y[n - 1], hw = halfWidth(y) * .9, x0 = CX - hw, x2 = CX + hw, y0 = y - 8, y1 = y + 14;
      s += '<g class="xm-tier" data-n="' + n + '"><path d="M' + f(x0) + ' ' + y0 + ' Q' + CX + ' ' + y1 + ' ' + f(x2) + ' ' + y0 + '" fill="none" stroke="#2A3A30" stroke-width="1.6"/>';
      var count = Math.max(3, Math.round(hw * 2 / 21));
      for (var j = 0; j < count; j++) {
        var tt = (j + .5) / count, bx = (1 - tt) * (1 - tt) * x0 + 2 * (1 - tt) * tt * CX + tt * tt * x2, by = (1 - tt) * (1 - tt) * y0 + 2 * (1 - tt) * tt * y1 + tt * tt * y0;
        var c = BULB_COLORS[(j + n) % BULB_COLORS.length];
        s += '<circle class="xm-glow" cx="' + f(bx) + '" cy="' + f(by + 3) + '" r="8" fill="' + c + '" style="animation-delay:-' + ((j * 7 + n * 3) % 10) / 5 + 's"/>'
          + '<circle class="xm-bulb" cx="' + f(bx) + '" cy="' + f(by + 3) + '" r="3.6" style="--c:' + c + '"/>';
      }
      s += '</g>';
    }
    return s + '<g class="xm-star"><circle class="xm-star-glow" cx="' + CX + '" cy="' + STAR_Y + '" r="50" fill="url(#xmGlow)"/></g></svg>';
  }

  /**
   * A character walks off by `toX` px (the walking frames, as X.walkIn walks them in; the art faces right, so they turn
   * round to walk left): an easy start, a little bob in the step.
   */
  function walkOut(holder, kind, toX, ms) {
    if (X.reduceMotion || !holder.animate) { holder.style.visibility = 'hidden'; return Promise.resolve(); }
    var step = 0, t = setInterval(function () { X.pose(holder, kind, step++ % 2 ? 'walk-2' : 'walk-1', true); }, 160);
    var flip = toX < 0 ? ' scaleX(-1)' : '';
    var walk = holder.animate([
      { transform: 'translate(0, 0)' + flip },
      { transform: 'translate(' + f(toX * .3) + 'px, -4px)' + flip, offset: .3 },
      { transform: 'translate(' + f(toX * .6) + 'px, 0)' + flip, offset: .6 },
      { transform: 'translate(' + f(toX) + 'px, -4px)' + flip }
    ], { duration: ms, easing: 'cubic-bezier(.45,.05,.75,.9)', fill: 'forwards' });
    return X.ended(walk).then(function () { clearInterval(t); });
  }

  /** The Elf (the tree's red-and-green Elf, his gift-game poses gf-elf-*) and the cast's gift-game poses. */
  function elfPose(el, poseName) { X.pose(el, X.hasArt('gf-elf-' + poseName) ? 'gf-elf' : 'elf', poseName); }
  function elfChar(poseName, height, cls) { return X.character(X.hasArt('gf-elf-' + poseName) ? 'gf-elf' : 'elf', poseName, height, cls); }
  /** The cast in a pose: the gift game's own (gf-cat-scarf…) where it is drawn, else the tree's (cat-cheer…). */
  function castPose(el, kind, poseName, quiet) {
    X.pose(el, X.hasArt('gf-' + kind + '-' + poseName) ? 'gf-' + kind : kind, poseName, quiet);
  }
  /**
   * A name label at a character's feet (the creator's own name, a friend's): whoever plays sees who is who. It lives
   * inside the character, so it stays through every pose (a pose only swaps the picture).
   */
  /** A name label pulled back inside its stage (6px in from either edge); the camera's zoom and a mirrored character are allowed for. */
  function keepInside(tag) {
    var stage = tag.closest('.xm-cam, .xm-unbox');
    if (!stage) { return; }
    if (tag.style.marginLeft) { tag.style.marginLeft = ''; }   // a write only when it was moved: a plain check only reads
    var r = tag.getBoundingClientRect(), c = stage.getBoundingClientRect();
    var shift = r.width > c.width - 12 ? 0 : r.left < c.left + 6 ? c.left + 6 - r.left : r.right > c.right - 6 ? c.right - 6 - r.right : 0;
    if (!shift) { return; }
    var k = r.width / (tag.offsetWidth || r.width || 1) || 1;   // on-screen pixels per CSS pixel (the camera's push-in)
    tag.style.marginLeft = Math.round(shift / k) + 'px';
    var moved = tag.getBoundingClientRect().left - r.left;
    if (moved * shift < 0) { tag.style.marginLeft = Math.round(-shift / k) + 'px'; }   // a mirrored character moves it the other way
  }
  function nameTag(who, name, side) {
    if (!who || !name) { return who; }
    var old = who.querySelector('.xm-cast-name');
    if (old) { old.remove(); }
    var tag = h('span.xm-cast-name.is-' + (side || 'creator'), name);
    who.appendChild(tag);
    // a character at the frame's edge: the label slides back inside the stage, and again whenever they walk or the
    // camera pushes in (a long name under someone at the edge ran out of the frame in the close-ups)
    // often while they walk in and the camera moves (the first 6 s), then calmly; never while the page is hidden
    var shown = false, ticks = 0;
    (function tick() {
      ticks++;
      if (!tag.isConnected) { if (shown || ticks > 400) { return; } }   // gone, or never put on stage
      else if (!document.hidden) { shown = true; keepInside(tag); }
      setTimeout(tick, ticks < 20 ? 300 : 1200);
    })();
    requestAnimationFrame(function () { keepInside(tag); });
    return who;
  }
  function castChar(kind, poseName, height, cls) {
    return X.character(X.hasArt('gf-' + kind + '-' + poseName) ? 'gf-' + kind : kind, poseName, height, cls);
  }

  /**
   * An answer's picture: our card with the creator's own character acting it out — the gift questions'
   * (gf-ans-{cat|bear}-{q}-{n}) or the tested bank's (ans-…) — else the question bank's photo.
   */
  function answerName(qid, index, kind) { return (+qid >= GIFT_QUESTIONS_FROM && +qid < FRIENDS_QUESTIONS_FROM ? 'gf-ans-' : 'ans-') + kind + '-' + qid + '-' + index; }
  function answerImg(qid, index, kind) {
    var name = answerName(qid, index, kind);
    var img = X.hasArt(name) ? X.artPic(name, 'xm-ans-pic') : h('img', { src: X.answerPic(qid, index), alt: '', loading: 'eager', decoding: 'async' });
    img.addEventListener('error', function () { img.remove(); });
    return img;
  }
  function answerUrl(qid, index, kind) { var name = answerName(qid, index, kind); return X.hasArt(name) ? X.artUrl(name) : X.answerPic(qid, index); }

  // ── a present (the friend's gift: its wrapping, a "From:" tag with their name) ─────────────────────────────
  /** A wrapped present: the box in its paper, the friend's name on a little tag (always as text). */
  function present(name, wrap, cls) {
    return h('div.xm-present.is-' + wrap + (cls ? '.' + cls : ''),
      h('span.xm-present-swing', X.artPic('gf-box-' + wrap, 'xm-present-pic'), name != null ? h('span.xm-present-tag', name) : null));
  }

  // ── the room camera: the creator's lit tree, the presents on the floor under it ──────────────────────────────
  /** Under the tree, in rank order: the best gift front and centre, then the front row, then the rows behind. */
  var FLOOR = [
    // a pile under the tree, clear of the host (right) and the Elf (left): fronts 40 units apart, rows behind in between
    [160, 630, 0], [118, 627, 0], [202, 627, 0], [76, 622, 0], [244, 622, 0],
    [139, 604, 1], [181, 604, 1], [97, 600, 1], [223, 600, 1],
    [160, 584, 2], [118, 580, 2], [202, 580, 2]
  ];
  /** The creator's empty rug: ten golden "From: ?" tags lying together under the tree (front row of 5, then 4, then 1). */
  var RUG_TAGS = [
    // a tight block clear of the cast at the frame's edges: rows of 4 / 3 / 3, 28 units apart (a tag is ~26 tall),
    // 34 apart (~30 wide), so they lie side by side, never on each other
    [109, 626, 0], [143, 627, 0], [177, 627, 0], [211, 626, 0],
    [126, 598, 1], [160, 599, 1], [194, 598, 1],
    [126, 570, 2], [160, 571, 2], [194, 570, 2]
  ];
  function roomCam(opts) {
    opts = opts || {};
    var layer = h('div.xm-layer');
    layer.appendChild(treeArt({ room: true }));
    var backdrop = X.artPic(roomArt(), 'xm-cam-backdrop');
    var shot = h('div.xm-shot', layer);
    var cam = h('div.xm-cam' + (opts.cls ? '.' + opts.cls : ''), backdrop, shot);
    function at(el, pt) { el.style.left = f(pt[0] / W * 100) + '%'; el.style.top = f(pt[1] / H * 100) + '%'; return el; }
    for (var n = 1; n <= 10; n++) { layer.appendChild(at(decoration(n), decoPoint(n))); }
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        var cw = cam.clientWidth, ch = cam.clientHeight, lw = Math.max(cw, ch / 2);
        layer.style.width = lw + 'px';
        layer.style.left = ((cw - lw) / 2) + 'px';
        if (ctl.last) { var l = ctl.last; if (l[0] === 'range') { ctl.range(l[1], l[2], l[3], l[4], l[5]); } else { ctl.focus(l[1], true); } }
      }).observe(cam);
    }
    var ctl = {
      el: cam, layer: layer, at: at,
      focus: function (y, instant) {
        ctl.last = ['focus', y];
        cam.classList.remove('is-wide');
        var camH = cam.clientHeight, LH = layer.offsetHeight, ty = Math.max(camH - LH, Math.min(0, camH / 2 - y / H * LH));
        if (instant) { layer.style.transition = 'none'; }
        layer.style.transform = 'translateY(' + f(ty) + 'px)';
        if (instant) { layer.offsetHeight; layer.style.transition = ''; }
      },
      wide: function (top) { ctl.range(0, H, top); },
      /**
       * The part of the tree from y0 to y1 (layer units) in the frame: `top` px kept clear above (the ribbon) and the
       * panel's overlap kept clear below, so the presents on the floor are never under the panel's edge.
       */
      range: function (y0, y1, top, span, bottom) {
        top = top || 0;
        ctl.last = ['range', y0, y1, top, span, bottom];
        cam.classList.add('is-wide');
        // never closer than the whole width of the room (a narrow phone keeps the floor's outer gifts in view) unless
        // a narrower `span` (layer units across, centred) is asked for: a PUSH IN; the part sits on the floor line
        var LH = layer.offsetHeight, room = cam.clientHeight - top - (bottom == null ? 44 : bottom);
        var s = Math.min(room / ((y1 - y0) / H * LH), cam.clientWidth / Math.max(1, layer.offsetWidth * (span || W) / W));
        layer.style.transform = 'translateY(' + f(top + room - y1 / H * LH * s) + 'px) scale(' + f(s * 1000) / 1000 + ')';
      },
      /** The presents' shot: the lower tree and the whole floor under it, big. */
      presents: function (top) { ctl.range(170, H, top); },
      light: function (n, on) { var g = layer.querySelector('.xm-tier[data-n="' + n + '"]'); if (g) { g.classList.toggle('is-on', on !== false); } },
      lightAll: function (step) {
        var ps = [];
        for (var n = 1; n <= 10; n++) { ps.push(X.pause((n - 1) * (step || 0)).then(ctl.light.bind(null, n, true))); }
        return Promise.all(ps);
      },
      star: function (on) { layer.classList.toggle('is-star', on !== false); },
      dim: function (on) { cam.classList.toggle('is-dim', on !== false); },
      place: function (el, pt) { if (!el.parentNode) { layer.appendChild(el); } return at(el, pt); },
      punch: function (k) {
        if (X.reduceMotion || !shot.animate) { return; }
        shot.animate([{ transform: 'scale(1)' }, { transform: 'scale(' + (k || 1.05) + ')', offset: .35 }, { transform: 'scale(1)' }], { duration: 900, easing: 'cubic-bezier(.3,0,.2,1)' });
      },
      toCam: function (pt) {
        var lr = layer.getBoundingClientRect(), cr = cam.getBoundingClientRect();
        return [lr.left - cr.left + pt[0] / W * lr.width, lr.top - cr.top + pt[1] / H * lr.height];
      }
    };
    if (opts.lit) { ctl.lightAll(0); ctl.star(true); }
    return ctl;
  }

  // ── shared bits of the scenes (as the tree's) ────────────────────────────────────────────────────────────
  function fitTitle(el) {
    var fit = function () {
      if (!el.isConnected) { return; }
      el.style.fontSize = '';
      var size = parseFloat(getComputedStyle(el).fontSize), range = document.createRange();
      // the text's own box (the ribbon centres it, so it overflows above and below, where scrollHeight can't see)
      var tall = function () { range.selectNodeContents(el); var r = range.getBoundingClientRect(); return r.height > el.clientHeight + 1 || r.width > el.clientWidth + 1; };
      while (tall() && size > 11) { size -= .5; el.style.fontSize = size + 'px'; }
    };
    requestAnimationFrame(fit);
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(fit); }
  }
  function topBar() {
    var brand = C.siteLogo
      ? h('img.xm-site-logo', { src: C.siteLogo, alt: 'Cloudz.fun', width: 847, height: 211, decoding: 'async' })
      : ['cloudz', h('span', '.fun')];
    return h('div.xm-top', h('a.xm-site' + (C.siteLogo ? '.is-logo' : ''), { href: '/' }, brand));
  }
  function languagePicker() {
    var codes = Object.keys(C.languages || {});
    if (codes.length < 2) { return null; }
    var field = h('button.xm-langfield', { type: 'button', 'aria-haspopup': 'dialog', 'aria-label': '🌐 ' + C.languages[C.locale],
      onclick: function () { X.sfx('tap'); openLanguages(field, codes); } },
      h('span.xm-langfield-globe', { 'aria-hidden': 'true' }, '🌐'), h('b', C.languages[C.locale]), h('span.xm-langfield-arrow', { 'aria-hidden': 'true' }));
    return field;
  }
  function openLanguages(field, codes) {
    var sheet = h('div.xm-sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': field.getAttribute('aria-label') });
    var close = X.sheetBack(function () { document.removeEventListener('keydown', esc); sheet.remove(); field.focus({ preventScroll: true }); });
    var esc = function (e) { if (e.key === 'Escape') { close(); } };
    var list = h('div.xm-langlist', codes.map(function (code) {
      var now = code === C.locale;
      return h('a' + (now ? '.is-now' : ''), { href: C.base + '/' + code, lang: (C.hreflangs || {})[code] || null, 'aria-current': now ? 'true' : null,
        onclick: function (e) { if (now) { e.preventDefault(); close(); } } }, C.languages[code]);
    }));
    var panel = h('div.xm-sheet-panel.is-langs', h('div.xm-sheet-head', h('span.xm-langfield-globe', { 'aria-hidden': 'true' }, '🌐'),
      h('div', h('h2.xm-h2', C.languages[C.locale])), h('button.xm-sheet-close', { type: 'button', 'aria-label': t('ui.close'), onclick: close }, '×')), list);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) { close(); } });
    document.addEventListener('keydown', esc);
    sheet.appendChild(panel);
    document.body.appendChild(sheet);
    X.enter(panel, 0, 'main', { y: 60 });
    var current = list.querySelector('.is-now');
    if (current) { current.scrollIntoView({ block: 'center' }); }
  }
  /** A game button with the premium press; a double tap counts once. */
  /** A small text link (the friend's result: under the one main button); the same double-tap guard as button(). */
  function textLink(label, onclick) {
    var last = 0;
    return h('button.xm-link.is-dark', { type: 'button', onclick: function (e) {
      var now = Date.now();
      if (now - last < 800) { return; }
      last = now;
      return onclick.call(this, e);
    } }, label);
  }
  function button(label, cls, onclick) {
    var last = 0;
    return h('button.xm-btn' + (cls ? '.' + cls : ''), { type: 'button', onclick: function (e) {
      var now = Date.now();
      if (now - last < 800) { return; }
      last = now;
      return onclick.call(this, e);
    } }, label);
  }
  /** The cast in the room camera: the Elf (bottom left) and the host (bottom right, beside the tree). */
  function castIn(cam, gender, name) {
    var kind = X.kindOf(gender);
    var hostH = Math.round(Math.min(170, Math.max(96, Math.min(cam.el.clientHeight * .38, window.innerHeight * .19))));
    var host = nameTag(castChar(kind, 'wave', hostH, 'xm-cam-host'), name);
    var elfH = Math.round(hostH * .88);
    cam.el.style.setProperty('--elf-h', elfH + 'px');
    var elfEl = X.character('elf', 'clipboard', elfH, 'xm-cam-elf');
    cam.el.append(elfEl, host);
    return { elf: elfEl, host: host, kind: kind };
  }
  var QUICK = 450;
  var ELF_SAYS = { who: 'elf', pos: 'left:8px;bottom:calc(var(--elf-h, 150px) + 30px);max-width:min(230px, calc(50% - 12px))', tail: 30 };
  function hostSays(cast) {
    var left = cast.host.parentNode && cast.host.parentNode.classList.contains('is-swap');
    return { who: 'creator', pos: (left ? 'left:8px;' : 'right:8px;') + 'bottom:' + (parseFloat(cast.host.style.height) + 34) + 'px;max-width:min(230px, calc(50% - 12px))',
      tail: left ? 30 : 'calc(100% - 50px)' };
  }
  function clearSays(stage) { stage.querySelectorAll('.xm-say').forEach(function (b) { b.remove(); }); X.finishTyping(); }

  // ── the film's grammar: black bars for the beats nobody taps, title cards, whip cuts between the acts ───────────
  /** The black bars close in (on) or open again (off) over a stage. */
  function bars(stage, on) { stage.classList.toggle('is-bars', on !== false); }
  /** A title card in the lower bar ("That evening, at the Christmas market…"); resolves once it has been read. */
  /**
   * "Tap to speed up ⏩" in the film's lower bar, a moment into a long film: a tap finishes a line and skips a pause, but
   * nothing said so (owner, 2026-11-01). Once they have tapped a film it never shows again. Returns its remover.
   */
  function tapHint(stage) {
    if (X.reduceMotion || X.store('XM_gift_tapped')) { return function () {}; }
    var chip = h('div.xm-taphint', { 'aria-hidden': 'true' }, t('gift.film.tapHint'));
    var timer = setTimeout(function () { if (stage.isConnected) { stage.appendChild(chip); } }, 1800);
    var done = function () { clearTimeout(timer); chip.remove(); stage.removeEventListener('pointerdown', tapped); };
    var tapped = function () { X.store('XM_gift_tapped', 1); done(); };
    stage.addEventListener('pointerdown', tapped);
    return done;
  }
  function titleCard(stage, text, ms) {
    var card = h('div.xm-film-card', h('span', text));
    stage.appendChild(card);
    card.getBoundingClientRect();
    card.classList.add('is-in');
    return X.pause(ms || 1600).then(function () {
      card.classList.remove('is-in');
      setTimeout(function () { card.remove(); }, 500);
    });
  }
  /** WHIP: a fast bright sweep across the phone; `cut` swaps the scene under it, the new shot comes out of the blur. */
  function whip(cut) {
    X.sfx('whoosh');
    if (X.reduceMotion) { cut(); return Promise.resolve(); }
    var sweep = h('div.xm-whip', { 'aria-hidden': 'true' });
    document.body.appendChild(sweep);
    return X.pause(240).then(function () { cut(); return X.pause(340); }).then(function () { sweep.remove(); });
  }
  /** The market's crowd under the music (sound.js), only while shopping. */
  function crowd(on) { if (window.XMSound && window.XMSound.bed) { window.XMSound.bed(on); } }
  /**
   * An emotion sticker over a character's head (Bail Me Out's emote): it bounces in (DBM's spring), floats up a little
   * and fades. `stage` is the positioned scene the character stands in.
   */
  function emote(stage, who, emoji) {
    if (!who || !who.isConnected || X.reduceMotion) { return; }
    var r = who.getBoundingClientRect(), c = stage.getBoundingClientRect();
    var e = h('span.xm-emote', { 'aria-hidden': 'true' }, emoji);
    // beside the head (right of it, a little down), clear of the speech bubble over the head; inside the stage
    e.style.left = f(Math.min(c.width - 22, r.left - c.left + r.width * .92)) + 'px';
    e.style.top = f(Math.max(30, r.top - c.top + r.height * .24)) + 'px';
    stage.appendChild(e);
    // never on a speech bubble: below it instead (a small set where the head sits right under the line). Measured by
    // layout, not on screen: a bubble that has just popped in is still small on screen. The sticker sits above its
    // point (translate -50%, -100%) and drifts ~22px up as it fades.
    var ex = parseFloat(e.style.left), ey = parseFloat(e.style.top), ew = e.offsetWidth, eh = e.offsetHeight;
    stage.querySelectorAll('.xm-say').forEach(function (b) {
      if (b.offsetParent !== stage) { return; }
      var bl = b.offsetLeft, bt = b.offsetTop, br = bl + b.offsetWidth, bb = bt + b.offsetHeight;
      if (ex - ew / 2 < br && bl < ex + ew / 2 && ey - eh - 24 < bb && bt < ey) {
        ey = bb + eh + 26;
        e.style.top = f(ey) + 'px';
      }
    });
    e.addEventListener('animationend', function () { e.remove(); });
  }
  /** While a line types (and is read), its speaker bobs and sways a little: you can see who is talking. */
  /**
   * A line's bubble aimed at the one saying it, measured on this phone (the lines are placed by fixed positions, so on
   * some sizes the tail pointed at nobody): the bubble slides sideways just enough for its tail to reach the speaker's
   * middle, the tail points there, and a bubble lying over someone's name tag rises above it when there is room.
   * Re-aimed while the line is up (characters walk, poses change).
   */
  function aimLine(b, who) {
    var stage = b.offsetParent;
    if (!stage) { return; }
    var pic = who.querySelector('img') || who;
    if (!pic.getBoundingClientRect().width || getComputedStyle(who).visibility === 'hidden') { return; }
    // the bubble's own box in the stage (its pop-in animation scales it, so its on-screen rectangle would mislead)
    var c = stage.getBoundingClientRect(), s = pic.getBoundingClientRect(), k = 1;
    var box = function () { var x = c.left + b.offsetLeft, y = c.top + b.offsetTop; return { left: x, right: x + b.offsetWidth, top: y, bottom: y + b.offsetHeight, width: b.offsetWidth }; };
    var r = box();
    // what the player sees: the stage within the phone's width (a pushed-in camera takes the speaker past the edge,
    // and then the line stays where the shot put it)
    var lo = Math.max(c.left, 0) + 6, hi = Math.min(c.right, document.documentElement.clientWidth) - 6;
    var mid = s.left + s.width / 2, pad = 24;
    if (mid < lo + 10 || mid > hi - 10) { return; }
    var shift = mid < r.left + pad ? mid - (r.left + pad) : mid > r.right - pad ? mid - (r.right - pad) : 0;
    shift = Math.max(lo - r.left, Math.min(hi - r.right, shift));
    if (Math.abs(shift) > 1) {
      b.style.left = Math.round((r.left + shift - c.left) / k) + 'px';
      b.style.right = 'auto';
      r = box();
    }
    // never over the speaker's face: above their head if the stage has room, else beside it (the tail on the near side)
    var head = { left: s.left + s.width * .15, right: s.right - s.width * .15, top: s.top, bottom: s.top + s.height * .45 };
    if (!b.classList.contains('is-up') && head.left < r.right && r.left < head.right && head.top < r.bottom && r.top < head.bottom) {
      // the question tags along the top are a ceiling: a line above the head must fit under them
      var bar = stage.querySelector('.xm-tagbar'), ceil = 8;
      if (bar && bar.offsetParent && getComputedStyle(bar).opacity > .1) { ceil = bar.getBoundingClientRect().bottom - c.top + 4; }
      var above = head.top - c.top - 6 - b.offsetHeight;
      if (above >= ceil) {
        b.style.top = Math.round(above) + 'px';
        b.style.bottom = 'auto';
      } else {
        var onLeft = mid >= r.left + r.width / 2, room = onLeft ? head.left - lo : hi - head.right;
        if (r.width > room && room >= 110) { b.style.maxWidth = Math.floor(room) + 'px'; r = box(); }   // narrower (more lines) rather than on the face
        var x = onLeft ? head.left - r.width : head.right;
        b.style.left = Math.round(Math.max(lo, Math.min(hi - r.width, x)) - c.left) + 'px';
        b.style.right = 'auto';
      }
      r = box();
    }
    b.style.setProperty('--tail', Math.round(Math.max(6, Math.min(r.width - 22, mid - r.left - 8)) / k) + 'px');
    // never over a name tag (the speaker's own included): up and out of the way, as far as the stage allows
    if (b.classList.contains('is-up') || b.classList.contains('is-under')) { return; }
    stage.querySelectorAll('.xm-cast-name, .xm-present-tag').forEach(function (tag) {
      var t = tag.getBoundingClientRect();
      if (!t.width || t.left >= r.right || r.left >= t.right || t.top >= r.bottom || r.top >= t.bottom) { return; }
      var lift = r.bottom - t.top + 6, room = r.top - c.top - 8;
      if (lift > 0 && room > 0) {
        b.style.top = Math.round((r.top - Math.min(lift, room) - c.top) / k) + 'px';
        b.style.bottom = 'auto';
        r = box();
      }
    });
  }
  function talking(who, line) {
    if (!who) { return line; }
    var stage = who.closest('.xm-cam, .xm-unbox, .xm-desk, .xm-scene');
    var says = stage ? stage.querySelectorAll('.xm-say') : [];
    var b = says[says.length - 1];
    if (b) {
      aimLine(b, who);
      // re-aimed often while the line pops in and the speaker settles (3 s), then calmly; never while hidden
      var aims = 0;
      (function aim() {
        if (!b.isConnected) { return; }
        aims++;
        if (!document.hidden) { aimLine(b, who); }
        setTimeout(aim, aims < 12 ? 250 : 1000);
      })();
    }
    who.classList.add('is-talking');
    return line.then(function (b) { who.classList.remove('is-talking'); return b; }, function (e) { who.classList.remove('is-talking'); throw e; });
  }

  // ══════════════════════════════════════ ACT 1 — the creator writes the wish list ════════════════════════
  var draft = {};

  /** 1.1 The landing: a warm window on a snowy night, the host holding up a blank gift tag. */
  function landing() {
    X.setHeroGender(null);
    var root = X.scene('is-landing.is-staged');
    var kind = Math.random() < .5 ? 'cat' : 'bear';
    var host = castChar(kind, 'tag', 156, 'xm-hero-host');
    var bow = h('span.xm-title-bow', { 'aria-hidden': 'true' });
    var title = h('div.xm-logo.xm-landing-title', h('span.xm-logo-top', t('gift.landing.title1')), h('span.xm-logo-main', t('gift.landing.title2'), bow));
    // inside the warm window: the lit tree with nothing under it yet (the window pane of bg-snowy-window is x 259–510,
    // y 660–884 of its 768 × 1376; the painting covers the hero, anchored 50% 60%)
    var winTree = treeArt({ room: false }, 'xm-hero-wintree.is-star');
    winTree.querySelectorAll('.xm-tier').forEach(function (g) { g.classList.add('is-on'); });
    var pane = h('div.xm-hero-pane', { 'aria-hidden': 'true' }, winTree);
    var win = h('div.xm-hero', X.artPic('bg-snowy-window', 'xm-hero-bg'), pane, h('i.xm-hero-glow'), title,
      X.artPic('gf-prop-parcel', 'xm-hero-parcel'), host);
    var placePane = function () {
      var Wd = win.clientWidth, Hd = win.clientHeight, s = Math.max(Wd / 768, Hd / 1376), ox = (Wd - 768 * s) / 2, oy = (Hd - 1376 * s) * .6;
      pane.style.cssText = 'left:' + f(ox + 259 * s) + 'px;top:' + f(oy + 660 * s) + 'px;width:' + f(251 * s) + 'px;height:' + f(224 * s) + 'px';
    };
    if (window.ResizeObserver) { new ResizeObserver(placePane).observe(win); }
    setTimeout(function () { X.fitText(title.children); }, 0);
    X.snow(win, 30);
    var cta = button(t('gift.landing.cta'), 'is-gold', function () {
      if (C.createUrl) { X.track('gift_start_moved'); location.href = X.createHref(KEY_CREATOR); return; }   // new lists: c.cloudz.fun
      X.track('gift_start');
      cta.disabled = true;
      X.sfx('whoosh');
      X.music(true);
      if (win.animate && !X.reduceMotion) {
        win.style.transformOrigin = '50% 46%';
        X.ended(win.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(3.2)', opacity: 0 }], { duration: 700, easing: 'cubic-bezier(.55,0,.75,0)', fill: 'forwards' })).then(letter);
      } else { letter(); }
    });
    var steps = h('ol.xm-steps', [1, 2, 3].map(function (n) {
      return h('li.xm-step', h('span.xm-step-n', String(n)), h('span', h('strong', t('gift.howto.' + n + '.title')), ' ', t('gift.howto.' + n + '.text')));
    }));
    var panel = h('div.xm-play.is-page', X.artPic('ui-snow', 'xm-play-snow'), h('p.xm-sub.xm-center', t('gift.landing.sub')), cta,
      h('p.xm-small.xm-center', t('gift.landing.meta')), languagePicker(), steps);
    root.append(win, panel);
    win.appendChild(h('div.xm-hero-top', topBar()));
    X.enter(host, 500, 'pop', { y: 40, s: .7 });
    X.enter(title, 250, 'accent', { y: 20, s: .9 });
    X.pause(1300).then(function () { bow.classList.add('is-tied'); X.sfx('sparkle'); });
    X.cascade(panel.querySelectorAll('.xm-sub, .xm-btn, .xm-small, .xm-langfield, .xm-step'), 700, 90);
    // idle: the host shakes an empty box by the ear, frowns, holds up the tag again
    (function idle(i) {
      X.pause(3200).then(function () {
        if (!host.isConnected) { return; }
        castPose(host, kind, ['shake', 'tag', 'cheer', 'tag'][i % 4]);
        X.move(host, 'hop');
        idle(i + 1);
      });
    })(0);
    preloadPoses();
  }
  /**
   * The cast's poses, early: the shared stills and the gift game's own (~1.9 MB), never the 188 "holding this gift"
   * poses (~6.8 MB: one is ever shown, the picked gift's, loaded when it is picked — holdPose).
   */
  function preloadPoses() {
    X.preloadCast(['cat', 'bear']);
    X.preloadArt(Object.keys((C.art && C.art.sizes) || {}).filter(function (n) { return /^gf-(cat|bear)-/.test(n) && n.indexOf('-hug-') < 0; }));
  }
  /** The picked gift held in that character's arms, loaded ahead of the morning (gf-{cat|bear}-hug-{gift}). */
  function holdPose(kind, gift) {
    if (gift && X.hasArt('gf-' + kind + '-hug-' + gift)) { X.preloadArt(['gf-' + kind + '-hug-' + gift]); }
  }

  /**
   * The wish-list paper's box is kept to the picture's own shape (285 × 480): 78% of the desk's height, or narrower
   * where 60% of its width is the limit, so the name line and the stickers sit on the paper on every phone.
   */
  function fitPaper(paper) {
    var box = paper.parentNode;                          // (called once the paper is on its desk)
    var fit = function () { paper.style.height = f(Math.min(box.clientHeight * .78, box.clientWidth * .6 * 480 / 285)) + 'px'; };
    if (window.ResizeObserver) { new ResizeObserver(fit).observe(box); }
    fit();
    return paper;
  }

  /**
   * The name on the wish-list paper's top line: as big as fits, down to 45%; a name still too long goes onto two lines
   * (never clipped). Again once the hand-lettering font has loaded and whenever the paper changes size.
   */
  function fitListName(nameOn) {
    var fit = function () {
      requestAnimationFrame(function () {
        if (!nameOn.isConnected) { return; }
        var fs = 1;
        nameOn.style.setProperty('--fs', fs);
        nameOn.style.overflowWrap = ''; nameOn.style.whiteSpace = '';
        while (fs > .45 && nameOn.scrollWidth > nameOn.clientWidth + 1) { fs -= .05; nameOn.style.setProperty('--fs', fs.toFixed(2)); }
        if (nameOn.scrollWidth > nameOn.clientWidth + 1) { nameOn.style.whiteSpace = 'normal'; nameOn.style.overflowWrap = 'anywhere'; }
      });
    };
    if (!nameOn.xmFit) {
      nameOn.xmFit = true;
      if (document.fonts && document.fonts.ready) { document.fonts.ready.then(function () { if (nameOn.textContent) { fit(); } }); }
      if (window.ResizeObserver && nameOn.parentNode) { new ResizeObserver(function () { if (nameOn.textContent) { fit(); } }).observe(nameOn.parentNode); }
    }
    fit();
  }

  /** 1.2 The wish list: the name writes itself at the top of the paper; the cat or the bear. */
  function letter() {
    var root = X.scene('is-letter.is-staged');
    var nameOn = h('span.xm-list-name');
    var paper = h('div.xm-list-paper', X.artPic('gf-prop-list', 'xm-list-pic'), nameOn);
    var elfOnDesk = elfChar('pencil-lick', 120, 'xm-desk-elf');
    var desk = h('div.xm-desk', X.artPic('gf-set-desk', 'xm-desk-bg'), paper, elfOnDesk);
    var fitName = function () { fitListName(nameOn); };
    var input = h('input.xm-input', { type: 'text', maxlength: String(C.rules.nameMax), placeholder: t('gift.letter.placeholder'), autocomplete: 'off', enterkeyhint: 'next', 'aria-label': t('gift.letter.label') });
    if (draft.name) { input.value = draft.name; nameOn.textContent = draft.name; fitName(); }
    input.addEventListener('input', function () {
      nameOn.textContent = X.cleanName(input.value);
      fitName();
      nameOn.classList.remove('is-paint'); nameOn.getBoundingClientRect(); nameOn.classList.add('is-paint');
      X.sfx('tap');
      err.textContent = '';
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { input.blur(); } });
    var err = h('div.xm-error', { role: 'alert' });
    var gender = draft.gender || null;
    var cards = h('div.xm-who', ['female', 'male'].map(function (g) {
      var kind = X.kindOf(g), pic = X.character(kind, 'wave', 92);
      var card = h('button.xm-who-card' + (gender === g ? '.is-picked' : ''), { type: 'button', 'aria-pressed': gender === g ? 'true' : 'false', onclick: function () {
        gender = g;
        cards.querySelectorAll('.xm-who-card').forEach(function (c) { var on = c === card; c.classList.toggle('is-picked', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        X.pose(pic, kind, 'cheer'); X.move(pic, 'hop');
        X.sfx(kind + '-hello');
        var other = cards.querySelector('.xm-who-card:not(.is-picked) .xm-char');
        if (other) { X.pose(other, other.getAttribute('data-kind'), 'wave'); }
        err.textContent = '';
        X.buzz(10);
      } }, pic, h('span', t('gift.letter.' + (g === 'female' ? 'girl' : 'boy'))));
      return card;
    }));
    var next = button(t('gift.letter.next'), 'is-green', function () {
      var name = X.cleanName(input.value);
      if (!name) { err.textContent = t('gift.letter.nameError'); next.classList.remove('is-shake'); next.getBoundingClientRect(); next.classList.add('is-shake'); input.focus(); return; }
      if (!gender) { err.textContent = t('gift.letter.genderError'); next.classList.remove('is-shake'); next.getBoundingClientRect(); next.classList.add('is-shake'); return; }
      next.disabled = true;
      draft.name = name; draft.gender = gender;
      X.setHeroGender(gender);
      loadQuestions();
      elfPose(elfOnDesk, 'list');
      X.sfx('elf-hmph');
      X.sayBy(desk, t('gift.letter.hi', { name: name }), elfOnDesk, { who: 'elf', gap: 10, maxWidth: 'calc(70% - 12px)' });
      X.pause(1500).then(mood);
    });
    var panel = h('div.xm-play.is-page', X.artPic('ui-snow', 'xm-play-snow'),
      h('label.xm-label', t('gift.letter.label')), input, err,
      h('div.xm-label', t('gift.letter.who')), cards, h('p.xm-small', t('gift.letter.hint')), next);
    desk.appendChild(h('div.xm-hero-top', topBar()));
    root.append(desk, panel);
    fitPaper(paper);
    X.enter(paper, 100, 'main', { y: 30, r: -4 });
    X.enter(elfOnDesk, 350, 'pop', { y: -30, s: .6 });
    X.cascade(root.querySelectorAll('.xm-label, .xm-input, .xm-who-card, .xm-small, .xm-btn'), 250, 60);
  }

  /** 1.3 The gift vibe: six cards (more on demand, or "Pick for me"); the host acts the pick out. */
  function mood() {
    var root = X.scene('is-mood.is-staged');
    var kind = X.kindOf(draft.gender);
    var order = X.shuffle(C.moods), page = 0, chosen = draft.mood || null, pages = Math.ceil(order.length / 6);
    var host = X.character(kind, 'wave', 150);
    var hostBox = h('div.xm-moodhost', X.artPic('bg-sofa', 'xm-moodhost-bg'), host);
    var grid = h('div.xm-moods');
    function card(key) {
      return h('button.xm-mood' + (key === chosen ? '.is-picked' : ''), { type: 'button', 'data-mood': key, onclick: function () { choose(key); } },
        X.hasArt('gf-mood-' + key) ? X.artPic('gf-mood-' + key, 'xm-mood-pic') : null,
        h('span', X.hasArt('gf-mood-' + key) ? t('gift.mood.' + key).replace(/\s*(?:\p{Extended_Pictographic}|️|‍)+\s*$/u, '') : t('gift.mood.' + key)));
    }
    function render(first) {
      var keys = order.slice(page * 6, page * 6 + 6);
      if (first && keys.indexOf(first) === -1) { keys = [first].concat(keys.slice(0, 5)); }
      grid.textContent = '';
      keys.forEach(function (k) { grid.appendChild(card(k)); });
      if (!/^(ja|ko)/.test(C.hreflang || '')) { X.fitText(grid.querySelectorAll('.xm-mood > span')); }
      X.cascade(grid.children, 0, 60, 'pop', { y: 14, s: .9, r: -3 });
    }
    function choose(key) {
      chosen = key;
      grid.querySelectorAll('.xm-mood').forEach(function (b) { b.classList.toggle('is-picked', b.getAttribute('data-mood') === key); });
      X.pose(host, kind, ['cheer', 'gasp', 'laugh', 'thumbs-up'][Math.floor(Math.random() * 4)]); X.move(host, 'hop');
      X.sfx('tap'); X.sfx(kind + '-giggle');
      X.say(hostBox, t('gift.mood.say.' + key), { who: 'creator', pos: 'left:8%;right:8%;max-width:none;text-align:center;top:calc(60px + env(safe-area-inset-top))', tail: 'calc(50% - 8px)' });
      emote(hostBox, host, VIBE_EMOJI[key] || '✨');
      cta.disabled = false;
      X.buzz(10);
    }
    var more = h('button.xm-chip', { type: 'button', onclick: function () { page = (page + 1) % pages; render(); } }, t('gift.mood.more'));
    var random = h('button.xm-chip', { type: 'button', onclick: function () {
      var key = X.pick(order.filter(function (k) { return k !== chosen; }));
      if (!grid.querySelector('[data-mood="' + key + '"]')) { render(key); }
      choose(key);
    } }, t('gift.mood.random'));
    var cta = button(t('gift.mood.cta'), 'is-green', function () { draft.mood = chosen; wishList(); });
    cta.disabled = !chosen;
    hostBox.appendChild(h('div.xm-hero-top', topBar()));
    root.append(hostBox, h('div.xm-play.is-page', X.artPic('ui-snow', 'xm-play-snow'), h('h2.xm-h2.xm-center', tn('gift.mood.heading', { creator: draft.name }, ['creator'])),
      h('p.xm-sub.xm-center', t('gift.mood.sub')), grid, h('div.xm-chips', more, random), cta));
    render(chosen);
    if (chosen) { choose(chosen); }
    X.enter(host, 200, 'pop', { y: 30, s: .8 });
  }

  function fitAnswers(tag, opts) {
    var texts = Array.from(opts.querySelectorAll('.xm-opt-text'));
    X.fitText([tag].concat(texts));
    var check = function () {
      if (opts.classList.contains('is-many') && texts.some(function (el) { return el.style.overflowWrap === 'anywhere'; })) { opts.classList.remove('is-many'); X.fitText(texts); }
    };
    check();
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(function () { setTimeout(check, 0); }); }
  }
  function loadQuestions() {
    // the creator's own tree (this phone made one): its questions go last, so their friends meet new ones here
    var tree = X.store('XM_tree_creator');
    var ask = { gender: draft.gender, locale: C.locale, country: C.country || '' };
    if (tree && tree.id) { ask.avoid = tree.id; }
    draft.questionsPromise = X.api('GET', '/questions?' + new URLSearchParams(ask).toString());
    draft.questionsPromise.catch(function () {});
    return draft.questionsPromise;
  }

  /**
   * 1.4 The wish list: ten questions about you. Each answer's picture is pinned to the paper on the desk like a sticker,
   * the host cheering beside it; the ribbon counts the wishes.
   */
  function wishList() {
    var root = X.scene('is-climb.is-wishlist');
    var first = draft.questionsPromise.catch(loadQuestions).then(function (res) {
      var q = res.questions[0];
      return X.loadUrls(q.options.map(function (o, i) { return answerUrl(q.id, i, X.kindOf(draft.gender)); })).then(function () { return res; });
    });
    X.gate(first, 900).then(function (res) {
      if (!res || !res.questions || !res.questions.length) { X.toast(t('ui.error')); mood(); return; }
      var kind = X.kindOf(draft.gender);
      var tag = h('span.xm-ribbon-text');
      var stickers = h('div.xm-list-stickers');
      var listName = h('span.xm-list-name', draft.name);
      var paper = h('div.xm-list-paper.is-desk', X.artPic('gf-prop-list', 'xm-list-pic'), listName, stickers);
      var host = nameTag(castChar(kind, 'wave', 130, 'xm-desk-host'), draft.name);
      var stage = h('div.xm-cam.is-stage.is-desk-stage', X.artPic('gf-set-desk', 'xm-desk-bg'), paper, host);
      var qbox = h('div.xm-qbox');
      var play = h('div.xm-play', X.artPic('ui-snow', 'xm-play-snow'), h('div.xm-ribbon', X.artPic('ui-ribbon', 'xm-ribbon-pic'), tag), qbox);
      play.style.setProperty('--holly', 'url("' + X.artUrl('ui-holly') + '")');
      root.append(stage, play);
      fitPaper(paper);
      fitListName(listName);
      X.music(true);
      var queue = res.questions.slice(), answers = [];
      function next() {
        if (answers.length === QUESTIONS) { listDone(answers, stage, host, kind, qbox); return; }
        if (!queue.length) { X.toast(t('ui.error')); landing(); return; }
        var q = queue[0], k = answers.length + 1;
        if (queue[1]) { X.loadUrls(queue[1].options.map(function (o, i) { return answerUrl(queue[1].id, i, kind); })); }
        tag.textContent = t('gift.list.tag', { k: k, n: QUESTIONS });
        castPose(host, kind, 'wave');
        var locked = false;
        var opts = h('div.xm-opts' + (q.options.length > 4 ? '.is-many' : q.options.length > 2 ? '.is-grid' : ''));
        q.options.forEach(function (text, index) {
          var b = h('button.xm-opt', { type: 'button', onclick: function () {
            if (locked) { return; }
            locked = true;
            b.classList.add('is-picked');
            X.sfx('tap');
            X.buzz(12);
            answers.push({ quesID: q.id, optionIndex: index });
            queue.shift();
            pin(q.id, index, k).then(next);
          } }, answerImg(q.id, index, kind), h('span.xm-opt-text', X.fill(text, draft.name)));
          opts.appendChild(b);
        });
        var skip = h('button.xm-link.is-dark', { type: 'button', onclick: function () { if (locked) { return; } locked = true; X.sfx('swipe'); queue.push(queue.shift()); next(); } }, t('gift.list.skip'));
        var card = h('div.xm-q', X.marked(q.question, draft.name));
        qbox.textContent = '';
        qbox.append.apply(qbox, [card, opts, k <= 2 ? h('p.xm-small.xm-center.is-dark', t('gift.list.hint')) : null, h('div.xm-center', skip)].filter(Boolean));
        fitAnswers(tag, opts);
        X.enter(card, 0, 'main', { y: -16 });
        X.cascade(opts.children, 160, 60, 'pop', { y: 22, s: .92 });
      }
      /** The picked answer flies onto the list as a sticker, with a tick; the host cheers. */
      function pin(qid, index, k) {
        if (window.scrollY > 4) { window.scrollTo({ top: 0, behavior: X.reduceMotion ? 'auto' : 'smooth' }); }
        var sticker = h('span.xm-list-sticker', { style: '--r:' + ((k % 2 ? -1 : 1) * (3 + (k * 7) % 6)) + 'deg' }, answerImg(qid, index, kind), h('i.xm-list-tick', '✓'));
        stickers.appendChild(sticker);
        X.enter(sticker, 0, 'pop', { y: -80, s: 1.6, r: 20 });
        castPose(host, kind, k % 3 ? 'cheer' : 'thumbs-up');
        emote(host.closest('.xm-cam') || host.parentNode, host, ['😍', '🎁', '✨', '😌', '🤭'][k % 5]);
        X.sfx('pop');
        return X.pause(380).then(function () {
          X.sfx('bulb', k);
          var r = sticker.getBoundingClientRect(), c = stage.getBoundingClientRect();
          X.sparkle(stage, r.left - c.left + r.width / 2, r.top - c.top + r.height / 2, 8);
          if (k % 4 === 0) { X.sfx(kind + '-giggle'); }
          return X.pause(480);
        });
      }
      next();
    });
  }

  /**
   * 1.5 The empty spot under the tree: the list is rolled up and hung on the lit tree; ten golden "From: ?" tags wait
   * on the empty rug ("All I need now… is you."); a flash. The list is saved meanwhile; the share screen follows.
   */
  function listDone(answers, stage, host, kind, qbox) {
    var body = { userName: draft.name, userGender: draft.gender, mood: draft.mood, answers: answers, country: C.country, locale: C.locale,
      from: comebackFrom(), submissionId: X.randomId(24) };
    var saved = (function book(n) {
      return X.api('POST', '/quizzes', body).catch(function (e) {
        if (e.refused) { throw e; }
        if (n < 2) { return X.wait(1500 * (n + 1)).then(function () { return book(n + 1); }); }
        return X.waitForConnection(e).then(function () { return book(0); });
      });
    })(0);
    var play = qbox.closest('.xm-play');
    qbox.textContent = '';
    var note = h('p.xm-small.xm-center.xm-saving.is-dark', { hidden: true }, t('gift.share.saving'), h('span.xm-dots', h('i'), h('i'), h('i')));
    qbox.appendChild(note);
    var root = stage.closest('.xm-scene');
    var cam, cast;
    var film = X.pause(200).then(function () {
      play.classList.add('is-hidden');
      castPose(host, kind, 'tag');
      X.sfx('whoosh');
      return X.pause(700);
    }).then(function () {
      // to the lit tree in the room: the empty rug under it
      cam = roomCam({ cls: 'is-stage', lit: true });
      stage.replaceWith(cam.el);
      bars(cam.el);                                      // the creator's money shot is the film's: letterboxed
      cast = castIn(cam, draft.gender, draft.name);
      castPose(cast.host, kind, 'tag');
      cam.wide();
      X.sfx('top');
      return X.pause(900);
    }).then(function () {
      // PUSH IN on the empty rug: the ten golden tags gathered under the tree, the cast stepping aside to the edges
      cam.el.classList.add('is-rug');
      cam.range(400, H, 60, 270, 62);
      RUG_TAGS.forEach(function (pt, i) {
        var tagEl = cam.place(h('span.xm-floor-tag', h('i', t('gift.invite.from')), h('b', '?')), pt);
        X.enter(tagEl, 300 + i * 70, 'pop', { s: .3, y: -12, r: (i % 2 ? 14 : -14) });
        X.pause(300 + i * 70).then(function () { X.sfx('bulb', i + 1); });
      });
      X.pose(cast.host, kind, 'admire');
      X.pause(1000).then(function () { emote(cam.el, cast.host, '🥺'); });
      return X.pause(1100).then(function () { return X.sayHold(cam.el, t('gift.list.done'), hostSays(cast), 1300); });
    }).then(function () {
      // "Say cheese!", then the photo's flash
      X.pose(cast.host, kind, 'thumbs-up');
      X.say(cam.el, t('gift.list.cheese'), hostSays(cast));
      return X.pause(700).then(function () {
        var flash = h('div.xm-flash');
        root.appendChild(flash);
        X.sfx('shutter');
        return X.pause(900).then(function () { flash.remove(); bars(cam.el, false); });
      });
    });
    film.then(function () { play.classList.remove('is-hidden'); note.hidden = false; });
    Promise.all([saved, film]).then(function (all) {
      var res = all[0];
      var me = { id: res.quiz.id, userKey: res.userKey, name: res.quiz.name, gender: res.quiz.gender, mood: res.quiz.mood, at: Date.now() };
      X.store(KEY_CREATOR, me);
      X.store(KEY_FROM, null);
      X.track('gift_create', { mood: me.mood, comeback: body.from ? 1 : 0 });
      draft = {};
      myGifts(me, true);
    }, function () {
      film.then(function () { X.toast(t('ui.error')); letter(); });
    });
  }

  /**
   * The wish list's own link-preview picture (js/tree-preview.js, game 'gift'): the creator's character holding up a
   * gold present at the night market, their name on a berry-red card, drawn here in the background and uploaded once,
   * so the link shows THEIR wish list in WhatsApp etc. (until then: og-gift.jpg). Never blocks the flow; a failed try
   * is retried once on the next visit. The server accepts it within an hour of saving (TreePreview::UPLOAD_WINDOW_MINUTES).
   */
  var previewTried = {}, IMG = C.assets + '/img/', VER = '?v=' + C.assetVersion;
  var PREVIEW_WINDOW_MS = 55 * 60 * 1000, PREVIEW_TRIES = 2;   // inside the server's hour; this visit + one later
  function sendPreview(me, fresh) {
    var key = 'XM_gift_preview_' + me.id, tried = X.store(key);
    if (!C.treePreviews || !window.XMTreePreview || previewTried[me.id] || tried === 1) { return; }
    // never again once the server would refuse it (an hour after saving) or after two tries: each try draws and
    // encodes a 1200×630 picture on the phone
    var tries = tried && typeof tried === 'object' ? tried.n || 0 : 0;
    if (tries >= PREVIEW_TRIES || (me.at && Date.now() - me.at > PREVIEW_WINDOW_MS)) { return; }
    previewTried[me.id] = true;
    X.store(key, { n: tries + 1 });
    var go = function () {
      window.XMTreePreview.send({
        img: IMG, ver: VER, kind: X.kindOf(me.gender), brand: 'cloudz.fun', dir: document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr', game: 'gift',
        title: t('gift.preview.title', { creator: me.name }), line: t('gift.preview.line', { them: X.them(me.gender) }),   // plain text
        url: C.api + '/quizzes/' + me.id + '/preview',
        headers: { 'Accept': 'application/json', 'X-CSRF-TOKEN': C.csrf, 'X-Requested-With': 'XMLHttpRequest', 'User-Key': me.userKey }
      }).then(function (ok) { if (ok) { X.store(key, 1); } });
    };
    // at once on a new list: it must be up before the creator taps Share, or WhatsApp keeps the plain banner for this
    // link for good (the drawing and encode take a moment while the board's film runs: a small price for that);
    // on a later visit (a retry), when the page is idle
    if (fresh) { go(); return; }
    X.wait(1500).then(function () {
      if (window.requestIdleCallback) { window.requestIdleCallback(go, { timeout: 3000 }); } else { setTimeout(go, 400); }
    });
  }

  /** The creator's page: share the wish list, then the presents under the tree, the list (tap → answers), delete. */
  function myGifts(me, fresh) {
    X.setHeroGender(me.gender);
    sendPreview(me, fresh);
    pushSubscribe(window.cloudzFcmToken);
    if (notifiedFriend) {
      var friend = notifiedFriend;
      notifiedFriend = null;
      X.api('GET', '/quizzes/' + me.id + '/players/' + friend + '?locale=' + encodeURIComponent(C.locale), null, me.userKey)
        .then(function (res) { if (res.player.opened) { friendAnswers(me, res.player); } else { unbox(me, res.player); } }, function () {});
    }
    var link = C.shareBase + me.id;
    var share = X.shareButtons(link, t('gift.share.text', { link: '' }).trim(), function (channel) { X.track('gift_share', { channel: channel }); });
    var shareBlock = h('div.xm-share-block', h('h2.xm-h2.xm-center', fresh ? t('gift.share.heading') : t('gift.share.more')),
      h('p.xm-sub.xm-center', t('gift.share.sub')), share);
    // "Your gifts" heads the list; the share block has its own heading (first visit: share first, later: the gifts first)
    var listBox = h('div.xm-board'), count = h('p.xm-small.xm-center'), boardHead = h('h2.xm-h2.xm-center', t('gift.board.mine'));
    var panel = fresh ? [shareBlock, boardHead, count, listBox, deleteBlock(me)] : [boardHead, count, listBox, shareBlock, deleteBlock(me)];
    revealScene(me.name, me.gender, fresh, panel, function (cam) {
      return loadBoard(me.id, cam, listBox, count, me).catch(function (e) {
        if (e && e.refused && e.status === 404) { X.store(KEY_CREATOR, null); landing(); }
      });
    });
  }

  /** The creator's browser token joins this wish list's topic ("a friend brought a gift"), once per token and list. */
  function pushSubscribe(token) {
    var me = X.store(KEY_CREATOR);
    if (!C.push || !token || !me || !me.id || !me.userKey) { return; }
    var mark = me.id + '|' + token;
    if (X.store('XM_gift_push') === mark) { return; }
    X.api('POST', '/quizzes/' + me.id + '/push', { token: token }, me.userKey)
      .then(function () { X.store('XM_gift_push', mark); X.track('push_optin'); })
      .catch(function () {});
  }
  window.addEventListener('cloudz:fcm-token', function (e) { pushSubscribe(e.detail); if (C.quiz) { friendPushSubscribe(C.quiz.id, e.detail); } });
  /** A friend's own topic: "{new}'s gift just beat yours under {creator}'s tree 😱". */
  function friendPushSubscribe(quizId, token) {
    var mine = X.played(quizId);
    if (!C.push || !token || !mine || !mine.key || !mine.id) { return; }
    var mark = 'XM_gift_fpush_' + quizId, value = mine.id + '|' + token;
    if (X.store(mark) === value) { return; }
    X.api('POST', '/quizzes/' + quizId + '/players/' + mine.id + '/push', { token: token, playerKey: mine.key })
      .then(function () { X.store(mark, value); })
      .catch(function () {});
  }

  /** The tree with every gift under it: the reveal film plays on the stage, then the panel slides up. */
  function revealScene(name, gender, fresh, panelItems, load) {
    var root = X.scene('is-reveal');
    var cam = roomCam({ cls: 'is-stage.is-reveal-cast' });
    var ribbon = h('div.xm-ribbon.is-title', X.artPic('ui-ribbon', 'xm-ribbon-pic'),
      h('h1.xm-ribbon-text', h('span', tn('gift.board.heading', { creator: name }, ['creator']))));
    cam.el.appendChild(ribbon);
    fitTitle(ribbon.querySelector('.xm-ribbon-text'));
    var panel = h('div.xm-play.is-result-panel.is-hidden', X.artPic('ui-snow', 'xm-play-snow'), panelItems);
    root.append(cam.el, panel);
    var cast = castIn(cam, gender, name);
    var shown = false;
    var show = function () {
      if (shown) { return; }
      shown = true;
      panel.classList.remove('is-hidden');
      X.adOnTop(panel);
      X.sfx('swipe');
    };
    X.enter(ribbon, 300, 'accent', { y: -30, s: .7 });
    cam.reveal = function (placed) { return revealFilm(cam, cast, placed, fresh).then(function () { return spotlight(cam, cast, placed); }).then(show); };
    Promise.resolve(load(cam)).then(show, show);
    return cam;
  }

  function deleteBlock(me) {
    var box = h('div.xm-center.xm-delete');
    var ask = h('button.xm-link', { type: 'button', onclick: function () {
      box.textContent = '';
      box.append(h('p.xm-sub', t('gift.board.deleteAsk')), h('div.xm-row',
        button(t('gift.board.deleteNo'), 'is-ghost', function () { box.textContent = ''; box.appendChild(ask); }),
        button(t('gift.board.deleteYes'), '', function () {
          this.disabled = true;
          X.api('DELETE', '/quizzes/' + me.id, null, me.userKey).then(done, function (e) { if (e.status === 404) { done(); } else { X.toast(t('ui.error')); box.textContent = ''; box.appendChild(ask); } });
        })));
    } }, t('gift.board.delete'));
    function done() { X.store(KEY_CREATOR, null); landing(); }
    box.appendChild(ask);
    return box;
  }

  /** The board: every friend's present under the tree (the first 12 drawn, best front and centre) and the ranked list. */
  function loadBoard(quizId, cam, listBox, count, me, highlight) {
    listBox.appendChild(h('div.xm-dots.xm-center', h('i'), h('i'), h('i')));
    return X.api('GET', '/quizzes/' + quizId + '/players' + (highlight ? '?you=' + encodeURIComponent(highlight) : ''), null, me ? me.userKey : undefined).then(function (res) {
      listBox.textContent = '';
      // the best gift's giver got there first: first among their equals (the server lists ties newest first)
      var hi = res.players.findIndex(function (p) { return p.id === res.holder; });
      if (hi > 0) {
        var holder = res.players.splice(hi, 1)[0], at = hi;
        while (at > 0 && res.players[at - 1].score === holder.score) { at--; }
        res.players.splice(at, 0, holder);
      }
      var players = res.players;
      var you = res.you && !players.some(function (p) { return p.id === res.you.player.id; }) ? res.you : null;
      if (you) { players = players.concat([you.player]); }
      count.textContent = res.total ? t(res.total === 1 ? 'gift.board.countOne' : 'gift.board.count', { n: res.total }) : '';   // "1 gift", never "1 gifts"
      if (me) { countToOpen(count, res.players.filter(function (p) { return p.opened === false; }).length); }
      if (!players.length) { listBox.appendChild(h('p.xm-sub.xm-center.xm-empty', t('gift.board.empty'))); }
      // under the tree: the friend looking always gets a spot (their present takes the last one if the pile is full)
      var drawn = players.slice(0, FLOOR.length);
      var mine = highlight ? players.filter(function (p) { return p.id === highlight; })[0] : null;
      if (mine && drawn.indexOf(mine) === -1) { drawn[drawn.length - 1] = mine; }
      var placed = drawn.map(function (p, i) {
        var el = present(p.name, WRAP[p.ending], 'is-row' + FLOOR[i][2] + (p.perfect ? '.is-perfect' : '') + (highlight && p.id === highlight ? '.is-you' : '')
          + (p.id === res.holder ? '.is-best' : '') + (i === 1 || i === 2 ? '.is-low-tag' : '') + (me && p.opened === false ? '.is-new' : ''));   // every other front tag a step lower
        if (me) {
          el.setAttribute('role', 'button');
          el.setAttribute('tabindex', '0');
          el.addEventListener('click', function () { openPresent(me, p, count, listBox.querySelector('[data-player="' + p.id + '"]'), true); });
        }
        return { p: p, el: el, pt: FLOOR[i] };
      });
      var hung = cam.reveal ? cam.reveal(placed) : Promise.resolve(placed.forEach(function (x, i) { cam.place(x.el, x.pt); X.enter(x.el, 200 + i * 50, 'pop', { y: -20, s: .5 }); }));
      var row = function (p, rank) { return friendRow(p, rank, res.holder, me, highlight, cam, listBox, count); };
      res.players.forEach(function (p, i) { listBox.appendChild(row(p, (res.page - 1) * res.perPage + i + 1)); });
      var yours = you ? [h('div.xm-row-gap', { 'aria-hidden': 'true' }, '⋯'), row(you.player, you.rank)] : [];
      yours.forEach(function (el) { listBox.appendChild(el); });
      var page = res.page;
      if (res.total > page * res.perPage) {
        var more = button(t('gift.board.more'), 'is-ghost.xm-board-more', function () {
          more.disabled = true;
          // with the creator's key, as the first page: friends past the first 50 keep their gift + "new" (unwrappable)
          X.api('GET', '/quizzes/' + quizId + '/players?page=' + (page + 1), null, me ? me.userKey : undefined).then(function (next) {
            page = next.page;
            next.players.forEach(function (p, i) {
              if (you && p.id === you.player.id) { yours.forEach(function (el) { el.remove(); }); you = null; }
              listBox.insertBefore(row(p, (next.page - 1) * next.perPage + i + 1), yours[0] && yours[0].isConnected ? yours[0] : more);
            });
            more.disabled = false;
            if (next.total <= page * next.perPage || !next.players.length) { more.remove(); }
          }, function () { more.disabled = false; X.toast(t('ui.error')); });
        });
        listBox.appendChild(more);
      }
      return hung.then(function () { cam.reveal = null; X.cascade(listBox.children, 100, 40); });
    }, function (e) {
      if (e && e.refused) { throw e; }
      listBox.textContent = '';
      listBox.appendChild(h('div.xm-center', h('p.xm-sub', t('ui.error')), button(t('ui.retry'), 'is-ghost', function () {
        listBox.textContent = '';
        loadBoard(quizId, cam, listBox, count, me, highlight).catch(function () {});
      })));
    });
  }

  /** One friend's row: a mini present in their paper, their name, the gift's name, the score; the creator taps for answers. */
  function friendRow(p, rank, holder, me, highlight, cam, listBox, count) {
    var row = h('div.xm-row-friend' + (highlight && p.id === highlight ? '.is-you' : ''), { 'data-player': p.id },
      h('span.xm-rank', String(rank)),
      X.artPic('gf-box-' + WRAP[p.ending], 'xm-mini-present'),
      h('span.xm-row-main', h('strong', p.name),
        h('span.xm-row-meta', p.id === holder ? h('span.xm-zone.is-hook', t('gift.board.topSpot')) : h('span.xm-zone.is-' + p.ending, t('gift.board.zone.' + p.ending)),
          h('span.xm-score', p.score + '/10')),
        // the creator's own rows: what is inside once it is unwrapped (never before: the surprise is theirs)
        me && p.gift ? (p.opened ? h('span.xm-row-gift', giftName(p.gift)) : h('span.xm-row-gift.is-new', '🎁 ' + t('gift.board.new'))) : null));
    if (me) {
      row.classList.add('is-tap');
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-label', p.name + ': ' + t('gift.board.seeAnswers'));
      var open = function () { openPresent(me, p, count, row); };
      row.addEventListener('click', open);
      row.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      row.append(h('span.xm-row-go', { 'aria-hidden': 'true' }, '›'),
        h('button.xm-row-remove', { type: 'button', 'aria-label': t('gift.board.remove', { friend: p.name }), onclick: function (e) { e.stopPropagation(); removeFriend(me, p, row, cam, listBox, count); } }, '×'));
    }
    return row;
  }

  /**
   * THE REVEAL — the creator's climax and every friend's: the room dark, the tree's lights climb, the star bursts, the
   * room lights up; then every present slides in under the tree, the plainest first and the best last (front and centre,
   * glowing, with its crown); confetti, the host cheers, the Elf takes his hat off. A tap speeds it up.
   */
  function revealFilm(cam, cast, placed, fresh) {
    var order = placed.slice().reverse();               // ranked best first: the best comes in last
    var fast = false;
    var skip = function () { fast = true; };
    cam.el.addEventListener('pointerdown', skip);
    var wait = function (ms) { return X.pause(fast ? Math.min(ms, 60) : ms); };
    var brisk = fresh && placed.length > 0;
    var ribbonTop = function () { var rb = cam.el.querySelector('.xm-ribbon.is-title'); return rb ? rb.offsetTop + rb.offsetHeight * .7 : 0; };
    if (!placed.length) {
      // no gifts yet (just written, or nobody has played): the lit tree, ten golden "From: ?" tags waiting on the rug
      cam.lightAll(0); cam.star(true);
      cam.el.classList.add('is-rug');                    // the same gathered rug as the creator's film
      cam.range(400, H, ribbonTop(), 270);
      X.music(true);
      castPose(cast.host, cast.kind, 'tag', true);
      RUG_TAGS.forEach(function (pt, i) {
        X.enter(cam.place(h('span.xm-floor-tag', h('i', t('gift.invite.from')), h('b', '?')), pt), 300 + i * 70, 'pop', { s: .3, y: -10 });
      });
      cam.el.removeEventListener('pointerdown', skip);
      return wait(400).then(function () { X.say(cam.el, t('gift.list.done'), hostSays(cast)); });
    }
    cam.dim(true);
    cam.focus(TIER_Y[0] + 40, true);
    X.pose(cast.host, cast.kind, 'admire', true);
    X.music(true);
    return wait(brisk ? 400 : 700).then(function () {
      X.sfx('whoosh');
      cam.focus(TIER_Y[9] + 80);
      var steps = [], step = brisk ? 80 : 130;
      for (var n = 1; n <= 10; n++) { (function (n) { steps.push(wait(step + n * step).then(function () { cam.light(n, true); X.sfx('bulb', n); })); })(n); }
      return Promise.all(steps);
    }).then(function () {
      cam.star(true);
      cam.punch(1.06);
      X.sfx('top');
      var p = cam.toCam([CX, STAR_Y]);
      X.sparkle(cam.el, p[0], p[1], 22);
      return wait(brisk ? 500 : 800);
    }).then(function () {
      cam.dim(false);
      cam.wide(ribbonTop());
      X.pose(cast.host, cast.kind, 'gasp');
      X.sfx(cast.kind + '-happygasp');
      return wait(brisk ? 400 : 600);
    }).then(function () {
      cam.presents(ribbonTop());                         // down to the floor under the tree, where the gifts go
      return wait(brisk ? 300 : 500);
    }).then(function () {
      // the presents slide in under the tree, one by one (within about 2.4 s for a friend, 3.6 s for the creator)
      var gap = order.length ? Math.max(brisk ? 90 : 140, Math.min(brisk ? 360 : 520, (brisk ? 2400 : 3600) / order.length)) : 0;
      return Promise.all(order.map(function (x, i) {
        return wait(i * gap).then(function () {
          cam.place(x.el, x.pt);
          x.el.classList.add('is-arrive');
          X.sfx('drop');
          X.sfx('bulb', Math.min(10, 1 + Math.round(i * 9 / Math.max(1, order.length - 1))));
          return wait(500).then(function () {
            if (x.pt[2]) { return; }
            var q = cam.toCam([x.pt[0], x.pt[1] - 20]);
            X.sparkle(cam.el, q[0], q[1], x.p.perfect ? 14 : 6);
          });
        });
      }));
    }).then(function () {
      castPose(cast.host, cast.kind, order.length ? 'cheer' : 'wave');
      elfPose(cast.elf, order.length ? 'hat-off' : 'clipboard');
      if (order.length) { X.confetti(cam.el, ['#FFD34D', '#FF6A63', '#7FD1AE', '#FFFFFF']); X.sfx(cast.kind + '-woohoo'); }
      cam.el.removeEventListener('pointerdown', skip);
      return wait(fresh ? 600 : 300);
    });
  }

  /** A friend looking at the board finds THEIR present: the room dims, it glows, the creator says their ending's line. */
  function spotlight(cam, cast, placed) {
    var mine = placed.filter(function (x) { return x.el.classList.contains('is-you'); })[0];
    if (!mine) { return Promise.resolve(); }
    var cut = false;
    var skip = function () { cut = true; };
    cam.el.addEventListener('pointerdown', skip);
    var hold = function (ms) { return X.pause(cut ? 0 : ms); };
    cam.dim(true);
    cam.layer.classList.add('is-spotlight');
    mine.el.classList.add('is-spot');
    X.sfx('whoosh');
    return hold(700).then(function () {
      X.sfx('top');
      X.buzz(20);
      var c = cam.toCam([mine.pt[0], mine.pt[1] - 20]);
      X.sparkle(cam.el, c[0], c[1], 16);
      X.pose(cast.host, cast.kind, mine.p.ending === 'box' ? 'laugh' : mine.p.ending === 'top' ? 'cheer' : 'admire');
      return X.sayHold(cam.el, t('gift.ending.' + mine.p.ending + '.creator', { friend: mine.p.name }), hostSays(cast), cut ? 400 : 1300);
    }).then(function () {
      cam.el.removeEventListener('pointerdown', skip);
      clearSays(cam.el);
      cam.dim(false);
      cam.layer.classList.remove('is-spotlight');
      mine.el.classList.remove('is-spot');
      castPose(cast.host, cast.kind, 'cheer');
      return X.pause(400);
    });
  }

  function removeFriend(me, p, row, cam, listBox, count) {
    if (row.nextElementSibling && row.nextElementSibling.classList.contains('xm-row-confirm')) { return; }
    var ask = h('div.xm-row-confirm', h('span', t('gift.board.removeAsk', { friend: p.name })),
      h('button.xm-chip', { type: 'button', onclick: function () { ask.remove(); } }, t('gift.board.removeNo')),
      h('button.xm-chip.is-red', { type: 'button', onclick: function (e) {
        var yes = e.currentTarget;
        if (yes.disabled) { return; }
        yes.disabled = true;
        var removed = function () {
          cam.layer.querySelectorAll('.xm-present').forEach(function (b) { b.remove(); });
          listBox.textContent = '';
          loadBoard(me.id, cam, listBox, count, me).catch(function () { listBox.textContent = ''; X.toast(t('ui.error')); });
        };
        X.api('DELETE', '/quizzes/' + me.id + '/players/' + p.id, null, me.userKey).then(removed, function (err) {
          if (err && err.status === 404) { removed(); return; }
          yes.disabled = false;
          X.toast(t('ui.error'));
        });
      } }, t('gift.board.removeYes')));
    row.after(ask);
  }

  /** "3 gifts to unwrap 🎁" under the count, while any present on the board is still wrapped. */
  function countToOpen(count, n) {
    var line = count.querySelector('.xm-to-open') || h('b.xm-to-open');
    line.textContent = n ? ' · ' + (n === 1 ? t('gift.board.toOpenOne') : t('gift.board.toOpen', { n: n })) : '';
    if (n && !line.isConnected) { count.appendChild(line); }
  }
  /** The creator taps a present (under the tree or in the list): a wrapped one is unwrapped first, then the answers. */
  function openPresent(me, p, count, row, again) {
    if (p.opened === false || (again && p.gift)) {
      unbox(me, p, function () {
        p.opened = true;
        document.querySelectorAll('.xm-present.is-new').forEach(function (el) {
          var tag = el.querySelector('.xm-present-tag');
          if (tag && tag.textContent === p.name) { el.classList.remove('is-new'); }
        });
        var gift = row && row.querySelector('.xm-row-gift');
        if (gift) { gift.classList.remove('is-new'); gift.textContent = giftName(p.gift); }
        if (count) { countToOpen(count, document.querySelectorAll('.xm-row-gift.is-new').length); }
      });
      return;
    }
    friendAnswers(me, p);
  }
  /**
   * THE UNBOXING, the creator's Christmas morning: the room goes dark, bars in, the friend's present swings down in its
   * paper with their tag ("Riya got you…", "Tap to open"). A tap: it shakes by the ear (drum roll), the bow comes off,
   * the gift rises out in a burst of light with its name; the shelf it came from stamps under it; the creator reacts.
   * Then: "See how well Riya knows you" and "Show it off" (their own link, with the gift in the line).
   */
  /**
   * A drawer closed by its × steps the browser's history back, and that "back" lands a moment later: a drawer opened
   * in that moment would be closed by it. So the creator's drawers open only once it has landed.
   */
  var backLanding = null;
  function drawerBack(close) {
    var shut = X.sheetBack(close);
    return function () {
      if (history.state && history.state.xmSheet) {
        backLanding = new Promise(function (done) {
          var landed = function () { window.removeEventListener('popstate', landed); setTimeout(done, 0); };
          window.addEventListener('popstate', landed);
          setTimeout(landed, 700);
        }).then(function () { backLanding = null; });
      }
      shut();
    };
  }
  function unbox(me, p, opened) {
    if (backLanding) { backLanding.then(function () { unbox(me, p, opened); }); return; }
    if (document.querySelector('.xm-unbox, .xm-sheet')) { return; }
    var zone = p.ending, gift = p.gift && GIFTS[p.gift] ? p.gift : defaultGift(zone, me.mood);
    var kind = X.kindOf(me.gender);
    holdPose(kind, gift);                                 // in their arms at the end: loaded while the box trembles
    X.track('gift_unbox', { tier: zone, gift: gift });
    var root = h('div.xm-unbox.is-' + zone, { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('gift.unbox.from', { friend: p.name }) });
    var close = drawerBack(function () { root.remove(); document.removeEventListener('keydown', esc); });
    var esc = function (e) { if (e.key === 'Escape') { close(); } };
    document.addEventListener('keydown', esc);
    var stage = h('div.xm-unbox-stage');
    var title = h('h2.xm-unbox-title', tn('gift.unbox.got', { friend: p.name }, ['friend']));
    var box = present(null, WRAP[zone], 'is-unbox');
    var tag = h('span.xm-present-tag.is-from', t('gift.unbox.from', { friend: p.name }));
    var spot = h('div.xm-unbox-spot', h('i.xm-unbox-rays', { 'aria-hidden': 'true' }), box, tag);
    var hostH = Math.round(Math.min(200, window.innerHeight * .26, window.innerWidth * .42));
    var host = nameTag(castChar(kind, 'fingers-crossed', hostH, 'xm-unbox-host'), me.name);
    var hint = h('p.xm-unbox-hint', t('gift.unbox.tap'));
    var after = h('div.xm-unbox-after');
    var shut = h('button.xm-sheet-close.xm-unbox-close', { type: 'button', 'aria-label': t('ui.close'), onclick: function () { close(); } }, '×');
    // the creator and the present side by side on one floor line, the hint under them
    var floor = h('div.xm-unbox-floor', host, spot, hint);
    stage.append(title, floor);
    root.append(stage, after, shut);
    document.body.appendChild(root);
    if (!X.reduceMotion) { X.snow(stage, 16); }
    X.sfx('whoosh');
    X.enter(spot, 100, 'pop', { y: -160, s: .6, r: -10 });
    X.enter(title, 300, 'main', { y: -20 });
    X.enter(host, 500, 'pop', { x: -80 });
    X.pause(700).then(function () { X.sfx('drop'); X.sfx(kind + '-happygasp'); emote(stage, host, '😍'); });
    var started = false;
    var go = function () {
      if (started) { return; }
      started = true;
      hint.remove();
      X.buzz(15);
      // the first unwrap asks the server what is really inside (a friend's pick can land after this board loaded):
      // the reveal waits for that answer at most 600 ms (the tap's buzz and 🤞 cover it), else shows the board's gift
      var inside = Promise.resolve(gift);
      if (p.opened === false) {
        inside = Promise.race([
          X.api('POST', '/quizzes/' + me.id + '/players/' + p.id + '/open', {}, me.userKey)
            .then(function (r) { return r && GIFTS[r.gift] ? r.gift : gift; }, function () { return gift; }),
          X.wait(600).then(function () { return gift; })
        ]);
        if (opened) { opened(); }
      }
      // THE REVEAL: it trembles, light leaks, the lid flies off, the gift rises out of the light
      tag.remove();
      emote(stage, host, '🤞');
      inside.then(function (real) {
      if (real !== gift) { gift = real; p.gift = real; holdPose(kind, real); }
      revealGift(box, WRAP[zone], gift, { stage: stage, rays: false, from: t('gift.reveal.from', { friend: p.name }) + ' ' + FROM_HEART[zone],
        onBurst: function () { root.classList.add('is-lit'); } }).then(function () {
        X.sfx(zone);
        var c = stage.getBoundingClientRect();
        if (zone === 'top' || zone === 'front') { X.confetti(stage, zone === 'top' ? ['#FFD34D', '#FFE9A0', '#F2BF26', '#FFFFFF'] : undefined); }
        // the creator's face says it all
        var react = { top: ['tears', '🥹', '-woohoo', 'gift.ending.top.creator'], front: ['cheer', '🥰', '-happygasp', 'gift.ending.front.creator'],
          bottom: ['try-not-laugh', '😐', '-giggle', 'gift.ending.bottom.creator'], box: ['facepalm', '😶', '-dismay', 'gift.morning.hostBin'] }[zone];
        if (gift === 'scarf') { react[0] = 'scarf'; }
        if (gift === 'sweater') { react[0] = 'sweater'; }
        if (gift === 'coal') { react = ['candy', '🤩', '-woohoo', 'gift.ending.box.candy']; }
        if (X.hasArt('gf-' + kind + '-hug-' + gift)) { react[0] = 'hug-' + gift; }   // they hold that very gift
        castPose(host, kind, react[0]);
        X.move(host, zone === 'box' || zone === 'bottom' ? 'droop' : 'hop');
        X.sfx(kind + react[2]);
        X.pause(400).then(function () { emote(stage, host, react[1]); });
        return X.pause(700).then(function () {
          var hr = host.getBoundingClientRect();
          // the line stays in the creator's own column: wider, it lay over the gift's name beside them
          var nm = stage.querySelector('.xm-reveal-name'), nr = nm && nm.getBoundingClientRect();
          var wide = nr && nr.width ? Math.max(120, Math.round(nr.left - c.left - 18)) + 'px' : '240px';
          return X.sayHold(stage, t(react[3], { creator: me.name, friend: p.name }), { who: 'creator',
            pos: 'left:10px;bottom:' + Math.round(c.bottom - hr.top + 10) + 'px;max-width:min(' + wide + ', 68%)', tail: Math.max(18, Math.round(hr.left - c.left + hr.width / 2 - 16)) }, 1400);
        }).then(function () { clearSays(stage); });
      }).then(function () {
        // the shelf it came from, stamped; the score; what next (the floor steps up to make room)
        root.classList.add('is-done');
        var stamp = h('div.xm-unbox-stamp.is-' + zone, t('gift.ending.' + zone + '.title'));
        var score = h('p.xm-unbox-score', tn('gift.ending.score', { friend: p.name, creator: me.name, n: p.score }, ['friend', 'creator']));
        var answers = button(t('gift.unbox.answers', { friend: p.name }), 'is-green', function () { close(); friendAnswers(me, p); });
        var show = button(t('gift.unbox.share'), 'is-gold', function () {
          X.track('gift_share', { channel: 'unbox' });
          // proud for a good gift, 😅 for a "thought counts" or bargain-bin one (the gift's name is the joke)
          var showKey = zone === 'bottom' || zone === 'box' ? 'gift.unbox.shareBad' : 'gift.unbox.shareText';
          shareLine(t(showKey, { friend: p.name, gift: giftName(gift), n: p.score, link: '' }).trim(), C.shareBase + me.id);
        });
        after.append(stamp, score, h('div.xm-actions', answers, show));
        X.sfx('drop');
        X.enter(stamp, 0, 'accent', { s: 1.8, r: -8 });
        X.cascade([score].concat(Array.from(after.querySelectorAll('.xm-btn'))), 250, 90);
      });
      });   // inside
    };
    spot.addEventListener('click', go);
    hint.addEventListener('click', go);
    root.addEventListener('click', function (e) { if (e.target === root || e.target === stage) { go(); } });
  }

  /** A friend's answers next to the creator's (the creator only, with their key). */
  function friendAnswers(me, p) {
    if (backLanding) { backLanding.then(function () { friendAnswers(me, p); }); return; }
    if (document.querySelector('.xm-sheet')) { return; }
    X.track('view_friend_answers', { ending: p.ending });
    var sheet = h('div.xm-sheet', { role: 'dialog', 'aria-modal': 'true' });
    var panel = h('div.xm-sheet-panel');
    var close = drawerBack(function () { sheet.remove(); document.removeEventListener('keydown', esc); });
    var esc = function (e) { if (e.key === 'Escape') { close(); } };
    document.addEventListener('keydown', esc);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) { close(); } });
    var again = p.gift ? h('button.xm-chip.xm-sheet-again', { type: 'button', onclick: function () { close(); unbox(me, p); } }, t('gift.answers.again')) : null;
    var head = h('div.xm-sheet-head', p.gift ? giftPic(p.gift, 'xm-sheet-present is-gift') : X.artPic('gf-box-' + WRAP[p.ending], 'xm-sheet-present'),
      h('div', h('h2.xm-h2', tn('gift.answers.heading', { friend: p.name }, ['friend'])),
        p.gift ? h('p.xm-sheet-gift', giftName(p.gift)) : null, again,
        h('span.xm-zone.is-' + p.ending, t('gift.board.zone.' + p.ending) + ' · ' + p.score + '/10')),
      h('button.xm-sheet-close', { type: 'button', 'aria-label': t('ui.close'), onclick: close }, '×'));
    var list = h('div.xm-answers', h('div.xm-dots.xm-center', h('i'), h('i'), h('i')));
    panel.append(head, list);
    sheet.appendChild(panel);
    document.body.appendChild(sheet);
    X.enter(panel, 0, 'main', { y: 60 });
    var kind = X.kindOf(me.gender);
    var pick = function (qid, choice, who, right) {
      return h('figure.xm-pick' + (right ? '.is-right' : '.is-wrong'), h('div.xm-pick-pic', answerImg(qid, choice.index, kind)),
        h('span.xm-pick-mark', { 'aria-hidden': 'true' }, right ? '✓' : '✗'),
        h('figcaption', h('span.xm-answer-who', who), h('span.xm-pick-text', X.fill(choice.text, me.name))));
    };
    X.api('GET', '/quizzes/' + me.id + '/players/' + p.id + '?locale=' + encodeURIComponent(C.locale), null, me.userKey).then(function (res) {
      list.textContent = '';
      res.answers.forEach(function (a, i) {
        var pair = a.right
          ? h('div.xm-answer-pair.is-match', h('figure.xm-pick.is-right', h('div.xm-pick-pic', answerImg(a.id, a.creator.index, kind)), h('span.xm-pick-mark', { 'aria-hidden': 'true' }, '✓')),
            h('div.xm-match', h('div.xm-match-who', h('span.xm-answer-who', t('gift.answers.creator')), h('span.xm-answer-who', p.name)), h('b.xm-pick-text', X.fill(a.creator.text, me.name))))
          : h('div.xm-answer-pair', pick(a.id, a.friend, p.name, false), pick(a.id, a.creator, t('gift.answers.creator'), true));
        list.appendChild(h('div.xm-answer' + (a.right ? '.is-right' : '.is-wrong'), h('div.xm-answer-q', h('span.xm-answer-n', String(i + 1)), h('span', X.marked(a.question, me.name))), pair));
      });
      X.cascade(list.children, 0, 50, 'pop', { y: 16, s: .96 });
    }, function () { list.textContent = ''; list.appendChild(h('p.xm-sub', t('ui.error'))); });
  }

  // ══════════════════════════════════════ ACT 2 — the friend goes shopping ════════════════════════════════
  /** 2.1 The invitation: a gift tag "To: {creator}" swings in; it flips, and the friend writes their name after "From:". */
  function invite(quiz) {
    X.setHeroGender(quiz.gender);
    var done = X.played(quiz.id);
    if (done) { result(quiz, done, false); return; }
    var waiting = X.pendingPlay(quiz.id);
    if (waiting) {
      var through = function () { return X.sendPlay(quiz.id, waiting).catch(function (e) { if (e.refused) { throw e; } return X.waitForConnection(e).then(through); }); };
      X.gate(through(), 600).then(function () { var p = X.played(quiz.id); if (p) { result(quiz, p, false); } else { invite(quiz); } });
      return;
    }
    var roundPromise = X.api('GET', '/quizzes/' + quiz.id + '/round?locale=' + encodeURIComponent(C.locale));
    roundPromise.catch(function () {});
    var root = X.scene('is-invite.is-staged');
    var kind = X.kindOf(quiz.gender);
    var polaroid = h('div.xm-polaroid', h('div.xm-polaroid-pic', X.artPic(roomArt(), 'xm-room-bg'), castChar(kind, 'tag', 104, 'xm-polaroid-host')),
      h('span.xm-polaroid-name', quiz.name));
    var cardText = h('h1.xm-h2.xm-center', tn('gift.invite.card', { creator: quiz.name, them: X.them(quiz.gender) }, ['creator']));
    var moodSticker = h('div.xm-sticker', t('gift.invite.mood', { mood: t('gift.mood.' + quiz.mood) }));
    var proof = h('p.xm-proof', { hidden: true });
    roundPromise.then(function (res) {
      var tree = res && res.tree;
      if (!tree || !tree.count || !proof.isConnected) { return; }
      proof.append(h('span.xm-proof-line', t('gift.invite.proof', { creator: quiz.name, n: tree.count })),
        tree.top ? h('span.xm-proof-line', t('gift.invite.top', { top: tree.top })) : '');   // '' not null: append() prints "null"
      proof.hidden = false;
      X.enter(proof, 0, 'pop', { y: 10, s: .8 });
    }, function () {});
    // the tag: "To: {creator}" on the front with their Polaroid; "From: ___" on the back, written as they type
    var to = h('div.xm-tag-face.is-front', h('span.xm-tag-to', tn('gift.invite.to', { creator: quiz.name }, ['creator'])), polaroid, cardText, moodSticker, proof);
    var fromName = h('b.xm-tag-from-name');
    var back = h('div.xm-tag-face.is-back', h('span.xm-tag-from', t('gift.invite.from')), fromName);
    var tagCard = h('div.xm-bigtag', h('i.xm-bigtag-string'), h('div.xm-bigtag-inner', to, back));
    var input = h('input.xm-input', { type: 'text', maxlength: String(C.rules.nameMax), placeholder: t('gift.invite.label'), autocomplete: 'off', enterkeyhint: 'go', 'aria-label': t('gift.invite.label') });
    var err = h('div.xm-error', { role: 'alert' });
    input.addEventListener('focus', function () { tagCard.classList.add('is-flipped'); });
    input.addEventListener('input', function () {
      fromName.textContent = X.cleanName(input.value);
      fromName.classList.remove('is-paint'); fromName.getBoundingClientRect(); fromName.classList.add('is-paint');
      tagCard.classList.add('is-flipped');
      err.textContent = '';
    });
    var go = button(t('gift.invite.cta'), 'is-gold', function () {
      var name = X.cleanName(input.value);
      if (!name) { err.textContent = t('gift.letter.nameError'); go.classList.remove('is-shake'); go.getBoundingClientRect(); go.classList.add('is-shake'); input.focus(); return; }
      go.disabled = true;
      X.track('gift_play_start');
      tagCard.classList.add('is-flipped');
      X.sfx('whoosh');
      X.pause(350).then(function () { whip(function () { shop(quiz, roundPromise, name); }); });   // WHIP into the market
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { go.click(); } });
    var hero = h('div.xm-hero.is-invite', X.artPic('bg-snowy-window', 'xm-hero-bg'), h('i.xm-hero-glow'), h('div.xm-hero-top', topBar()), tagCard);
    X.snow(hero, 24);
    var rule = h('p.xm-invite-rule.xm-center', tn('gift.invite.rule', { creator: quiz.name }, ['creator']));
    var panel = h('div.xm-play.is-page', X.artPic('ui-snow', 'xm-play-snow'), rule, input, err, go);
    root.append(hero, panel);
    X.enter(tagCard, 200, 'accent', { y: -120, r: -14, s: .8 });
    X.pause(300).then(function () { X.sfx('sparkle'); });
    X.enter(moodSticker, 1300, 'pop', { s: .4, r: -12 });
    X.cascade(root.querySelectorAll('.xm-invite-rule, .xm-input, .xm-btn'), 900, 70);
  }

  /**
   * 2.2–2.3 The market: one long snowy market painting the camera pans along, a stall per question; the Elf behind the
   * counter; the friend's box on the snow, its paper the score; the creator's Polaroid in the corner, reacting.
   */
  function marketStage(kind) {
    var pic = X.artPic(C.season === 'summer' && X.hasArt('gf-set-market-summer') ? 'gf-set-market-summer' : 'gf-set-market', 'xm-market-pic');
    var pan = h('div.xm-market-pan', pic);
    var counter = X.artPic('gf-prop-counter', 'xm-market-counter');
    var elfEl = elfChar('list', 160, 'xm-market-elf');
    var box = present(null, 'brown', 'is-shop');
    // the friend shopping (the other character), standing behind the box they fill: they act out every answer
    var friendKind = kind === 'cat' ? 'bear' : 'cat';
    var friendEl = X.character(friendKind, 'wave', 150, 'xm-market-friend');
    var badgeHost = X.character(kind, 'fingers-crossed', 96, 'xm-badge-host');
    var badge = h('div.xm-badge', h('div.xm-badge-pic', badgeHost));
    var tags = h('div.xm-tagbar', { 'aria-hidden': 'true' }, Array.from({ length: QUESTIONS }, function (_, i) { return h('i', { 'data-n': i + 1 }); }));
    // the market is alive: snow drifting in front of the stalls (a summer market: warm lights floating instead) and
    // the string lights twinkling, out of focus, close to the lens
    var summer = C.season === 'summer';
    var air = h('div.xm-market-air', { 'aria-hidden': 'true' });
    if (!summer) { X.snow(air, 26); }
    if (!X.reduceMotion) {
      for (var b = 0; b < 9; b++) {
        air.appendChild(h('i.xm-bokeh', { style: 'left:' + Math.round(4 + Math.random() * 92) + '%;top:' + Math.round(4 + Math.random() * (summer ? 70 : 42)) + '%;'
          + '--size:' + Math.round(10 + Math.random() * 22) + 'px;--hue:' + ['#FFD38A', '#FF9C7A', '#FFF1C9', '#9FD8FF'][b % 4] + ';'
          + 'animation-delay:-' + (Math.random() * 4).toFixed(1) + 's;animation-duration:' + (2.6 + Math.random() * 2.4).toFixed(1) + 's' }));
      }
    }
    // the world the camera pushes into (the bubbles, the tag bar and the Polaroid stay where they are)
    var world = h('div.xm-market-world', pan, h('i.xm-market-dim'), elfEl, counter, friendEl, box, air);
    var stage = h('div.xm-cam.is-stage.is-market', world, badge, tags);
    var ctl = {
      el: stage, world: world, elf: elfEl, box: box, badgeHost: badgeHost, kind: kind, friend: friendEl, friendKind: friendKind,
      /** PUSH IN on the box (or back out with scale 1): the whole market leans in on the gift. */
      push: function (scale, on) {
        if (X.reduceMotion) { return; }
        var c = stage.getBoundingClientRect(), r = (on || box).getBoundingClientRect();
        world.style.transformOrigin = f(r.left - c.left + r.width / 2) + 'px ' + f(r.top - c.top + r.height / 2) + 'px';
        world.style.scale = String(scale || 1);
      },
      /** The picked answer card flies into the box: it shrinks into a little parcel on the way (arc, then a drop). */
      catchCard: function (card) {
        var pic = card && card.querySelector('img');
        if (!pic || X.reduceMotion || !pic.animate) { return ctl.drop('gf-prop-parcel', false); }
        var from = pic.getBoundingClientRect(), to = box.getBoundingClientRect();
        var fly = h('img.xm-fly', { src: pic.currentSrc || pic.src, alt: '' });
        fly.style.cssText = 'left:' + f(from.left) + 'px;top:' + f(from.top) + 'px;width:' + f(from.width) + 'px;height:' + f(from.height) + 'px';
        document.body.appendChild(fly);
        var dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height * .3 - (from.top + from.height / 2);
        X.sfx('whoosh');
        return X.ended(fly.animate([
          { transform: 'none', borderRadius: '14px', opacity: 1 },
          { transform: 'translate(' + f(dx * .45) + 'px,' + f(dy * .45 - 90) + 'px) scale(.55) rotate(-12deg)', borderRadius: '18px', opacity: 1, offset: .5 },
          { transform: 'translate(' + f(dx) + 'px,' + f(dy) + 'px) scale(.16) rotate(8deg)', borderRadius: '40px', opacity: .9 }
        ], { duration: 640, easing: 'cubic-bezier(.4,0,.6,1)' })).then(function () {
          fly.remove();
          X.move(box.querySelector('.xm-present-swing'), 'hop');
          X.sfx('drop');
          var c = stage.getBoundingClientRect();
          X.sparkle(stage, to.left - c.left + to.width / 2, to.top - c.top + to.height * .3, 8);
        });
      },
      /** Three right in a row: the stall's string lights flash, a little bell rings. */
      flash: function () {
        stage.classList.remove('is-flash'); stage.getBoundingClientRect(); stage.classList.add('is-flash');
        X.sfx('jingle');
      },
      /** Once on the page: the Elf sized by the stage (his upper half over the counter on every phone). */
      fit: function () {
        // he stands 24% of the width up (behind the counter) and his hat stays under the tag bar (~104px down)
        var W0 = stage.clientWidth, hgt = Math.round(Math.max(96, Math.min(W0 * .38, stage.clientHeight - (22 + W0 * .24) - 108)));
        elfEl.style.height = hgt + 'px';
        elfEl.removeAttribute('data-pose');               // the same pose again, drawn at the new size
        elfPose(elfEl, 'list');
        // the friend: big in the front left, their head under the lines
        // (a little smaller while the shelf is up on a short stage, so the lines above clear their head)
        var share = stage.closest('.is-shelving') ? .36 : .44;
        friendEl.style.height = Math.round(Math.max(92, Math.min(stage.clientHeight * share, W0 * .44, 180))) + 'px';
        friendEl.removeAttribute('data-pose');
        X.pose(friendEl, friendKind, 'fingers-crossed', true);
      },
      /** The friend acts out a moment: a pose, its emotion sticker, and a body move by feeling. */
      react: function (poseName, emoji, move) {
        X.pose(friendEl, friendKind, poseName);
        if (emoji) { emote(stage, friendEl, emoji); }
        if (move) { X.move(friendEl, move); }
      },
      /**
       * PAN to stall position k of n (0 = the street's start, n − 1 = its end): the painting covers the stage and slides
       * by its object-position, so it always runs from its left edge to its right edge, whatever the phone's shape.
       */
      pan: function (k, n, instant) {
        var x = 100 * Math.max(0, Math.min(1, k / Math.max(1, n - 1)));
        if (instant) { pic.style.transition = 'none'; }
        pic.style.objectPosition = f(x) + '% 50%';
        if (instant) { pic.offsetWidth; pic.style.transition = ''; }
      },
      /** The box re-wraps itself (a paper whirl, the new paper lands with a squash). */
      wrap: function (paper) {
        var pic = box.querySelector('.xm-present-pic');
        box.classList.remove('is-whirl'); box.getBoundingClientRect(); box.classList.add('is-whirl');
        X.sfx('rustle');
        return X.pause(320).then(function () {
          X.setArt(pic, 'gf-box-' + paper);
          box.className = box.className.replace(/\bis-(brown|knit|red|gold)\b/, 'is-' + paper);
          var r = box.getBoundingClientRect(), c = stage.getBoundingClientRect();
          X.sparkle(stage, r.left - c.left + r.width / 2, r.top - c.top + r.height / 2, paper === 'gold' ? 22 : 12);
          return X.pause(380);
        });
      },
      /** Something drops into the box from above (a parcel for a right answer, a silly thing for a wrong one). */
      drop: function (artName, silly) {
        var thing = X.artPic(artName, 'xm-drop' + (silly ? ' is-silly' : ''));
        world.appendChild(thing);
        var r = box.getBoundingClientRect(), c = stage.getBoundingClientRect();
        thing.style.left = f(r.left - c.left + r.width / 2) + 'px';
        thing.style.top = f(r.top - c.top + r.height * .2) + 'px';
        thing.addEventListener('animationend', function () { thing.remove(); });
        return X.pause(560).then(function () {
          X.move(box.querySelector('.xm-present-swing'), silly ? 'shake' : 'hop');
          X.sfx(!silly ? 'drop' : /duck/.test(artName) ? 'squeak' : 'rattle');   // the rubber duck squeaks as it lands
        });
      },
      dim: function (on) { stage.classList.toggle('is-dim', on !== false); },
      shake: function () {
        if (X.reduceMotion || !world.animate) { return; }
        world.animate([{ translate: '0 0' }, { translate: '-7px 2px' }, { translate: '6px -2px' }, { translate: '-4px 1px' }, { translate: '0 0' }], { duration: 420, easing: 'ease-out', composite: 'add' });
      }
    };
    return ctl;
  }

  function shop(quiz, roundPromise, friend) {
    var root = X.scene('is-climb.is-shopping');
    var kind = X.kindOf(quiz.gender);
    var ready = roundPromise.then(function (res) {
      var q = res.questions[0];
      return X.loadUrls(q.options.map(function (o) { return answerUrl(q.id, o.index, kind); })
        .concat(X.artUrl(C.season === 'summer' ? 'gf-set-market-summer' : 'gf-set-market'), X.artUrl('gf-box-brown'))).then(function () { return res; });
    }, function (e) { return { error: e }; });
    X.gate(ready, 700).then(function (res) {
      if (!res || res.error || !res.questions) {
        if (res && res.error && res.error.refused) { closed(); return; }
        X.toast(t('ui.offline')); invite(quiz); return;
      }
      var round = res.questions;
      var tag = h('span.xm-ribbon-text');
      var m = marketStage(kind);
      nameTag(m.friend, friend, 'friend');
      var qbox = h('div.xm-qbox');
      var play = h('div.xm-play', X.artPic('ui-snow', 'xm-play-snow'), h('div.xm-ribbon', X.artPic('ui-ribbon', 'xm-ribbon-pic'), tag), qbox);
      play.style.setProperty('--holly', 'url("' + X.artUrl('ui-holly') + '")');
      root.append(m.el, play);
      m.fit();
      var rivals = ((res.tree && res.tree.others) || []).filter(function (r) { return r.score > 0; });
      var names = { creator: quiz.name, friend: friend, them: X.them(quiz.gender) };
      var right = 0, answers = [], streakRight = 0, streakWrong = 0, silly = 0;
      var rightPics = [];                                // the pictures of the answers they got right: they float out of a perfect gift
      // the lines sit on the left, over the box and under the tag bar: the Elf's tail points down to him behind the
      // counter on the right; the creator's tail points up to their Polaroid in the corner. One line at a time.
      var LINE_POS = 'left:10px;top:calc(128px + env(safe-area-inset-top));max-width:min(230px, calc(60% - 14px))';
      // at the shelf the tag bar and the Polaroid have gone (the score is told): the Elf's line moves up into their place,
      // clear of the friend's head on the shorter stage
      var SHELF_POS = 'left:10px;top:calc(56px + env(safe-area-inset-top));max-width:min(230px, calc(60% - 14px))';
      var elfSays = function (text, ms) {
        clearSays(m.el);
        return talking(m.elf, X.sayHold(m.el, text, { who: 'elf', pos: root.classList.contains('is-shelving') ? SHELF_POS : LINE_POS, tail: 'calc(100% - 34px)' }, ms));
      };
      var creatorSays = function (text, ms) { clearSays(m.el); return talking(m.badgeHost, X.sayHold(m.el, text, { who: 'creator', up: true, pos: LINE_POS, tail: 26 }, ms)); };
      // the friend's own lines sit just over their head, the tail on them
      var friendSays = function (text, ms) {
        clearSays(m.el);
        var c = m.el.getBoundingClientRect(), r = m.friend.getBoundingClientRect();
        return talking(m.friend, X.sayHold(m.el, text, { who: 'friend', pos: 'left:8px;bottom:' + Math.round(c.bottom - r.top + 8) + 'px;max-width:min(230px, calc(64% - 14px))',
          tail: Math.max(18, Math.round(r.left - c.left + r.width / 2 - 16)) }, ms));
      };
      var FR = { right: [['cheer', '🎉', 'hop'], ['thumbs-up', '😎', 'hop'], ['laugh', '🙌', 'hop'], ['cheer', '😍', 'hop']],
        wrong: [['facepalm', '🤦', 'droop'], ['gasp', '😱', 'shake'], ['try-not-laugh', '😅', 'droop'], ['facepalm', '🙈', 'droop']] };
      var reacted = { right: 0, wrong: 0 };
      var friendReacts = function (how) { var r = FR[how][reacted[how]++ % FR[how].length]; m.react(r[0], r[1], r[2]); };
      // the intro (about 6 s; a tap skips each line): the market street; the host waves "Get me something good!" and
      // runs off home; the Elf pops up behind the counter and hands over the box in brown paper
      play.classList.add('is-hidden');
      m.elf.style.visibility = 'hidden';
      m.box.style.visibility = 'hidden';
      m.friend.style.visibility = 'hidden';
      m.pan(0, round.length, true);
      X.music(true, 'market');                           // "Jingle Bells" while shopping
      crowd(true);
      bars(m.el);                                        // the opening shot is the film's: bars in, a title card
      var guest = nameTag(castChar(kind, 'wave', Math.round(Math.min(190, m.el.clientHeight * .42)), 'xm-market-host'), quiz.name);
      guest.style.visibility = 'hidden';                 // the title card plays over the empty street; then the host walks in
      m.world.appendChild(guest);
      // paced for a friend fresh from a link (owner, 2026-11-01: the first question within ~10 s): short title card,
      // brisk walks, and the friend walks in while the host is still walking off home (a crossing, not two walks)
      var endHint = tapHint(m.el);
      titleCard(m.el, t('gift.film.market'), 1100).then(function () {
        guest.style.visibility = '';
        X.sfx('footsteps');
        return X.walkIn(guest, kind, -m.el.clientWidth * .5, 700);
      }).then(function () {
        castPose(guest, kind, 'cheer');
        X.sfx(kind + '-hello');
        // under the tag bar and the creator's Polaroid, never over them
        return X.sayHold(m.el, t('gift.market.bye', names), { who: 'creator', pos: 'left:10px;right:10px;top:calc(122px + env(safe-area-inset-top));text-align:center', tail: 'calc(50% - 8px)' }, 1000);
      }).then(function () {
        // a wave goodbye, then they turn and walk off home (the walking frames, facing the way they go)
        clearSays(m.el);
        castPose(guest, kind, 'wave');
        emote(m.el, guest, '👋');
        return X.pause(250);
      }).then(function () {
        X.sfx('footsteps');
        walkOut(guest, kind, m.el.clientWidth * .75, 750).then(function () { guest.remove(); });
        // the friend walks into the market as they go, rubbing their paws: "Leave it to me."
        return X.pause(250).then(function () {
          m.friend.style.visibility = '';
          return X.walkIn(m.friend, m.friendKind, -m.el.clientWidth * .45, 650);
        });
      }).then(function () {
        m.react('wave', null, 'hop');
        X.sfx(m.friendKind + '-hello');
        var line = friendSays(t('gift.market.friendHi', names), QUICK);
        X.pause(250).then(function () { emote(m.el, m.friend, '😎'); });   // once the line is up: the sticker steps around it
        return line;
      }).then(function () {
        clearSays(m.el);
        m.elf.style.visibility = '';
        X.enter(m.elf, 0, 'pop', { y: 60, s: .6 });
        X.sfx('pop');
        X.sfx('jingle');
        return X.pause(200);
      }).then(function () {
        m.box.style.visibility = '';
        X.enter(m.box, 0, 'pop', { y: -120, s: .5, r: -20 });
        X.sfx('drop');
        X.sfx('elf-hm');
        m.react('gasp', '👀');
        return elfSays(t('gift.market.elfIntro', names), QUICK);
      }).then(function () {
        X.sfx('swipe');
        endHint();
        bars(m.el, false);
        play.classList.remove('is-hidden');
        return X.pause(300);
      }).then(function () { ask(0, true); });

      function ask(i, keep) {
        var q = round[i], k = i + 1;
        if (round[i + 1]) { X.loadUrls(round[i + 1].options.map(function (o) { return answerUrl(round[i + 1].id, o.index, kind); })); }
        tag.textContent = t('gift.question.tag', { k: k, n: round.length });
        if (!keep) { clearSays(m.el); }
        m.pan(i, round.length);
        if (i) { X.sfx('footsteps'); X.pause(700).then(function () { X.sfx('stall'); }); }   // a few steps on, the next stall's bell
        elfPose(m.elf, 'list');
        X.pose(m.badgeHost, kind, 'fingers-crossed', true);
        X.pose(m.friend, m.friendKind, 'fingers-crossed', true);   // the friend thinks it over with them
        var locked = false;
        var opts = h('div.xm-opts.is-two');
        q.options.forEach(function (o) {
          var b = h('button.xm-opt', { type: 'button', onclick: function () {
            if (locked) { return; }
            locked = true;
            if (window.scrollY > 4) { window.scrollTo({ top: 0, behavior: X.reduceMotion ? 'auto' : 'smooth' }); }
            answers.push(o.index);
            b.classList.add('is-picked');
            // the tap's click alone first, then the voice and the drum roll a beat later: played at the same instant
            // (once the recorded voices had loaded, on a phone during question 1) they buried the 40 ms click, so
            // from question 2 the tap seemed muted (the owner's team, 2026-11-03)
            X.sfx('tap');
            setTimeout(function () { X.sfx(kind + '-nervous'); X.sfx('drumroll', .5); }, 150);
            X.buzz(12);
            // the card lifts and glows over a short drum roll, then the answer lands
            b.classList.add('is-lift');
            if (o.correct) { rightPics.push(answerUrl(q.id, o.index, kind)); }
            X.pause(560).then(function () { b.classList.remove('is-lift'); return o.correct ? hit(b, k) : miss(b, opts, k); }).then(function () { return rhythm(k); }).then(function () {
              if (k < round.length) { ask(i + 1, !breaks(k)); } else { finish(); }
            });
          } }, answerImg(q.id, o.index, kind), h('span.xm-opt-text', X.fill(o.text, quiz.name)));
          opts.appendChild(b);
        });
        var card = h('div.xm-q', X.marked(q.question, quiz.name));
        qbox.textContent = '';
        qbox.append(card, opts);
        X.fitText([tag].concat(Array.from(opts.querySelectorAll('.xm-opt-text'))));
        X.enter(card, 0, 'main', { y: -16 });
        X.cascade(opts.children, 180, 90, 'pop', { y: 26, s: .9 });
      }
      function quipHold(k) { return k >= round.length - 1 ? null : breaks(k) ? undefined : QUICK; }
      function quip(key, k) {
        var ms = quipHold(k);
        return ms === null ? X.pause(300) : elfSays(t(X.poolLine(key, 8), names), ms);
      }
      /** A right answer: a parcel drops into the box; at 5, 7 and 9 right the box re-wraps itself. */
      function hit(b, k) {
        b.classList.add('is-right');
        right++; streakRight++; streakWrong = 0;
        var t1 = m.el.querySelector('.xm-tagbar [data-n="' + k + '"]');
        if (t1) { t1.classList.add('is-right'); }
        clearSays(m.el);
        elfPose(m.elf, 'tape');
        X.pose(m.badgeHost, kind, 'cheer', true);
        X.sfx('correct');
        X.sfx(kind + (right >= 7 ? '-woohoo' : '-cheer'));
        friendReacts('right');
        if (Math.random() < .4) { X.pause(300).then(function () { emote(m.el, m.elf, ['😤', '🙄', '😒'][right % 3]); }); }   // the Elf, grudging
        // the picked card itself flies into the box: what they chose is what goes into the gift
        return m.catchCard(b).then(function () {
          X.sfx('bulb', right);
          var upgrade = { 5: 'knit', 7: 'red', 9: 'gold' }[right];
          if (!upgrade) { return null; }
          // a re-wrap is a moment: the camera pushes in on the box while the paper whirls, then eases back; the friend
          // can't believe it, then cheers
          m.push(upgrade === 'gold' ? 1.4 : 1.28);
          m.react('gasp', '🤩');
          return X.pause(380).then(function () { return m.wrap(upgrade); }).then(function () {
            X.sfx('top');
            m.react('cheer', upgrade === 'gold' ? '👑' : '✨', 'hop');
            if (upgrade === 'gold') { X.confetti(m.el, ['#FFD34D', '#FFE9A0', '#F2BF26', '#FFFFFF']); }
            return X.pause(500);
          }).then(function () { m.push(1); return elfSays(t('gift.wrap.' + upgrade), quipHold(k) || undefined); });
        }).then(function (said) {
          if (said) { return; }
          var passed = rivals.filter(function (r) { return r.score === right - 1; })[0];
          if (passed) { X.sfx('pop'); m.react('thumbs-up', '😏', 'hop'); return elfSays(t('gift.rhythm.passed', { name: passed.name }), quipHold(k) || undefined); }
          if (streakRight === 3) { m.flash(); m.react('laugh', '🔥', 'hop'); return elfSays(t('gift.rhythm.streak', names), quipHold(k) || undefined); }
          // now and then the creator cheers from their Polaroid instead of the Elf's quip
          if (quipHold(k) !== null && Math.random() < .35) { return creatorSays(t(X.poolLine('gift.creator.right', 3), names), quipHold(k) || undefined); }
          return quip('gift.elf.right', k);
        });
      }
      /** A wrong answer: the Elf drops something silly in; the box rattles; the right card shows. */
      function miss(b, opts, k) {
        b.classList.add('is-wrong');
        streakWrong++; streakRight = 0;
        var good = Array.prototype.find.call(opts.children, function (o) { return o !== b; });
        if (good) { good.classList.add('is-answer'); }
        var t1 = m.el.querySelector('.xm-tagbar [data-n="' + k + '"]');
        if (t1) { t1.classList.add('is-wrong'); }
        clearSays(m.el);
        elfPose(m.elf, 'socks');
        X.pose(m.badgeHost, kind, 'facepalm', true);
        X.sfx('wrong');
        X.sfx(kind + (streakWrong >= 2 ? '-groan' : '-dismay'));
        friendReacts('wrong');
        X.pause(500).then(function () { X.sfx('elf-chuckle'); emote(m.el, m.elf, ['😏', '🤭', '😂'][streakWrong % 3]); });
        return m.drop('gf-item-' + SILLY[silly++ % SILLY.length], true).then(function () {
          m.shake();
          if (streakWrong === 3) { m.react('facepalm', '💀', 'droop'); return elfSays(t('gift.rhythm.slump', names), quipHold(k) || undefined); }
          if (quipHold(k) !== null && Math.random() < .35) { return creatorSays(t(X.poolLine('gift.creator.wrong', 3), names), quipHold(k) || undefined); }
          return quip('gift.elf.wrong', k);
        });
      }
      /**
       * A beat played on the whole phone: the question panel slides away and the market grows to fill the screen
       * (letterboxed), `scene()` plays, then the market shrinks back, the camera eases out and the panel returns.
       */
      function interlude(scene) {
        qbox.textContent = '';
        play.classList.add('is-hidden');
        root.classList.add('is-interlude');
        bars(m.el);
        return X.pause(450).then(scene).then(function () {
          clearSays(m.el);
          bars(m.el, false);
          m.push(1);
          root.classList.remove('is-interlude');
          play.classList.remove('is-hidden');
          return X.pause(450);
        });
      }
      /** The beats that break the rhythm: the cocoa stall after question 4, the dimmed market before the last one. */
      function breaks(k) { return k === 4 || k === round.length - 1; }
      function rhythm(k) {
        if (k === 4) {
          // a breath: the questions slide away, the film fills the phone, CUT in close on the Elf and his cocoa
          clearSays(m.el);
          return interlude(function () {
            m.push(1.6, m.elf);
            elfPose(m.elf, 'cocoa');
            X.sfx('elf-sigh');
            X.pause(450).then(function () { X.sfx('sip'); emote(m.el, m.elf, '☕'); });
            m.react(right >= 3 ? 'thumbs-up' : 'gasp', right >= 3 ? '😌' : '😬');
            return X.pause(500).then(function () { return elfSays(t(right >= 3 ? 'gift.rhythm.cocoaGood' : 'gift.rhythm.cocoaBad'), 1300); });
          });
        }
        if (k === round.length - 1) {
          // the last one: the questions slide away, the market goes dark, one stall still glowing; the camera on the box
          clearSays(m.el);
          return interlude(function () {
            m.dim(true);
            m.push(1.3);
            X.sfx('drumroll', 1.1);
            m.react('fingers-crossed', '🤞');
            // the gold paper is "right there" only when one more right answer reaches the top band (9 / 10)
            return X.pause(900).then(function () { return elfSays(t(right >= 8 ? 'gift.rhythm.final' : 'gift.rhythm.finalFar')); })
              .then(function () { m.dim(false); });
          });
        }
        return Promise.resolve();
      }
      /**
       * THE CLIMAX at the counter (about 9 s; a tap speeds the lines): the market goes quiet and dark, the bars close in,
       * the Elf seals the box; the Elf and the friend trade a line; a drum roll; the gift tag swings down with the score
       * counting up a point at a time and the gift stamped across it; both react.
       */
      function climax(score, zone) {
        var tagN = h('b.xm-scoretag-n', '0');
        var stamp = h('span.xm-scoretag-stamp.is-' + zone, t('gift.ending.' + zone + '.title'));
        var board = h('div.xm-scoretag', h('i.xm-scoretag-string'),
          h('span.xm-scoretag-to', tn('gift.climax.tag', { friend: friend, creator: quiz.name }, ['friend', 'creator'])),
          h('span.xm-scoretag-score', tagN, h('small', '/10')), stamp);
        clearSays(m.el);
        crowd(false);
        m.dim(true);
        bars(m.el);
        m.push(1.18);
        elfPose(m.elf, 'tape');
        X.sfx('ribbon');
        return X.pause(650).then(function () {
          return elfSays(t('gift.climax.elf', names));
        }).then(function () {
          m.react({ top: 'thumbs-up', front: 'cheer', bottom: 'fingers-crossed', box: 'try-not-laugh' }[zone], { top: '😎', front: '😌', bottom: '🫣', box: '🙈' }[zone], 'hop');
          return friendSays(t('gift.climax.friend.' + zone, names));
        }).then(function () {
          elfPose(m.elf, 'list');
          X.sfx('drumroll', 1.3);
          return elfSays(t('gift.climax.count', names), 700);
        }).then(function () {
          clearSays(m.el);
          m.el.appendChild(board);
          X.sfx('whoosh');
          return X.pause(650);
        }).then(function () {
          // the score counts up a point at a time, the last points slower
          var n = 0;
          return (function up() {
            if (n >= score) { return X.pause(score ? 300 : 600); }
            n++;
            tagN.textContent = String(n);
            X.sfx('bulb', n);
            tagN.classList.remove('is-pop'); tagN.getBoundingClientRect(); tagN.classList.add('is-pop');
            return X.pause(n >= score - 1 ? 300 : 160).then(up);
          })();
        }).then(function () {
          stamp.classList.add('is-in');
          X.sfx('drop');
          X.sfx(zone);
          if (zone === 'top') { X.confetti(m.el, ['#FFD34D', '#FFE9A0', '#F2BF26', '#FFFFFF']); elfPose(m.elf, 'hat-off'); m.react('cheer', '🥳', 'hop'); }
          else if (zone === 'front') { elfPose(m.elf, 'eye-roll'); m.react('laugh', '😊', 'hop'); }
          else if (zone === 'bottom') { elfPose(m.elf, 'chuckle'); m.react('try-not-laugh', '😬', 'droop'); }
          else { elfPose(m.elf, 'chuckle'); m.react('facepalm', '💀', 'droop'); }
          X.pause(250).then(function () { emote(m.el, m.elf, { top: '🎩', front: '👍', bottom: '🤭', box: '😂' }[zone]); });
          return X.pause(1700);
        }).then(function () {
          board.classList.add('is-out');
        });
      }
      /**
       * THE SHELF: the score opens one shelf of the shop (gold, good, "the thought counts", the bargain bin). The
       * lights come back up, the Elf waves at it, and the panel returns as the shelf: six gifts at a time (the local
       * treat and the creator's vibe first), "Show me others" for more. A tap picks one (the friend reacts), "Wrap it"
       * flies it into the box and the Elf tapes it shut. Resolves with the gift's key.
       */
      function shelf(zone) {
        var pages = shelfPages(zone, quiz.mood, C.country), page = 0, chosen = null, picks = 0;
        // a shelf with nothing on it (a catalogue change) never leaves the friend stuck: the shelf's own gift
        if (!pages.length || !pages[0] || !pages[0].length) { return Promise.resolve(defaultGift(zone, quiz.mood)); }
        var grid = h('div.xm-shelf.is-' + zone);
        var more = h('button.xm-chip.xm-shelf-more', { type: 'button' }, t('gift.shelf.more'));
        var done;
        var wrapIt = button(t('gift.shelf.wrap', names), 'is-gold.xm-shelf-wrap', function () {
          if (!chosen) { return; }
          wrapIt.disabled = true; more.disabled = true;
          grid.classList.add('is-locked');
          X.track('gift_pick', { tier: zone, gift: chosen.key });
          X.sfx('ribbon');
          m.react('cheer', null, 'hop');                 // the Elf's line says the rest
          m.catchCard(chosen.el.isConnected ? chosen.el : null).then(function () {
            elfPose(m.elf, 'tape');
            X.sfx('tear');
            return elfSays(t('gift.shelf.wrapped', names), QUICK);
          }).then(function () { done(chosen.key); });
        });
        wrapIt.disabled = true;
        function render(first) {
          grid.textContent = '';
          pages[page].forEach(function (g) {
            // the pick survives paging: on its page it shows picked again
            var mine = chosen && chosen.key === g.key;
            var card = h('button.xm-gift-card' + (mine ? '.is-picked' : ''), { type: 'button', 'aria-pressed': mine ? 'true' : 'false' },
              h('span.xm-gift-stage', giftPic(g.key, 'xm-gift-pic')),
              h('span.xm-gift-name', giftName(g.key)),
              g.local ? h('span.xm-gift-why.is-local', '📍 ' + t('gift.shelf.local'))
                : g.vibe ? h('span.xm-gift-why.is-vibe', (VIBE_EMOJI[quiz.mood] || '✨') + ' ' + t('gift.shelf.vibe')) : null);
            if (mine) { chosen.el = card; }
            card.addEventListener('click', function () {
              if (grid.classList.contains('is-locked') || (chosen && chosen.el === card)) { return; }
              grid.querySelectorAll('.xm-gift-card').forEach(function (c) { c.classList.remove('is-picked'); c.setAttribute('aria-pressed', 'false'); });
              card.classList.add('is-picked');
              card.setAttribute('aria-pressed', 'true');
              chosen = { key: g.key, el: card };
              wrapIt.disabled = false;
              // a short phone: "Wrap it" comes into view under the finger
              if (wrapIt.getBoundingClientRect().bottom > window.innerHeight) { wrapIt.scrollIntoView({ block: 'nearest', behavior: X.reduceMotion ? 'auto' : 'smooth' }); }
              X.sfx('tap');
              X.sfx('bulb', 3 + (picks % 5));
              X.buzz(10);
              // the friend weighs it up in the tier's mood (their line every other pick, so taps never queue lines)
              var r = { top: ['cheer', '🥹'], front: ['thumbs-up', '😌'], bottom: ['try-not-laugh', '😅'], box: ['facepalm', '🙈'] }[zone];
              m.react(r[0], null, 'hop');
              if (picks++ % 2 === 0) { friendSays(t('gift.shelf.friend.' + zone + '.' + (1 + (picks >> 1) % 2), names), QUICK); }
              else { clearSays(m.el); emote(m.el, m.friend, r[1]); }
            });
            grid.appendChild(card);
          });
          X.cascade(grid.children, first ? 250 : 0, first ? 90 : 50, 'pop', { y: 24, s: .85 });
        }
        more.addEventListener('click', function () {
          page = (page + 1) % pages.length;
          X.sfx('swipe');
          clearSays(m.el);
          render(false);
        });
        if (pages.length < 2) { more.hidden = true; }
        return new Promise(function (resolve) {
          done = resolve;
          // the lights come back up on the market: the shop is open
          m.dim(false);
          bars(m.el, false);
          m.push(1);
          crowd(true);
          elfPose(m.elf, 'clipboard');
          X.pose(m.friend, m.friendKind, 'gasp');
          tag.textContent = t('gift.shelf.name.' + zone);
          qbox.textContent = '';
          qbox.append(h('div.xm-q.xm-shelf-head', tn('gift.shelf.pick', names, ['creator'])),
            h('p.xm-shelf-why', t('gift.shelf.why', { creator: quiz.name, n: right })),
            grid, h('div.xm-shelf-actions', more, wrapIt));
          play.classList.add('is-shelf');
          play.classList.remove('is-hidden');
          root.classList.add('is-shelving');
          m.fit();                                       // the cast refitted to the shorter stage…
          X.pause(120).then(function () { if (root.classList.contains('is-shelving')) { m.fit(); X.pose(m.friend, m.friendKind, 'gasp'); } });   // …once it has settled
          elfPose(m.elf, 'clipboard');
          X.pose(m.friend, m.friendKind, 'gasp');
          X.fitText([tag]);
          X.sfx('swipe');
          X.sfx('jingle');
          render(true);
          elfSays(t('gift.shelf.elf.' + zone, names), QUICK);
        });
      }
      function finish() {
        qbox.textContent = '';
        play.classList.add('is-hidden');
        var score = right, zone = zoneOf(score), gift = null;
        var save = X.sendPlay(quiz.id, { playerName: friend, answers: answers, submissionId: X.randomId(24) });
        // the climax at the counter; the shelf the score opened; then the box closes and the WHIP to Christmas morning
        var film = climax(score, zone).then(function () {
          return shelf(zone);
        }).then(function (key) {
          gift = key;
          holdPose(X.kindOf(quiz.gender), key);           // the creator holds it in the morning: loaded during the wrap
          // the pick goes in their box once the play is saved (proved with the key the save gave them); kept in this
          // browser first, so a slow or failed save can't lose it (sendPick / resendPick)
          X.store(PICK_KEY + quiz.id, key);
          save.then(function (res) { return sendPick(quiz.id, key, res); }).catch(function (e) { if (!(e && e.refused)) { resendPick(quiz.id); } });
          qbox.textContent = '';
          play.classList.add('is-hidden');
          play.classList.remove('is-shelf');
          root.classList.remove('is-shelving');
          m.fit();
          clearSays(m.el);
          crowd(false);
          bars(m.el);
          m.push(1.35);
          X.sfx('ribbon');
          return X.pause(500);
        }).then(function () {
          return new Promise(function (done) { whip(function () { done(morningFilm(quiz, zone, score, friend, rightPics, gift)); }); });
        });
        Promise.all([save.catch(function (e) { return { error: e }; }), film]).then(function (all) {
          var res2 = all[0];
          if (res2.error && res2.error.refused && res2.error.status === 404) { closed(); return; }
          if (res2.error && res2.error.refused) { X.toast(t('ui.error')); }
          var p = res2.error ? { name: friend, score: score, ending: zone, perfect: score >= PERFECT } : X.played(quiz.id) || res2.player;
          if (!res2.error) { p.id = res2.player.id; }
          p.gift = gift;
          X.track('gift_play_end', { ending: p.ending });
          result(quiz, p, true);
        });
      }
    });
  }

  // ══════════════════════════════════════ ACT 3 — Christmas morning: the unwrap ═══════════════════════════
  /**
   * The gift's "From: …" tag on the morning rug: the word on a small line of its own over the name, so the tag stays
   * about a name wide and never covers the host's or the friend's name tag beside the gift (long names, small phones).
   */
  function fromLabel(name) {
    return h('span.xm-present-tag.is-from.is-stacked', h('small.xm-from-word', t('gift.invite.from')), h('span.xm-from-name', name));
  }
  /** The morning stage: the living room in sunrise light, the gift on the rug, the host and the Elf. */
  function morningStage(quiz, zone, opts) {
    opts = opts || {};
    var kind = X.kindOf(quiz.gender);
    // sized by the phone: the host about half the width, the Elf a little smaller (room for the gift between them)
    var hostH = Math.round(Math.min(220, window.innerHeight * .28, window.innerWidth * .56));
    var host = nameTag(castChar(kind, opts.hostPose || 'shake-' + WRAP[zone], hostH, 'xm-morning-host'), quiz.name);
    var elfEl = elfChar(opts.elfPose || 'clipboard', Math.round(hostH * .72), 'xm-morning-elf');
    var gift = h('div.xm-morning-gift', present(null, WRAP[zone], 'is-morning'));
    // the bare wall above them: a garland swag, and the host's own photo framed under it (their home, their morning)
    // (the frame is 34% of the stage's width in the film, 24% on the result: gift.css)
    var photo = X.character(kind, 'cheer', Math.round(Math.min(window.innerWidth, 480) * (opts.hostPose ? .24 : .34) * 1.15), 'xm-morning-photo');
    var wall = h('div.xm-morning-wall', { 'aria-hidden': 'true' }, X.artPic('ui-garland', 'xm-morning-garland is-left'),
      X.artPic('ui-garland', 'xm-morning-garland is-right'), h('div.xm-morning-frame', photo));
    // the box's light goes on a twin of the gift's spot BEHIND the cast (owner, 2026-11-03: the rays washed over the
    // characters): same place and size as the gift (an invisible copy of its box gives the height), under everyone
    var light = h('div.xm-morning-light', { 'aria-hidden': 'true' }, X.artPic('gf-box-' + WRAP[zone], 'xm-morning-light-box'));
    var stage = h('div.xm-cam.is-stage.is-morning', X.artPic('gf-set-room-morning', 'xm-morning-bg'), wall, h('i.xm-morning-sun'), light, gift, elfEl, host);
    return { el: stage, host: host, elf: elfEl, gift: gift, light: light, kind: kind, name: quiz.name };
  }
  /**
   * Where each paper's top meets the box, in % of its picture's height: the left edge, the front corner, the right
   * edge. The red and the gold boxes have a lid that lifts off; the brown paper and the knitted wool tear open.
   */
  var SEAMS = { brown: [42, 55, 41, true], knit: [47, 57, 46, true], red: [45, 59, 44, false], gold: [52, 62, 51, false] };
  function seamPoints(seam) {
    var torn = seam[3], n = torn ? 12 : 2, pts = [];
    for (var i = 0; i <= n; i++) {
      var x = i / n * 100;
      var y = x <= 50 ? seam[0] + (seam[1] - seam[0]) * x / 50 : seam[1] + (seam[2] - seam[1]) * (x - 50) / 50;
      if (torn && i % 2) { y += 3.5; }                  // a ragged tear
      pts.push(f(x) + '% ' + f(y) + '%');
    }
    return pts;
  }
  /**
   * THE REVEAL, the same on both sides (the friend's Christmas morning, the creator's unboxing): the box trembles and
   * light leaks out of its seam; the lid flies off (or the paper tears away); light bursts out; the gift slowly rises
   * out of the opening from behind the box's front wall, then its name comes up. The box is cut in two along its
   * seam (two copies of its picture, clipped), so the base the gift came out of stays where it was.
   * opts: still (the last frame at once, for the result), caption (default true), rays (default true), stage (the
   * flash and the sparkles), onBurst (the moment the light comes out), empty (with `still`: the opened box only, its
   * gift already taken out), from (a handwritten "from Riya 💛" under the name). Resolves with the gift's element.
   */
  function revealGift(present, wrap, key, opts) {
    opts = opts || {};
    var swing = present.querySelector('.xm-present-swing'), pic = swing.querySelector('.xm-present-pic');
    var seam = SEAMS[wrap] || SEAMS.red, pts = seamPoints(seam);
    var lid = X.artPic('gf-box-' + wrap, 'xm-reveal-lid'), body = X.artPic('gf-box-' + wrap, 'xm-reveal-body');
    lid.style.clipPath = 'polygon(0% 0%, 100% 0%, ' + pts.slice().reverse().join(', ') + ')';
    body.style.clipPath = 'polygon(' + pts.join(', ') + ', 100% 100%, 0% 100%)';
    var glow = h('i.xm-reveal-glow', { 'aria-hidden': 'true', style: 'top:' + seam[1] + '%' });
    var rays = opts.rays === false ? null : h('i.xm-reveal-rays', { 'aria-hidden': 'true', style: 'top:' + seam[1] + '%' });
    var name = opts.caption === false ? null : h('span.xm-reveal-name', giftName(key), opts.from ? h('small.xm-reveal-from', opts.from) : null);
    var thing = opts.empty ? null : h('div.xm-reveal-gift', { style: 'bottom:' + (100 - seam[1]) + '%' }, giftPic(key, 'xm-reveal-pic'), name);
    present.classList.add('is-revealing', seam[3] ? 'is-torn' : 'is-lid');
    pic.style.visibility = 'hidden';                     // it keeps the box's size; the two halves draw it
    // opts.behind: a layer under the characters lined up with the box (the morning's light); the rays go there, so
    // they shine behind the cast and the gift instead of over their faces
    var behind = rays && opts.behind ? opts.behind : null;
    if (behind) { behind.appendChild(rays); }
    swing.append(behind ? '' : rays || '', thing || '', body, glow, lid);    // back to front: light, gift, the box's front, the seam's glow, the lid
    var done = function () { present.classList.add('is-revealed'); if (behind) { behind.classList.add('is-on'); } return thing; };
    if (opts.still || X.reduceMotion || !thing.animate) { return Promise.resolve(done()); }
    var flashAt = function () {
      if (!opts.stage) { return; }
      var r = present.getBoundingClientRect(), c = opts.stage.getBoundingClientRect();
      X.sparkle(opts.stage, r.left - c.left + r.width / 2, r.top - c.top + r.height * seam[1] / 100, 18);
      var flash = h('i.xm-reveal-flash', { style: 'left:' + f(r.left - c.left + r.width / 2) + 'px;top:' + f(r.top - c.top + r.height * seam[1] / 100) + 'px' });
      opts.stage.appendChild(flash);
      X.pause(900).then(function () { flash.remove(); });
    };
    // 1. it trembles, harder and harder, and light leaks out of the seam
    X.sfx('drumroll', 1.1);
    X.sfx('rattle');
    present.classList.add('is-leak');
    var tremble = swing.animate([{ rotate: '0deg' }, { rotate: '-2deg' }, { rotate: '2deg' }, { rotate: '-3deg' }, { rotate: '3deg' }, { rotate: '-5deg', scale: '1.03' },
      { rotate: '5deg', scale: '1.05' }, { rotate: '-4deg', scale: '1.06' }, { rotate: '0deg', scale: '1.04' }], { duration: 1100, easing: 'ease-in' });
    return X.ended(tremble).then(function () {
      // 2. the lid flies off (spinning away), or the paper tears and peels off
      X.sfx(seam[3] ? 'tear' : 'pop');
      X.sfx('whoosh');
      present.classList.add('is-burst');
      if (behind) { behind.classList.add('is-on'); }
      if (opts.onBurst) { opts.onBurst(); }
      flashAt();
      X.buzz(20);
      lid.animate(seam[3]
        ? [{ transform: 'none', opacity: 1 }, { transform: 'translate(-28%, -70%) rotate(-24deg)', opacity: 1, offset: .45 }, { transform: 'translate(-90%, -10%) rotate(-70deg)', opacity: 0 }]
        : [{ transform: 'none', opacity: 1 }, { transform: 'translate(10%, -120%) rotate(16deg)', opacity: 1, offset: .45 }, { transform: 'translate(85%, -40%) rotate(80deg)', opacity: 0 }],
        { duration: 900, easing: 'cubic-bezier(.25,.7,.4,1)', fill: 'forwards' });
      return X.pause(260);
    }).then(function () {
      // 3. the gift rises slowly out of the light, from behind the front of the box
      X.sfx('sparkle');
      [0, 1, 2, 3, 4].forEach(function (i) { X.pause(220 + i * 170).then(function () { X.sfx('bulb', i + 2); }); });
      var END = 'translate(-50%, -8%) scale(1)';
      var rise = thing.animate([
        { transform: 'translate(-50%, 34%) scale(.42)', opacity: 0 },
        { transform: 'translate(-50%, 24%) scale(.5)', opacity: 1, offset: .14 },
        { transform: 'translate(-50%, -14%) scale(1.07)', opacity: 1, offset: .78 },
        { transform: END, opacity: 1 }
      ], { duration: 1500, easing: 'cubic-bezier(.22,.68,.25,1)' });
      return X.ended(rise).then(function () { thing.style.transform = END; thing.style.opacity = '1'; });
    }).then(function () {
      // 4. it settles, glowing, and its name comes up under it
      present.classList.add('is-named');
      if (opts.stage) {
        var r = thing.getBoundingClientRect(), c = opts.stage.getBoundingClientRect();
        X.sparkle(opts.stage, r.left - c.left + r.width / 2, r.top - c.top + r.height * .4, 10);
      }
      return X.pause(name ? 450 : 150).then(done);
    });
  }
  /** The little heart after "from {friend}" on the gift's card, by the shelf it came from. */
  var FROM_HEART = { top: '💛', front: '💝', bottom: '🫣', box: '🙈' };
  /**
   * THE RECEIVING: the gift floats out of its box into the host's arms and they hug it to their chest (`pose`, starry-
   * eyed by default). Resolves with its animation, which `setDown` plays back (into the box before the big hug).
   */
  function receive(s, thing, pose, gift) {
    // a gift drawn in the host's arms (gf-{cat|bear}-hug-{gift}, animated from a Flow clip): they hold THAT gift
    var own = gift && X.hasArt('gf-' + s.kind + '-hug-' + gift) ? 'hug-' + gift : null;
    if (own) { pose = own; }
    castPose(s.host, s.kind, 'gasp');
    X.sfx('whoosh');
    if (!thing.animate || X.reduceMotion) { castPose(s.host, s.kind, pose || 'admire'); return Promise.resolve(null); }
    thing.classList.add('is-held');
    var tr = thing.getBoundingClientRect(), hr = s.host.getBoundingClientRect();
    var k = Math.min(1, hr.width * .46 / tr.width);
    // held low in front of them (clear of the face, the paws over it); the way there arcs up a little
    var dx = hr.left + hr.width * .5 - (tr.left + tr.width / 2), dy = hr.top + hr.height * .92 - tr.bottom;
    var at = function (x, y, sc, r) { return 'translate(calc(-50% + ' + f(x) + 'px), calc(-8% + ' + f(y) + 'px)) scale(' + f(sc) + ') rotate(' + r + 'deg)'; };
    var anim = thing.animate([{ transform: at(0, 0, 1, 0) }, { transform: at(dx * .5, dy * .5 - 46, (1 + k) / 2, -7), offset: .5 }, { transform: at(dx, dy, k, 0) }],
      { duration: 950, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
    return X.ended(anim).then(function () {
      castPose(s.host, s.kind, pose || 'admire');
      if (own) { thing.style.visibility = 'hidden'; X.sfx('sparkle'); }   // it is in their arms now, drawn
      X.move(s.host, 'hop');
      X.sfx('pop');
      return anim;
    });
  }
  /** The held gift goes back into its box (the hug needs both arms). */
  function setDown(thing, anim) {
    if (!anim) { return Promise.resolve(); }
    thing.style.visibility = '';
    anim.reverse();
    return X.ended(anim).then(function () { thing.classList.remove('is-held'); });
  }
  /**
   * A WEARABLE goes on: held up against them for a look; a ring of sparkles and it's on (their pose wearing it); a twirl
   * to show it off. The coal goes into the paw the same way (no twirl).
   */
  function wearOn(s, thing, pose, twirl) {
    return receive(s, thing).then(function () {
      X.sfx('rustle');
      return X.pause(650);
    }).then(function () {
      var hr = s.host.getBoundingClientRect(), c = s.el.getBoundingClientRect();
      var x = hr.left - c.left + hr.width / 2, y = hr.top - c.top + hr.height * .55;
      var ring = h('i.xm-poof', { 'aria-hidden': 'true', style: 'left:' + f(x) + 'px;top:' + f(y) + 'px' });
      s.el.appendChild(ring);
      X.pause(900).then(function () { ring.remove(); });
      X.sparkle(s.el, x, y, 18);
      X.sfx('sparkle');
      thing.style.visibility = 'hidden';
      castPose(s.host, s.kind, pose);
      X.move(s.host, 'pop');
      return X.pause(420);
    }).then(function () {
      if (twirl === false || !s.host.animate || X.reduceMotion) { return null; }
      X.sfx('whoosh');
      X.sfx(s.kind + '-woohoo');
      return X.ended(s.host.animate([{ scale: '1 1' }, { scale: '-1 1', offset: .25 }, { scale: '1 1', offset: .5 }, { scale: '-1 1', offset: .75 }, { scale: '1 1' }],
        { duration: 950, easing: 'ease-in-out' }));
    });
  }
  /** The friend's right answers float up out of the perfect gift, one by one, glowing (what they knew about them). */
  function floatAnswers(s, pics) {
    if (!pics.length || X.reduceMotion) { return X.pause(400); }
    var c = s.el.getBoundingClientRect();
    var n = Math.min(pics.length, 10), size = Math.round(Math.min(64, c.width / 6.2));
    // a gentle arc across the middle of the room, in the gap between the photo on the wall and the cast's heads
    var photo = s.el.querySelector('.xm-morning-frame'), heads = Math.min(s.host.getBoundingClientRect().top, s.elf.getBoundingClientRect().top) - c.top;
    var base = heads - 8 - size / 2, wallFloor = photo ? photo.getBoundingClientRect().bottom - c.top + 6 + size / 2 : base - 60;
    var rx = Math.min(c.width / 2 - size / 2 - 16, 170), ry = Math.max(0, Math.min(60, base - wallFloor));
    pics.slice(0, n).forEach(function (url, i) {
      // the first on the left, the last on the right
      var a = Math.PI * (1 - (n === 1 ? .5 : i / (n - 1)));
      var x = c.width / 2 + Math.cos(a) * rx, y = base - Math.sin(a) * ry;
      // fanned like a hand of photos (a narrow phone has room only for an overlapping row)
      var card = h('img.xm-morning-answer', { src: url, alt: '', style: 'left:' + f(x) + 'px;top:' + f(y) + 'px;width:' + size + 'px;height:' + size + 'px;animation-delay:' + (i * 150) + 'ms;'
        + 'rotate:' + f(n === 1 ? 0 : (i / (n - 1) - .5) * 24) + 'deg;z-index:' + (8 + Math.min(2, Math.floor(i / 4))) });   // under every line (11), even with ten
      s.el.appendChild(card);
      X.pause(i * 150).then(function () { X.sfx('bulb', i + 1); });
    });
    return X.pause(n * 150 + 1900);                     // the fan floats away before anyone speaks over it
  }
  /** The host and the friend hug (the friend is the other character): the host's pose gives way to the pair. */
  /**
   * The friend (the other character) walks into the morning from the left, in front of the Elf, and says their line
   * (`key`, default "Merry Christmas, {creator}!"); they stay, in `pose` with `emoji`. Resolves with the friend.
   */
  function friendIn(s, key, pose, emoji) {
    var fk = s.kind === 'cat' ? 'bear' : 'cat';
    var fr = s.friend = nameTag(X.character(fk, 'wave', Math.round(s.host.offsetHeight * .96), 'xm-morning-friend'), s.friendName, 'friend');
    s.el.appendChild(fr);
    X.sfx('footsteps');
    return X.walkIn(fr, fk, -s.el.clientWidth * .6, 700).then(function () {
      X.pose(fr, fk, pose || 'wave');
      X.sfx(fk + '-hello');
      var c = s.el.getBoundingClientRect(), r = fr.getBoundingClientRect();
      var line = talking(fr, X.sayHold(s.el, t(key || 'gift.morning.friendHi', { creator: s.name }), { who: 'friend',
        pos: 'left:10px;bottom:' + Math.round(c.bottom - r.top + 14) + 'px;max-width:min(240px, 70%)', tail: Math.max(18, Math.round(r.left - c.left + r.width / 2 - 16)) }, 900));
      if (emoji) { X.pause(250).then(function () { emote(s.el, fr, emoji); }); }   // once the line is up
      return line;
    }).then(function () { clearSays(s.el); return fr; });
  }
  function hug(s) {
    return friendIn(s).then(function (fr) {
      var fk = s.kind === 'cat' ? 'bear' : 'cat';
      fr.remove();
      var pair = X.artPic('pair-hug-' + fk + 'left', 'xm-morning-hug');   // the host stays on the right
      pair.style.height = Math.round(s.host.offsetHeight * 1.05) + 'px';
      s.el.appendChild(pair);
      s.host.style.visibility = 'hidden';
      X.enter(pair, 0, 'pop', { x: -60, s: .8 });
      // their names under each of them (the friend on the left, the host on the right)
      X.pause(420).then(function () {
        if (!pair.isConnected) { return; }
        var r = pair.getBoundingClientRect(), c = s.el.getBoundingClientRect();
        [[s.friendName, 'friend', .3], [s.name, 'creator', .72]].forEach(function (n) {
          if (!n[0]) { return; }
          s.el.appendChild(h('span.xm-cast-name.is-' + n[1] + '.is-pinned', { style: 'left:' + f(r.left - c.left + r.width * n[2]) + 'px;top:' + f(r.bottom - c.top - 4) + 'px' }, n[0]));
        });
      });
      X.sfx(s.kind + '-squeal');
      emote(s.el, pair, '💛');
      return X.pause(1100);
    });
  }

  /**
   * The ending's mini-film (about 9 s, a tap speeds the lines up). Letterboxed: the room in the dark, "Christmas
   * morning." in the bars, the sun comes up on the friend's box under the tree with its "From:" tag; the host runs in
   * in pyjamas, shakes it by the ear (drum roll), pulls the bow, and unwraps the gift the friend picked off their shelf
   * (the scarf, the sweater and the coal keep their own scenes: worn, worn, sugar).
   */
  function morningFilm(quiz, zone, score, friend, rightPics, gift) {
    gift = gift || defaultGift(zone, quiz.mood);
    var root = X.scene('is-morning-film');
    var s = morningStage(quiz, zone);
    s.friendName = friend;
    root.appendChild(s.el);
    var names = { creator: quiz.name, friend: friend, them: X.them(quiz.gender) };
    // each line just above its speaker's head, the tail pointing down at them: the host on the right, the Elf on the left
    var above = function (who) { return Math.round(s.el.clientHeight - who.getBoundingClientRect().top + s.el.getBoundingClientRect().top + 14); };
    var hostSay = function (key, ms) { return talking(s.host, X.sayHold(s.el, t(key, names), { who: 'creator', pos: 'right:10px;bottom:' + above(s.host) + 'px;max-width:min(250px, 72%)', tail: 'calc(100% - 64px)' }, ms)); };
    var elfSay = function (key, ms) { return talking(s.elf, X.sayHold(s.el, t(key, names), { who: 'elf', pos: 'left:10px;bottom:' + above(s.elf) + 'px;max-width:min(250px, 72%)', tail: 34 }, ms)); };
    var feel = function (who, emoji) { emote(s.el, who, emoji); };
    var box = s.gift.querySelector('.xm-present');
    var fromTag = fromLabel(friend);
    s.gift.appendChild(fromTag);
    s.el.classList.add('is-dawn');
    s.host.style.visibility = 'hidden';
    bars(s.el);
    X.music(true);                                       // back home: "We Wish You a Merry Christmas"
    X.pause(500).then(function () { s.el.classList.remove('is-dawn'); X.sfx('sparkle'); });   // the sun comes up
    var swing = box.querySelector('.xm-present-swing');
    castPose(s.host, s.kind, 'cheer', true);             // they run in with empty paws…
    tapHint(s.el);                                       // gone with the stage when the result takes over
    return titleCard(s.el, t('gift.film.morning'), 1500).then(function () {
      // the host runs in from the right, in pyjamas, straight to the box
      s.host.style.visibility = '';
      X.sfx('footsteps');
      X.sfx(s.kind + '-happygasp');
      feel(s.host, '😍');
      if (s.host.animate && !X.reduceMotion) {
        return X.ended(s.host.animate([{ transform: 'translateX(110%)' }, { transform: 'translateX(-6%)', offset: .8 }, { transform: 'none' }],
          { duration: 650, easing: 'cubic-bezier(.3,.8,.4,1)' }));
      }
    }).then(function () {
      // …pick the friend's box up off the rug and shake it by the ear: the pose holds THAT box, in its own paper
      // (gf-{cat|bear}-shake-{paper}, animated from a Flow clip where there is one)
      swing.style.visibility = 'hidden';
      fromTag.style.visibility = 'hidden';               // the tag goes with the box
      castPose(s.host, s.kind, 'shake-' + WRAP[zone]);
      X.move(s.host, 'shake', 700);
      X.sfx('rattle');
      feel(s.host, '🤔');
      return hostSay('gift.morning.shake', 900);
    }).then(function () {
      clearSays(s.el);
      X.sfx('drumroll', 1);
      X.move(s.host, 'shake', 500);
      feel(s.elf, '👀');
      return X.pause(900);
    }).then(function () {
      // set it back down on the rug, step back, fingers crossed (the box opens on its own, in the light)
      swing.style.visibility = '';
      fromTag.style.visibility = '';
      X.enter(swing, 0, 'pop', { y: -30, s: .9 });
      castPose(s.host, s.kind, 'fingers-crossed');
      X.sfx('drop');
      return X.pause(600);
    }).then(function () {
      // the reveal: it trembles, the lid comes off, light, and the gift rises out of the box
      fromTag.remove();
      castPose(s.host, s.kind, 'gasp');
      feel(s.elf, '😮');
      return revealGift(box, WRAP[zone], gift, { stage: s.el, behind: s.light, from: t('gift.reveal.from', { friend: friend }) + ' ' + FROM_HEART[zone] });
    }).then(function (thing) {
      X.sfx(zone);
      X.sfx(s.kind + { top: '-woohoo', front: '-happygasp', bottom: '-giggle', box: '-dismay' }[zone]);
      var held = null;
      var hold = function (pose) { return receive(s, thing, pose, gift).then(function (a) { held = a; }); };
      if (zone === 'top') {
        // the perfect gift: tears, what they knew floats up out of the light, then they hug it to their chest
        s.el.classList.add('is-golden');
        castPose(s.host, s.kind, 'tears');
        feel(s.host, '🥹');
        return X.pause(700).then(function () {
          return floatAnswers(s, rightPics || []);
        }).then(function () {
          return hold();
        }).then(function () {
          feel(s.host, '💛');
          return hostSay('gift.ending.top.creator', 1300);
        }).then(function () {
          clearSays(s.el);
          if (score >= PERFECT) { elfPose(s.elf, 'hat-off'); feel(s.elf, '🎩'); } else { elfPose(s.elf, 'eye-roll'); feel(s.elf, '😤'); }
          X.confetti(s.el, ['#FFD34D', '#FFE9A0', '#F2BF26', '#FFFFFF']);
          return setDown(thing, held);
        }).then(function () { return hug(s); }).then(function () { return X.pause(1300); });
      }
      if (zone === 'front') {
        if (gift === 'scarf') {
          // held up for a look, a sparkle, and it's round their neck; a twirl to show it off
          return wearOn(s, thing, 'scarf').then(function () {
            feel(s.host, '🥰');
            return hostSay('gift.ending.front.creator', 1100);
          }).then(function () {
            clearSays(s.el);
            return hug(s);
          }).then(function () { elfPose(s.elf, 'eye-roll'); return elfSay('gift.ending.front.elf', 1100); });
        }
        // any other thoughtful gift: into their arms, they can't believe they remembered
        feel(s.host, '😍');
        return X.pause(500).then(function () {
          return hold();
        }).then(function () {
          feel(s.host, '🥰');
          return hostSay('gift.ending.front.creator', 1100);
        }).then(function () {
          clearSays(s.el);
          return setDown(thing, held);
        }).then(function () {
          return hug(s);
        }).then(function () { elfPose(s.elf, 'eye-roll'); return elfSay('gift.ending.front.elf', 1100); });
      }
      if (zone === 'bottom') {
        var sweater = gift === 'sweater';
        return X.pause(500).then(function () {
          // the sweater goes on (a twirl, very proud); anything else is held with a brave smile
          return sweater ? wearOn(s, thing, 'sweater') : hold('try-not-laugh');
        }).then(function () {
          if (!sweater) { X.move(s.host, 'droop'); }
          feel(s.host, '😐');
          return hostSay('gift.ending.bottom.creator', 1100);
        }).then(function () {
          clearSays(s.el);
          elfPose(s.elf, 'photo');
          feel(s.elf, '📸');
          var flash = h('div.xm-flash');
          s.el.appendChild(flash);
          X.sfx('shutter');
          X.pause(700).then(function () { flash.remove(); });
          return elfSay(sweater ? 'gift.ending.bottom.elf' : 'gift.morning.elfPhoto', 1100);
        }).then(function () {
          // the friend comes in, trying very hard not to laugh
          clearSays(s.el);
          return friendIn(s, sweater ? 'gift.morning.friendSweater' : 'gift.morning.friendMeh', 'try-not-laugh', '🤭');
        }).then(function () { return X.pause(700); });
      }
      if (gift !== 'coal') {
        // the naughty-list bin: a potato, one sock, a nice rock… it floats into their arms, they just stare at it
        elfPose(s.elf, 'chuckle');
        feel(s.elf, '😂');
        return hold('gasp').then(function () {
          feel(s.host, '😶');
          return elfSay('gift.morning.elfBin', 1000);
        }).then(function () {
          clearSays(s.el);
          X.sfx('drop');
          castPose(s.host, s.kind, 'facepalm');
          X.move(s.host, 'droop');
          return hostSay('gift.morning.hostBin', 900);
        }).then(function () {
          clearSays(s.el);
          return friendIn(s, 'gift.morning.friendCoal', 'facepalm', '😅');
        }).then(function () {
          X.pose(s.friend, s.kind === 'cat' ? 'bear' : 'cat', 'laugh');
          castPose(s.host, s.kind, 'laugh');
          X.sfx(s.kind + '-giggle');
          return hostSay('gift.ending.box.creator', 1100);
        }).then(function () { emote(s.el, s.friend, '🤝'); return X.pause(700); });
      }
      // a lump of coal: funny, then warm (it's sugar candy)
      elfPose(s.elf, 'chuckle');
      feel(s.elf, '😂');
      // it floats into their paw (no twirl for coal)
      return wearOn(s, thing, 'coal', false).then(function () {
        feel(s.host, '😶');
        return elfSay('gift.ending.box.elf', 1000);
      }).then(function () {
        clearSays(s.el);
        X.sfx('drop');
        X.move(s.host, 'droop');
        return X.pause(500);
      }).then(function () {
        castPose(s.host, s.kind, 'candy');
        feel(s.host, '🤩');
        X.sfx('crunch');
        X.pause(350).then(function () { X.sfx('sparkle'); });
        var r = s.host.getBoundingClientRect(), c = s.el.getBoundingClientRect();
        X.sparkle(s.el, r.left - c.left + r.width / 2, r.top - c.top + r.height * .45, 14);
        return hostSay('gift.ending.box.candy', 900);
      }).then(function () {
        // the friend peeks in, sheepish; the host holds out a piece to share: "Next year, a real gift. Deal?"
        clearSays(s.el);
        return friendIn(s, 'gift.morning.friendCoal', 'facepalm', '😅');
      }).then(function () {
        X.pose(s.friend, s.kind === 'cat' ? 'bear' : 'cat', 'laugh');
        return hostSay('gift.ending.box.creator', 1100);
      }).then(function () { emote(s.el, s.friend, '🤝'); return X.pause(700); });
    });
  }

  /** The result: the morning stage in its last moment, the gift's name on the ribbon; score and next steps below. */
  function result(quiz, p, fresh) {
    X.setHeroGender(quiz.gender);
    var zone = WRAP[p.ending] ? p.ending : zoneOf(p.score);   // an old or edited record never draws a box that isn't
    // their gift: the one in their box, else the one they picked that is still waiting to be sent (from their shelf),
    // else the shelf's own
    var waiting = X.store(PICK_KEY + quiz.id);
    var gift = p.gift && GIFTS[p.gift] ? p.gift
      : typeof waiting === 'string' && GIFTS[waiting] && GIFTS[waiting].tier === zone ? waiting : defaultGift(zone, quiz.mood);
    if (!fresh) { resendPick(quiz.id); }                  // a pick still waiting from their visit (a save that came late)
    var root = X.scene('is-result');
    // the scarf and the sweater are worn and the sugar coal is in the paws; any other gift hangs over its open box
    var worn = { scarf: 'scarf', sweater: 'sweater', coal: 'candy' }[gift];
    var hostPose = worn || { top: 'tears', front: 'cheer', bottom: 'try-not-laugh', box: 'laugh' }[zone];
    var elfPose0 = zone === 'top' && p.perfect ? 'hat-off' : zone === 'bottom' ? 'photo' : zone === 'box' ? 'chuckle' : 'eye-roll';
    var s = morningStage(quiz, zone, { hostPose: hostPose, elfPose: elfPose0 });
    s.el.classList.add('is-final');
    // the last moment of the film: the box stands open as the film left it, the gift floating over it; the scarf, the
    // sweater and the sugar coal are on the host (worn, worn, in the paw), so their box is empty, with the friend's tag
    revealGift(s.gift.querySelector('.xm-present'), WRAP[zone], gift, { still: true, caption: false, empty: !!worn, behind: s.light });
    if (worn) { s.gift.appendChild(fromLabel(p.name)); }
    // the friend is in the last shot too, on the left in front of the Elf, in the ending's mood
    var fk = s.kind === 'cat' ? 'bear' : 'cat';
    s.el.appendChild(nameTag(X.character(fk, { top: 'cheer', front: 'laugh', bottom: 'try-not-laugh', box: 'laugh' }[zone], Math.round(s.host.style.height ? parseFloat(s.host.style.height) * .9 : 160), 'xm-morning-friend is-final-friend'), p.name, 'friend'));
    // the ribbon names the gift; the shelf it came from is the stamp under it
    var ribbon = h('div.xm-ribbon.is-title', X.artPic('ui-ribbon', 'xm-ribbon-pic'), h('h1.xm-ribbon-text', giftName(gift)));
    s.el.appendChild(ribbon);
    fitTitle(ribbon.querySelector('.xm-ribbon-text'));
    var card = h('div.xm-endcard-text',
      h('div.xm-endcard-tier.is-' + zone, t('gift.ending.' + zone + '.title')),
      zone === 'top' ? h('p.xm-endcard-line', t('gift.ending.top.line')) : null,
      p.perfect ? h('div.xm-perfect', t('gift.ending.perfect')) : null,
      p.top ? h('div.xm-perfect.is-hook', t('gift.result.tookTop')) : null,
      h('p.xm-endcard-score', tn('gift.ending.score', { friend: p.name, creator: quiz.name, n: p.score }, ['friend', 'creator'])),
      gift === 'coal' ? h('p.xm-endcard-line', t('gift.ending.box.line')) : null);
    // ONE main action (owner, 2026-11-02: the viral loop): the friend writes their own wish list. The hook ("…What would
    // {creator} get you? 🎁") right above the one big gold button; sharing this gift and the tree are small links under it
    var comeback = h('p.xm-comeback', tn('gift.comeback.' + zone, { creator: quiz.name, gift: giftName(gift) }, ['creator']));
    var own = h('a.xm-btn.is-gold.xm-own', { href: X.createHref(KEY_CREATOR), onclick: function () {
      X.track('gift_loop_click');
      var mine = X.played(quiz.id);
      if (mine && mine.key && mine.id) { X.store(KEY_FROM, { quiz: quiz.id, player: mine.id, key: mine.key, at: Date.now() }); }
    } }, t('gift.result.again'));
    // the friend's own share, by how they did: a brag at the top, a dare in the middle, a joke on themselves at the bottom
    var shareKey = zone === 'top' ? 'gift.result.shareTop' : zone === 'box' ? 'gift.result.shareLow' : 'gift.result.shareText';
    var shareText = t(shareKey, { creator: quiz.name, gift: giftName(gift), n: p.score, them: X.them(quiz.gender), link: '' }).trim();
    var link = C.shareBase + quiz.id;
    var shareMine = textLink(t('gift.result.share'), function () {
      X.track('gift_share', { channel: 'result' });
      shareLine(shareText, link);
    });
    var see = textLink(t('gift.board.seeTree'), function () { board(quiz, p); });
    var actions = h('div.xm-actions', comeback, own, h('div.xm-result-links', shareMine, see));
    friendPushSubscribe(quiz.id, window.cloudzFcmToken);
    var panel = h('div.xm-play.is-result-panel', X.artPic('ui-snow', 'xm-play-snow'), card, actions);
    panel.style.setProperty('--holly', 'url("' + X.artUrl('ui-holly') + '")');
    root.append(s.el, panel);
    X.adOnTop(panel);
    X.enter(ribbon, 200, 'accent', { y: -30, s: .7 });
    X.cascade(panel.querySelectorAll('.xm-endcard-text > *, .xm-btn'), 600, 90);
    if (fresh && zone === 'top') { X.confetti(s.el); }
  }

  /** "Gifts under {creator}'s tree" for a friend: every present, the list (no answers: those are private). */
  function board(quiz, p) {
    var listBox = h('div.xm-board'), count = h('p.xm-small.xm-center');
    var actions = h('div.xm-actions', h('a.xm-btn.is-gold', { href: X.createHref(KEY_CREATOR), onclick: function () { X.track('gift_loop_click'); } }, t('gift.result.again')),
      p ? button(t('ui.back'), 'is-ghost', function () { result(quiz, p, false); }) : null);
    revealScene(quiz.name, quiz.gender, true, [count, listBox, actions], function (cam) {
      return loadBoard(quiz.id, cam, listBox, count, null, p && p.id).catch(function (e) { if (e && e.refused) { closed(); } });
    });
  }

  /** The link of a wish list that was thrown away: the Elf beside an empty tree. */
  function closed() {
    var root = X.scene('is-closed');
    X.snow(root, 18);
    var bare = h('div.xm-closed-scene', treeArt({ room: false }, 'xm-closed-tree'), X.artPic('elf-eye-roll', 'xm-elf xm-closed-elf'));
    root.append(topBar(), bare, h('h1.xm-h2.xm-center', t('gift.closed')), h('a.xm-btn.is-gold', { href: X.createHref(KEY_CREATOR) }, t('gift.closed.cta')));
    X.enter(bare, 0, 'main', { y: 20 });
  }

  // ── start ────────────────────────────────────────────────────────────────────────────────────────────────
  (function start() {
    var q = new URLSearchParams(location.search), friend = q.get('friend');
    if (friend !== null) { q.delete('friend'); history.replaceState(history.state, '', location.pathname + (q.toString() ? '?' + q : '')); }
    if (friend && /^\d{1,12}$/.test(friend)) { notifiedFriend = friend; }
    var me = X.store(KEY_CREATOR);
    if (C.visitId) {
      if (!C.quiz) { closed(); return; }
      if (me && me.id === C.quiz.id) { myGifts(me, false); return; }
      invite(C.quiz);
      return;
    }
    if (me && me.id) { myGifts(me, false); return; }
    // arrived from the main site's "Write my wish list" (?start=1): straight into making one, no second tap
    if (X.startNow()) { X.track('gift_start'); letter(); return; }
    landing();
  })();
})();
