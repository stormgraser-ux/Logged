/**
 * Logged Test Harness
 *
 * Mocks the Chrome Extension API so built detector scripts can run
 * on localhost without the real extension context. Captures all messages
 * and displays results in a fixed dashboard at the bottom of the page.
 *
 * Usage: load this script BEFORE the detector script:
 *   <script src="harness.js"></script>
 *   <script src="../dist/content/detectors/linkedin.js"></script>
 */
(function () {
  'use strict';

  var messages = [];
  var cachedJob = {};
  var storage = {};

  // ── Chrome API Mock ─────────────────────────────────────

  window.chrome = {
    runtime: {
      id: 'logged-test-harness',
      sendMessage: function (msg) {
        var entry = { time: new Date(), type: msg.type, payload: msg.payload };
        messages.push(entry);
        console.log(
          '%c[Harness]%c ' + msg.type + ' %c' + formatPayload(msg.payload),
          'color: #00b4d8; font-weight: bold',
          'color: #ffd166',
          'color: #90e0ef'
        );

        if (msg.type === 'CACHE_JOB_DATA' && msg.payload) {
          Object.assign(cachedJob, msg.payload);
          addMessageRow(entry);
          return Promise.resolve();
        }

        if (msg.type === 'GET_CACHED_JOB') {
          addMessageRow(entry);
          return Promise.resolve(cachedJob.company ? Object.assign({}, cachedJob) : null);
        }

        if (msg.type === 'APPLICATION_DETECTED') {
          addMessageRow(entry);
          showDetection(msg.payload);
          return Promise.resolve();
        }

        addMessageRow(entry);
        return Promise.resolve();
      },
      onMessage: {
        addListener: function () {},
        removeListener: function () {},
      },
    },

    storage: {
      local: {
        get: function (key) {
          if (typeof key === 'string') {
            var result = {};
            if (key in storage) result[key] = storage[key];
            return Promise.resolve(result);
          }
          if (key === null || key === undefined) {
            return Promise.resolve(Object.assign({}, storage));
          }
          return Promise.resolve({});
        },
        set: function (data) {
          if (data) Object.assign(storage, data);
          return Promise.resolve();
        },
      },
      session: {
        get: function (key) {
          if (typeof key === 'string') {
            var result = {};
            if (key in storage) result[key] = storage[key];
            return Promise.resolve(result);
          }
          return Promise.resolve({});
        },
        set: function (data) {
          if (data) Object.assign(storage, data);
          return Promise.resolve();
        },
      },
    },

    alarms: {
      create: function () {},
      get: function () { return Promise.resolve(null); },
      onAlarm: { addListener: function () {} },
    },
  };

  // ── Helpers ────────────────────────────────────────────

  function formatPayload(p) {
    if (!p) return '';
    if (p.company && p.role) {
      return p.company + ' \u2014 ' + p.role + (p.salary ? ' | ' + p.salary : '');
    }
    return JSON.stringify(p).slice(0, 100);
  }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'textContent') e.textContent = attrs[k];
        else if (k === 'className') e.className = attrs[k];
        else e.setAttribute(k, attrs[k]);
      });
    }
    if (children) {
      children.forEach(function (c) {
        if (typeof c === 'string') e.appendChild(document.createTextNode(c));
        else if (c) e.appendChild(c);
      });
    }
    return e;
  }

  // ── Dashboard UI ───────────────────────────────────────

  function createDashboard() {
    var dash = el('div', { id: 'test-dashboard' });

    var style = el('style', {
      textContent: [
        '#test-dashboard {',
        '  position: fixed; bottom: 0; left: 0; right: 0;',
        '  background: #0f172a; color: #e2e8f0;',
        '  font-family: "Consolas", "Monaco", monospace; font-size: 13px;',
        '  border-top: 3px solid #3b82f6;',
        '  max-height: 280px; overflow-y: auto;',
        '  z-index: 99999;',
        '}',
        '#test-dashboard .dash-header {',
        '  display: flex; justify-content: space-between; align-items: center;',
        '  padding: 6px 16px; background: #1e293b;',
        '  position: sticky; top: 0;',
        '}',
        '#test-dashboard .dash-title { font-weight: bold; color: #3b82f6; font-size: 14px; }',
        '#test-dashboard .dash-controls { display: flex; gap: 8px; }',
        '#test-dashboard .dash-btn {',
        '  background: #334155; color: #94a3b8; border: none; padding: 3px 10px;',
        '  border-radius: 4px; cursor: pointer; font-size: 12px; font-family: inherit;',
        '}',
        '#test-dashboard .dash-btn:hover { background: #475569; color: #e2e8f0; }',
        '#test-dashboard .dash-body { padding: 6px 16px; }',
        '#test-dashboard .msg-row {',
        '  padding: 3px 0; border-bottom: 1px solid #1e293b;',
        '  display: flex; gap: 12px; align-items: baseline;',
        '}',
        '#test-dashboard .msg-time { color: #64748b; min-width: 65px; font-size: 11px; }',
        '#test-dashboard .msg-type { min-width: 200px; }',
        '#test-dashboard .msg-type-cache { color: #fbbf24; }',
        '#test-dashboard .msg-type-detect { color: #34d399; font-weight: bold; }',
        '#test-dashboard .msg-type-get { color: #818cf8; }',
        '#test-dashboard .msg-type-other { color: #94a3b8; }',
        '#test-dashboard .msg-data { color: #7dd3fc; }',
        '#test-dashboard .detection-banner {',
        '  background: #064e3b; color: #6ee7b7; border: 1px solid #10b981;',
        '  padding: 10px 16px; border-radius: 6px;',
        '  margin: 6px 0; font-size: 13px;',
        '  animation: harness-flash 0.6s ease;',
        '}',
        '#test-dashboard .det-title { font-weight: bold; font-size: 15px; margin-bottom: 2px; }',
        '#test-dashboard .det-meta { color: #a7f3d0; font-size: 12px; }',
        '#test-dashboard .det-salary { color: #34d399; font-weight: bold; }',
        '#test-dashboard .empty-state { color: #475569; font-style: italic; padding: 8px 0; }',
        '@keyframes harness-flash { from { background: #10b981; } to { background: #064e3b; } }',
      ].join('\n'),
    });
    dash.appendChild(style);

    // Header
    var titleSpan = el('span', { className: 'dash-title', textContent: 'Logged Test Harness' });
    var clearBtn = el('button', { className: 'dash-btn', id: 'dashClearBtn', textContent: 'Clear' });
    var toggleBtn = el('button', { className: 'dash-btn', id: 'dashToggleBtn', textContent: '_' });
    var controls = el('div', { className: 'dash-controls' }, [clearBtn, toggleBtn]);
    var header = el('div', { className: 'dash-header' }, [titleSpan, controls]);
    dash.appendChild(header);

    // Body
    var emptyState = el('div', { className: 'empty-state', id: 'emptyState', textContent: 'Waiting for detector messages...' });
    var body = el('div', { className: 'dash-body', id: 'dashBody' }, [emptyState]);
    dash.appendChild(body);

    document.body.appendChild(dash);
    document.body.style.paddingBottom = '300px';

    toggleBtn.addEventListener('click', function () {
      var b = document.getElementById('dashBody');
      b.style.display = b.style.display === 'none' ? 'block' : 'none';
      this.textContent = b.style.display === 'none' ? '+' : '_';
    });

    clearBtn.addEventListener('click', function () {
      var b = document.getElementById('dashBody');
      while (b.firstChild) b.removeChild(b.firstChild);
      b.appendChild(el('div', { className: 'empty-state', id: 'emptyState', textContent: 'Cleared. Waiting...' }));
    });
  }

  function addMessageRow(entry) {
    var body = document.getElementById('dashBody');
    if (!body) return;

    var empty = document.getElementById('emptyState');
    if (empty) empty.remove();

    var timeStr = entry.time.getHours().toString().padStart(2, '0') + ':' +
      entry.time.getMinutes().toString().padStart(2, '0') + ':' +
      entry.time.getSeconds().toString().padStart(2, '0');

    var typeClass = 'msg-type msg-type-other';
    if (entry.type === 'APPLICATION_DETECTED') typeClass = 'msg-type msg-type-detect';
    else if (entry.type === 'CACHE_JOB_DATA') typeClass = 'msg-type msg-type-cache';
    else if (entry.type === 'GET_CACHED_JOB') typeClass = 'msg-type msg-type-get';

    var row = el('div', { className: 'msg-row' }, [
      el('span', { className: 'msg-time', textContent: timeStr }),
      el('span', { className: typeClass, textContent: entry.type }),
      el('span', { className: 'msg-data', textContent: formatPayload(entry.payload) }),
    ]);

    body.appendChild(row);
    body.scrollTop = body.scrollHeight;
  }

  function showDetection(payload) {
    var body = document.getElementById('dashBody');
    if (!body) return;

    var banner = el('div', { className: 'detection-banner' }, [
      el('div', { className: 'det-title', textContent: 'DETECTED: ' + payload.company + ' \u2014 ' + payload.role }),
      el('div', {
        className: 'det-meta',
        textContent: 'Platform: ' + payload.sourcePlatform +
          ' | Detected by: ' + payload.detectedBy +
          ' | URL: ' + payload.sourceUrl,
      }),
    ]);

    if (payload.salary) {
      banner.appendChild(el('div', { className: 'det-salary', textContent: 'Salary: ' + payload.salary }));
    }

    body.appendChild(banner);
    body.scrollTop = body.scrollHeight;

    // Prefix title with checkmark on detection
    if (!document.title.startsWith('\u2705')) {
      document.title = '\u2705 ' + document.title;
    }
  }

  // ── Init ───────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createDashboard);
  } else {
    createDashboard();
  }

  // ── Public API ─────────────────────────────────────────

  window.testHarness = {
    messages: messages,
    cachedJob: cachedJob,
    storage: storage,
    getDetections: function () {
      return messages.filter(function (m) { return m.type === 'APPLICATION_DETECTED'; })
        .map(function (m) { return m.payload; });
    },
    getCachedJobs: function () {
      return messages.filter(function (m) { return m.type === 'CACHE_JOB_DATA'; })
        .map(function (m) { return m.payload; });
    },
  };

  console.log(
    '%c[Harness] Chrome API mock ready. Load a detector script to begin testing.',
    'color: #3b82f6; font-weight: bold'
  );
})();
