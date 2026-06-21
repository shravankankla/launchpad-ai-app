# LaunchPad AI: The Open-Source Product Engine

> Transform any public GitHub repository into a fully-packaged, market-ready product — automated tech architecture, compliance reports, and brand assets, in minutes.

---

## ✨ Tech Stack

| Layer | Technology |
|---|---|
| Structure | HTML5 (semantic) |
| Styling | Tailwind CSS v3 (CDN) |
| Logic | Vanilla JavaScript (ES2020+) |
| Typography | Inter + JetBrains Mono (Google Fonts) |

No build tools, no Node.js, no dependencies to install.

---

## 🚀 Quick Start

1. **Clone or download** this folder.
2. **Open `index.html`** directly in any modern browser (Chrome, Firefox, Edge, Safari).
3. An internet connection is required on first load to fetch the Tailwind CDN and Google Fonts.

That's it — no `npm install`, no build step.

---

## 📁 File Structure

```
launchpad-ai-app/
├── index.html    ← Full SPA shell: layout, all 4 view panels, Tailwind config
├── app.js        ← Tab switching, Launch Engine interaction, URL validation
└── README.md     ← This file
```

---

## 🗂 Views

| View | ID | Purpose |
|---|---|---|
| Dashboard | `#view-dashboard` | GitHub URL input + Launch Engine console |
| Tech Architecture | `#view-architecture` | 3×2 card grid for stack/dependency/API reports |
| Compliance Report | `#view-compliance` | Licensing matrix + risk scorecard placeholder |
| Brand Hub | `#view-brand` | Logo gallery + color swatch + typography canvas |

---

## ⚡ Interactions

### Tab Switching
Click any sidebar nav link — the matching view fades in instantly via CSS animation. The active link is highlighted with a violet left-border glow.

### Launch Engine
1. Enter a valid `https://github.com/owner/repo` URL in the Dashboard input.
2. Click **Launch Engine**.
3. The console animates a typewriter-style pipeline sequence, ends with `Running ✓`, then auto-resets to `Idle` after ~4.5 s.
4. Invalid URLs produce a shake animation + inline error message.

---

## 🎨 Design Tokens

| Token | Hex | Role |
|---|---|---|
| Charcoal | `#0f1117` | Page background |
| Surface | `#1e2235` | Cards / panels |
| Border | `#2d3252` | Card outlines |
| Violet Accent | `#7c3aed` | Buttons, active nav |
| Violet Glow | `#a78bfa` | Headings, highlights |
| Terminal Green | `#22c55e` | Console status |
| Text Primary | `#e2e8f0` | Body copy |
| Text Muted | `#64748b` | Placeholders |

---

## 🛤 Roadmap / Next Steps

- [ ] Connect to a backend API to actually clone and analyse GitHub repos
- [ ] Populate Tech Architecture cards with real markdown-rendered data
- [ ] Animate Compliance risk scorecard bars with real scores
- [ ] Generate SVG logo variants in the Brand Hub
- [ ] Add export buttons (PDF, JSON, SBOM)
- [ ] Add user auth / project history sidebar

---

## 📄 License

MIT — open source, build on top of it freely.
