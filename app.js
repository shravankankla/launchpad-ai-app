/**
 * app.js — LaunchPad AI: The Open-Source Product Engine
 * Handles: tab switching, active nav state, n8n webhook integration, URL validation.
 */

/* ─────────────────────────────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────────────────────────────── */
const GITHUB_REGEX     = /^https?:\/\/([a-zA-Z0-9_.-]*\.)?(github\.com|githubusercontent\.com)(\/.*)?$/;
const N8N_WEBHOOK_URL  = 'https://airtribe.app.n8n.cloud/webhook/launchpad-trigger';
const FETCH_TIMEOUT_MS = 15000; // 15 s before we surface a timeout error

/* ─────────────────────────────────────────────────────────────────────
   TAB / VIEW SWITCHING
───────────────────────────────────────────────────────────────────── */

/** All sidebar nav links */
const navLinks   = document.querySelectorAll('.nav-link');
/** All view panels */
const viewPanels = document.querySelectorAll('.view-panel');
/** Top-bar breadcrumb label */
const topbarLabel = document.getElementById('topbar-view-label');

/** Human-friendly label map for top-bar breadcrumb */
const VIEW_LABELS = {
  'view-dashboard':    'Dashboard',
  'view-architecture': 'Tech Architecture',
  'view-compliance':   'Compliance Report',
  'view-brand':        'Brand Hub',
};

/**
 * Activate a view by its panel ID (e.g. "view-dashboard").
 * @param {string} targetId
 */
function activateView(targetId) {
  viewPanels.forEach((panel) => panel.classList.remove('active'));
  navLinks.forEach((link) => {
    link.classList.remove('active');
    link.style.borderLeft = '';
  });

  const targetPanel = document.getElementById(targetId);
  if (targetPanel) {
    targetPanel.classList.add('active');
    void targetPanel.offsetWidth; // restart animation
  }

  navLinks.forEach((link) => {
    if (link.dataset.target === targetId) link.classList.add('active');
  });

  if (topbarLabel) topbarLabel.textContent = VIEW_LABELS[targetId] || targetId;
}

// Attach click listeners to all nav links
navLinks.forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const target = link.dataset.target;
    if (target) activateView(target);
  });
});

/* ─────────────────────────────────────────────────────────────────────
   LAUNCH ENGINE — n8n WEBHOOK INTEGRATION
───────────────────────────────────────────────────────────────────── */

/** DOM refs */
const urlInput    = document.getElementById('github-url-input');
const urlError    = document.getElementById('url-error');
const launchBtn   = document.getElementById('launch-btn');
const consoleBody = document.getElementById('console-body');
const statusValue = document.getElementById('status-value');

/* Sidebar status refs */
const sidebarDot  = document.getElementById('sidebar-status-dot');
const sidebarText = document.getElementById('sidebar-status-text');

/**
 * Main entry point — called by the "Launch Engine" button.
 * Validates the URL, then fires a real fetch() POST to the n8n webhook.
 */
