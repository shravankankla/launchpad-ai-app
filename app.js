/**
 * app.js — LaunchPad AI: The Open-Source Product Engine
 * Handles: tab switching, active nav state, n8n webhook integration, URL validation.
 */

/* ─────────────────────────────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────────────────────────────── */
const GITHUB_REGEX     = /^https?:\/\/([a-zA-Z0-9_.-]*\.)?(github\.com|githubusercontent\.com)(\/.*)?$/;
const N8N_WEBHOOK_URL  = 'https://airtribe.app.n8n.cloud/webhook-test/launchpad-trigger';
const BRAND_WEBHOOK_URL = 'https://airtribe.app.n8n.cloud/webhook/brand-generate';
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
        if (badge) {
          badge.textContent = '✓ Live Data';
          badge.className = 'text-[10px] font-mono text-terminal-green bg-terminal-green/10 px-2 py-1 rounded-full';
        }

        // ── Tech Architecture cards ──
        for (const [field, elementId] of Object.entries(CARD_TARGETS)) {
          const el = document.getElementById(elementId);
          if (!el) continue;
          el.textContent = json[field] && json[field].trim()
            ? json[field]
            : 'No data returned for this category.';
        }
        appendConsoleLine('✔ Tech Architecture populated.', '#22c55e');
        if (window.triggerCardReveal) window.triggerCardReveal('arch-card-grid');

        // Store repo context for Brand Hub form
        window._repoContext = {
          project_summary: json.architecture_brief || '',
          stack_overview:  json.stack_overview     || '',
          repo_url:        document.getElementById('github-url-input')?.value || '',
        };

        // ── Compliance Report ──
        populateCompliance(json);
        appendConsoleLine('✔ Compliance Report populated.', '#22c55e');

        // ── Brand Hub ──
        populateBrand(json);
        appendConsoleLine('✔ Brand Hub populated.', '#22c55e');

        setStatusLine('> Full analysis complete. All tabs updated.', '#22c55e');
        setSidebarStatus('Running', 'green');

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

// ── Compliance Report Populator ───────────────────────────────────────────────
function populateCompliance(json) {
  // Licensing Matrix
  const matrixEl = document.getElementById('compliance-matrix-area');
  if (matrixEl && json.license_type) {
    const riskLabel = json.license_type.toLowerCase().includes('gpl') ? 'High'
      : json.license_type.toLowerCase().includes('none') ? 'Unknown'
      : 'Low';
    const riskColor = riskLabel === 'High' ? '#ef4444' : riskLabel === 'Unknown' ? '#f59e0b' : '#22c55e';
    matrixEl.innerHTML = `
      <div class="grid grid-cols-3 gap-2 mb-2">
        <div class="h-6 bg-charcoal-700 rounded text-[10px] font-semibold text-slate-muted/60 flex items-center px-2">Component</div>
        <div class="h-6 bg-charcoal-700 rounded text-[10px] font-semibold text-slate-muted/60 flex items-center px-2">License</div>
        <div class="h-6 bg-charcoal-700 rounded text-[10px] font-semibold text-slate-muted/60 flex items-center px-2">Risk</div>
      </div>
      <div class="grid grid-cols-3 gap-2">
        <div class="h-8 bg-charcoal-800/60 rounded border border-slate-border/20 flex items-center px-2 text-xs text-slate-300">This repository</div>
        <div class="h-8 bg-charcoal-800/60 rounded border border-slate-border/20 flex items-center px-2 text-xs text-slate-300">${json.license_type}</div>
        <div class="h-8 bg-charcoal-800/60 rounded border border-slate-border/20 flex items-center px-2 text-xs font-semibold" style="color:${riskColor}">${riskLabel}</div>
      </div>`;
  }

  // Risk Scorecard bars
  const scores = json.risk_scores || {};
  const scoreMap = [
    ['score-license',   scores.license_compatibility   ?? 0],
    ['score-security',  scores.security_vulnerabilities ?? 0],
    ['score-freshness', scores.dependency_freshness     ?? 0],
    ['score-coverage',  scores.code_coverage            ?? 0],
    ['score-copyleft',  scores.copyleft_exposure        ?? 0],
  ];
  let total = 0;
  scoreMap.forEach(([id, val]) => {
    const bar = document.getElementById(`${id}-bar`);
    const lbl = document.getElementById(`${id}-value`);
    if (bar) bar.style.width = `${val}%`;
    if (lbl) { lbl.textContent = `${val}`; lbl.style.color = val >= 70 ? '#22c55e' : val >= 40 ? '#f59e0b' : '#ef4444'; }
    total += val;
  });
  const overall = Math.round(total / scoreMap.length);
  const overallEl = document.getElementById('score-overall-value');
  if (overallEl) {
    overallEl.textContent = overall;
    overallEl.style.color = overall >= 70 ? '#22c55e' : overall >= 40 ? '#f59e0b' : '#ef4444';
  }

  // Compliance summary
  const summaryEl = document.getElementById('compliance-summary-area');
  if (summaryEl && json.compliance_summary) summaryEl.textContent = json.compliance_summary;
}

