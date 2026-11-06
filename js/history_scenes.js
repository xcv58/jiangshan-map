/* Optional, web-only viewing room. The atlas renderer and onboarding stay intact. */
(function (root) {
  'use strict';
  const CONTEXT_KEYS = ['activePerson', 'activePersonEventIdx', 'activeReturnPerson',
    'activeCustomRoute', 'customRouteStopIdx', 'activeTrace', 'activeTraceLabel',
    'activePolity', 'eraFocus', 'activeMilestone'];

  class SceneSession {
    constructor(app) { this.app = app; this.saved = null; }
    capture() {
      if (this.saved) return;
      const a = this.app;
      a._cancelCameraAnimation(); a._commitStageTransform();
      this.saved = { year: a.year, camera: { ...a.camera }, context: {} };
      for (const key of CONTEXT_KEYS) this.saved.context[key] = a[key];
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
      Object.assign(a, saved.context);
      a.jumpToYear(saved.year);
      // A resize while watching should keep the original center and zoom.
      const c = { ...saved.camera }, centerY = c.y + c.h / 2;
      c.h = c.w * a._getViewportAspect(); c.y = centerY - c.h / 2;
      a._cameraViewportRect = null; a.camera = c; a._applyCamera(true);
      if (a.activePerson) {
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
      // Playback and music remain paused, so closing never starts unexpected audio.
    }
  }

  // One owned target per request. Late provider replies cannot revive a closed player.
  class ScenePlayer {
    constructor(getWidgets, onState, timeoutMs = 18000) {
      this.getWidgets = getWidgets; this.onState = onState;
      this.timeoutMs = timeoutMs;
      this.sequence = 0; this.target = null; this.timer = null;
    }
    stop() {
      this.sequence++;
      clearTimeout(this.timer); this.timer = null;
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
          const widgets = await this.getWidgets();
          if (sequence !== this.sequence) return null;
          const frame = await widgets.createTweet(scene.postId, target, {
            conversation: 'none', cards: 'visible', dnt: true,
            theme: 'light', lang, align: 'center', width: 550,
          });
          if (sequence !== this.sequence && frame) { frame.remove(); return null; }
          return frame;
        })()]);
        if (sequence !== this.sequence) { if (frame) frame.remove(); return; }
        clearTimeout(this.timer); this.timer = null;
        if (!frame) throw new Error('embed-unavailable');
        frame.title = scene.title[lang === 'en' ? 'en' : 'zh'] + ' · X';
        this.onState('ready');
      } catch (_) {
        if (sequence !== this.sequence) return;
        this.stop(); this.onState('error');
      }
    }
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

  const sourceURL = scene => 'https://x.com/' + scene.handle + '/status/' + scene.postId;
  const nextFrame = () => new Promise(resolve => root.requestAnimationFrame(resolve));
  class SceneBrowser {
    constructor(app, scenes) {
      this.app = app; this.scenes = scenes; this.scene = null; this.opened = false;
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
      this.eraObserver = new MutationObserver(() => {
        if (this.scene) { this.updateEra(); this.updateMarker(); }
      });
      this.cameraObserver = new MutationObserver(() => this.updateMarker());
      root.addEventListener('hashchange', () => {
        const id = this.hashScene();
        if (id && this.scenes.some(scene => scene.id === id)) { this.open(); this.select(id); }
        else if (this.opened) this.close();
      });
      this.render();
      const id = this.hashScene();
      if (id && this.scenes.some(scene => scene.id === id)) { this.open(); this.select(id); }
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
      this.session.capture(); this.opened = true;
      this.panel.hidden = false; this.workspace.classList.add('has-history-scenes');
      this.cameraObserver.observe(this.app.svg, { attributes: true, attributeFilter: ['viewBox'] });
      this.eraObserver.observe(document.getElementById('scrubber-track'), { attributes: true, attributeFilter: ['aria-valuenow'] });
      this.trigger.setAttribute('aria-expanded', 'true');
      this.render();
      document.getElementById('history-scenes-close').focus();
      return true;
    }
    async select(id) {
      const scene = this.scenes.find(scene => scene.id === id);
      if (!scene || (!this.opened && !this.open())) return;
      const request = ++this.request;
      this.player.stop(); this.host.replaceChildren(); this.scene = scene; this.status = 'loading';
      this.render(); this.setHash(scene.id);
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
    async close() {
      if (!this.opened) return;
      const request = ++this.request;
      this.opened = false; this.player.stop(); this.host.replaceChildren();
      this.cameraObserver.disconnect(); this.eraObserver.disconnect(); this.status = 'stopped';
      if (this.marker) { this.marker.remove(); this.marker = null; }
      this.panel.hidden = true; this.workspace.classList.remove('has-history-scenes');
      this.trigger.setAttribute('aria-expanded', 'false'); this.setHash(null);
      await nextFrame();
      if (request !== this.request || this.opened) return;
      this.session.restore(); this.scene = null; this.status = 'idle'; this.trigger.focus();
    }
    render() {
      this.panel.classList.toggle('has-scene', Boolean(this.scene));
      this.label('history-scenes-trigger-label', '影像', 'Scenes');
      this.trigger.setAttribute('aria-label', this.text({ zh: '打开历史影像放映室', en: 'Open historical scenes' }));
      this.list.setAttribute('aria-label', this.text({ zh: '历史影像', en: 'Historical scenes' }));
      this.label('history-scenes-kicker', '江山 · 放映室', 'JIANGSHAN · VIEWING ROOM');
      this.label('history-scenes-heading', '让历史，在地图上发生', 'History, with a sense of place');
      this.label('history-scenes-intro', '三段创作者影像，三个历史片刻。选一段，在地图旁观看。', 'Three creator-made films, three historical moments. Choose a scene to watch beside the map.');
      this.label('history-scenes-close', '返回探索 ×', 'Back to exploring ×');
      this.label('history-scene-context-label', '史实与演绎', 'History & dramatization');
      this.label('history-scene-focus', '回到影片年代与区域', 'Return map to this scene');
      this.label('history-scene-source', '查看原帖 ↗', 'Original post ↗');
      this.label('history-scene-empty', '选择一个历史片刻', 'Choose a historical moment');
      this.label('history-scene-badge', 'AI 演绎 · 非史料影像', 'AI dramatization · not historical footage');
      this.label('history-scene-sources-label', '历史背景参考', 'Historical references');
      this.list.replaceChildren(...this.scenes.map((scene, index) => {
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'history-scene-choice'; button.dataset.sceneId = scene.id;
        button.setAttribute('aria-pressed', String(this.scene === scene));
        const number = document.createElement('span'); number.className = 'history-scene-number'; number.textContent = '0' + (index + 1);
        const copy = document.createElement('span');
        const title = document.createElement('strong'); title.textContent = this.text(scene.title);
        const meta = document.createElement('small'); meta.textContent = this.text(scene.date) + ' · ' + Math.floor(scene.duration / 60) + ':' + String(scene.duration % 60).padStart(2, '0');
        copy.append(title, meta); button.append(number, copy); return button;
      }));
      document.getElementById('history-scene-detail').hidden = !this.scene;
      document.getElementById('history-scene-empty').hidden = Boolean(this.scene);
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
      this.renderStatus(); this.updateMarker();
    }
    updateEra() {
      const inEra = this.app.year >= this.scene.range[0] && this.app.year <= this.scene.range[1];
      document.getElementById('history-scene-focus').hidden = inEra;
    }
    renderStatus() {
      const labels = {
        idle: { zh: '', en: '' }, ready: { zh: '在地图旁观看 · 播放由 X 提供', en: 'Watch beside the map · playback by X' },
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
      const scene = this.scene;
      if (!this.opened || !scene || scene.approximate || this.app.year !== scene.year) {
        if (this.marker) { this.marker.remove(); this.marker = null; }
        return;
      }
      if (!this.marker) {
        this.marker = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.marker.classList.add('history-scene-pin'); this.marker.setAttribute('aria-hidden', 'true');
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); circle.setAttribute('r', '12');
        const play = document.createElementNS('http://www.w3.org/2000/svg', 'path'); play.setAttribute('d', 'M-3-5L5 0-3 5Z');
        this.marker.append(circle, play); document.getElementById('camera-rig').append(this.marker);
      }
      const [x, y] = this.app.projector.toScreen(...scene.coord);
      const pixels = this.app.svg.getBoundingClientRect().width;
      this.marker.setAttribute('transform', 'translate(' + x + ' ' + y + ') scale(' + (this.app.camera.w / Math.max(1, pixels)) + ')');
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SceneSession, ScenePlayer, sourceURL }; return;
  }
  root.addEventListener('DOMContentLoaded', () => {
    if (root.atlasApp && !root.atlasApp.embed && document.getElementById('history-scenes')) {
      root.atlasHistoryScenes = new SceneBrowser(root.atlasApp, root.ATLAS_HISTORY_SCENES);
    }
  });
})(typeof window === 'undefined' ? globalThis : window);