async function launchEngine() {                           // eslint-disable-line no-unused-vars
  const url = urlInput.value.trim();

  // ── 1. Validate URL ──────────────────────────────────────────────
  if (!GITHUB_REGEX.test(url)) {
    showUrlError(true);
    shakeElement(urlInput);
    return;
  }
  showUrlError(false);

  // ── 2. Lock UI into "connecting" state ───────────────────────────
  setEngineRunning(true);
  clearConsoleOutput();

  // Phase 1 console message — connecting
  setStatusLine('> Connecting to n8n backend…', '#a78bfa');
  setSidebarStatus('Connecting', 'violet');
  appendConsoleLine('▶  Sending payload to automation engine…', '#a78bfa');
  appendConsoleLine(`   github_url: "${url}"`, '#64748b');

  // ── 3. Fire fetch() with timeout ─────────────────────────────────
  try {
    const response = await fetchWithTimeout(N8N_WEBHOOK_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ github_url: url }),
    }, FETCH_TIMEOUT_MS);

    // ── 4a. SUCCESS ──────────────────────────────────────────────────
    if (response.ok) {
      appendConsoleLine('✔ Webhook accepted — pipeline triggered.', '#22c55e');
      let json = null;
      try {
        json = await response.json();
      } catch (e) {
        console.log('Response parsing bypassed', e);
      }

      const target = document.getElementById('architecture-text-target');
      const badge  = document.getElementById('brief-status-badge');

      const CARD_TARGETS = {
        stack_overview:   'stack-overview-target',
        dependency_graph: 'dependency-graph-target',
        api_surface:      'api-surface-target',
        security_posture: 'security-posture-target',
        cicd_pipeline:    'cicd-pipeline-target',
        code_quality:     'code-quality-target',
      };

      if (target && json && json.architecture_brief) {
        target.innerHTML = json.architecture_brief;
        appendConsoleLine('✔ Architecture brief received — tab updated.', '#22c55e');
        setStatusLine('> Engineering analysis complete. Tab updated successfully!', '#22c55e');
        if (badge) {
          badge.textContent = '✓ Live Data';
          badge.className = 'text-[10px] font-mono text-terminal-green bg-terminal-green/10 px-2 py-1 rounded-full';
        }

        // Populate the six cards. Each is independent — a missing field
        // shows a clear "not available" message instead of staying stuck
        // on its loading skeleton forever.
        for (const [field, elementId] of Object.entries(CARD_TARGETS)) {
          const el = document.getElementById(elementId);
          if (!el) continue;
          el.textContent = json[field] && json[field].trim()
            ? json[field]
            : 'No data returned for this category.';
        }
        appendConsoleLine('✔ Card data populated.', '#22c55e');

      } else {
        if (target) target.innerHTML = 'Error: Received empty payload from n8n engine. Check your n8n output parameters.';
        appendConsoleLine('ℹ No architecture_brief in payload.', '#64748b');
        setStatusLine('> Ingestion complete, but payload was empty.', '#f59e0b');
        if (badge) {
          badge.textContent = '⚠ Empty Payload';
          badge.className = 'text-[10px] font-mono text-amber-400 bg-amber-400/10 px-2 py-1 rounded-full';
        }
      }
      setSidebarStatus('Running', 'green');

    } else {
      // ── 4b. HTTP ERROR (non-2xx) ─────────────────────────────────
      throw new Error(`HTTP ${response.status} — ${response.statusText}`);
    }

  } catch (err) {
    // ── 4c. NETWORK / TIMEOUT / HTTP ERROR ──────────────────────────
    const isTimeout = err.name === 'AbortError';
    const msg       = isTimeout
      ? '> Connection Error: Request timed out after 15 s.'
      : `> Connection Error: Failed to reach the automation engine.`;
    const detail    = isTimeout
      ? '   The n8n webhook did not respond in time.'
      : `   ${err.message}`;

    appendConsoleLine('✖  ' + (isTimeout ? 'Timeout — no response received.' : err.message), '#ef4444');
    appendConsoleLine(detail, '#64748b');
    setStatusLine(msg, '#ef4444');
    setSidebarStatus('Error', 'red');

  } finally {
    // ── 5. Always re-enable the button ──────────────────────────────
    setEngineRunning(false);
  }
}

/* ─────────────────────────────────────────────────────────────────────
   FETCH WITH TIMEOUT HELPER
───────────────────────────────────────────────────────────────────── */

/**
 * Wraps fetch() with an AbortController-based timeout.
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

/* ─────────────────────────────────────────────────────────────────────
   UI HELPER FUNCTIONS
───────────────────────────────────────────────────────────────────── */

/** Show/hide the URL validation error message */
function showUrlError(show) {
  if (urlError) urlError.classList.toggle('hidden', !show);
}

/** Apply a CSS shake animation to an element */
function shakeElement(el) {
  if (!el) return;
  el.classList.remove('shake-anim');
  void el.offsetWidth;
  el.classList.add('shake-anim');
  el.addEventListener('animationend', () => el.classList.remove('shake-anim'), { once: true });
}

/**
 * Toggle the Launch Engine button between active / idle states.
 * @param {boolean} running
 */
function setEngineRunning(running) {
  if (!launchBtn) return;
  launchBtn.disabled = running;
  launchBtn.innerHTML = running
    ? `<svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.5">
         <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
       </svg>
       Connecting…`
    : `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round">
         <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
       </svg>
       Launch Engine`;
}

/**
 * Update the inline status text and colour inside the console.
 * @param {string} text
 * @param {string} color  CSS colour value
 */
function setStatusLine(text, color = '#22c55e') {
  if (!statusValue) return;
  statusValue.textContent = text;
  statusValue.style.color  = color;
}

/**
 * Update the sidebar status dot + label.
 * @param {string} label
 * @param {'green'|'violet'|'red'|'idle'} theme
 */
