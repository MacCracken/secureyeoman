/**
 * Tool Manifest — static list of all MCP tools for auto-registration with core.
 *
 * All tools are always included in the manifest so they get persisted in core's DB.
 * Feature toggles (exposeGit, exposeFilesystem) control *visibility* at the API level,
 * not whether tools are registered.
 */

export interface ToolManifestEntry {
  name: string;
  description: string;
}

export function getToolManifest(): ToolManifestEntry[] {
  return [
    // Brain tools
    { name: 'knowledge_search', description: 'Search the SecureYeoman knowledge base' },
    { name: 'knowledge_get', description: 'Get a specific knowledge entry by ID' },
    { name: 'knowledge_store', description: 'Store a new knowledge entry' },
    { name: 'memory_recall', description: 'Recall memories matching a query' },

    // Task tools
    { name: 'task_create', description: 'Create a new agent task' },
    { name: 'task_list', description: 'List tasks with optional filters' },
    { name: 'task_get', description: 'Get a specific task by ID' },
    { name: 'task_cancel', description: 'Cancel a running task' },

    // System tools
    { name: 'system_health', description: 'Check system health status' },
    { name: 'system_metrics', description: 'Get system performance metrics' },
    { name: 'system_config', description: 'Get current system configuration (secrets redacted)' },

    // Integration tools
    { name: 'integration_list', description: 'List all configured integrations' },
    { name: 'integration_send', description: 'Send a message via an integration' },
    { name: 'integration_status', description: 'Get integration connection status' },

    // Soul tools
    { name: 'personality_get', description: 'Get the active personality profile' },
    { name: 'personality_switch', description: 'Switch to a different personality' },
    { name: 'skill_list', description: 'List available skills' },
    { name: 'skill_execute', description: 'Execute a skill by name' },

    // Audit tools
    { name: 'audit_query', description: 'Query the audit log with filters' },
    { name: 'audit_verify', description: 'Verify audit chain integrity' },
    { name: 'audit_stats', description: 'Get audit statistics' },

    // Git & GitHub tools
    { name: 'git_status', description: 'Show working tree status for a git repository' },
    { name: 'git_log', description: 'Show commit log for a git repository' },
    { name: 'git_diff', description: 'Show changes between commits, working tree, etc.' },
    { name: 'git_branch_list', description: 'List branches in a git repository' },
    { name: 'git_commit', description: 'Create a new commit with staged changes' },
    { name: 'git_checkout', description: 'Switch branches or restore working tree files' },
    { name: 'git_show', description: 'Show details of a specific commit' },
    { name: 'github_pr_list', description: 'List pull requests for a GitHub repository' },
    { name: 'github_pr_view', description: 'View details of a specific pull request' },
    { name: 'github_pr_create', description: 'Create a new pull request' },
    { name: 'github_pr_diff', description: 'View the diff of a pull request' },
    { name: 'github_issue_list', description: 'List issues for a GitHub repository' },
    { name: 'github_issue_view', description: 'View details of a specific issue' },
    { name: 'github_issue_create', description: 'Create a new issue' },
    { name: 'github_repo_view', description: 'View repository information' },

    // Filesystem tools
    { name: 'fs_read', description: 'Read a file (path-restricted, admin-only)' },
    { name: 'fs_write', description: 'Write a file (path-restricted, admin-only)' },
    { name: 'fs_list', description: 'List directory contents (path-restricted, admin-only)' },
    { name: 'fs_search', description: 'Search files by pattern (path-restricted, admin-only)' },

    // Web tools (scraping)
    {
      name: 'web_scrape_markdown',
      description: 'Scrape a webpage and convert to clean LLM-ready markdown',
    },
    {
      name: 'web_scrape_html',
      description: 'Scrape raw HTML from a webpage with optional CSS selector',
    },
    {
      name: 'web_scrape_batch',
      description: 'Scrape multiple URLs in parallel and return markdown (max 10)',
    },
    {
      name: 'web_extract_structured',
      description: 'Extract structured data from a webpage as JSON',
    },

    // Web tools (search)
    { name: 'web_search', description: 'Search the web using configurable search backend' },
    { name: 'web_search_batch', description: 'Run multiple search queries in parallel (max 5)' },

    // Browser automation tools (placeholder — requires Playwright/Puppeteer)
    { name: 'browser_navigate', description: 'Navigate to a URL and return page content' },
    { name: 'browser_screenshot', description: 'Take a screenshot of a webpage' },
    { name: 'browser_click', description: 'Click an element on a page' },
    { name: 'browser_fill', description: 'Fill in a form field on a page' },
    { name: 'browser_evaluate', description: 'Execute JavaScript in the browser context' },
    { name: 'browser_pdf', description: 'Generate a PDF from a webpage' },

    // Diagnostic tools — Channel B (sub-agent/external reporting)
    {
      name: 'diag_report_status',
      description: "Push this sub-agent's health status (uptime, task count, errors) to the orchestrator",
    },
    {
      name: 'diag_query_agent',
      description: "Retrieve the most recent health report from a spawned sub-agent by personality ID",
    },
    {
      name: 'diag_ping_integrations',
      description: 'Ping all MCP servers and integrations connected to the active personality',
    },

    // Desktop control tools (vision capability — screen observation)
    {
      name: 'desktop_screenshot',
      description: 'Capture a screenshot of the screen, window, or region — returns image + AI description',
    },
    {
      name: 'desktop_window_list',
      description: 'List all open windows with IDs, titles, and bounds',
    },
    {
      name: 'desktop_display_list',
      description: 'List all connected monitors/displays with IDs, names, and resolutions',
    },
    {
      name: 'desktop_camera_capture',
      description: 'Capture a single frame from the system camera (requires allowCamera)',
    },

    // Desktop control tools (limb_movement capability — input control)
    {
      name: 'desktop_window_focus',
      description: 'Focus (bring to foreground) a window by its ID',
    },
    {
      name: 'desktop_window_resize',
      description: 'Resize and/or reposition a window by ID',
    },
    {
      name: 'desktop_mouse_move',
      description: 'Move the mouse cursor to absolute screen coordinates',
    },
    {
      name: 'desktop_click',
      description: 'Click a mouse button at current or specified coordinates',
    },
    {
      name: 'desktop_scroll',
      description: 'Scroll the mouse wheel horizontally or vertically',
    },
    {
      name: 'desktop_type',
      description: 'Type text into the currently focused window',
    },
    {
      name: 'desktop_key',
      description: "Press or release a key combination (e.g., 'ctrl+c', 'enter')",
    },
    {
      name: 'desktop_clipboard_read',
      description: 'Read the current clipboard content',
    },
    {
      name: 'desktop_clipboard_write',
      description: 'Write text to the clipboard',
    },
    {
      name: 'desktop_input_sequence',
      description: 'Execute an ordered sequence of input actions atomically (max 50 steps)',
    },
  ];
}
