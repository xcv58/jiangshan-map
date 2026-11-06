/* Optional, web-only viewing room. The atlas renderer and onboarding stay intact. */
(function (root) {
  'use strict';
  const CONTEXT_KEYS = ['activePerson', 'activePersonEventIdx', 'activeReturnPerson',
    'activeCustomRoute', 'customRouteStopIdx', 'activeTrace', 'activeTraceLabel',
    'activePolity', 'eraFocus', 'activeMilestone', 'genealogyEventsOnly', 'genealogySheetExpanded'];
  const PROVIDERS = { x: 'X', youtube: 'YouTube' };
  const ERAS = {
    zhanguo: { zh: '战国', en: 'Warring States' }, qin: { zh: '秦末·楚汉', en: 'Qin / Chu–Han' },
    donghan: { zh: '东汉末', en: 'Late Eastern Han' },
    tang: { zh: '唐', en: 'Tang' }, beisong: { zh: '北宋', en: 'Northern Song' },
    'jin-mongol': { zh: '金·蒙古', en: 'Jin / Mongols' },
  };
  const literary = scene => scene.kind === 'literature';
  const orderScenes = scenes => [...scenes].sort((a, b) => Number(literary(a)) - Number(literary(b)) ||
    a.range[0] - b.range[0] || a.range[1] - b.range[1] || a.id.localeCompare(b.id));
  const filterScenes = (scenes, filters = {}) => orderScenes(scenes).filter(scene =>
    (!filters.era || filters.era === 'all' || scene.era === filters.era) &&
    (!filters.length || filters.length === 'all' || (filters.length === 'short' ? scene.duration <= 180 : scene.duration > 180)));
  const timelineScenes = scenes => orderScenes(scenes).filter(scene => !literary(scene) && scene.timeline !== false);
  const canPinScene = (scene, year, zoom) => !literary(scene) && !scene.approximate &&
    year >= scene.range[0] && year <= scene.range[1] && zoom >= 3.2;
  function distanceKm(a, b) {
    const rad = Math.PI / 180, lat = (b[1] - a[1]) * rad, lng = (b[0] - a[0]) * rad;
    const h = Math.sin(lat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(lng / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(Math.min(1, h)));
  }
  function scenesAtPlace(scenes, coord) {
    if (!coord) return [];
    return orderScenes(scenes).filter(scene => (scene.places || (scene.approximate ? [] : [{ coord: scene.coord, radiusKm: 18 }]))
      .some(place => distanceKm(place.coord, coord) <= place.radiusKm));
  }
  function scenesForEvent(scenes, event) {
    if (!event || !event.coord) return [];
    return scenesAtPlace(timelineScenes(scenes), event.coord).filter(scene =>
      event.year >= scene.range[0] && event.year <= scene.range[1]);
  }
  function timelineGroups(scenes, progress, width, gap = 40) {
    if (width <= 0) return [];
    const groups = [];
    for (const scene of timelineScenes(scenes)) {
      const position = Math.max(0, Math.min(1, progress(scene.year)));
      const previous = groups[groups.length - 1];
      if (previous && (position - previous.position) * width < gap) {
        previous.scenes.push(scene);
      } else groups.push({ position, scenes: [scene] });
    }
    return groups;
  }
  function sourceURL(scene) {
    if (scene.provider === 'youtube' && /^[\w-]{11}$/.test(scene.videoId)) return 'https://www.youtube.com/watch?v=' + scene.videoId;
    if (scene.provider === 'x' && /^[\w]+$/.test(scene.handle) && /^\d{19}$/.test(scene.postId)) return 'https://x.com/' + scene.handle + '/status/' + scene.postId;
    throw new Error('unsupported-video');
  }
  function embedURL(scene, origin) {
    sourceURL(scene); // Validate the curated provider ID before building a player URL.
    if (scene.provider === 'youtube') {
      const url = new URL('https://www.youtube.com/embed/' + scene.videoId);
      url.search = new URLSearchParams({ autoplay: '0', playsinline: '1', enablejsapi: '1', origin }).toString();
      return url.href;
    }
    throw new Error('unsupported-frame-provider');
  }

  class SceneSession {
    constructor(app) { this.app = app; this.saved = null; }
    capture() {
      if (this.saved) return;
      const a = this.app;
      a._cancelCameraAnimation(); a._commitStageTransform();
      this.saved = { year: a.year, camera: { ...a.camera }, context: {} };
      for (const key of CONTEXT_KEYS) this.saved.context[key] = a[key];
      this.saved.cards = ['genealogy-card', 'journey-card'].map(id => [id, a._id?.(id)?.className]);
      this.saved.layout = { paneCollapsed: a.paneCollapsed, mobileChronicleOpen: a.mobileChronicleOpen, paneAutoCollapsed: a._paneAutoCollapsed };
      const frame = a._id?.('viewport-frame');
      this.saved.frameClasses = ['has-active-genealogy', 'has-active-person', 'has-active-journey']
        .map(name => [name, Boolean(frame?.classList.contains(name))]);
      a.stopAutoplay();
      if (a.musicPlaying) a.toggleMusic();
      // Suspend inspection modes without destroying their data or return state.
      for (const key of ['activePerson', 'activeReturnPerson', 'activeCustomRoute',
        'activeTrace', 'activePolity', 'eraFocus', 'activeMilestone']) a[key] = null;
    }
    frame(scene) {
      this.capture();
      const a = this.app;
      a.stopAutoplay();
      if (a.musicPlaying) a.toggleMusic();
      a._cancelCameraAnimation(); a._commitStageTransform();
      a.jumpToYear(scene.year);
      const [x, y] = a.projector.toScreen(...scene.coord), w = 1000 / scene.zoom;
      const h = w * a._getViewportAspect();
      a._cameraViewportRect = null;
      a.camera = { x: x - w / 2, y: y - h / 2, w, h, zoom: scene.zoom };
      a._applyCamera(true);
    }
    restore() {
      if (!this.saved) return;
      const saved = this.saved, a = this.app;
      this.saved = null;
      a._cancelCameraAnimation(); a._commitStageTransform(); a.stopAutoplay();
      // Map interactions may have opened another mode while the viewing room was up.
      if (a.activePerson || a.activeTrace) a.closeGenealogyCard();
      if (a.activeCustomRoute) a.clearCustomRoute();
      if (a.activeMilestone) a.closeMilestoneBalloon();
      if (typeof saved.layout.paneCollapsed === 'boolean' && a.paneCollapsed !== saved.layout.paneCollapsed) a.toggleChroniclePane(saved.layout.paneCollapsed);
      if (typeof saved.layout.mobileChronicleOpen === 'boolean' && a.mobileChronicleOpen !== saved.layout.mobileChronicleOpen) a.toggleMobileChronicle(saved.layout.mobileChronicleOpen);
      a._paneAutoCollapsed = saved.layout.paneAutoCollapsed;
      for (const [id, classes] of saved.cards) if (classes !== undefined) a._id(id).className = classes;
      Object.assign(a, saved.context);
      a.jumpToYear(saved.year);
      // A resize while watching should keep the original center and zoom.
      const c = { ...saved.camera }, centerY = c.y + c.h / 2;
      c.h = c.w * a._getViewportAspect(); c.y = centerY - c.h / 2;
      a._cameraViewportRect = null; a.camera = c; a._applyCamera(true);
      if (a.activePerson) {
        a._lastPersonCardKey = null;
        a._renderPersonPinsOverlay(); a._renderPersonChronicleCard(true);
      } else if (a.activeCustomRoute) {
        // Rebuild the route without the camera flight performed by _renderCustomRoute.
        a._drawCustomRouteOverlay(a.activeCustomRoute); a._renderCustomRouteCard();
      }
      const dynasty = a.dynasties[a.dynastyIdx];
      a._renderChroniclePane(dynasty);
      const event = saved.context.activeMilestone;
      if (event && !event.isAuto && event.milestone) {
        a.openMilestoneBalloon(dynasty, event.milestone, { siteIdx: event.siteIdx });
      }
      const frame = a._id?.('viewport-frame');
      for (const [name, enabled] of saved.frameClasses) frame?.classList.toggle(name, enabled);
      a._syncMobileOverlayState?.();
      // Playback and music remain paused, so closing never starts unexpected audio.
    }
  }

  // One owned target per request. Late provider replies cannot revive a closed player.
  class ScenePlayer {
    constructor(getWidgets, onState, timeoutMs = 18000, renderFrame = renderOfficialFrame) {
      this.getWidgets = getWidgets; this.onState = onState;
      this.timeoutMs = timeoutMs; this.renderFrame = renderFrame; this.cleanup = null;
      this.sequence = 0; this.target = null; this.timer = null;
    }
    stop() {
      this.sequence++;
      clearTimeout(this.timer); this.timer = null;
      const cleanup = this.cleanup; this.cleanup = null;
      try { if (cleanup) cleanup(); } catch (_) { /* Removing the owned frame still stops playback. */ }
      if (this.target) this.target.remove();
      this.target = null;
    }
    async load(scene, target, lang) {
      this.stop(); this.target = target;
      const sequence = this.sequence;
      this.onState('loading');
      const deadline = new Promise((_, reject) => {
        this.timer = setTimeout(() => reject(new Error('embed-timeout')), this.timeoutMs);
      });
      try {
        const frame = await Promise.race([deadline, (async () => {
          const active = () => sequence === this.sequence;
          let frame;
          if (scene.provider === 'x') {
            const widgets = await this.getWidgets();
            if (!active()) return null;
            frame = await widgets.createTweet(scene.postId, target, {
              conversation: 'none', cards: 'visible', dnt: true,
              theme: 'light', lang, align: 'center', width: 550,
            });
          } else {
            frame = await this.renderFrame(scene, target, lang, active, cleanup => {
              if (active()) this.cleanup = cleanup; else cleanup();
            }, () => { if (active()) { this.stop(); this.onState('error'); } });
          }
          if (sequence !== this.sequence && frame) { frame.remove(); return null; }
          return frame;
        })()]);
        if (sequence !== this.sequence) { if (frame) frame.remove(); return; }
        clearTimeout(this.timer); this.timer = null;
        if (!frame) throw new Error('embed-unavailable');
        frame.title = scene.title[lang === 'en' ? 'en' : 'zh'] + ' · ' + PROVIDERS[scene.provider];
        this.onState('ready');
      } catch (_) {
        if (sequence !== this.sequence) return;
        this.stop(); this.onState('error');
      }
    }
  }

  let youtubePromise = null;
  function loadYouTubeAPI() {
    if (root.YT && root.YT.Player) return Promise.resolve(root.YT);
    if (youtubePromise) return youtubePromise;
    youtubePromise = new Promise((resolve, reject) => {
      const previous = root.onYouTubeIframeAPIReady, script = document.createElement('script');
      const finish = error => {
        clearTimeout(timeout);
        if (root.onYouTubeIframeAPIReady === ready) root.onYouTubeIframeAPIReady = previous;
        if (error) { script.remove(); reject(error); } else resolve(root.YT);
      };
      const ready = () => { try { if (previous) previous(); } finally { finish(); } };
      const timeout = setTimeout(() => finish(new Error('youtube-timeout')), 12000);
      root.onYouTubeIframeAPIReady = ready;
      script.src = 'https://www.youtube.com/iframe_api'; script.async = true;
      script.onerror = () => finish(new Error('youtube-script-failed'));
      document.head.append(script);
    }).catch(error => { youtubePromise = null; throw error; });
    return youtubePromise;
  }
  async function renderOfficialFrame(scene, target, lang, active, own, fail) {
    const url = embedURL(scene, root.location.origin);
    const youtube = await loadYouTubeAPI();
    if (!active()) return null;
    const frame = document.createElement('iframe');
    frame.className = 'history-scene-frame'; frame.allowFullscreen = true;
    frame.allow = 'fullscreen; encrypted-media; picture-in-picture';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    return new Promise((resolve, reject) => {
      let api = null;
      own(() => { if (api) api.destroy(); frame.remove(); });
      frame.onerror = () => reject(new Error('frame-failed'));
      frame.src = url; target.append(frame);
      api = new youtube.Player(frame, { events: {
        onReady: () => resolve(frame),
        onError: () => { reject(new Error('youtube-unavailable')); fail(); },
      } });
    });
  }

  let widgetPromise = null;
  function loadXWidgets() {
    if (root.twttr && root.twttr.widgets) return Promise.resolve(root.twttr.widgets);
    if (widgetPromise) return widgetPromise;
    widgetPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://platform.twitter.com/widgets.js'; script.async = true;
      const timeout = setTimeout(() => { script.remove(); reject(new Error('script-timeout')); }, 12000);
      script.onload = () => {
        clearTimeout(timeout);
        if (root.twttr && root.twttr.widgets) resolve(root.twttr.widgets);
        else reject(new Error('widgets-unavailable'));
      };
      script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('script-failed')); };
      document.head.append(script);
    }).catch(error => { widgetPromise = null; throw error; });
    return widgetPromise;
  }

  const nextFrame = () => new Promise(resolve => root.requestAnimationFrame(resolve));
  class SceneNavigation {
    constructor(browser) {
      this.browser = browser; this.app = browser.app; this.scenes = browser.scenes;
      this.placeHost = document.getElementById('history-scenes-place-links');
      this.eraHost = document.getElementById('history-scenes-era-links');
      this.timeline = document.getElementById('history-scenes-timeline');
      this.layer = document.getElementById('chk-history-scenes');
      this.pins = new Map();
      this.mapGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      document.getElementById('camera-rig').append(this.mapGroup);
      this.layer.addEventListener('change', () => { browser.syncCameraObserver(); this.renderMap(); });
      this.cityObserver = new MutationObserver(() => this.renderPlace());
      this.cityObserver.observe(document.getElementById('genealogy-heading'), { childList: true, characterData: true, subtree: true });
      this.cityObserver.observe(document.getElementById('genealogy-card'), { attributes: true, attributeFilter: ['class'] });
      this.cityObserver.observe(document.getElementById('journey-card'), { attributes: true, attributeFilter: ['class'] });
      this.chronicleObserver = new MutationObserver(() => this.renderEra(true));
      this.chronicleObserver.observe(document.getElementById('milestone-list'), { childList: true });
      this.yearObserver = new MutationObserver(() => {
        if (browser.opened && browser.scene) browser.updateEra();
        this.refresh();
      });
      this.yearObserver.observe(document.getElementById('scrubber-track'), { attributes: true, attributeFilter: ['aria-valuenow'] });
      this.quizObserver = new MutationObserver(() => {
        if (this.app.challenge && browser.opened) browser.close(false);
        browser.syncCameraObserver();
        this.refresh(); this.renderTimeline();
      });
      this.quizObserver.observe(document.getElementById('challenge-card'), { attributes: true, attributeFilter: ['class'] });
      this.resizeObserver = new ResizeObserver(() => this.renderTimeline());
      this.resizeObserver.observe(document.getElementById('scrubber-track'));
      document.getElementById('act-music').addEventListener('click', () => {
        // Choosing music stops the video before the atlas's normal music handler runs.
        if (browser.player.target) { browser.player.stop(); browser.status = 'stopped'; browser.renderStatus(); }
      }, true);
    }
    describe(scene) {
      return this.browser.text(scene.title) + ' · ' + this.browser.text(scene.date);
    }
    button(scenes, compact = false) {
      const button = document.createElement('button'); button.type = 'button';
      button.className = 'history-scene-watch';
      button.textContent = compact ? '▶' + (scenes.length > 1 ? ' ' + scenes.length : '') :
        '▶ ' + this.describe(scenes[0]) + (literary(scenes[0]) ? this.browser.text({ zh: ' · 文学故事', en: ' · Literary story' }) : '');
      button.title = scenes.map(scene => this.describe(scene)).join('\n');
      button.setAttribute('aria-label', this.browser.text({ zh: '观看影像：', en: 'Watch: ' }) + button.title);
      button.addEventListener('pointerdown', e => e.stopPropagation());
      button.addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); });
      button.addEventListener('click', e => { e.stopPropagation(); this.browser.openCollection(scenes.map(scene => scene.id)); });
      return button;
    }
    fillLinks(host, scenes, heading) {
      const key = this.app.locale + ':' + scenes.map(scene => scene.id).join(',');
      if (host.hidden !== !scenes.length) host.hidden = !scenes.length;
      if (host.dataset.sceneKey === key) return;
      host.dataset.sceneKey = key; host.replaceChildren();
      if (!scenes.length) return;
      const title = document.createElement('h4'); title.textContent = heading + ' · ' + scenes.length;
      host.append(title, ...scenes.map(scene => this.button([scene])));
    }
    renderPlace() {
      if (this.browser.opened && (this.app.activeTrace || this.app.activePerson || this.app.activeCustomRoute)) this.browser.close(false);
      const card = document.getElementById('genealogy-card');
      const scenes = !this.app.challenge && !this.app.activePerson && !card.classList.contains('is-hidden') ?
        scenesAtPlace(this.scenes, this.app.activeTrace) : [];
      this.fillLinks(this.placeHost, scenes, this.browser.text({ zh: '观看相关影像', en: 'Watch related scenes' }));
    }
    renderEra(force = false) {
      const dynasty = this.app.dynasties[this.app.dynastyIdx];
      const key = this.app.locale + ':' + dynasty.key + ':' + Boolean(this.app.activePolity) + ':' + Boolean(this.app.challenge);
      if (!force && key === this.eraKey) return;
      this.eraKey = key;
      const scenes = this.app.activePolity || this.app.challenge ? [] : this.scenes.filter(scene =>
        scene.range[0] <= dynasty.toYear && scene.range[1] >= dynasty.fromYear);
      this.fillLinks(this.eraHost, orderScenes(scenes), this.browser.text({ zh: '此时代影像', en: 'Scenes in this era' }));
      const events = this.app.activePolity ? this.app._polityEventsCache || [] : dynasty.milestones || [];
      Array.from(document.getElementById('milestone-list').children).forEach((row, index) => {
        const event = events[index], matches = this.app.challenge ? [] : scenesForEvent(this.scenes, event);
        let button = row.querySelector('.history-scene-event-watch');
        const ids = matches.map(scene => scene.id).join(',');
        if (button && button.dataset.sceneIds === ids && button.dataset.locale === this.app.locale) return;
        if (button) button.remove();
        if (!matches.length) return;
        button = this.button(matches, true); button.classList.add('history-scene-event-watch');
        button.dataset.sceneIds = ids; button.dataset.locale = this.app.locale;
        (row.querySelector('.ev-yr + span') || row).append(button);
      });
    }
    renderTimeline() {
      const width = document.getElementById('scrubber-track').clientWidth;
      const key = width + ':' + this.app.locale + ':' + Boolean(this.app.challenge);
      if (key === this.timelineKey) return;
      this.timelineKey = key; this.timeline.hidden = Boolean(this.app.challenge);
      this.timeline.setAttribute('aria-label', this.browser.text({ zh: '按史事年代浏览影像', en: 'Browse scenes by historical date' }));
      this.timeline.replaceChildren(...timelineGroups(this.scenes, year => this.app._yearToProgress(year), width).map(group => {
        const button = this.button(group.scenes, true);
        button.style.left = (group.position * 100) + '%'; return button;
      }));
    }
    renderMap() {
      const b = this.browser, a = this.app;
      const scenes = a.challenge ? [] : b.opened ?
        (b.scene && canPinScene(b.scene, a.year, a.camera.zoom) ? [b.scene] : []) :
        (this.layer.checked ? this.scenes.filter(scene => canPinScene(scene, a.year, a.camera.zoom)) : []);
      const groups = new Map();
      for (const scene of scenes) {
        const key = scene.coord.join(',');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(scene);
      }
      for (const [key, node] of this.pins) if (!groups.has(key)) { node.remove(); this.pins.delete(key); }
      if (!groups.size) return;
      const scale = a.camera.w / Math.max(1, a.svg.getBoundingClientRect().width);
      for (const [key, group] of groups) {
        let node = this.pins.get(key);
        const interactive = !b.opened, state = this.app.locale + ':' + interactive + ':' + group.map(scene => scene.id).join(',');
        if (node && node.dataset.sceneState !== state) { node.remove(); this.pins.delete(key); node = null; }
        if (!node) {
          node = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          node.classList.add('history-scene-pin'); node.dataset.sceneState = state;
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); circle.setAttribute('r', '12');
          const play = document.createElementNS('http://www.w3.org/2000/svg', 'path'); play.setAttribute('d', 'M-3-5L5 0-3 5Z');
          const title = document.createElementNS('http://www.w3.org/2000/svg', 'title'); title.textContent = group.map(scene => this.describe(scene)).join('\n');
          node.append(circle, play, title);
          if (interactive) {
            node.classList.add('is-interactive'); node.setAttribute('role', 'button'); node.setAttribute('tabindex', '0');
            node.setAttribute('aria-label', this.browser.text({ zh: '观看该区域影像：', en: 'Watch scenes in this region: ' }) + title.textContent);
            node.addEventListener('pointerdown', e => e.stopPropagation());
            node.addEventListener('pointerup', e => e.stopPropagation());
            const activate = e => { e.stopPropagation(); this.browser.openCollection(group.map(scene => scene.id)); };
            node.addEventListener('click', activate);
            node.addEventListener('keydown', e => {
              if (e.key !== 'Escape') e.stopPropagation();
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(e); }
            });
          } else node.setAttribute('aria-hidden', 'true');
          this.mapGroup.append(node); this.pins.set(key, node);
        }
        const [x, y] = a.projector.toScreen(...group[0].coord);
        node.setAttribute('transform', 'translate(' + x + ' ' + y + ') scale(' + scale + ')');
      }
    }
    refresh() { this.renderPlace(); this.renderEra(); this.renderMap(); }
  }
  class SceneBrowser {
    constructor(app, scenes) {
      this.app = app; this.scenes = orderScenes(scenes); this.scene = null; this.opened = false;
      this.filters = { era: 'all', length: 'all' }; this.contextIds = null;
      this.session = new SceneSession(app); this.request = 0; this.status = 'idle';
      this.panel = document.getElementById('history-scenes');
      this.workspace = document.getElementById('workspace-body');
      this.trigger = document.getElementById('act-history-scenes');
      this.list = document.getElementById('history-scene-list');
      this.host = document.getElementById('history-scene-player');
      this.player = new ScenePlayer(loadXWidgets, state => { this.status = state; this.renderStatus(); });
      this.trigger.addEventListener('click', () => this.opened ? this.close() : this.open());
      document.getElementById('history-scenes-close').addEventListener('click', () => this.close());
      document.getElementById('history-scene-retry').addEventListener('click', () => this.play());
      document.getElementById('history-scene-focus').addEventListener('click', () => this.focusScene());
      this.list.addEventListener('click', e => {
        const button = e.target.closest('[data-scene-id]');
        if (button) this.select(button.dataset.sceneId);
      });
      for (const key of ['era', 'length']) document.getElementById('history-scene-' + key).addEventListener('change', e => {
        this.filters[key] = e.target.value; this.render();
      });
      document.getElementById('history-scene-clear').addEventListener('click', () => {
        this.filters = { era: 'all', length: 'all' }; this.contextIds = null; this.render();
      });
      this.panel.addEventListener('keydown', e => {
        // Atlas arrow/space shortcuts must not hijack focused viewing-room controls.
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      });
      document.addEventListener('keydown', e => {
        if (this.opened && e.key === 'Escape' && !e.defaultPrevented) {
          e.preventDefault(); this.close();
        }
      }, true);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.player.target) {
          this.player.stop(); this.status = 'stopped'; this.renderStatus();
        }
      });
      this.stateObserver = new MutationObserver(() => this.render());
      this.stateObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
      this.cameraObserver = new MutationObserver(() => this.updateMarker());
      this.navigation = new SceneNavigation(this);
      root.addEventListener('hashchange', () => {
        const id = this.hashScene();
        if (id && this.scenes.some(scene => scene.id === id)) { this.open(); this.select(id); }
        else if (this.opened) this.close();
      });
      this.render();
      const id = this.hashScene();
      if (id && this.scenes.some(scene => scene.id === id)) { this.open(); this.select(id); }
    }
    visibleScenes() {
      const scenes = this.contextIds ? this.scenes.filter(scene => this.contextIds.includes(scene.id)) : this.scenes;
      return filterScenes(scenes, this.filters);
    }
    openCollection(ids) {
      const scenes = this.scenes.filter(scene => ids.includes(scene.id));
      if (!scenes.length || !this.open()) return;
      this.filters = { era: 'all', length: 'all' }; this.contextIds = scenes.map(scene => scene.id);
      if (scenes.length === 1) { this.select(scenes[0].id); return; }
      ++this.request; this.player.stop(); this.host.replaceChildren();
      this.scene = null; this.status = 'idle'; this.setHash(null); this.render(); this.panel.scrollTop = 0;
      const choice = this.list.querySelector('[data-scene-id]');
      if (choice) choice.focus({ preventScroll: true });
    }
    syncCameraObserver() {
      const watch = !this.app.challenge && (this.opened || this.navigation.layer.checked);
      if (watch === this.watchingCamera) return;
      this.watchingCamera = watch;
      this.cameraObserver.disconnect();
      if (watch) this.cameraObserver.observe(this.app.svg, { attributes: true, attributeFilter: ['viewBox'] });
    }
    text(value) {
      const text = typeof value === 'string' ? value : value[this.app.locale === 'en' ? 'en' : 'zh'];
      return this.app.locale === 'zh-tw' ? this.app._zh(text) : text;
    }
    label(id, zh, en) { document.getElementById(id).textContent = this.text({ zh, en }); }
    hashScene() { return new URLSearchParams(root.location.hash.slice(1)).get('scene'); }
    setHash(id) {
      const url = new URL(root.location.href);
      url.hash = id ? 'scene=' + encodeURIComponent(id) : this.previousHash || '';
      root.history.replaceState(root.history.state, '', url);
    }
    open() {
      if (this.opened) return true;
      if (this.app.challenge) {
        this.trigger.title = this.text({ zh: '请先结束当前挑战', en: 'Finish the current challenge first' });
        return false;
      }
      this.previousHash = this.hashScene() ? '' : root.location.hash;
      this.returnFocus = document.activeElement;
      this.session.capture(); this.opened = true;
      this.panel.hidden = false; this.workspace.classList.add('has-history-scenes');
      this.syncCameraObserver();
      this.trigger.setAttribute('aria-expanded', 'true');
      this.render();
      document.getElementById('history-scenes-close').focus();
      return true;
    }
    async select(id) {
      const scene = this.scenes.find(scene => scene.id === id);
      if (!scene || (!this.opened && !this.open())) return;
      if (!this.visibleScenes().includes(scene)) { this.filters = { era: 'all', length: 'all' }; this.contextIds = null; }
      const request = ++this.request;
      this.player.stop(); this.host.replaceChildren(); this.scene = scene; this.status = 'loading';
      this.render(); this.setHash(scene.id); this.panel.scrollTop = 0;
      try {
        await this.app._ensureFullSnapshots(); await nextFrame();
        if (!this.opened || request !== this.request) return;
        this.session.frame(scene); this.render(); this.updateMarker(); this.play();
      } catch (_) {
        if (this.opened && request === this.request) { this.status = 'map-error'; this.renderStatus(); }
      }
    }
    async focusScene() {
      if (!this.scene || !this.opened) return;
      const request = this.request;
      await nextFrame();
      if (this.opened && request === this.request) { this.session.frame(this.scene); this.render(); this.updateMarker(); }
    }
    play() {
      if (!this.opened || !this.scene) return;
      this.app.stopAutoplay(); if (this.app.musicPlaying) this.app.toggleMusic();
      const target = document.createElement('div'); target.className = 'history-scene-embed';
      this.player.stop(); this.host.replaceChildren(target);
      this.player.load(this.scene, target, this.app.locale === 'en' ? 'en' : 'zh-cn');
    }
    async close(restore = true) {
      if (!this.opened) return;
      const request = ++this.request;
      this.opened = false; this.player.stop(); this.host.replaceChildren();
      this.syncCameraObserver(); this.status = 'stopped';
      this.panel.hidden = true; this.workspace.classList.remove('has-history-scenes');
      this.trigger.setAttribute('aria-expanded', 'false'); this.setHash(null);
      if (!restore || this.app.challenge) this.session.saved = null;
      await nextFrame();
      if (request !== this.request || this.opened) return;
      if (restore && !this.app.challenge) this.session.restore(); else this.session.saved = null;
      this.scene = null; this.contextIds = null; this.status = 'idle'; this.render();
      if (restore && !this.app.challenge) (this.returnFocus && this.returnFocus.isConnected ? this.returnFocus : this.trigger).focus();
    }
    renderFilters() {
      this.label('history-scene-era-label', '朝代', 'Era');
      this.label('history-scene-length-label', '片长', 'Length');
      this.label('history-scene-clear', '全部影像', 'All scenes');
      this.label('history-scene-no-results', '没有符合筛选条件的影片', 'No scenes match these filters');
      const eraKeys = [...new Set(this.scenes.map(scene => scene.era))];
      const options = {
        era: [['all', { zh: '全部朝代', en: 'All eras' }], ...eraKeys.map(key => [key, ERAS[key]])],
        length: [['all', { zh: '全部片长', en: 'All lengths' }], ['short', { zh: '短片 · ≤3分钟', en: 'Short · ≤3 min' }], ['long', { zh: '长片 · >3分钟', en: 'Long · >3 min' }]],
      };
      for (const key of ['era', 'length']) {
        const select = document.getElementById('history-scene-' + key);
        select.replaceChildren(...options[key].map(([value, label]) => {
          const option = document.createElement('option'); option.value = value; option.textContent = this.text(label); return option;
        }));
        select.value = this.filters[key];
      }
      document.getElementById('history-scene-clear').hidden = !this.contextIds && this.filters.era === 'all' && this.filters.length === 'all';
    }
    render() {
      const focusedId = this.list.contains(document.activeElement) ? document.activeElement.dataset.sceneId : null;
      this.panel.classList.toggle('has-scene', Boolean(this.scene));
      this.label('history-scenes-trigger-label', '影像', 'Scenes');
      this.trigger.setAttribute('aria-label', this.text({ zh: '打开历史影像放映室', en: 'Open historical scenes' }));
      this.list.setAttribute('aria-label', this.text({ zh: '历史影像', en: 'Historical scenes' }));
      this.label('history-scenes-kicker', '江山 · 放映室', 'JIANGSHAN · VIEWING ROOM');
      this.label('history-scenes-heading', '让历史，在地图上发生', 'History, with a sense of place');
      this.label('history-scenes-intro', this.scenes.length + ' 段创作者影像，让历史与故事在地图旁展开。', this.scenes.length + ' creator-made films. Explore history and stories beside the map.');
      this.label('history-scenes-close', '返回探索 ×', 'Back to exploring ×');
      this.label('lbl-history-scenes-layer', '影像标记', 'Scene markers');
      this.label('history-scene-context-label', '史实与演绎', 'History & dramatization');
      this.label('history-scene-focus', '回到影片年代与区域', 'Return map to this scene');
      this.label('history-scene-source', '查看原帖 ↗', 'Original post ↗');
      this.label('history-scene-empty', '选择一个历史片刻', 'Choose a historical moment');
      const isLiterary = this.scene && literary(this.scene);
      this.label('history-scene-badge', isLiterary ? 'AI 文学演绎 · 小说故事' : 'AI 演绎 · 非史料影像', isLiterary ? 'AI literary dramatization · fictional story' : 'AI dramatization · not historical footage');
      this.label('history-scene-sources-label', isLiterary ? '文学原作' : '历史背景参考', isLiterary ? 'Literary source' : 'Historical references');
      if (isLiterary) this.label('history-scene-context-label', '故事背景与演绎', 'Story & dramatization');
      this.renderFilters();
      const visible = this.visibleScenes();
      this.label('history-scene-order', visible.length + '/' + this.scenes.length + ' 部 · 史事按年代排列，文学故事单列', visible.length + '/' + this.scenes.length + ' films · historical chronology; literary stories grouped separately');
      document.getElementById('history-scene-no-results').hidden = Boolean(visible.length);
      const entries = [];
      let previousKind = null;
      visible.forEach(scene => {
        const kind = literary(scene) ? 'literature' : 'history';
        if (kind !== previousKind) {
          const heading = document.createElement('h3'); heading.className = 'history-scene-group-label';
          heading.textContent = this.text(kind === 'literature' ? { zh: '文学故事 · 按时代背景', en: 'Literary stories · by setting' } : { zh: '史事影像 · 按年代', en: 'Historical scenes · chronological' });
          entries.push(heading); previousKind = kind;
        }
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'history-scene-choice'; button.dataset.sceneId = scene.id;
        button.setAttribute('aria-pressed', String(this.scene === scene));
        const number = document.createElement('span'); number.className = 'history-scene-number'; number.textContent = String(this.scenes.indexOf(scene) + 1).padStart(2, '0');
        const copy = document.createElement('span');
        const title = document.createElement('strong'); title.textContent = this.text(scene.title);
        const meta = document.createElement('small'); meta.textContent = this.text(scene.date) + ' · ' + Math.floor(scene.duration / 60) + ':' + String(scene.duration % 60).padStart(2, '0') + ' · ' + PROVIDERS[scene.provider];
        copy.append(title, meta); button.append(number, copy); entries.push(button);
      });
      this.list.replaceChildren(...entries);
      const choices = Array.from(this.list.querySelectorAll('[data-scene-id]'));
      const focused = choices.find(button => button.dataset.sceneId === focusedId);
      if (focused) focused.focus({ preventScroll: true });
      if (this.opened && this.scene) {
        const choice = focused || choices.find(button => button.dataset.sceneId === this.scene.id);
        if (choice) {
          const left = choice.offsetLeft, right = left + choice.offsetWidth;
          if (left < this.list.scrollLeft) this.list.scrollLeft = left;
          else if (right > this.list.scrollLeft + this.list.clientWidth) this.list.scrollLeft = right - this.list.clientWidth;
        }
      }
      document.getElementById('history-scene-detail').hidden = !this.scene;
      document.getElementById('history-scene-empty').hidden = Boolean(this.scene) || !visible.length;
      if (this.scene) {
        for (const key of ['title', 'date', 'place', 'summary', 'history', 'caveat', 'credit']) {
          document.getElementById('history-scene-' + key).textContent = this.text(this.scene[key]);
        }
        document.getElementById('history-scene-source').href = sourceURL(this.scene);
        const sources = document.getElementById('history-scene-sources');
        sources.replaceChildren(...this.scene.sources.map(source => {
          const link = document.createElement('a'); link.href = source.url;
          link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = this.text(source.label) + ' ↗';
          return link;
        }));
        this.updateEra();
      }
      this.renderStatus(); this.navigation.refresh(); this.navigation.renderTimeline();
    }
    updateEra() {
      const inEra = this.app.year >= this.scene.range[0] && this.app.year <= this.scene.range[1];
      document.getElementById('history-scene-focus').hidden = inEra;
    }
    renderStatus() {
      const provider = this.scene ? PROVIDERS[this.scene.provider] : '';
      const labels = {
        idle: { zh: '', en: '' }, ready: { zh: provider + ' 播放器已载入 · 点击播放', en: provider + ' player loaded · press play' },
        loading: { zh: '正在载入原帖播放器…', en: 'Loading the original player…' },
        error: { zh: '播放器未能载入。可重试，或查看原帖；历史背景仍可阅读。', en: 'The player could not load. Retry or open the original; the historical context remains available.' },
        stopped: { zh: '已停止播放', en: 'Playback stopped' },
        'map-error': { zh: '地图资料未能载入，请稍后重新选择此片。', en: 'Map data could not load. Please select this scene again.' },
      };
      document.getElementById('history-scene-status').textContent = this.text(labels[this.status]);
      const retry = document.getElementById('history-scene-retry');
      retry.hidden = !['error', 'stopped'].includes(this.status);
      retry.textContent = this.text(this.status === 'stopped' ? { zh: '重新播放', en: 'Play again' } : { zh: '重新载入播放器', en: 'Retry player' });
      this.host.setAttribute('aria-busy', String(this.status === 'loading'));
    }
    updateMarker() {
      this.navigation.renderMap();
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SceneSession, ScenePlayer, SceneBrowser, SceneNavigation, sourceURL, embedURL,
      orderScenes, filterScenes, timelineScenes, timelineGroups, canPinScene, scenesAtPlace, scenesForEvent }; return;
  }
  root.addEventListener('DOMContentLoaded', () => {
    if (root.atlasApp && !root.atlasApp.embed && document.getElementById('history-scenes')) {
      root.atlasHistoryScenes = new SceneBrowser(root.atlasApp, root.ATLAS_HISTORY_SCENES);
    }
  });
})(typeof window === 'undefined' ? globalThis : window);
