# Signal Intel v3 · Praxis Experiential

6-agent social intelligence pipeline.
Brand24 MCP · Grok x_search · Claude AI · Next.js · Vercel

## Stack

| Layer | Tool |
|---|---|
| Quantitative data | Brand24 MCP (mentions, reach, sentiment, SOV) |
| X/Twitter signals | Grok API (x_search + web_search) |
| Intelligence synthesis | Claude API (6-agent pipeline) |
| Deployment | Vercel |

## Deploy to Vercel (5 minutes)

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Signal Intel v3"
git remote add origin https://github.com/YOUR_USERNAME/signal-intel.git
git push -u origin main
```

### 2. Import to Vercel
1. Go to vercel.com → New Project
2. Import your GitHub repo
3. Framework: Next.js (auto-detected)
4. Add environment variables:
   - `ANTHROPIC_API_KEY` — from console.anthropic.com
   - `XAI_API_KEY` — from console.x.ai

### 3. Connect Brand24
Brand24 auth is handled via your Anthropic account connector.
Connect Brand24 in Claude.ai → Settings → Connectors → Add Custom Connector → `https://mcp.brand24.com/v1/mcp`
The same Anthropic API key identifies your account and uses your connected Brand24.

### 4. Set up Brand24 projects
For each client brand, create a project in app.brand24.com.
Signal Intel auto-detects which projects exist when you run a report.

## Local development
```bash
npm install
cp .env.example .env.local
# Fill in your API keys in .env.local
npm run dev
# Open http://localhost:3000
```

## Pipeline order
1. **Listener** — Claude + Brand24 MCP → project_stats
2. **Tracker** — Pure computation (daily averages, sentiment %)
3. **Context Scout** — Brand24 events + semantic search + Grok X/Twitter (runs BEFORE Analyst)
4. **Analyst** — Claude synthesis grounded in Brand24 + Grok data
5. **Competitive Intel** — Brand24 SOV across competitor projects
6. **Report Builder** — Claude final synthesis → deliverable
