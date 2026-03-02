# ADR 175: Theme Rebalancing — 10/10/10 Distribution

**Status**: Accepted
**Date**: 2026-03-01

## Context

The dashboard theme system had an uneven distribution: 6 dark free, 6 light free, and 11 enterprise themes. Several popular themes (Dracula, Solarized Dark, Solarized Light, GitHub Light) were gated behind the enterprise license despite being widely expected as standard options. Meanwhile, the light theme selection was thin and lacked variety.

## Decision

Rebalance to a clean 10/10/10 split plus System:

- **10 Dark (free)**: Default Dark, Tokyo Night, Catppuccin Mocha, Gruvbox, Nord, One Dark, Dracula, Solarized Dark, Rosé Pine, Horizon
- **10 Light (free)**: Default Light, Catppuccin Latte, Rosé Pine Dawn, Everforest Light, One Light, Ayu Light, Solarized Light, GitHub Light, Quiet Light, Winter Light
- **10 Enterprise**: Monokai, GitHub Dark, Everforest Dark, Ayu Dark, Catppuccin Macchiato, Kanagawa, Matrix, Synthwave, Palenight, Night Owl
- **1 System**: Auto-detects OS preference

### Movements from enterprise to free
- Dracula → Dark (free)
- Solarized Dark → Dark (free)
- Solarized Light → Light (free)
- GitHub Light → Light (free)

### New themes added
- **Dark (free)**: Rosé Pine, Horizon
- **Light (free)**: Catppuccin Latte, Rosé Pine Dawn, Everforest Light, One Light, Ayu Light, Quiet Light, Winter Light (CSS added; IDs existed for some but lacked CSS blocks)
- **Enterprise**: Synthwave, Palenight, Night Owl

All enterprise themes are dark-only — light themes are never gated.

## Consequences

- Free users get a significantly richer theme selection (20 themes vs 12)
- Light mode users have 10 options instead of 6
- Enterprise themes remain differentiated with niche/specialty dark themes
- Total theme count: 31 (up from 24)
- 12 new CSS theme variable blocks added to `index.css`