function setSidebarStatus(label, theme = 'idle') {
  const COLORS = {
    green:  '#22c55e',
    violet: '#a78bfa',
    red:    '#ef4444',
    idle:   '#64748b',
  };
  if (sidebarDot) {
    sidebarDot.style.backgroundColor = COLORS[theme] ?? COLORS.idle;
    // Pulse only when actively running
    if (theme === 'green' || theme === 'violet') {
      sidebarDot.classList.add('animate-pulse-slow');
    } else {
      sidebarDot.classList.remove('animate-pulse-slow');
    }
  }
  if (sidebarText) sidebarText.textContent = `Engine ${label}`;
}

/**
 * Append a new colour-coded log line to the console output,
 * inserted before the status line so status always stays last.
 * @param {string} text
 * @param {string} color
 */
function appendConsoleLine(text, color = '#94a3b8') {
  if (!consoleBody) return;
  const line = document.createElement('p');
  line.className  = 'text-[13px] font-mono';
  line.style.color   = color;
  line.style.opacity = '0';
  line.textContent   = text;

  const statusLine = document.getElementById('console-status-line');
  if (statusLine) {
    consoleBody.insertBefore(line, statusLine);
  } else {
    consoleBody.appendChild(line);
  }

  // Fade in
  requestAnimationFrame(() => {
    line.style.transition = 'opacity 0.3s ease';
    line.style.opacity    = '1';
  });
}

/**
 * Remove all dynamically-appended console lines,
 * preserving the two static header lines and the status line.
 */
function clearConsoleOutput() {
  if (!consoleBody) return;
  const keepIds  = ['console-status-line'];
  Array.from(consoleBody.children).forEach((child, i) => {
    if (i >= 2 && !keepIds.includes(child.id)) child.remove();
  });
  // Reset status back to neutral
  setStatusLine('Idle', '#22c55e');
}

/* ─────────────────────────────────────────────────────────────────────
   ARCHITECTURE BRIEF RENDERER
───────────────────────────────────────────────────────────────────── */

/**
 * Receives the raw `architecture_brief` string from n8n and injects it
 * into #view-architecture, replacing the static placeholder grid.
 *
 * The text is written into #arch-brief-body with whitespace-pre-wrap so
 * every line break and indent the AI produces renders faithfully —
 * no markdown parser needed on our side.
 *
 * @param {string} text  Raw text / markdown from n8n response
 */
function renderArchitectureBrief(text) {
  const container = document.getElementById('view-architecture');
  if (!container) return;

  // ── Preserve the hero header block (badge + h1 + subtitle) ────────
  const heroBlock = container.querySelector('div:first-child');

  // ── Build card shell ───────────────────────────────────────────────
  const card = document.createElement('div');
  card.innerHTML = `
    <!-- Architecture brief card -->
    <div class="glass-card rounded-2xl shadow-card overflow-hidden mb-6 animate-fade-in">
      <!-- Card header bar -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-slate-border/30">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-violet-faint flex items-center justify-center">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a78bfa"
                 stroke-width="2" stroke-linecap="round">
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>
              <line x1="12" y1="22" x2="12" y2="15.5"/>
              <polyline points="22 8.5 12 15.5 2 8.5"/>
            </svg>
          </div>
          <span class="text-sm font-semibold text-slate-bright">Architecture Brief</span>
        </div>
        <span class="text-[10px] font-mono text-terminal-green bg-terminal-bg px-2.5 py-1 rounded-full
                     border border-terminal-dim/40">
          ✔ Live Data
        </span>
      </div>
      <!-- Content body: raw text with whitespace preserved -->
      <div id="arch-brief-body" class="px-7 py-6 overflow-x-auto"></div>
    </div>
  `;

  // ── Write the raw text into the body container ─────────────────────
  // Using a wrapper with whitespace-pre-wrap so every newline and indent
  // the AI output contains renders exactly as-is on screen.
  const body = card.querySelector('#arch-brief-body');
  const wrapper = document.createElement('div');
  wrapper.className = 'whitespace-pre-wrap font-sans text-slate-200 text-sm leading-relaxed';
  wrapper.textContent = text;   // textContent — safe, no XSS risk
  body.appendChild(wrapper);

  // ── Replace everything after the hero header ───────────────────────
  if (heroBlock) {
    while (heroBlock.nextSibling) heroBlock.nextSibling.remove();
    container.appendChild(card);
  } else {
    container.innerHTML = '';
    container.appendChild(card);
  }

  // ── Pulse the nav link to signal fresh data ────────────────────────
  const archLink = document.getElementById('nav-architecture');
  if (archLink) {
    archLink.style.boxShadow = '0 0 0 1px rgba(124,58,237,0.50), inset 0 0 20px rgba(124,58,237,0.08)';
    setTimeout(() => { archLink.style.boxShadow = ''; }, 3000);
  }
}

