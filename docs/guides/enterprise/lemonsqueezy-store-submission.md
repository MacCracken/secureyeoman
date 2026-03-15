# LemonSqueezy Store Submission Materials

## Product Overview

**Product Name:** SecureYeoman

**Tagline:** Your AI. Your Rules. Your Infrastructure.

**Short Description (for store listing):**

SecureYeoman is a self-hosted AI agent platform that runs entirely on your infrastructure. Deploy sovereign AI assistants with enterprise-grade security, multi-model intelligence, and a complete ML training pipeline — no cloud dependency, no vendor lock-in.

**Full Description:**

SecureYeoman gives individuals and organizations full ownership of their AI stack. Instead of relying on cloud-hosted AI services where your data leaves your control, SecureYeoman runs on your own servers, laptops, or edge devices.

**Key Features:**

- **Multi-Model Intelligence** — Connect 13 AI providers (Claude, GPT, Gemini, Ollama, DeepSeek, Mistral, and more) with automatic failover routing. Use the best model for each task without vendor lock-in.

- **462 Built-In Tools** — Web scraping, code search, security auditing, device control, voice synthesis, QuickBooks accounting, and more — all accessible to your AI agents out of the box.

- **Enterprise Security** — Role-based access control (RBAC), SAML/OIDC single sign-on, AES-256-GCM encryption, sandboxed code execution, data loss prevention (DLP), and cryptographic audit trails.

- **Agent Swarms & Workflows** — Deploy multiple AI agents that collaborate on complex tasks. Build visual workflows with a drag-and-drop DAG editor. Trigger workflows on schedule, webhook, or event.

- **ML Training Pipeline** — Export conversations, distill knowledge from large models to small ones, fine-tune with LoRA, evaluate with LLM-as-Judge, and align with DPO — all from your own data, on your own hardware.

- **38 Integrations** — Slack, Discord, Telegram, GitHub, Jira, Linear, Notion, AWS, and more. Connect your AI to the tools you already use.

- **Single Binary Deployment** — One ~123 MB binary, no runtime dependencies. Also available as Docker images and Kubernetes Helm charts.

- **Privacy First** — Your data never leaves your infrastructure. No telemetry, no phone-home, no cloud dependency. Air-gap capable.

**Target Audience:**

- Developers and technical teams who want AI assistants without cloud dependency
- Security-conscious organizations that need on-premises AI with audit trails
- Solo operators and consultants who want enterprise-grade AI tooling
- Homelab enthusiasts and self-hosters

**Use Cases:**

- Automated code review and development assistance
- Internal knowledge base Q&A over private documents
- Security monitoring and incident response automation
- Workflow automation across business tools (Slack, Jira, GitHub, etc.)
- Custom AI agent deployment for domain-specific tasks
- ML model fine-tuning and evaluation pipelines

---

## Pricing Information

| Tier | Price | Billing | Target Audience | What's Included |
|------|-------|---------|-----------------|-----------------|
| **Community** | Free | — | Hobbyists, evaluators | Full platform, all core features, community support |
| **Pro** | $20/year | Annual | Developers, power users | Everything in Community + 6 pro-tier features (adaptive learning, advanced workflows, priority model routing, extended tool access, custom personalities, API gateway mode) |
| **Solopreneur** | $100/year | Annual | Solo operators, consultants | All enterprise features, single-seat license. Full security stack, training pipeline, and integrations for individual use. |
| **Enterprise** | $1,000/year | Annual | Organizations, regulated industries | Everything in Solopreneur + multi-tenant isolation, SAML SSO, SCIM provisioning, access review campaigns, priority support |

**Trial:** All new installations include a **30-day free trial** with all features unlocked. No credit card required. After the trial, unlicensed installations gracefully degrade to the Community tier.

**Licensing Model:** Honor-system licensing. No DRM, no machine fingerprinting, no phone-home. License keys are validated via the LemonSqueezy API with local caching and a 7-day offline grace period. The software is open-source (AGPL-3.0) — commercial licenses unlock additional features and support.

---

## Demo Video Script

**Target Length:** 3–5 minutes

### Scene 1 — Installation (0:00–0:30)

**Show:** Terminal

**Script:**
> "SecureYeoman installs in under a minute. One command pulls the Docker image and starts everything — the AI engine, dashboard, and database."

**Action:**
```bash
docker compose --env-file .env.dev up -d
```

Show containers starting, then open the dashboard in a browser.

---

### Scene 2 — Dashboard Tour (0:30–1:15)

**Show:** Browser — Dashboard

**Script:**
> "The dashboard is your mission control. You can see system health, active agents, recent activity, and service status at a glance."

**Action:**
- Show the Mission Control page (stat cards, services status)
- Click into Settings → show the theme picker (mention 45 themes)
- Show the personality editor briefly — "You can fully customize your agent's identity, skills, and behavior."

---

### Scene 3 — Chat & Multi-Model (1:15–2:15)

**Show:** Browser — Chat interface

**Script:**
> "Let's talk to our agent. SecureYeoman connects to 13 AI providers — I can switch between Claude, GPT, Gemini, or local models like Ollama without changing anything else."

**Action:**
- Send a message, show the three-phase rendering (Thinking → Tools → Response)
- Show the model selector — switch providers
- Ask the agent to do something that triggers a tool (e.g., "search GitHub for..." or "what's the weather")
- Show the tool execution in the chat

---

### Scene 4 — Workflows (2:15–3:00)

**Show:** Browser — Workflow Builder

**Script:**
> "For complex tasks, you can build visual workflows. Drag and drop steps — agent calls, conditions, transforms, approvals — and connect them into a pipeline."

**Action:**
- Open the workflow builder
- Show an existing workflow template (e.g., Research Pipeline)
- Briefly show the DAG layout, highlight a few step types
- Trigger a manual run, show the execution timeline

---

### Scene 5 — Security (3:00–3:45)

**Show:** Browser — Security Dashboard

**Script:**
> "Everything is auditable. Every agent action, tool call, and user login is recorded in a cryptographically signed audit trail. You get role-based access control, DLP scanning, and sandboxed code execution out of the box."

**Action:**
- Show the audit log with recent events
- Show RBAC roles briefly
- Show the DLP / content classification settings

---

### Scene 6 — Closing (3:45–4:00)

**Show:** Terminal or product landing page

**Script:**
> "SecureYeoman — your AI, your rules, your infrastructure. Try it free for 30 days at secureyeoman.ai."

---

### Recording Tips

- **Resolution:** 1920x1080 minimum, 4K preferred
- **Audio:** Clear voiceover, no background music needed (LemonSqueezy reviews care about clarity)
- **Pace:** Don't rush — let each screen breathe for 2-3 seconds before moving on
- **Browser:** Use a clean browser profile, no personal bookmarks or tabs visible
- **Terminal:** Use a large font size (16pt+) so text is readable
- **Dashboard theme:** Use a clean, professional theme (not OLED/dark themes that are hard to read in video)
