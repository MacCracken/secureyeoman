# Marketing Strategy: SecureYeoman

> Zero-budget guerrilla marketing plan for a sovereign AI agent platform with zero market awareness, strong technical differentiation, and a favorable competitive window.
>
> **Last updated:** 2026-03-05

---

## Table of Contents

1. [Positioning & Narrative](#1-positioning--narrative)
2. [Attack Narratives](#2-attack-narratives)
3. [Launch Sequence](#3-launch-sequence-zero-budget)
4. [Content Pillars](#4-content-pillars)
5. [Channel Strategy](#5-channel-strategy)
6. [SEO & Discovery](#6-seo--discovery)
7. [Community & Flywheel](#7-community--flywheel)
8. [AGPL-3.0 as Marketing Weapon](#8-agpl-30-as-marketing-weapon)
9. [Metrics & Milestones](#9-metrics--milestones)
10. [Copy Templates](#10-copy-templates)

---

## 1. Positioning & Narrative

### Core Message

> **"Your AI agent shouldn't report to someone else's cloud."**

One line. Every channel. Every post. Burn it into the audience's memory.

### Supporting Messages (use in rotation)

| Audience | Message |
|----------|---------|
| Enterprise CISO/CTO | "~16,100 tests. HMAC-SHA256 audit chain. RBAC + SSO/SAML. Air-gapped. The enterprise AI agent platform that was built for your compliance team, not against them." |
| Self-hoster / homelabber | "One curl. One binary. Twelve AI providers. Zero cloud dependency. Your AI, your hardware, your rules." |
| Security professional | "OpenClaw has 135,000+ exposed instances and 1,184+ malicious skills. We have a cryptographic audit chain and OPA governance. Pick one." |
| Developer | "274 MCP tools. DAG workflow builder. Multi-agent swarms. AGPL-3.0. Ship it on a Friday, sleep on Saturday." |

### The Sovereignty Stack (Differentiator Framework)

Every competitor conversation reduces to this stack. If we win on 4 of 5, we win the deal.

| Layer | SecureYeoman | Cloud Agents (Frontier, Manus/Meta, Devin) | OpenClaw | Ironclaw |
|-------|:---:|:---:|:---:|:---:|
| **Data stays on your machines** | Yes | No | Yes (but 135K exposed) | No (NEAR AI Cloud) |
| **Multi-provider flexibility** | 12 providers | Locked to 1 | Multiple | 5 |
| **Enterprise auth (RBAC/SSO/SAML)** | Yes | Partial | No | No |
| **Cryptographic audit trail** | HMAC-SHA256 | Logs | No | No |
| **Air-gap / offline capable** | Yes | No | Yes | No |

---

## 2. Attack Narratives

Three stories that write themselves. Every piece of content should map to at least one.

### Narrative A: The OpenClaw Security Crisis

**The facts (all public, all sourced in [functional-audit.md](development/functional-audit.md)):**
- CVE-2026-25253: one-click RCE (CVSS 8.8) — clicking a single link fully compromises the instance
- CVE-2026-25157, CVE-2026-24763, plus 6 more from Endor Labs audit
- ClawHavoc: 1,184+ malicious skills in ClawHub (Bitdefender: ~900, ~20% of ecosystem at time of audit)
- Snyk ToxicSkills: prompt injection in 36% of examined skills; 1,467 malicious payloads
- Cline supply chain attack installed OpenClaw on developer systems without consent
- 135,000+ publicly exposed instances (Censys data, March 2026)
- Gartner: "unacceptable cybersecurity risk" — immediate enterprise ban recommended
- Palo Alto Networks: "the potential biggest insider threat of 2026"
- Creator Peter Steinberger joined OpenAI (Feb 14, 2026); project in foundation transition
- API cost: $300–750/month for the full experience; 8 GB RAM for browser skills

**How to use it:**
- Every new OpenClaw CVE or breach report is a content trigger — write a response post within 24 hours
- Never attack OpenClaw developers directly (they'll be potential contributors). Attack the architecture and the security posture
- Frame as "the industry has a problem" not "OpenClaw is bad"
- Always end with: "Here's how SecureYeoman handles this" with a specific technical explanation

**Sample angle:** "135,000 exposed AI agent instances and counting. Here's why self-hosted doesn't mean secure — and what governed self-hosted looks like."

### Narrative B: The Manus/Meta Sovereignty Wake-Up

**The facts:**
- Manus AI acquired by Meta for ~$2 billion (March 2026)
- $100M ARR in ~8 months — validates the market
- Every Manus user's agent data, conversation history, and connected account credentials now flow through Meta's infrastructure
- For any org subject to GDPR, CCPA, HIPAA, or sector-specific data residency rules, Manus is now a compliance liability

**How to use it:**
- Frame around the question: "Where does your agent's data go after an acquisition?"
- Target LinkedIn (enterprise decision-makers) and HN (technical founders who understand the implications)
- The Meta angle resonates with privacy-conscious developers AND enterprise compliance teams — rare overlap

**Sample angle:** "Your AI agent's data is now Meta's data. What the Manus acquisition means for enterprise AI sovereignty."

### Narrative C: The Vendor Lock-In Trap

**The facts:**
- OpenAI Frontier: OpenAI models only, OpenAI cloud, OpenAI rules. Enterprise subscription pricing
- Devin 2.0: dropped to $20/mo (from $500) — race to commoditize cloud-hosted agents. Acquired Windsurf. All code and conversation data on Cognition's servers
- SecureYeoman: 13 AI providers (including fully local via Ollama/LM Studio), your infrastructure, AGPL-3.0

**How to use it:**
- "What happens when your AI provider raises prices 10x?" (it's happened before — see GPT-4 → GPT-4o pricing history)
- "What happens when your SaaS agent vendor gets acquired?" (Manus → Meta proves this isn't hypothetical)
- "SecureYeoman supports 12 providers. Switch models with one CLI command. No migration, no lock-in, no permission needed."

---

## 3. Launch Sequence (Zero-Budget)

### Week 1–2: Pre-Launch Preparation

| Task | Detail | Owner |
|------|--------|-------|
| **README polish** | Already strong. Add a GIF/screenshot above the fold showing the dashboard. First impression is visual. | Dev |
| **Social preview image** | Create `docs/assets/social-preview.png` (1280x640). Show the dashboard with the sovereignty tagline. Set as GitHub repo social preview. | Design |
| **GitHub repo hygiene** | Topics: `ai-agent`, `self-hosted`, `enterprise`, `security`, `mcp`, `typescript`, `kubernetes`. Description: "Sovereign AI agent platform — self-hosted, governed, multi-model. ~16,100 tests." | Dev |
| **llms.txt** | Already exists at `site/llms.txt`. Verify it's current with v2026.3.5 features. | Dev |
| **Comparison pages** | Write 3 markdown files: `docs/vs-openclaw.md`, `docs/vs-openai-frontier.md`, `docs/vs-manus.md`. These become SEO landing pages. Structure: problem → comparison table → "try it" CTA. | Dev |
| **Demo video** | Record a 5-minute video: `curl install` → `secureyeoman init` → dashboard tour → create a workflow → run a swarm. No narration needed if captions are clear. Host on YouTube. | Dev |
| **"Good first issues"** | Tag 10-15 issues with `good first issue` + `help wanted`. These are contributor bait for the post-launch wave. | Dev |

### Week 3: Show HN Launch

**This is the single highest-ROI event.** Prepare meticulously.

**Timing:** Tuesday or Wednesday, 8–9 AM ET (HN peak traffic).

**Post format:** (see [Copy Templates](#show-hn-post) below)

**Launch day checklist:**
- [ ] Post goes live at 8:30 AM ET
- [ ] Founder/maintainer monitors HN comments for 6 hours straight — respond to every question within 15 minutes
- [ ] Cross-post announcement to Reddit (r/selfhosted, r/homelab) — stagger by 2 hours
- [ ] Tweet thread goes live simultaneously
- [ ] LinkedIn post targets CISO/CTO audience — different angle (governance, compliance)

**What makes HN posts succeed:**
- Lead with what's different, not what it does (sovereignty, not features)
- Show the engineering rigor: "~16,100 tests, 19 ADRs, 87% coverage"
- Be honest about trade-offs: "30s startup vs PicoClaw's <1s — we chose enterprise features over embedded performance"
- Respond to criticism gracefully and technically — HN respects humility and depth

### Week 4+: Sustained Cadence

| Frequency | Activity |
|-----------|----------|
| Weekly | One technical blog post or comparison page (rotate through Content Pillars) |
| Per-incident | Rapid response post whenever an AI agent security incident makes news |
| Bi-weekly | Reddit engagement (r/selfhosted, r/LocalLLaMA) — answer questions, don't just promote |
| Monthly | Demo video or architecture deep-dive on YouTube |
| Quarterly | Conference CFP submission cycle |

---

## 4. Content Pillars

Six recurring themes. Every piece of content maps to one.

### Pillar 1: Security Incident Response (Newsjacking)

**Trigger:** Any OpenClaw CVE, breach report, or AI agent security incident.
**Format:** Blog post or X/Twitter thread within 24 hours.
**Structure:**
1. What happened (cite sources — Gartner, Palo Alto, Censys, CVE database)
2. Why it happened (architectural root cause)
3. How SecureYeoman's architecture prevents it (specific technical mechanism)
4. Link to relevant ADR or code

**Example topics:**
- "CVE-2026-25253 Explained: Why Query-String Trust in AI Agents Is an RCE"
- "1,184 Malicious Skills: What ClawHavoc Teaches Us About AI Supply Chains"
- "135,000 Exposed Instances: Self-Hosted Doesn't Mean Secure"

### Pillar 2: Technical Deep-Dives

**Trigger:** Scheduled cadence (weekly).
**Format:** Long-form blog post (1500-3000 words) with code snippets and architecture diagrams.
**Structure:** Problem → Design decision → Implementation → ADR reference → Benchmarks

**Example topics:**
- "How We Built a Cryptographic Audit Chain for AI Agent Actions"
- "OPA + CEL: Governing AI Agents Without Slowing Them Down"
- "Multi-Agent Orchestration: DAG Workflows, Swarms, and Teams"
- "Sandboxing AI: From Landlock to WASM in a TypeScript Codebase"
- "200+ MCP Tools: Building a Governed Tool Ecosystem"
- "13,097 Tests: Our Testing Strategy for a 430K-Line AI Platform"

### Pillar 3: Comparison Pages (SEO Bait)

**Format:** Structured comparison page — problem, feature table, architecture diagram, "try it" CTA.

**Priority pages (write first):**
1. "SecureYeoman vs OpenClaw" — security angle
2. "SecureYeoman vs OpenAI Frontier" — sovereignty + lock-in angle
3. "SecureYeoman vs Manus AI" — post-acquisition sovereignty angle
4. "Self-Hosted AI Agent Comparison (2026)" — umbrella page targeting generic searches
5. "SecureYeoman vs Devin" — scope angle (platform vs coding agent)

### Pillar 4: Live Demos & Walkthroughs

**Format:** 5-10 minute YouTube video with captions.

**Priority videos:**
1. "Install to Dashboard in 3 Minutes" (curl install → init → dashboard tour)
2. "Build Your First AI Workflow" (DAG builder demo)
3. "Multi-Agent Swarm: Parallel Security Audit" (swarm template demo)
4. "Connect SecureYeoman to Everything" (MCP tools, integrations walkthrough)
5. "Air-Gapped AI: Running SecureYeoman with Ollama" (local-only demo)

### Pillar 5: Industry Analysis

**Format:** Opinion piece or data-driven analysis.
**Audience:** CTOs, CISOs, security researchers.

**Example topics:**
- "The State of AI Agent Security in 2026"
- "Why AGPL-3.0 Is the Right License for AI Infrastructure"
- "The Manus Acquisition and What It Means for AI Sovereignty"
- "Enterprise AI Agents: Cloud vs Self-Hosted Trade-offs"

### Pillar 6: Community Showcases

**Format:** Short post highlighting a community contribution, deployment story, or integration.
**Purpose:** Social proof + contributor recognition.

---

## 5. Channel Strategy

### Hacker News

**Role:** Primary launch platform. Ongoing technical credibility.

**Rules:**
- No marketing speak. Ever. HN will bury you.
- Lead with engineering substance: test counts, ADR count, architectural decisions
- Be genuinely helpful in comments — answer tangential questions about sandboxing, OPA, MCP
- Submit technical blog posts (not product announcements) for ongoing visibility
- Max 1 submission per week to avoid flagging

### Reddit

**Subreddits (in priority order):**

| Subreddit | Audience | Angle |
|-----------|----------|-------|
| r/selfhosted | Self-hosters, homelabbers | "New self-hosted AI agent platform — single binary, 13 AI providers, air-gap capable" |
| r/homelab | Home server enthusiasts | "Run your own AI agent on your homelab — Docker Compose, works with Ollama" |
| r/cybersecurity | Security professionals | Security incident response content; comparison with OpenClaw's CVE history |
| r/LocalLLaMA | Local AI enthusiasts | "Self-hosted AI agent platform with Ollama integration, training pipeline, and LoRA fine-tuning" |
| r/devops | DevOps engineers | Kubernetes deployment, Helm chart, Prometheus/Grafana, CI/CD integration |
| r/netsec | Security researchers | Technical deep-dives on sandboxing, OPA governance, audit chain |
| r/kubernetes | K8s operators | Helm chart, HPA, PDB, NetworkPolicies, ExternalSecret CRD |

**Rules:**
- Engage authentically — answer questions in threads where SecureYeoman is relevant, don't just post links
- Each subreddit gets a tailored angle (see table above)
- Follow each sub's self-promotion rules (most allow 1:10 ratio — 1 self-promo per 10 genuine contributions)
- r/selfhosted is the single most valuable subreddit for this project. Invest heavily.

### X/Twitter

**Role:** Real-time commentary, demo clips, thread launches.

**Content types:**
- Security incident commentary (within hours of news breaking)
- 30-second demo clips (GIF or video)
- Thread launches for blog posts
- Feature announcements with screenshots
- Engagement with security researchers who post about AI agent risks

**Cadence:** 3-5 posts per week. Don't spam.

**Key accounts to engage with (not spam — genuinely reply with substance):**
- Security researchers posting about AI agent vulnerabilities
- Self-hosting advocates
- CISOs and CTOs discussing AI governance
- MCP ecosystem developers

### LinkedIn

**Role:** Enterprise decision-maker pipeline. CISO/CTO audience.

**Content types:**
- Industry analysis posts (Manus acquisition, OpenClaw security, AI governance)
- "How we built X" engineering leadership content
- Compliance-focused messaging (GDPR, HIPAA, SOC 2, EU AI Act)
- Customer/deployment stories (once available)

**Cadence:** 2-3 posts per week. LinkedIn rewards consistency.

**Format:** Native text posts (not link shares — LinkedIn deprioritizes external links). Put the blog link in the first comment.

### GitHub

**Role:** The product IS the GitHub repo. Optimize it as a storefront.

**Actions:**
- Social preview image (1280x640) — dashboard screenshot with tagline
- Detailed README (already strong — add visual above the fold)
- GitHub Topics: `ai-agent`, `self-hosted`, `enterprise`, `security`, `mcp`, `typescript`, `kubernetes`, `llm`, `autonomous-agent`, `workflow-automation`
- GitHub Discussions enabled — use as community hub
- "Good first issues" tagged (10-15 minimum for launch)
- Release notes for every version — detailed, with screenshots
- Submit to Awesome lists: `awesome-selfhosted`, `awesome-mcp-servers`, `awesome-ai-agents`, `awesome-security`

**GitHub Trending:**
- Stars velocity matters more than absolute count
- Coordinate the Show HN launch with a "star if you find this useful" soft-CTA in the README
- Trending = compound visibility (HN front page → stars → Trending → more stars)

### YouTube

**Role:** Evergreen demo content. Search-discoverable.

**Invest in:**
- Clear thumbnails with the SecureYeoman logo
- Captions on every video (accessibility + international reach)
- Consistent series naming: "SecureYeoman in 5 Minutes: [Topic]"
- Pin a comment with install instructions and relevant doc links

### Conference CFPs (Free)

**Submit to (all have free submission tracks):**

| Conference | Angle | Season |
|------------|-------|--------|
| BSides (local) | "Governing Autonomous AI Agents: From OPA to Audit Chains" | Rolling (monthly somewhere) |
| DEF CON | "135,000 Exposed AI Agents: Attack Surface of the New Stack" | May CFP deadline |
| KubeCon | "Deploying Governed AI Agents on Kubernetes" | Spring/Fall |
| Local meetups | Any talk — get reps, test messaging | Ongoing |
| OWASP events | "AI Agent OWASP Top 10: Lessons from OpenClaw" | Rolling |
| DevSecOps Days | "Securing the AI Agent Pipeline" | Rolling |
| All Things Open | "AGPL-3.0 and the Business of AI Infrastructure" | Summer CFP |

**Talk strategy:** Submit the same core talk to 5-10 CFPs. Adapt the title for each audience. The content is the same: sovereignty, governance, security architecture.

### Security Researcher Outreach

**Why:** Security researchers amplify for free when the narrative is genuine. They're the most credible third-party voices in this space.

**How:**
- When a researcher publishes an OpenClaw vulnerability analysis, reply with a technical explanation of how SecureYeoman handles the same vector
- Offer the codebase for security review — the ~16,100 tests and 87% coverage make this a credible invitation
- Submit SecureYeoman to bug bounty platforms (HackerOne free tier or GitHub Security Advisories)
- Engage with AI security research communities (OWASP AI, MITRE ATLAS)

---

## 6. SEO & Discovery

### Target Keywords

| Priority | Keyword | Intent | Content |
|----------|---------|--------|---------|
| 1 | `self-hosted AI agent` | Informational/commercial | Comparison page + README |
| 2 | `openclaw alternative` | Commercial | vs-openclaw.md comparison page |
| 3 | `enterprise AI agent platform` | Commercial | White paper + LinkedIn content |
| 4 | `sovereign AI platform` | Informational | Blog posts + white paper |
| 5 | `AI agent security` | Informational | Incident response content |
| 6 | `self-hosted AI assistant` | Informational/commercial | Getting started guide |
| 7 | `mcp server tools` | Technical | MCP documentation + blog post |
| 8 | `openai frontier alternative` | Commercial | vs-openai-frontier.md |
| 9 | `air-gapped AI agent` | Commercial | Deployment guide + blog post |
| 10 | `manus ai alternative` | Commercial | vs-manus.md |

### AI Discoverability

- **llms.txt** already exists at `site/llms.txt` — keep updated with every major release
- Structured data in README (version badges, feature tables) helps LLM-powered search engines index capabilities
- The white paper (`docs/white-paper.md`) is LLM-friendly long-form content

### Technical SEO

- If/when a marketing site exists: one landing page per comparison keyword
- Blog posts should be at least 1500 words (Google rewards depth for technical content)
- Internal linking between comparison pages, guides, and the white paper
- Schema markup for software application (SoftwareApplication JSON-LD) on the marketing site

---

## 7. Community & Flywheel

### Community Hub: GitHub Discussions

**Why Discussions over Discord for primary:** Indexed by Google, threaded, integrated with the repo, doesn't require yet-another-account. Discord for real-time; Discussions for durable knowledge.

**Category structure:**
- Announcements (releases, milestones)
- Q&A (support)
- Show & Tell (deployments, integrations)
- Ideas (feature requests)
- General (off-topic, introductions)

### Discord Server

**Role:** Real-time engagement, community building, quick support.

**Channels:**
- `#general` — introductions, off-topic
- `#support` — installation, configuration help
- `#showcase` — deployment screenshots, integration demos
- `#development` — contributor discussion, PR reviews
- `#security` — vulnerability discussion, security research
- `#marketplace` — skill sharing, workflow templates

### Contributor Funnel

```
See project on HN/Reddit/GitHub Trending
        ↓
Star the repo → read README → try the install
        ↓
Hit an issue → open a Discussion → get help
        ↓
See "good first issues" → submit a PR → get merged
        ↓
Become a regular contributor → advocate in their network
```

**Actions to grease this funnel:**
1. `CONTRIBUTING.md` already exists — ensure it covers: dev setup, test running, PR process, skill contribution
2. Tag 10-15 issues `good first issue` before launch
3. Merge contributor PRs fast (< 48 hours for clean PRs)
4. Thank every contributor publicly (GitHub, Discord, X)
5. Contributor spotlight in release notes

### The Marketplace Flywheel

```
More users → more skills/workflows shared → richer marketplace
        ↓
Richer marketplace → more value for new users → more users
```

**Accelerate with:**
- Seed the marketplace with 20+ high-quality builtin skills (already at 18)
- Workflow template gallery in the dashboard
- Community skill submission process (already via community repo sync)
- Feature community skills in blog posts / showcases

---

## 8. AGPL-3.0 as Marketing Weapon

The dual license (AGPL-3.0 + Commercial) is not just a business model — it's a marketing strategy.

### How AGPL Drives Growth

```
Developer finds SecureYeoman → downloads → deploys internally
        ↓
        ├── Individual / small team → uses under AGPL → contributes back → community grows
        ↓
        └── Enterprise evaluates for production
                ↓
                ├── Can accept AGPL → deploys, must share modifications → community grows
                ↓
                └── Cannot accept AGPL (most enterprises) → buys commercial license → revenue
```

**Every enterprise evaluation drives either community growth or revenue. There is no third outcome.**

### AGPL Messaging

- **For developers:** "Fully open source under AGPL-3.0. Use it, modify it, deploy it. The only requirement: if you offer it as a service to others, share your modifications."
- **For enterprises:** "AGPL-3.0 for internal use is fully permissive. If you need to keep modifications private or offer SecureYeoman as a hosted service, we offer commercial licenses."
- **For competitors who fork:** AGPL requires any SaaS offering built on SecureYeoman to publish source. This prevents cloud providers from strip-mining the project (the MongoDB/Elastic/Redis playbook).

### The GitLab Parallel

GitLab proved this model works for developer infrastructure:
- Open core under a permissive-ish license → community growth
- Enterprise features behind a commercial license → revenue
- IPO'd at $15B

SecureYeoman follows the same structure with a stronger copyleft (AGPL > MIT for cloud-era protection).

---

## 9. Metrics & Milestones

### Week 1–4 (Launch Period)

| Metric | Target | How |
|--------|--------|-----|
| GitHub stars | 500+ | Show HN + Reddit + X launch |
| HN front page | Top 30 | Sovereignty angle + engineering credibility |
| r/selfhosted upvotes | 100+ | Tailored self-hosting angle |
| YouTube demo views | 1,000+ | Embedded in HN post + README |
| Discord members | 50+ | CTA in README + HN comments |
| First external contributor PR | 1+ | Good first issues + responsive merging |

### Month 2–3 (Sustained Growth)

| Metric | Target | How |
|--------|--------|-----|
| GitHub stars | 2,000+ | Weekly content + Reddit engagement + Awesome lists |
| Monthly unique visitors (site) | 5,000+ | SEO comparison pages + blog posts |
| Discord members | 200+ | Community engagement + support quality |
| External contributor PRs | 10+ | Good first issues + contributor recognition |
| Conference CFP acceptances | 1-2 | BSides / local meetups (fastest turnaround) |
| Blog posts published | 8+ | Weekly cadence |
| Commercial license inquiries | 5+ | Enterprise content on LinkedIn + comparison pages |

### Month 4–6 (Compounding)

| Metric | Target | How |
|--------|--------|-----|
| GitHub stars | 5,000+ | Compound visibility + GitHub Trending hits |
| Monthly unique visitors | 15,000+ | SEO maturation + conference talks |
| Discord members | 500+ | Community momentum |
| Commercial license deals | 2+ | Enterprise pilot conversions |
| Conference talks delivered | 2+ | BSides / meetups / DevSecOps Days |
| Community skills contributed | 10+ | Marketplace flywheel |

### Leading Indicators to Track

| Indicator | What It Means | Tool |
|-----------|---------------|------|
| GitHub star velocity (stars/day) | Viral coefficient | GitHub API or star-history.com |
| README "install" section copy rate | Conversion from awareness to trial | Analytics on install script endpoint |
| HN upvote/comment ratio | Content quality resonance | Manual tracking |
| Reddit save rate | Content bookmark = future revisit | Reddit analytics |
| "openclaw alternative" search volume | Market demand signal | Google Trends / Ahrefs |
| Discord message/day | Community health | Discord analytics |
| Time-to-first-response (Discussions) | Support quality → retention | GitHub Discussions metrics |

---

## 10. Copy Templates

### Show HN Post

```
Title: Show HN: SecureYeoman – Sovereign AI agent platform (self-hosted, 13K tests, 274 MCP tools)

Text:
Hi HN, I built SecureYeoman — an enterprise-grade AI agent platform that runs
entirely on your infrastructure.

The problem: Most AI agent frameworks either run in someone else's cloud
(Frontier, Manus/Meta, Devin) or have serious security gaps when self-hosted
(135,000+ exposed OpenClaw instances, 1,184+ malicious skills in ClawHub,
CVSS 8.8 RCE via a single link click).

SecureYeoman is the governed alternative:

- Self-hosted (single binary, Docker, or Kubernetes Helm chart)
- 13 AI providers (Anthropic, OpenAI, Gemini, Ollama, local models, etc.)
- Enterprise security: RBAC, SSO/OIDC/SAML, AES-256-GCM encryption,
  HMAC-SHA256 audit chain, OPA/CEL governance, Landlock/seccomp/WASM sandboxing
- 274 MCP tools, 32 platform integrations, DAG workflow builder
- Multi-agent: swarms, teams, A2A protocol
- Full training pipeline: distillation, LoRA fine-tuning, LLM-as-Judge eval
- ~16,100 tests (87% coverage), 19 Architecture Decision Records
- AGPL-3.0 + commercial dual license

Quick start:
  curl -fsSL https://secureyeoman.ai/install | bash
  secureyeoman init

GitHub: https://github.com/MacCracken/secureyeoman
Docs: [link]
White paper: [link]
5-min demo: [YouTube link]

I'm here to answer questions about the architecture, security model,
or competitive landscape. We've done extensive competitive analysis against
11 platforms — happy to discuss trade-offs honestly.
```

### Reddit r/selfhosted Post

```
Title: Self-hosted AI agent platform with 13 AI providers, 274 MCP tools,
       and enterprise security — no cloud dependency

Body:
I've been building SecureYeoman — a self-hosted AI agent platform that runs
on your hardware with zero cloud dependency.

**Quick install:**
  curl -fsSL https://secureyeoman.ai/install | bash
  secureyeoman init

Or Docker Compose: git clone + docker compose up -d

**What it does:**
- Chat with AI using 12 providers (including Ollama for fully local)
- 274 MCP tools for automation (GitHub, Slack, email, CI/CD, network security, etc.)
- Build workflows with a visual DAG editor
- Run multi-agent swarms and teams
- Full dashboard (React + Tailwind, 18 themes)
- Enterprise features: RBAC, SSO, encryption, audit trails, multi-tenancy

**What makes it different from OpenClaw:**
- Actually secured (RBAC, HMAC audit chain, sandboxing, OPA governance)
- Not 135,000+ exposed instances on the internet
- No malicious skill supply chain problems (skill trust tiers)
- Enterprise auth (SSO/OIDC/SAML)
- ~1 GB RAM baseline (vs 2-8 GB for OpenClaw)

**Resources:**
- Single binary: ~123 MB (Linux x64/arm64, macOS arm64, Windows x64)
- RAM: ~1 GB baseline
- Works great with Ollama for fully air-gapped deployments

Docker, Kubernetes Helm chart, or bare metal — your choice.

AGPL-3.0 licensed. Happy to answer questions.

GitHub: [link]
```

### X/Twitter Thread (Launch)

```
Thread:

1/ Introducing SecureYeoman — a sovereign AI agent platform that runs entirely
on your infrastructure.

Your AI agent shouldn't report to someone else's cloud. 🧵

2/ The problem:
- OpenClaw: 135K+ exposed instances, 1,184+ malicious skills, CVSS 8.8 RCE
- Manus: acquired by Meta — your agent data is now Meta's data
- OpenAI Frontier: one provider, their cloud, their rules
- Devin: $20/mo race to commoditize cloud agents

3/ SecureYeoman:
- Self-hosted (one binary, Docker, or K8s)
- 13 AI providers (including fully local via Ollama)
- RBAC + SSO/SAML + HMAC-SHA256 audit chain
- 274 MCP tools
- Multi-agent swarms, teams, DAG workflows
- Full training pipeline

4/ The numbers:
- ~16,100 tests
- 87% code coverage
- 19 Architecture Decision Records
- 274 MCP tools
- 32 platform integrations
- ~123 MB single binary

curl -fsSL https://secureyeoman.ai/install | bash

5/ It's AGPL-3.0 — fully open source.

Enterprise features (SSO/SAML, adaptive learning, multi-tenancy, CI/CD,
advanced observability) available under commercial license.

GitHub: [link]
Docs: [link]
White paper: [link]

[Screenshot of dashboard]
```

### LinkedIn Post (CISO/CTO Audience)

```
The AI agent security landscape in March 2026:

→ 135,000+ exposed OpenClaw instances detected in the wild
→ 1,184+ malicious skills in ClawHub (20% of ecosystem at time of audit)
→ Gartner: "unacceptable cybersecurity risk" — immediate enterprise ban recommended
→ Manus AI acquired by Meta — every connected credential now flows through Meta's infrastructure
→ OpenAI Frontier launched — enterprise agents locked to a single provider, a single cloud

Meanwhile, enterprises need AI agents. The question isn't whether to deploy them —
it's whether to deploy them on someone else's infrastructure or your own.

We built SecureYeoman to answer that question:

• RBAC with SSO/OIDC and SAML 2.0 (Okta, Azure AD, Auth0)
• HMAC-SHA256 cryptographic audit chain
• AES-256-GCM encryption at rest, mTLS in transit
• OPA/CEL governance with LLM-as-Judge review
• Landlock/seccomp/WASM/gVisor sandboxing
• Multi-tenancy with PostgreSQL RLS
• HashiCorp Vault / OpenBao secrets management
• 13,097 automated tests, 87% code coverage
• Fully air-gapped deployment on Kubernetes

AGPL-3.0 open source with commercial licensing for enterprises.

[link in first comment]
```

### Security Incident Response Template

Use this template when a new AI agent security incident makes news:

```
Title: [Incident Name] and What It Means for AI Agent Security

## What Happened
[2-3 sentences describing the incident. Cite primary sources.]

## Why It Happened
[Technical root cause analysis. Be specific — name the architectural flaw.]

## How SecureYeoman Handles This
[Specific technical mechanism that prevents this class of vulnerability.
Reference the relevant ADR number.]

## The Bigger Picture
[1-2 sentences connecting to the sovereignty narrative.]

## Try It
curl -fsSL https://secureyeoman.ai/install | bash

---
Sources: [link to CVE, research report, news article]
```

---

## Appendix: Competitive Quick Reference

Data sourced from [functional-audit.md](development/functional-audit.md). Use these numbers in content — they're all publicly verifiable.

| Competitor | Key Vulnerability | SecureYeoman Counter |
|------------|-------------------|----------------------|
| **OpenClaw** | 135K+ exposed instances, 1,184+ malicious skills, CVSS 8.8 RCE, Gartner "unacceptable risk" | Skill trust tiers, OPA governance, ResponseGuard, RBAC, sandboxing |
| **Manus AI** | Acquired by Meta; all data flows through Meta infrastructure | 100% self-hosted, zero cloud dependency |
| **OpenAI Frontier** | Single provider lock-in, cloud-only, premium pricing | 12 providers, self-hosted, AGPL-3.0 |
| **Devin 2.0** | Cloud-only, code-focused only, data on Cognition servers | Self-hosted, general-purpose platform, full security stack |
| **TrustClaw** | Still routes credentials through TrustClaw's cloud vault | SecretsManager with Vault/OpenBao — keys never leave your perimeter |
| **Ironclaw** | Cannot air-gap (requires NEAR AI Cloud for TEE) | Full air-gap capability, no cloud dependency |
| **Agent Zero** | No RBAC, SSO, encryption; experimental status | Full enterprise stack |
| **PicoClaw** | No security, RBAC, persistent memory; experimental | Full enterprise stack (different target: embedded vs enterprise) |

---

*This document should be reviewed and updated quarterly, or whenever a significant competitive event occurs (CVE, acquisition, major release). All competitive claims are sourced from the [functional audit](development/functional-audit.md) and publicly available data.*