/* ─────────────────────────────────────────────────────────────────────
   LIGHTWEIGHT MARKDOWN → HTML CONVERTER
   Handles: h1-h3, bold, italic, inline-code, code blocks,
            unordered lists, ordered lists, blockquotes, hr, paragraphs.
───────────────────────────────────────────────────────────────────── */

/**
 * @param {string} md  Raw markdown string
 * @returns {string}   Safe HTML string
 */
function markdownToHtml(md) {
  // Sanitise: strip script tags to prevent XSS
  let s = md.replace(/<script[\s\S]*?<\/script>/gi, '');

  // Fenced code blocks  ```lang\n...\n```
  s = s.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const label = lang
      ? `<span class="text-[10px] font-mono text-violet-glow/70 mb-2 block uppercase tracking-widest">${escHtml(lang)}</span>`
      : '';
    return `<div class="my-4 rounded-xl overflow-hidden border border-slate-border/30">
      <div class="bg-charcoal-900 px-4 py-3">
        ${label}
        <pre class="text-[13px] text-slate-text font-mono whitespace-pre overflow-x-auto leading-relaxed m-0">${escHtml(code.trimEnd())}</pre>
      </div>
    </div>`;
  });

  // Headings
  s = s.replace(/^### (.+)$/gm,  '<h3 class="text-base font-semibold text-violet-glow mt-6 mb-2">$1</h3>');
  s = s.replace(/^## (.+)$/gm,   '<h2 class="text-lg font-bold text-slate-bright mt-8 mb-3 pb-2 border-b border-slate-border/30">$1</h2>');
  s = s.replace(/^# (.+)$/gm,    '<h1 class="text-xl font-extrabold text-slate-bright mt-2 mb-4">$1</h1>');

  // Horizontal rule
  s = s.replace(/^---+$/gm, '<hr class="border-slate-border/30 my-5" />');

  // Blockquotes
  s = s.replace(/^> (.+)$/gm,
    '<blockquote class="border-l-4 border-violet-accent pl-4 italic text-slate-text my-3 text-sm">$1</blockquote>');

  // Unordered lists — group consecutive lines starting with - / * / +
  s = s.replace(/((?:^[\-\*\+] .+\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map((line) =>
      `<li class="text-sm text-slate-text leading-relaxed">${inlineFormat(line.replace(/^[\-\*\+] /, ''))}</li>`
    ).join('');
    return `<ul class="list-disc list-inside space-y-1 my-3 pl-2">${items}</ul>`;
  });

  // Ordered lists
  s = s.replace(/((?:^\d+\. .+\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map((line) =>
      `<li class="text-sm text-slate-text leading-relaxed">${inlineFormat(line.replace(/^\d+\. /, ''))}</li>`
    ).join('');
    return `<ol class="list-decimal list-inside space-y-1 my-3 pl-2">${items}</ol>`;
  });

  // Paragraphs — wrap non-tagged lines
  s = s.replace(/^(?!<[a-z]).+$/gm, (line) => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    return `<p class="text-sm text-slate-text leading-relaxed my-2">${inlineFormat(trimmed)}</p>`;
  });

  // Collapse multiple blank lines
  s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}

/**
 * Apply inline markdown: bold, italic, inline-code, links.
 * @param {string} text
 * @returns {string}
 */
function inlineFormat(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-slate-bright">$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em class="italic text-slate-text/90">$1</em>')
    .replace(/`([^`]+)`/g,     '<code class="font-mono text-violet-glow bg-charcoal-900 px-1.5 py-0.5 rounded text-[12px]">$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-violet-glow underline underline-offset-2 hover:text-violet-bright transition-colors">$1</a>');
}

/** HTML-escape a string to prevent injection inside code blocks. */
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ─────────────────────────────────────────────────────────────────────
   INIT — set Dashboard as the default active view on page load
───────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  activateView('view-dashboard');
});
