/**
 * app.js — LaunchPad AI: The Open-Source Product Engine
 * Handles: tab switching, active nav state, Launch Engine animation, URL validation.
 */

/* ─────────────────────────────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────────────────────────────── */
const GITHUB_REGEX = /^https?:\/\/(www\.)?github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(\/.*)?$/;

const CONSOLE_MESSAGES = [
  { delay: 0,    text: '▶  Initializing LaunchPad Engine…',        color: '#a78bfa' },
  { delay: 600,  text: '⟳  Validating repository access…',         color: '#94a3b8' },
  { delay: 1200, text: '⟳  Cloning metadata snapshot…',            color: '#94a3b8' },
  { delay: 1800, text: '⟳  Scanning dependency graph…',            color: '#94a3b8' },
  { delay: 2400, text: '✔  Analysis pipeline queued.',             color: '#22c55e' },
];

const RESET_DELAY_MS = 4500;

/* ─────────────────────────────────────────────────────────────────────
   TAB / VIEW SWITCHING
───────────────────────────────────────────────────────────────────── */

/** All sidebar nav links */
const navLinks = document.querySelectorAll('.nav-link');
/** All view panels */
const viewPanels = document.querySelectorAll('.view-panel');
/** Top-bar breadcrumb label */
const topbarLabel = document.getElementById('topbar-view-label');

/** Human-friendly label map for top-bar breadcrumb */
const VIEW_LABELS = {
  'view-dashboard':   'Dashboard',
  'view-architecture':'Tech Architecture',
  'view-compliance':  'Compliance Report',
  'view-brand':       'Brand Hub',
};

/**
 * Activate a view by its panel ID (e.g. "view-dashboard").
 * @param {string} targetId
 */
