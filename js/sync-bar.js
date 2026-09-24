/**
 * Mobile-friendly sync bar: refresh cached JSON + request remote sync via GitHub Actions.
 * GitHub token stored in localStorage on your device only (never committed).
 */
(function () {
  const LS_KEY = 'portfolio_sync_settings_v1';

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveSettings(s) {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  }

  function injectStyles() {
    if (document.getElementById('sync-bar-css')) return;
    const link = document.createElement('link');
    link.id = 'sync-bar-css';
    link.rel = 'stylesheet';
    const base = window.DashboardPaths?.js || 'js/';
    link.href = base + 'sync-bar.css';
    document.head.appendChild(link);
  }

  function injectModal() {
    if (document.getElementById('sync-settings-modal')) return;
    const s = loadSettings();
    const html = `
      <div class="sync-modal" id="sync-settings-modal" role="dialog">
        <div class="sync-modal-panel">
          <h3>Sync settings (saved on this device)</h3>
          <p style="font-size:0.8rem;color:var(--muted);margin:0 0 12px">
            Used to trigger a GitHub Action from your phone. Create a fine-grained token with
            <strong>Actions: read and write</strong> on your repo only.
          </p>
          <label>GitHub owner<input id="sync-owner" placeholder="your-username" value="${s.owner || ''}" /></label>
          <label>Repo name<input id="sync-repo" placeholder="TradingAgents" value="${s.repo || ''}" /></label>
          <label>Branch<input id="sync-branch" placeholder="main" value="${s.branch || 'main'}" /></label>
          <label>GitHub token (PAT)<input id="sync-token" type="password" placeholder="github_pat_…" autocomplete="off" /></label>
          <div class="sync-modal-actions">
            <button type="button" id="sync-save-settings">Save</button>
            <button type="button" class="secondary" id="sync-close-settings">Cancel</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('sync-close-settings').addEventListener('click', closeModal);
    document.getElementById('sync-save-settings').addEventListener('click', () => {
      const prev = loadSettings();
      saveSettings({
        owner: document.getElementById('sync-owner').value.trim(),
        repo: document.getElementById('sync-repo').value.trim(),
        branch: document.getElementById('sync-branch').value.trim() || 'main',
        token: document.getElementById('sync-token').value.trim() || prev.token || '',
      });
      closeModal();
      setMsg('Settings saved on this device.', 'ok');
    });
    document.getElementById('sync-settings-modal').addEventListener('click', (e) => {
      if (e.target.id === 'sync-settings-modal') closeModal();
    });
  }

  function openModal() {
    document.getElementById('sync-settings-modal').classList.add('open');
  }

  function closeModal() {
    document.getElementById('sync-settings-modal').classList.remove('open');
  }

  function setMsg(text, kind) {
    const el = document.getElementById('sync-msg');
    if (!el) return;
    el.textContent = text;
    el.className = 'sync-msg' + (kind ? ' ' + kind : '');
  }

  function injectBar() {
    if (document.getElementById('portfolio-sync-bar')) return;
    const wrap = document.querySelector('.wrap');
    if (!wrap) return;
    const bar = document.createElement('div');
    bar.className = 'sync-bar';
    bar.id = 'portfolio-sync-bar';
    bar.innerHTML = `
      <div class="sync-status" id="sync-status">Loading sync status…</div>
      <button type="button" id="sync-refresh-btn" title="Reload latest JSON from server">↻ Refresh</button>
      <button type="button" id="sync-request-btn" title="Trigger GitHub Action (1–5 min delay)">⚡ Request sync</button>
      <button type="button" class="secondary" id="sync-settings-btn">⚙</button>
      <div class="sync-msg" id="sync-msg"></div>`;
    wrap.insertBefore(bar, wrap.firstChild);

    document.getElementById('sync-refresh-btn').addEventListener('click', onRefresh);
    document.getElementById('sync-request-btn').addEventListener('click', onRequestSync);
    document.getElementById('sync-settings-btn').addEventListener('click', openModal);
  }

  async function fetchSyncStatus() {
    const prefix = window.DashboardPaths?.data || 'data/';
    try {
      const r = await fetch(prefix + 'sync_status.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('no status file');
      return r.json();
    } catch {
      return null;
    }
  }

  async function updateStatusLine() {
    const el = document.getElementById('sync-status');
    if (!el) return;
    const status = await fetchSyncStatus();
    if (status?.synced_at) {
      const t = new Date(status.synced_at).toLocaleString();
      el.innerHTML = '<strong>Last sync</strong> ' + t +
        (status.pending ? ' · <span style="color:var(--yellow,#e7c547)">sync requested…</span>' : '');
    } else {
      el.innerHTML = '<strong>Sync status</strong> unknown — tap Refresh or Request sync';
    }
  }

  function onRefresh() {
    setMsg('Refreshing data…', '');
    window.dispatchEvent(new CustomEvent('portfolio:refresh'));
    setTimeout(updateStatusLine, 500);
  }

  async function onRequestSync() {
    const s = loadSettings();
    if (!s.owner || !s.repo || !s.token) {
      setMsg('Configure GitHub owner, repo, and token first (⚙).', 'err');
      openModal();
      return;
    }
    const btn = document.getElementById('sync-request-btn');
    btn.disabled = true;
    setMsg('Sending sync request to GitHub…', '');
    try {
      const url = `https://api.github.com/repos/${s.owner}/${s.repo}/actions/workflows/sync-portfolio.yml/dispatches`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer ' + s.token,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref: s.branch || 'main' }),
      });
      if (res.status === 204) {
        setMsg('Sync requested. Wait 1–5 min, then tap Refresh. (Requires webhook or PC agent — see PUBLISH.md)', 'ok');
      } else {
        const err = await res.text();
        throw new Error(res.status + ' ' + err.slice(0, 120));
      }
    } catch (e) {
      setMsg('Request failed: ' + e.message, 'err');
    } finally {
      btn.disabled = false;
      setTimeout(updateStatusLine, 2000);
    }
  }

  window.PortfolioSyncBar = {
    init() {
      injectStyles();
      injectModal();
      injectBar();
      updateStatusLine();
    },
    dataUrl(name) {
      const prefix = window.DashboardPaths?.data || 'data/';
      return prefix + name + '?t=' + Date.now();
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.PortfolioSyncBar.init());
  } else {
    window.PortfolioSyncBar.init();
  }
})();
