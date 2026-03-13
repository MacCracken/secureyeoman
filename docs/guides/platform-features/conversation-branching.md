# Conversation Branching Visualization

Explore and analyze conversation branch trees with the Branch Explorer.

## Overview

When you fork a conversation from any message, SecureYeoman creates a branch tree. The Branch Explorer provides four views to visualize, analyze, and compare these branches.

## Opening the Branch Explorer

1. Navigate to **Chat** and select a conversation
2. Click the **branch icon** in the conversation header
3. The Branch Explorer opens as a side panel with four tabs

## Views

### Tree View

The default view renders the branch hierarchy as a directed graph using ReactFlow. Each node shows:
- Conversation title
- Message count
- Quality score (when available) — computed from user feedback ratings and LLM-as-Judge evaluations on a 0–1 scale
- Branch label

Click any node to navigate to that conversation. The active conversation is highlighted with a primary-color ring.

### Timeline View

Shows all branches in depth-first order as a vertical timeline. Each entry displays:
- **Depth indicator** — Color-coded dot showing tree depth (blue=0, purple=1, cyan=2, etc.)
- **Title** — Conversation title
- **Quality score** — Color-coded (green > 0.8, blue > 0.6, yellow > 0.4, orange > 0.2, red < 0.2)
- **Model badge** — Which AI model was used
- **Branch label** — Optional label set during branching
- **Fork index** — Which message the branch was forked from

Click any timeline entry to navigate to that conversation.

### Stats View

Aggregate statistics across the entire branch tree:
- **Total Branches** — Number of conversations in the tree
- **Max Depth** — Deepest level of branching
- **Leaf Branches** — Branches with no children (endpoints)
- **Avg Quality** — Mean quality score across scored branches
- **Quality Histogram** — 5-bucket distribution from 0–1 with color-coded bars
- **Model Breakdown** — Count of branches per AI model, sorted by usage

### Compare View

Select any two branches for side-by-side comparison:
1. Choose a **source** branch from the first dropdown
2. Choose a **target** branch from the second dropdown
3. Click **Compare** to open the diff view

The dropdowns show all branches indented by depth with quality scores.

## Branching a Conversation

### From the UI
Right-click any message in a conversation and select **Branch from here**. Optionally provide a branch label.

### From the API
```bash
curl -X POST http://localhost:18789/api/v1/conversations/{id}/branch \
  -H 'Content-Type: application/json' \
  -d '{"messageIndex": 3, "branchLabel": "experiment-gpt4"}'
```

## Replay

Replay a conversation with a different model to compare outputs:

```bash
curl -X POST http://localhost:18789/api/v1/conversations/{id}/replay \
  -H 'Content-Type: application/json' \
  -d '{"replayModel": "claude-3-opus", "replayProvider": "anthropic"}'
```

Replays create new branches in the tree with pairwise quality comparison.

## Batch Replay

Compare multiple conversations at once:

```bash
curl -X POST http://localhost:18789/api/v1/conversations/replay-batch \
  -H 'Content-Type: application/json' \
  -d '{
    "sourceConversationIds": ["conv-1", "conv-2", "conv-3"],
    "replayModel": "gpt-4-turbo",
    "replayProvider": "openai"
  }'
```

View batch results with aggregate win/loss/tie statistics in the Replay Batch Panel.