// ── Brand Hub Populator ───────────────────────────────────────────────────────
function populateBrand(json) {
  // Color swatches
  const palette = json.color_palette || [];
  palette.forEach((swatch, i) => {
    if (i > 5) return;
    const dot = document.getElementById(`swatch-${i}`);
    const lbl = document.getElementById(`swatch-label-${i}`);
    if (dot && swatch.hex) dot.style.backgroundColor = swatch.hex;
    if (lbl && swatch.name) lbl.textContent = `${swatch.name}\n${swatch.hex}`;
  });

  // Tone & Voice
  const voiceEl = document.getElementById('voice-target');
  if (voiceEl && json.brand_voice && json.brand_voice.length) {
    voiceEl.innerHTML = json.brand_voice.map(v =>
      `<div class="dashed-box rounded-lg p-3 text-xs text-slate-300">${v}</div>`
    ).join('');
  }

  // Brand positioning
  const posEl = document.getElementById('brand-positioning-area');
  if (posEl && json.brand_positioning) {
    posEl.textContent = (json.brand_tagline ? `"${json.brand_tagline}"\n\n` : '') + json.brand_positioning;
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// VISUAL ENHANCEMENTS — node graph, scan line, card stagger, swatch glow
// ══════════════════════════════════════════════════════════════════════════════

// ── Animated dependency-graph canvas ─────────────────────────────────────────
(function initNodeGraph() {
  const canvas = document.getElementById('node-graph-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, nodes, raf;

  function resize() {
    const section = document.getElementById('view-dashboard');
    W = canvas.width  = section ? section.offsetWidth  : window.innerWidth;
    H = canvas.height = section ? section.offsetHeight : 400;
  }

  function buildNodes(count = 28) {
    return Array.from({ length: count }, () => ({
      x:     Math.random() * W,
      y:     Math.random() * H,
      vx:    (Math.random() - 0.5) * 0.25,
      vy:    (Math.random() - 0.5) * 0.25,
      r:     Math.random() * 1.8 + 0.8,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Edges
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < 130) {
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.strokeStyle = `rgba(124,58,237,${(1 - d / 130) * 0.18})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }

    // Nodes
    const t = performance.now() / 1000;
    nodes.forEach(n => {
      const glow = 0.5 + 0.5 * Math.sin(t * 1.1 + n.phase);
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + glow * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(167,139,250,${0.3 + glow * 0.45})`;
      ctx.fill();

      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 0 || n.x > W) n.vx *= -1;
      if (n.y < 0 || n.y > H) n.vy *= -1;
    });

    raf = requestAnimationFrame(draw);
  }

  // Only animate when dashboard is visible
  function startIfVisible() {
    const dash = document.getElementById('view-dashboard');
    if (dash && dash.classList.contains('active')) {
      if (!raf) { resize(); nodes = buildNodes(); draw(); }
    } else {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
    }
  }

  window.addEventListener('resize', () => { resize(); });

  // Hook into tab switching — observe class changes on dashboard section
  const observer = new MutationObserver(startIfVisible);
  const dash = document.getElementById('view-dashboard');
  if (dash) observer.observe(dash, { attributes: true, attributeFilter: ['class'] });

  // Initial start
  startIfVisible();
})();

// ── Console scan line during engine run ───────────────────────────────────────
const _origSetEngineRunning = typeof setEngineRunning === 'function' ? setEngineRunning : null;
// Patch the running state to toggle scan class
const _consoleWrap = document.getElementById('console-body')?.parentElement?.parentElement;
document.addEventListener('launchpad:running', e => {
  if (_consoleWrap) _consoleWrap.classList.toggle('console-scanning', e.detail.running);
});

// ── Card stagger-reveal on data populate ─────────────────────────────────────
function triggerCardReveal(gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  Array.from(grid.children).forEach(card => {
    card.classList.remove('card-revealed');
    void card.offsetWidth; // reflow to restart animation
    card.classList.add('card-revealed');
  });
}

// ── Swatch glow on populate ───────────────────────────────────────────────────
function triggerSwatchGlow() {
  for (let i = 0; i < 6; i++) {
    const box = document.getElementById(`swatch-box-${i}`);
    if (box) {
      setTimeout(() => box.classList.add('swatch-live'), i * 80);
    }
  }
}

// ── Wire stagger + glow into existing populators ─────────────────────────────
const _origPopulateBrand = populateBrand;
window.populateBrand = function(json) {
  _origPopulateBrand(json);
  triggerSwatchGlow();
};

// Expose triggerCardReveal so the main flow can call it after Tech Arch populates
window.triggerCardReveal = triggerCardReveal;

// ══════════════════════════════════════════════════════════════════════════════
// BRAND HUB — 4-step form + dedicated brand webhook
// ══════════════════════════════════════════════════════════════════════════════

let _bfStep = 1;
const _BF_TOTAL = 4;
const _BF_LABELS = ['', 'Product basics', 'Audience & geography', 'Visual direction', 'Differentiation'];
let _bfSelectedColor = null;
window._repoContext = null;

// ── Step navigation ───────────────────────────────────────────────────────────
function bfNavigate(dir) {
  if (dir > 0 && _bfStep === _BF_TOTAL) { submitBrandBrief(); return; }
  bfGoToStep(Math.max(1, Math.min(_BF_TOTAL, _bfStep + dir)));
}

function bfGoToStep(n) {
  _bfStep = n;
  for (let i = 1; i <= _BF_TOTAL; i++) {
    const p = document.getElementById('bf-step-' + i);
    if (p) p.classList.toggle('hidden', i !== n);
  }
  for (let i = 1; i <= _BF_TOTAL; i++) {
    const d = document.getElementById('bfd-' + i);
    if (!d) continue;
    d.classList.remove('active', 'done');
    if (i < n)      { d.classList.add('done');   d.textContent = '✓'; }
    else if (i === n){ d.classList.add('active'); d.textContent = i; }
    else             { d.textContent = i; }
  }
  const lbl = document.getElementById('bf-step-label');
  if (lbl) lbl.textContent = 'Step ' + n + ' of ' + _BF_TOTAL + ' — ' + _BF_LABELS[n];
  const ctr = document.getElementById('bf-counter');
  if (ctr) ctr.textContent = 'Step ' + n + ' of ' + _BF_TOTAL;
  const prev = document.getElementById('bf-prev-btn');
  if (prev) prev.style.visibility = n > 1 ? 'visible' : 'hidden';
  const next = document.getElementById('bf-next-btn');
  if (next) {
    if (n === _BF_TOTAL) { next.textContent = '✦ Generate Brand Identity'; next.onclick = submitBrandBrief; }
    else                  { next.textContent = 'Next →'; next.onclick = () => bfNavigate(1); }
  }
  if (n === 4) bfUpdateSummary();
}

// ── Pill toggle (single-select when max=1, multi when max>1) ─────────────────
function bfTogglePill(el, max) {
  const container = el.closest('.bf-pills');
  const selected = [...container.querySelectorAll('.bf-pill.selected')];
  if (el.classList.contains('selected')) {
    el.classList.remove('selected');
  } else {
    if (max === 1) selected.forEach(p => p.classList.remove('selected'));
    if (selected.length < max || max === 1) el.classList.add('selected');
  }
}

// ── Colour picker ─────────────────────────────────────────────────────────────
function bfSelectColor(el) {
  document.querySelectorAll('.bf-color-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  _bfSelectedColor = { name: el.dataset.color, hex: el.dataset.hex };
}

// ── Step 4 live summary ───────────────────────────────────────────────────────
function bfUpdateSummary() {
  const pills = document.getElementById('bf-summary-pills');
  if (!pills) return;
  const items = [];
  const cat = document.getElementById('bf-category')?.value;
  if (cat) items.push(cat);
  const aud = document.querySelector('#bf-audience .bf-pill.selected');
  if (aud) items.push(aud.textContent);
  const geo = document.querySelector('#bf-geo .bf-pill.selected');
  if (geo) items.push(geo.textContent);
  if (_bfSelectedColor) items.push(_bfSelectedColor.name);
  document.querySelectorAll('#bf-personality .bf-pill.selected').forEach(p => items.push(p.textContent));
  pills.innerHTML = items.map(i => `<span class="bf-pill selected" style="font-size:11px;padding:4px 10px">${i}</span>`).join('');
  const warn = document.getElementById('bf-no-repo-note');
  if (warn) warn.style.display = window._repoContext ? 'none' : 'block';
}

// ── Show/hide form vs results ─────────────────────────────────────────────────
function bfShowForm() {
  const form = document.getElementById('brand-form-container');
  const res  = document.getElementById('brand-results-container');
  if (form) form.style.display = 'block';
  if (res)  res.style.display = 'none';
  bfGoToStep(1);
}

// ── Submit brand brief to dedicated webhook ───────────────────────────────────
async function submitBrandBrief() {
  const next = document.getElementById('bf-next-btn');
  if (next) { next.disabled = true; next.textContent = '⟳ Generating…'; }

  const brief = {
    product_name:        document.getElementById('bf-name')?.value?.trim()        || '',
    product_description: document.getElementById('bf-desc')?.value?.trim()        || '',
    category:            document.getElementById('bf-category')?.value             || '',
    primary_user:        document.querySelector('#bf-audience .bf-pill.selected')?.textContent || '',
    geography:           document.querySelector('#bf-geo .bf-pill.selected')?.textContent     || '',
    color_family:        _bfSelectedColor?.name  || '',
    color_hex:           _bfSelectedColor?.hex   || '',
    personality_traits:  [...document.querySelectorAll('#bf-personality .bf-pill.selected')].map(p => p.textContent),
    colors_to_avoid:     document.getElementById('bf-avoid')?.value?.trim()        || '',
    three_words:         document.getElementById('bf-words')?.value?.trim()        || '',
    style_inspiration:   document.getElementById('bf-inspiration')?.value?.trim() || '',
    differentiator:      document.getElementById('bf-diff')?.value?.trim()         || '',
  };

  try {
    const res = await fetch(BRAND_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand_brief:  brief,
        repo_context: window._repoContext || { note: 'No repository analysed yet — brand only.' },
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' from brand webhook');
    const data = await res.json();
    const raw  = Array.isArray(data) ? data[0]?.output : data?.output;
    const cleaned = (raw || '').replace(/^```json\s*/i,'').replace(/```\s*$/,'').trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); } catch { parsed = data; }
    bfShowResults(parsed, brief.product_name);
  } catch (err) {
    alert('Brand generation failed: ' + err.message + '\n\nCheck that the brand-generate webhook is activated in n8n.');
  } finally {
    if (next) { next.disabled = false; next.textContent = '✦ Generate Brand Identity'; }
  }
}

// ── Populate brand results ────────────────────────────────────────────────────
function bfShowResults(json, productName) {
  const form = document.getElementById('brand-form-container');
  const res  = document.getElementById('brand-results-container');
  if (form) form.style.display = 'none';
  if (res)  res.style.display  = 'block';

  const badge = document.getElementById('brand-product-name-badge');
  if (badge && productName) badge.textContent = productName;

  const tagEl = document.getElementById('brand-tagline-display');
  if (tagEl) tagEl.textContent = json.brand_tagline ? '"' + json.brand_tagline + '"' : '';

  populateBrand(json);
  triggerSwatchGlow();
}