function activateView(targetId) {
  // Hide all panels
  viewPanels.forEach((panel) => panel.classList.remove('active'));
  // Remove active class from all nav links
  navLinks.forEach((link) => {
    link.classList.remove('active');
    // Reset border-left hack for active state (Tailwind won't strip inline styles)
    link.style.borderLeft = '';
  });

  // Show target panel
  const targetPanel = document.getElementById(targetId);
  if (targetPanel) {
    targetPanel.classList.add('active');
    // Trigger re-flow for animation restart
    void targetPanel.offsetWidth;
  }

  // Mark the corresponding nav link active
  navLinks.forEach((link) => {
    if (link.dataset.target === targetId) {
      link.classList.add('active');
    }
  });

  // Update top-bar breadcrumb
  if (topbarLabel) {
    topbarLabel.textContent = VIEW_LABELS[targetId] || targetId;
  }
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
   LAUNCH ENGINE LOGIC
───────────────────────────────────────────────────────────────────── */

/** DOM refs */
const urlInput       = document.getElementById('github-url-input');
const urlError       = document.getElementById('url-error');
const launchBtn      = document.getElementById('launch-btn');
const consoleBody    = document.getElementById('console-body');
const statusValue    = document.getElementById('status-value');

/* Sidebar status refs */
const sidebarDot     = document.getElementById('sidebar-status-dot');
const sidebarText    = document.getElementById('sidebar-status-text');

/** Tracks active reset timer so we can cancel if re-launched */
let resetTimer = null;
/** Tracks all timeout IDs for console animation so we can clear them */
let consoleTimers = [];

/**
 * Called when the Launch Engine button is clicked.
 */
function launchEngine() {                                   // eslint-disable-line no-unused-vars
  const url = urlInput.value.trim();

  // ── 1. Validate URL ──────────────────────────────────────────────
  if (!GITHUB_REGEX.test(url)) {
    showUrlError(true);
    shakeElement(urlInput);
    return;
  }
  showUrlError(false);

  // ── 2. Clear previous timers ─────────────────────────────────────
  clearAllTimers();

  // ── 3. Update button & sidebar to "running" state ─────────────────
  setEngineRunning(true);

  // ── 4. Animate console output ─────────────────────────────────────
  // Keep the header lines, clear dynamic output
  clearConsoleOutput();

  CONSOLE_MESSAGES.forEach(({ delay, text, color }) => {
    const t = setTimeout(() => {
      appendConsoleLine(text, color);
    }, delay);
    consoleTimers.push(t);
  });

  // ── 5. After all messages: show "Running ✓" ───────────────────────
  const finalT = setTimeout(() => {
    setStatusLine('Running ✓', '#22c55e');
    setSidebarStatus('Running', true);
  }, CONSOLE_MESSAGES[CONSOLE_MESSAGES.length - 1].delay + 300);
  consoleTimers.push(finalT);

  // ── 6. Auto-reset to Idle ─────────────────────────────────────────
  resetTimer = setTimeout(() => {
    resetToIdle();
  }, RESET_DELAY_MS);
}

/* ─────────────────────────────────────────────────────────────────────
   HELPER FUNCTIONS
───────────────────────────────────────────────────────────────────── */

/** Show/hide the URL validation error message */
function showUrlError(show) {
  if (urlError) {
    urlError.classList.toggle('hidden', !show);
  }
}

/** Apply a CSS shake animation to an element */
function shakeElement(el) {
  if (!el) return;
  el.classList.remove('shake-anim');
  // Trigger reflow to restart animation
  void el.offsetWidth;
  el.classList.add('shake-anim');
  el.addEventListener('animationend', () => el.classList.remove('shake-anim'), { once: true });
}

/** Set engine running/idle state on the button */
function setEngineRunning(running) {
  if (!launchBtn) return;
  launchBtn.disabled = running;
  launchBtn.innerHTML = running
    ? `<svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
         <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
       </svg>
       Analyzing…`
    : `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
         <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
       </svg>
       Launch Engine`;
}

/** Update the main status line inside the console */
function setStatusLine(text, color = '#22c55e') {
  if (!statusValue) return;
  statusValue.textContent = text;
  statusValue.style.color = color;
}

/** Update the sidebar status dot + text */
function setSidebarStatus(label, active = false) {
  if (sidebarDot) {
    sidebarDot.style.backgroundColor = active ? '#22c55e' : '#64748b';
    sidebarDot.classList.toggle('animate-ping', false); // reset
    if (active) sidebarDot.classList.add('animate-pulse-slow');
    else sidebarDot.classList.remove('animate-pulse-slow');
  }
  if (sidebarText) sidebarText.textContent = `Engine ${label}`;
}

/** Append a new line to the console, preserving header lines */
function appendConsoleLine(text, color = '#94a3b8') {
  if (!consoleBody) return;
  const line = document.createElement('p');
  line.className = 'text-[13px] font-mono transition-opacity duration-300';
  line.style.color = color;
  line.style.opacity = '0';
  line.textContent = text;

  // Insert before the status line (last child)
  const statusLine = document.getElementById('console-status-line');
  if (statusLine) {
    consoleBody.insertBefore(line, statusLine);
  } else {
    consoleBody.appendChild(line);
  }

  // Fade in
  requestAnimationFrame(() => {
    line.style.transition = 'opacity 0.3s ease';
    line.style.opacity = '1';
  });
}

/** Remove all dynamically-appended console lines (keep static header lines) */
function clearConsoleOutput() {
  if (!consoleBody) return;
  // Remove all children that are NOT the header lines or status line
  const keepIds = ['console-status-line'];
  // Keep first 2 p elements (header / divider) and #console-status-line
  const children = Array.from(consoleBody.children);
  children.forEach((child, i) => {
    if (i >= 2 && !keepIds.includes(child.id)) {
      child.remove();
    }
  });
  // Reset status value to "Running…" placeholder
  setStatusLine('Initializing…', '#a78bfa');
}

/** Cancel all active timers */
function clearAllTimers() {
  consoleTimers.forEach(clearTimeout);
  consoleTimers = [];
  if (resetTimer) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }
}

/** Fully reset the UI to Idle state */
function resetToIdle() {
  setEngineRunning(false);
  setStatusLine('Idle', '#22c55e');
  setSidebarStatus('Idle', false);
  // Remove dynamic console lines
  const children = Array.from(consoleBody.children);
  children.forEach((child, i) => {
    if (i >= 2 && child.id !== 'console-status-line') {
      child.style.transition = 'opacity 0.4s ease';
      child.style.opacity = '0';
      setTimeout(() => child.remove(), 400);
    }
  });
}

/* ─────────────────────────────────────────────────────────────────────
   INIT — ensure Dashboard is the default active view on load
───────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  activateView('view-dashboard');
});
