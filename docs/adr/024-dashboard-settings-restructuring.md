# ADR 024: Dashboard Navigation Restructuring

**Status**: Implemented
**Date**: 2026-02-13

## Context

The Settings section in the dashboard sidebar was cluttered with multiple unrelated features:
- Agent Identity (editing agent name/personality)
- API Keys management
- General settings
- Security configuration
- Log retention

This made navigation confusing and mixed different types of configuration.

Additionally, the Code Editor required manual "Send to Chat" workflow for running code, and the Personality Editor Body section didn't provide capability management for Vision and Auditory features.

## Decision

### 1. Sidebar Navigation Restructuring

The sidebar now uses expandable/collapsible sections with sub-items for logical grouping:

```
Overview                    → Dashboard overview
Chat                       → Chat interface
Code                       → Code editor

▼ Security                 → Security section (expandable)
    ├─ Overview            → Security events & config
    ├─ Tasks               → Task management
    └─ Reports             → Security reports

Personality                → Personality editor

▼ Skills                   → Skills section (expandable)
    ├─ Overview            → Skill management
    └─ Marketplace         → Skill marketplace

▼ Connections              → Connections section (expandable)
    ├─ Messaging           → Platform integrations
    └─ MCP Servers         → MCP server management

Experiments                → Feature experiments

▼ Settings                 → Settings section (expandable)
    ├─ General             → General preferences
    ├─ Security            → Security settings
    └─ API Keys            → API key management
```

### 2. General Settings

The main Settings page now contains only general configuration:
- Notification Preferences
- Log Retention (read-only display)
- Soul System configuration
- MCP Servers overview

### 3. Agent Identity Moved

Agent Identity editing has been removed from Settings. Agent name and personality configuration is now managed entirely through the Personality section of the dashboard.

### 4. API Keys as Separate Page

API Keys management has been extracted to its own dedicated page (`/api-keys`) with:
- List of active API keys
- Create new key form (name, role, expiration)
- Revoke key functionality with confirmation dialog
- Copy to clipboard for newly created keys

### 5. Security Settings Renamed

The "Security Config" sidebar item was renamed to simply "Security" for consistency with other top-level sections.

### 6. Security Events Link

A settings cog icon was added to the Security Events view that links directly to the Security settings page.

### 7. Code Editor Run Button

The Code Editor now includes a "Run" button that:
- Saves the current editor content to a temporary file in the working directory
- Automatically executes the file using the appropriate runtime (python3, node, npx ts-node, bash, ruby, go run)
- Displays the output in the integrated terminal
- Supports multiple languages via extension-based runner detection

```
Supported runtimes:
- python/py    → python3
- js           → node
- ts/tsx       → npx ts-node
- sh/bash      → bash
- rb           → ruby
- go           → go run
```

### 8. Personality Editor Body Capabilities

The Personality Editor Body section now displays all capabilities with their status:
- **Vision** (👁️): Screen capture and visual input - toggleable
- **Limb Movement** (⌨️): Keyboard/mouse control - available indicator
- **Auditory** (👂): Microphone input and audio output - toggleable
- **Haptic** (🖐️): Tactile feedback - available indicator

Toggleable capabilities (Vision, Auditory) can be enabled/disabled directly from the UI when the feature is available on the system.

### 9. Task History - New Task Creation

The Task History page now includes a "New Task" button that opens a dialog to create tasks:
- Task name (required)
- Task type (execute, query, file, network, system)
- Description (optional)
- Input as JSON (optional)

When submitted, the task is created via the API and immediately queued for execution.

### 10. Sidebar "New" Quick Create Button

A "New" button was added to the sidebar (between navigation and Live/Connected status) that opens a dialog with quick-create options. The button spans the full width of the sidebar container for consistent styling:

- **Personality**: Create new AI personality with name, description, and model
- **Task**: Schedule new task with name, type, description, and JSON input
- **Skill**: Create new skill with name, description, trigger, and action
- **Experiment**: Create new experiment with name, description, and feature flag

Each option presents a form in the same dialog, then navigates to the appropriate page with pre-filled parameters.

## Consequences

- **Positive**: Clearer navigation structure with logical grouping
- **Positive**: API Keys have their own dedicated page with proper CRUD functionality
- **Positive**: Agent identity now properly separated from system settings
- **Positive**: Settings page is less cluttered, focused on general preferences
- **Positive**: Code Editor can now run code directly without manual file creation
- **Positive**: Personality Editor provides direct capability management for Vision/Auditory
- **Positive**: Task History now includes "New Task" button to create tasks directly
- **Positive**: Quick-create "New" button in sidebar for fast access to create personalities, tasks, skills, or experiments
- **Neutral**: Requires users to learn new navigation pattern

---

**Previous**: [ADR 023: Scheduled Skill Execution](./023-scheduled-skill-execution.md)
