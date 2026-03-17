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
  category: string;
}

export function getToolManifest(): ToolManifestEntry[] {
  return [
    // Brain tools
    {
      name: 'knowledge_search',
      description:
        'Search the SecureYeoman knowledge base. Optional instanceId param searches a federated peer instance.',
      category: 'brain',
    },
    {
      name: 'knowledge_get',
      description:
        'Retrieve a specific knowledge entry by ID. Returns the full entry with content, metadata, confidence score, and source attribution.',
      category: 'brain',
    },
    {
      name: 'knowledge_store',
      description:
        'Store a new knowledge entry with content, optional source URL, and metadata tags. Auto-generates embeddings for semantic search.',
      category: 'brain',
    },
    {
      name: 'memory_recall',
      description:
        'Recall memories matching a natural language query. Supports filters by importance, date range, and personality. Returns ranked results with relevance scores.',
      category: 'brain',
    },
    // Cognitive Memory tools (Phase 124)
    {
      name: 'memory_activation_stats',
      description:
        'Get cognitive memory activation stats — top memories/documents, associations, access trend',
      category: 'brain',
    },
    {
      name: 'memory_associations',
      description:
        'Get Hebbian associative links for a memory or document with co-activation weights',
      category: 'brain',
    },

    // Task tools
    {
      name: 'task_create',
      description:
        'Create a new agent task with name, description, and optional schedule. Supports cron expressions for recurring tasks.',
      category: 'task',
    },
    {
      name: 'task_list',
      description:
        'List tasks with optional filters: status (pending/running/completed/failed), personality, date range. Paginated.',
      category: 'task',
    },
    {
      name: 'task_get',
      description:
        'Get a specific task by ID including status, output, logs, and execution history.',
      category: 'task',
    },
    {
      name: 'task_cancel',
      description:
        'Cancel a running or pending task by ID. Running tasks receive SIGTERM with graceful shutdown.',
      category: 'task',
    },

    // System tools
    {
      name: 'system_health',
      description:
        'Check system health: database connectivity, AI provider status, memory usage, disk space, queue depth.',
      category: 'system',
    },
    {
      name: 'system_metrics',
      description:
        'Get system performance metrics: CPU, memory, request latency (p50/p95/p99), active connections, cache hit rates.',
      category: 'system',
    },
    {
      name: 'system_config',
      description:
        'Get the current system configuration with secrets redacted. Includes AI, security, brain, and integration settings.',
      category: 'system',
    },

    // Integration tools
    {
      name: 'integration_list',
      description:
        'List all configured integrations (Slack, Discord, Teams, etc.) with connection status and capabilities.',
      category: 'integration',
    },
    {
      name: 'integration_send',
      description:
        'Send a message via an integration by name or ID. Supports text, markdown, and platform-specific formatting.',
      category: 'integration',
    },
    {
      name: 'integration_status',
      description:
        'Get detailed connection status for an integration: connected/disconnected, last message time, error details.',
      category: 'integration',
    },

    // Soul tools
    {
      name: 'personality_get',
      description:
        'Get the active personality profile including name, system prompt, model config, skills, and voice settings.',
      category: 'soul',
    },
    {
      name: 'personality_switch',
      description:
        'Switch to a different personality by name or ID. Loads the personality config and updates the active context.',
      category: 'soul',
    },
    {
      name: 'skill_list',
      description:
        'List available skills for the active personality with descriptions, categories, and enabled/disabled status.',
      category: 'soul',
    },
    {
      name: 'skill_execute',
      description:
        'Execute a skill by name with optional input parameters. Returns the skill output and any side effects.',
      category: 'soul',
    },

    // Audit tools
    {
      name: 'audit_query',
      description:
        'Query the audit log with filters: action type, actor, target, date range, severity. Supports pagination and sorting.',
      category: 'audit',
    },
    {
      name: 'audit_verify',
      description:
        'Verify audit chain integrity using SHA-256 hash chain. Returns valid/invalid status with first broken link details.',
      category: 'audit',
    },
    {
      name: 'audit_stats',
      description:
        'Get audit statistics: event counts by type, top actors, hourly distribution, chain health status.',
      category: 'audit',
    },

    // Git & GitHub tools
    {
      name: 'git_status',
      description:
        'Show working tree status: staged, unstaged, and untracked files. Params: cwd (required — repo path).',
      category: 'git',
    },
    {
      name: 'git_log',
      description:
        'Show commit log. Params: cwd, maxCount (default 20), oneline (default true). Returns hash, author, date, message.',
      category: 'git',
    },
    {
      name: 'git_diff',
      description:
        'Show diff between commits, branches, or working tree. Params: cwd, ref1, ref2, cached (staged only), path filter.',
      category: 'git',
    },
    {
      name: 'git_branch_list',
      description: 'List branches in a git repository',
      category: 'git',
    },
    {
      name: 'git_commit',
      description:
        'Create a new commit with staged changes. Params: cwd, message (required). Runs pre-commit hooks.',
      category: 'git',
    },
    {
      name: 'git_checkout',
      description:
        'Switch branches or restore files. Params: cwd, ref (branch/tag/commit), createBranch (boolean).',
      category: 'git',
    },
    {
      name: 'git_show',
      description: 'Show details of a specific commit',
      category: 'git',
    },
    {
      name: 'github_pr_list',
      description: 'List pull requests for a GitHub repository',
      category: 'git',
    },
    {
      name: 'github_pr_view',
      description: 'View details of a specific pull request',
      category: 'git',
    },
    {
      name: 'github_pr_create',
      description: 'Create a new pull request',
      category: 'git',
    },
    {
      name: 'github_pr_diff',
      description: 'View the diff of a pull request',
      category: 'git',
    },
    {
      name: 'github_issue_list',
      description: 'List issues for a GitHub repository',
      category: 'git',
    },
    {
      name: 'github_issue_view',
      description: 'View details of a specific issue',
      category: 'git',
    },
    {
      name: 'github_issue_create',
      description: 'Create a new issue',
      category: 'git',
    },
    {
      name: 'github_repo_view',
      description: 'View repository information',
      category: 'git',
    },

    // Filesystem tools
    {
      name: 'fs_read',
      description:
        'Read file contents. Params: path (required). Restricted to allowed directories. Returns text content with line numbers.',
      category: 'filesystem',
    },
    {
      name: 'fs_write',
      description:
        'Write file contents. Params: path, content (required). Creates parent directories. Restricted to allowed directories.',
      category: 'filesystem',
    },
    {
      name: 'fs_list',
      description:
        'List directory contents. Params: path (required), recursive (boolean). Returns filenames, sizes, and types.',
      category: 'filesystem',
    },
    {
      name: 'fs_search',
      description:
        'Search files by glob pattern. Params: pattern (required), path (search root). Returns matching file paths.',
      category: 'filesystem',
    },

    // Web tools (scraping)
    {
      name: 'web_scrape_markdown',
      description: 'Scrape a webpage and convert to clean LLM-ready markdown',
      category: 'web',
    },
    {
      name: 'web_scrape_html',
      description: 'Scrape raw HTML from a webpage with optional CSS selector',
      category: 'web',
    },
    {
      name: 'web_scrape_batch',
      description: 'Scrape multiple URLs in parallel and return markdown (max 10)',
      category: 'web',
    },
    {
      name: 'web_extract_structured',
      description: 'Extract structured data from a webpage as JSON',
      category: 'web',
    },

    // Web tools (search)
    {
      name: 'web_search',
      description: 'Search the web using configurable search backend',
      category: 'web',
    },
    {
      name: 'web_search_batch',
      description: 'Run multiple search queries in parallel (max 5)',
      category: 'web',
    },
    {
      name: 'web_search_multi',
      description:
        'Aggregated multi-engine search — fans out to all configured providers (DuckDuckGo, Brave, Bing, Exa, SerpAPI, Tavily, SearXNG) plus connected MCP search servers, deduplicates by URL, and ranks by cross-source agreement',
      category: 'web',
    },

    // Browser automation tools (placeholder — requires Playwright/Puppeteer)
    {
      name: 'browser_navigate',
      description: 'Navigate to a URL and return page content',
      category: 'browser',
    },
    {
      name: 'browser_screenshot',
      description: 'Take a screenshot of a webpage',
      category: 'browser',
    },
    {
      name: 'browser_click',
      description: 'Click an element on a page',
      category: 'browser',
    },
    {
      name: 'browser_fill',
      description: 'Fill in a form field on a page',
      category: 'browser',
    },
    {
      name: 'browser_evaluate',
      description: 'Execute JavaScript in the browser context',
      category: 'browser',
    },
    {
      name: 'browser_pdf',
      description: 'Generate a PDF from a webpage',
      category: 'browser',
    },

    // Diagnostic tools — Channel B (sub-agent/external reporting)
    {
      name: 'diag_report_status',
      description:
        "Push this sub-agent's health status (uptime, task count, errors) to the orchestrator",
      category: 'diagnostic',
    },
    {
      name: 'diag_query_agent',
      description:
        'Retrieve the most recent health report from a spawned sub-agent by personality ID',
      category: 'diagnostic',
    },
    {
      name: 'diag_ping_integrations',
      description: 'Ping all MCP servers and integrations connected to the active personality',
      category: 'diagnostic',
    },

    // Desktop control tools (vision capability — screen observation)
    {
      name: 'desktop_screenshot',
      description:
        'Capture a screenshot of the screen, window, or region — returns image + AI description',
      category: 'desktop',
    },
    {
      name: 'desktop_window_list',
      description: 'List all open windows with IDs, titles, and bounds',
      category: 'desktop',
    },
    {
      name: 'desktop_display_list',
      description: 'List all connected monitors/displays with IDs, names, and resolutions',
      category: 'desktop',
    },
    {
      name: 'desktop_camera_capture',
      description: 'Capture a single frame from the system camera (requires allowCamera)',
      category: 'desktop',
    },

    // Desktop control tools (limb_movement capability — input control)
    {
      name: 'desktop_window_focus',
      description: 'Focus (bring to foreground) a window by its ID',
      category: 'desktop',
    },
    {
      name: 'desktop_window_resize',
      description: 'Resize and/or reposition a window by ID',
      category: 'desktop',
    },
    {
      name: 'desktop_mouse_move',
      description: 'Move the mouse cursor to absolute screen coordinates',
      category: 'desktop',
    },
    {
      name: 'desktop_click',
      description: 'Click a mouse button at current or specified coordinates',
      category: 'desktop',
    },
    {
      name: 'desktop_scroll',
      description: 'Scroll the mouse wheel horizontally or vertically',
      category: 'desktop',
    },
    {
      name: 'desktop_type',
      description: 'Type text into the currently focused window',
      category: 'desktop',
    },
    {
      name: 'desktop_key',
      description: "Press or release a key combination (e.g., 'ctrl+c', 'enter')",
      category: 'desktop',
    },
    {
      name: 'desktop_clipboard_read',
      description: 'Read the current clipboard content',
      category: 'desktop',
    },
    {
      name: 'desktop_clipboard_write',
      description: 'Write text to the clipboard',
      category: 'desktop',
    },
    {
      name: 'desktop_input_sequence',
      description: 'Execute an ordered sequence of input actions atomically (max 50 steps)',
      category: 'desktop',
    },

    // Video streaming tools
    {
      name: 'video_stream_start',
      description:
        'Start a real-time video streaming session from AGNOS remote screen, local camera, or local screen. Returns session ID for WebSocket subscription.',
      category: 'video',
    },
    {
      name: 'video_stream_stop',
      description: 'Stop an active video streaming session by session ID.',
      category: 'video',
    },
    {
      name: 'video_stream_sessions',
      description: 'List all active video streaming sessions.',
      category: 'video',
    },
    {
      name: 'video_stream_sources',
      description:
        'List available video sources (AGNOS remote, local camera, local screen) and their availability status.',
      category: 'video',
    },
    {
      name: 'video_stream_snapshot',
      description:
        'Capture a single frame from an active video stream session. Returns base64 image with optional AI vision analysis.',
      category: 'video',
    },

    // Network tools — device automation (46.1)
    {
      name: 'network_device_connect',
      description:
        'Open SSH session to a network device; returns sessionId for subsequent commands',
      category: 'network',
    },
    {
      name: 'network_show_command',
      description: 'Execute IOS-XE/NX-OS/IOS-XR/EOS show commands on a connected device',
      category: 'network',
    },
    {
      name: 'network_config_push',
      description: 'Push configuration lines to a device via SSH config mode (dry-run supported)',
      category: 'network',
    },
    {
      name: 'network_health_check',
      description:
        'Fleet-wide health check: run show version + show interfaces across a list of targets',
      category: 'network',
    },
    {
      name: 'network_ping_test',
      description: 'Execute ping from a connected device to a target IP; returns loss % and RTT',
      category: 'network',
    },
    {
      name: 'network_traceroute',
      description: 'Execute traceroute from a connected device; returns hop list with latency',
      category: 'network',
    },

    // Network tools — discovery & topology (46.2)
    {
      name: 'network_discovery_cdp',
      description: 'Run show cdp neighbors detail; return structured neighbor list',
      category: 'network',
    },
    {
      name: 'network_discovery_lldp',
      description: 'Run show lldp neighbors detail; return structured neighbor list',
      category: 'network',
    },
    {
      name: 'network_topology_build',
      description:
        'Recursively discover network topology via CDP from seed devices; returns JSON graph and Mermaid diagram',
      category: 'network',
    },
    {
      name: 'network_arp_table',
      description: 'Return parsed ARP table (IP → MAC → interface) from a connected device',
      category: 'network',
    },
    {
      name: 'network_mac_table',
      description: 'Return parsed MAC address table (MAC → VLAN → interface) from a switch',
      category: 'network',
    },

    // Network tools — routing & switching (46.3)
    {
      name: 'network_routing_table',
      description:
        'Parse show ip route; return structured route entries with protocol, prefix, next-hop, AD/metric',
      category: 'network',
    },
    {
      name: 'network_ospf_neighbors',
      description:
        'Parse show ip ospf neighbor; return neighbor list with state, dead timer, interface',
      category: 'network',
    },
    {
      name: 'network_ospf_lsdb',
      description: 'Parse show ip ospf database; return LSA summary by type',
      category: 'network',
    },
    {
      name: 'network_bgp_peers',
      description: 'Parse show bgp summary; return peer list with ASN, state, prefix count',
      category: 'network',
    },
    {
      name: 'network_interface_status',
      description:
        'Parse show interfaces; return per-interface admin/oper state, speed, duplex, errors',
      category: 'network',
    },
    {
      name: 'network_vlan_list',
      description: 'Parse show vlan brief; return VLAN ID, name, active ports',
      category: 'network',
    },

    // Network tools — security auditing (46.4)
    {
      name: 'network_acl_audit',
      description:
        'Parse show ip access-lists; return ACL entries, match counts, implicit deny analysis',
      category: 'network',
    },
    {
      name: 'network_aaa_status',
      description: 'Return AAA server list and method config from a connected device',
      category: 'network',
    },
    {
      name: 'network_port_security',
      description:
        'Parse show port-security; return per-interface violations, max MAC, sticky config',
      category: 'network',
    },
    {
      name: 'network_stp_status',
      description:
        'Parse show spanning-tree; return root bridge, port roles/states, topology change count',
      category: 'network',
    },
    {
      name: 'network_software_version',
      description:
        'Parse show version; return OS family, version string, uptime, platform, serial number',
      category: 'network',
    },

    // Network tools — NetBox source of truth (46.5)
    {
      name: 'netbox_devices_list',
      description: 'Query NetBox devices with optional site/role/tag/status filters',
      category: 'network',
    },
    {
      name: 'netbox_interfaces_list',
      description: 'Query NetBox interfaces for a device with IP assignments',
      category: 'network',
    },
    {
      name: 'netbox_ipam_ips',
      description: 'Query NetBox IP addresses by prefix, VRF, or device',
      category: 'network',
    },
    {
      name: 'netbox_cables',
      description: 'Query NetBox cables with endpoint A/B device and interface',
      category: 'network',
    },
    {
      name: 'netbox_reconcile',
      description:
        'Compare live CDP topology against NetBox cables; return structured drift report',
      category: 'network',
    },

    // Network tools — NVD / CVE vulnerability assessment (46.6)
    {
      name: 'nvd_cve_search',
      description: 'Search NVD CVE database by keyword with optional CVSS severity filter',
      category: 'network',
    },
    {
      name: 'nvd_cve_by_software',
      description: 'Look up CVEs for a specific vendor/product/version using CPE match',
      category: 'network',
    },
    {
      name: 'nvd_cve_get',
      description: 'Fetch full CVE record by CVE ID including CVSS v3 vector, CWE, and references',
      category: 'network',
    },

    // Network tools — utilities (46.7)
    {
      name: 'subnet_calculator',
      description:
        'Calculate IPv4 subnet details: network, broadcast, first/last host, mask, wildcard mask, host count',
      category: 'network',
    },
    {
      name: 'subnet_vlsm',
      description:
        'VLSM planning — carve a parent prefix into subnets sized for given host requirements',
      category: 'network',
    },
    {
      name: 'wildcard_mask_calc',
      description: 'Convert a subnet mask or prefix length to an ACL wildcard mask',
      category: 'network',
    },

    // Network tools — PCAP analysis (46.8)
    {
      name: 'pcap_upload',
      description: 'Upload a pcap/pcapng file (base64-encoded) for analysis; returns pcapId',
      category: 'network',
    },
    {
      name: 'pcap_protocol_hierarchy',
      description: 'Run tshark protocol hierarchy statistics on an uploaded pcap',
      category: 'network',
    },
    {
      name: 'pcap_conversations',
      description:
        'List IP/TCP/UDP conversations in an uploaded pcap with bytes, packets, duration',
      category: 'network',
    },
    {
      name: 'pcap_dns_queries',
      description: 'Extract DNS query/response pairs from an uploaded pcap',
      category: 'network',
    },
    {
      name: 'pcap_http_requests',
      description: 'Extract HTTP request/response metadata from an uploaded pcap',
      category: 'network',
    },

    // Twingate tools (Phase 45)
    {
      name: 'twingate_resources_list',
      description:
        'List all Twingate Resources; returns id, name, address, group access, protocol rules',
      category: 'twingate',
    },
    {
      name: 'twingate_resource_get',
      description:
        'Fetch a single Twingate Resource by id with full protocol policy and group assignments',
      category: 'twingate',
    },
    {
      name: 'twingate_groups_list',
      description:
        'List Twingate access groups and which identities/service accounts can reach which resources',
      category: 'twingate',
    },
    {
      name: 'twingate_service_accounts_list',
      description:
        'List Twingate service accounts (non-human principals for agent-to-resource access)',
      category: 'twingate',
    },
    {
      name: 'twingate_service_account_create',
      description:
        'Create a Twingate service account scoped to specific resources; returns account id for key generation',
      category: 'twingate',
    },
    {
      name: 'twingate_service_key_create',
      description:
        'Generate a service key for a service account; stores it in SecretsManager — returned once',
      category: 'twingate',
    },
    {
      name: 'twingate_service_key_revoke',
      description: 'Revoke a Twingate service key by id; emits twingate_key_revoked audit event',
      category: 'twingate',
    },
    {
      name: 'twingate_connectors_list',
      description:
        'List Twingate Connectors with online/offline status, remote network, and last heartbeat',
      category: 'twingate',
    },
    {
      name: 'twingate_remote_networks_list',
      description: 'List Twingate Remote Networks (private network segments behind Connectors)',
      category: 'twingate',
    },
    {
      name: 'twingate_mcp_connect',
      description:
        'Open a proxy session to a private MCP server reachable via the Twingate Client tunnel; returns sessionId',
      category: 'twingate',
    },
    {
      name: 'twingate_mcp_list_tools',
      description: 'List tools exposed by a private MCP server connected via twingate_mcp_connect',
      category: 'twingate',
    },
    {
      name: 'twingate_mcp_call_tool',
      description:
        'Invoke a tool on a connected private MCP server; returns result; emits twingate_mcp_tool_call audit event',
      category: 'twingate',
    },
    {
      name: 'twingate_mcp_disconnect',
      description: 'Close a Twingate MCP proxy session',
      category: 'twingate',
    },

    // Organizational Intent tools (Phase 48)
    {
      name: 'intent_signal_read',
      description:
        'Read the current value of a named signal from the active organizational intent document',
      category: 'intent',
    },
    {
      name: 'intent_list',
      description: 'List all organizational intent documents (metadata only)',
      category: 'intent',
    },
    {
      name: 'intent_get',
      description:
        'Get a specific organizational intent document by ID with full body (goals, signals, boundaries, policies)',
      category: 'intent',
    },
    {
      name: 'intent_get_active',
      description: 'Get the currently active organizational intent document with full body',
      category: 'intent',
    },
    {
      name: 'intent_create',
      description:
        'Create a new organizational intent document with goals, signals, authorized actions, boundaries, and policies',
      category: 'intent',
    },
    {
      name: 'intent_update',
      description:
        'Update an existing organizational intent document (partial update — only included fields change)',
      category: 'intent',
    },
    {
      name: 'intent_activate',
      description: 'Set a specific intent document as the active one (deactivates all others)',
      category: 'intent',
    },
    {
      name: 'intent_delete',
      description: 'Delete an organizational intent document and deactivate it if active',
      category: 'intent',
    },
    {
      name: 'intent_enforcement_log',
      description:
        'Query the intent enforcement log (boundary_violated, action_blocked, goal_activated, policy_warn, etc.)',
      category: 'intent',
    },

    // Gmail tools (Phase 63)
    {
      name: 'gmail_profile',
      description: 'Get connected Gmail account email, mode, message and thread counts',
      category: 'gmail',
    },
    {
      name: 'gmail_list_messages',
      description: 'List Gmail messages with Gmail search syntax (is:unread, from:alice@...)',
      category: 'gmail',
    },
    {
      name: 'gmail_read_message',
      description: 'Read full Gmail message content by ID (headers + body + labels)',
      category: 'gmail',
    },
    {
      name: 'gmail_read_thread',
      description: 'Read all messages in a Gmail thread (full conversation chain)',
      category: 'gmail',
    },
    {
      name: 'gmail_list_labels',
      description: 'List all Gmail labels including system labels (INBOX, SENT, TRASH)',
      category: 'gmail',
    },
    {
      name: 'gmail_compose_draft',
      description: 'Create a Gmail draft (not sent — requires human review)',
      category: 'gmail',
    },
    {
      name: 'gmail_send_email',
      description: 'Send email immediately via Gmail (auto mode only)',
      category: 'gmail',
    },

    // Twitter / X tools (Phase 63)
    {
      name: 'twitter_profile',
      description: 'Get authenticated Twitter / X account profile',
      category: 'twitter',
    },
    {
      name: 'twitter_search',
      description: 'Search recent tweets (supports Twitter search operators)',
      category: 'twitter',
    },
    {
      name: 'twitter_get_tweet',
      description: 'Get a single tweet by ID',
      category: 'twitter',
    },
    {
      name: 'twitter_get_user',
      description: 'Look up a Twitter / X user by username',
      category: 'twitter',
    },
    {
      name: 'twitter_get_mentions',
      description: 'Get mentions of the authenticated Twitter / X account',
      category: 'twitter',
    },
    {
      name: 'twitter_get_timeline',
      description: 'Get the authenticated Twitter / X account home timeline',
      category: 'twitter',
    },
    {
      name: 'twitter_post_tweet',
      description: 'Post a tweet (or preview in draft mode without posting)',
      category: 'twitter',
    },
    {
      name: 'twitter_like_tweet',
      description: 'Like a tweet (auto mode only)',
      category: 'twitter',
    },
    {
      name: 'twitter_retweet',
      description: 'Retweet a tweet (auto mode only)',
      category: 'twitter',
    },
    {
      name: 'twitter_unretweet',
      description: 'Undo a retweet (auto mode only)',
      category: 'twitter',
    },
    {
      name: 'twitter_upload_media',
      description:
        'Upload an image or video to Twitter to attach to a tweet — requires OAuth 1.0a credentials and auto mode',
      category: 'twitter',
    },

    // GitHub API tools (Phase 70)
    {
      name: 'github_profile',
      description:
        'Get the connected GitHub account profile — login, name, email, public repos count, access mode, and two_factor_authentication status (boolean). Use to surface 2FA security recommendations.',
      category: 'github_api',
    },
    {
      name: 'github_list_repos',
      description: 'List repositories for the authenticated GitHub user',
      category: 'github_api',
    },
    {
      name: 'github_get_repo',
      description: 'Get details for a specific GitHub repository',
      category: 'github_api',
    },
    {
      name: 'github_list_prs',
      description: 'List pull requests for a GitHub repository',
      category: 'github_api',
    },
    {
      name: 'github_get_pr',
      description: 'Get details of a specific pull request',
      category: 'github_api',
    },
    {
      name: 'github_list_issues',
      description: 'List issues for a GitHub repository',
      category: 'github_api',
    },
    {
      name: 'github_get_issue',
      description: 'Get details of a specific issue',
      category: 'github_api',
    },
    {
      name: 'github_create_issue',
      description: 'Create a new GitHub issue',
      category: 'github_api',
    },
    {
      name: 'github_create_pr',
      description: 'Create a new pull request (draft mode returns preview)',
      category: 'github_api',
    },
    {
      name: 'github_comment',
      description: 'Add a comment to a GitHub issue or PR (auto mode only)',
      category: 'github_api',
    },
    {
      name: 'github_list_ssh_keys',
      description: 'List SSH public keys on the connected GitHub account (all modes)',
      category: 'github_api',
    },
    {
      name: 'github_add_ssh_key',
      description:
        'Add an SSH public key to the connected GitHub account (draft → preview, suggest → blocked)',
      category: 'github_api',
    },
    {
      name: 'github_delete_ssh_key',
      description:
        'Remove an SSH public key from the connected GitHub account by key_id (auto mode only)',
      category: 'github_api',
    },
    {
      name: 'github_setup_ssh',
      description:
        'Generate ed25519 SSH key pair in this container, register public key with GitHub, configure ~/.ssh/ for git push/pull via SSH',
      category: 'github_api',
    },
    {
      name: 'github_rotate_ssh_key',
      description:
        'Rotate the container SSH key: generate new key, register with GitHub, revoke old key, update ~/.ssh/',
      category: 'github_api',
    },
    {
      name: 'github_create_repo',
      description: 'Create a new GitHub repository (draft → preview, suggest → blocked)',
      category: 'github_api',
    },
    {
      name: 'github_fork_repo',
      description:
        'Fork a GitHub repository into the authenticated user or org (draft → preview, suggest → blocked)',
      category: 'github_api',
    },
    {
      name: 'github_sync_fork',
      description:
        'Sync a fork branch with its upstream repository via the GitHub Merges API (draft → preview, suggest → blocked, 204 = already up-to-date)',
      category: 'github_api',
    },

    // Ollama model lifecycle tools (Phase 64)
    {
      name: 'ollama_pull',
      description:
        'Pull (download) an Ollama model from the registry — only available when provider is ollama',
      category: 'ollama',
    },
    {
      name: 'ollama_rm',
      description:
        'Remove a locally downloaded Ollama model to free disk space — only available when provider is ollama',
      category: 'ollama',
    },

    // Docker management tools (Phase 74)
    {
      name: 'docker_ps',
      description: 'List Docker containers (running by default; use all=true to include stopped)',
      category: 'docker',
    },
    {
      name: 'docker_logs',
      description: 'Fetch recent logs from a Docker container with optional timestamps',
      category: 'docker',
    },
    {
      name: 'docker_inspect',
      description: 'Return detailed metadata for a container or image as JSON',
      category: 'docker',
    },
    {
      name: 'docker_stats',
      description: 'One-shot snapshot of CPU, memory, and network I/O for running containers',
      category: 'docker',
    },
    {
      name: 'docker_images',
      description: 'List locally available Docker images with optional filter',
      category: 'docker',
    },
    {
      name: 'docker_start',
      description:
        'Start one or more stopped containers. Params: containers (array of names or IDs).',
      category: 'docker',
    },
    {
      name: 'docker_stop',
      description:
        'Stop one or more running containers. Params: containers (array), timeout (seconds, default 10).',
      category: 'docker',
    },
    {
      name: 'docker_restart',
      description:
        'Restart containers. Params: containers (array), timeout (seconds before SIGKILL).',
      category: 'docker',
    },
    {
      name: 'docker_exec',
      description: 'Execute a command inside a running Docker container and return its output',
      category: 'docker',
    },
    {
      name: 'docker_pull',
      description:
        'Pull a Docker image from a registry. Params: image (e.g. "nginx:latest"). Returns pull progress.',
      category: 'docker',
    },
    {
      name: 'docker_compose_ps',
      description: 'List services in a Docker Compose project',
      category: 'docker',
    },
    {
      name: 'docker_compose_logs',
      description: 'Fetch logs from a Docker Compose project or specific service',
      category: 'docker',
    },
    {
      name: 'docker_compose_up',
      description: 'Start Docker Compose services in detached mode (with optional build)',
      category: 'docker',
    },
    {
      name: 'docker_compose_down',
      description: 'Stop and remove containers and networks for a Docker Compose project',
      category: 'docker',
    },

    // Terminal tools
    {
      name: 'terminal_execute',
      description:
        'Execute a shell command in a workspace directory. Commands are validated against a security allowlist and blocked-pattern filter. Returns stdout, stderr, exit code, and cwd.',
      category: 'terminal',
    },
    {
      name: 'terminal_tech_stack',
      description:
        'Detect the tech stack of a workspace directory. Returns detected stacks (node, python, rust, go, etc.) and the corresponding allowed commands.',
      category: 'terminal',
    },

    // Knowledge Base tools (Phase 82)
    {
      name: 'kb_search',
      description:
        'Semantic search across the knowledge base (documents + entries). Returns chunks ranked by relevance.',
      category: 'knowledge_base',
    },
    {
      name: 'kb_add_document',
      description:
        'Ingest a URL or raw text into the knowledge base. URL is fetched and indexed; raw text is stored directly.',
      category: 'knowledge_base',
    },
    {
      name: 'kb_list_documents',
      description:
        'List all documents ingested into the knowledge base with status and chunk counts.',
      category: 'knowledge_base',
    },
    {
      name: 'kb_delete_document',
      description: 'Delete a document from the knowledge base and remove all its indexed chunks.',
      category: 'knowledge_base',
    },

    // CI/CD — GitHub Actions (Phase 90)
    {
      name: 'gha_list_workflows',
      description: 'List all GitHub Actions workflows in a repository.',
      category: 'cicd',
    },
    {
      name: 'gha_dispatch_workflow',
      description:
        'Trigger a workflow_dispatch event for a GitHub Actions workflow on a specified ref with optional inputs.',
      category: 'cicd',
    },
    {
      name: 'gha_list_runs',
      description:
        'List workflow runs for a GitHub repository, optionally filtered by branch and status.',
      category: 'cicd',
    },
    {
      name: 'gha_get_run',
      description: 'Get details and current status of a specific GitHub Actions workflow run.',
      category: 'cicd',
    },
    {
      name: 'gha_cancel_run',
      description: 'Cancel a running or queued GitHub Actions workflow run.',
      category: 'cicd',
    },
    {
      name: 'gha_get_run_logs',
      description: 'Get the download URL for logs of a completed GitHub Actions workflow run.',
      category: 'cicd',
    },

    // CI/CD — Jenkins (Phase 90)
    {
      name: 'jenkins_list_jobs',
      description:
        'List all jobs on the Jenkins server with their name, URL, and build color/status.',
      category: 'cicd',
    },
    {
      name: 'jenkins_trigger_build',
      description: 'Trigger a Jenkins job build, optionally with parameters.',
      category: 'cicd',
    },
    {
      name: 'jenkins_get_build',
      description:
        'Get details of a specific Jenkins job build (status, result, duration, timestamp).',
      category: 'cicd',
    },
    {
      name: 'jenkins_get_build_log',
      description: 'Get the console text log for a specific Jenkins job build.',
      category: 'cicd',
    },
    {
      name: 'jenkins_queue_item',
      description:
        'Get the status of a Jenkins queue item to find the build number after triggering.',
      category: 'cicd',
    },

    // CI/CD — GitLab CI (Phase 90)
    {
      name: 'gitlab_list_pipelines',
      description:
        'List recent CI/CD pipelines for a GitLab project, optionally filtered by ref and status.',
      category: 'cicd',
    },
    {
      name: 'gitlab_trigger_pipeline',
      description:
        'Trigger a new GitLab CI/CD pipeline on a specified ref with optional variables.',
      category: 'cicd',
    },
    {
      name: 'gitlab_get_pipeline',
      description: 'Get details and status of a specific GitLab CI/CD pipeline.',
      category: 'cicd',
    },
    {
      name: 'gitlab_get_job_log',
      description: 'Get the log (trace) output for a specific GitLab CI job.',
      category: 'cicd',
    },
    {
      name: 'gitlab_cancel_pipeline',
      description: 'Cancel a running GitLab CI/CD pipeline.',
      category: 'cicd',
    },

    // CI/CD — Northflank (Phase 90)
    {
      name: 'northflank_list_services',
      description: 'List all services in a Northflank project.',
      category: 'cicd',
    },
    {
      name: 'northflank_trigger_build',
      description: 'Trigger a build for a Northflank combined/build service.',
      category: 'cicd',
    },
    {
      name: 'northflank_get_build',
      description: 'Get details and status of a specific Northflank build.',
      category: 'cicd',
    },
    {
      name: 'northflank_list_deployments',
      description: 'List all deployments in a Northflank project.',
      category: 'cicd',
    },
    {
      name: 'northflank_trigger_deployment',
      description: 'Trigger a redeployment for a Northflank deployment service.',
      category: 'cicd',
    },

    // SRA — Security Reference Architecture (Phase 123)
    {
      name: 'sra_list_blueprints',
      description:
        'List available Security Reference Architecture blueprints, filtered by provider, framework, or status.',
      category: 'sra',
    },
    {
      name: 'sra_get_blueprint',
      description:
        'Get a specific SRA blueprint by ID, including all controls with implementation guidance.',
      category: 'sra',
    },
    {
      name: 'sra_create_blueprint',
      description: 'Create a custom Security Reference Architecture blueprint with controls.',
      category: 'sra',
    },
    {
      name: 'sra_assess',
      description: 'Create a new SRA assessment against a blueprint for gap analysis.',
      category: 'sra',
    },
    {
      name: 'sra_get_assessment',
      description:
        'Get a specific SRA assessment by ID, including control results and compliance summary.',
      category: 'sra',
    },
    {
      name: 'sra_compliance_map',
      description:
        'List compliance framework mappings across security domains (NIST CSF, CIS v8, SOC 2, FedRAMP).',
      category: 'sra',
    },
    {
      name: 'sra_summary',
      description: 'Get an executive summary of the Security Reference Architecture posture.',
      category: 'sra',
    },

    // Constitutional AI tools
    {
      name: 'constitutional_principles',
      description:
        'List the active constitutional AI principles used for self-critique and response revision.',
      category: 'constitutional_ai',
    },
    {
      name: 'constitutional_critique',
      description:
        'Critique an AI response against the active constitutional principles. Returns per-principle violation findings.',
      category: 'constitutional_ai',
    },
    {
      name: 'constitutional_revise',
      description:
        'Full critique-and-revise loop: evaluate a response against the constitution, revise if violations found, record preference pairs for DPO training.',
      category: 'constitutional_ai',
    },

    // Excalidraw diagramming tools (Phase 117)
    {
      name: 'excalidraw_create',
      description: 'Generate an Excalidraw scene JSON from structured element specs',
      category: 'excalidraw',
    },
    {
      name: 'excalidraw_validate',
      description:
        'Validate an Excalidraw scene for layout issues, orphaned bindings, and accessibility',
      category: 'excalidraw',
    },
    {
      name: 'excalidraw_modify',
      description:
        'Patch an existing Excalidraw scene with add/update/delete/move/restyle operations',
      category: 'excalidraw',
    },
    {
      name: 'excalidraw_templates',
      description: 'List available Excalidraw element templates and color palettes',
      category: 'excalidraw',
    },
    {
      name: 'excalidraw_from_description',
      description:
        'Generate an Excalidraw scene from a natural language description and diagram type',
      category: 'excalidraw',
    },
    {
      name: 'excalidraw_render',
      description: 'Render an Excalidraw scene to SVG for preview or export',
      category: 'excalidraw',
    },

    // PDF Analysis tools (Phase 122-A)
    {
      name: 'pdf_extract_text',
      description: 'Extract text content from a PDF file (base64-encoded)',
      category: 'pdf',
    },
    {
      name: 'pdf_upload',
      description: 'Upload a PDF to the knowledge base for indexing and retrieval',
      category: 'pdf',
    },
    {
      name: 'pdf_analyze',
      description:
        'Analyze a PDF with AI — summary, key findings, entities, risks, or action items',
      category: 'pdf',
    },
    {
      name: 'pdf_search',
      description: 'Search within a PDF for text matches with page-level context',
      category: 'pdf',
    },
    {
      name: 'pdf_compare',
      description: 'Compare two PDFs and return a line-level diff with change summary',
      category: 'pdf',
    },
    {
      name: 'pdf_list',
      description: 'List PDF documents in the knowledge base',
      category: 'pdf',
    },

    // Advanced PDF Analysis tools (Phase 122-B)
    {
      name: 'pdf_extract_pages',
      description: 'Extract text from a PDF page by page with optional page range',
      category: 'pdf',
    },
    {
      name: 'pdf_extract_tables',
      description: 'Extract tables from a PDF with AI-ready prompts per page',
      category: 'pdf',
    },
    {
      name: 'pdf_visual_analyze',
      description: 'Analyze the structural layout of a PDF (headers, sections, tables, figures)',
      category: 'pdf',
    },
    {
      name: 'pdf_summarize',
      description: 'Generate a hierarchical summary of a PDF with page citations',
      category: 'pdf',
    },
    {
      name: 'pdf_form_fields',
      description: 'Read AcroForm fields from a PDF (text, checkbox, radio, dropdown, signature)',
      category: 'pdf',
    },

    // Trading tools — BullShift integration
    {
      name: 'bullshift_health',
      description: 'Check if the BullShift trading API server is running',
      category: 'trading',
    },
    {
      name: 'bullshift_get_account',
      description: 'Get trading account balance, buying power, and margin',
      category: 'trading',
    },
    {
      name: 'bullshift_get_positions',
      description: 'List all open positions with entry price, current price, and P&L',
      category: 'trading',
    },
    {
      name: 'bullshift_submit_order',
      description: 'Submit a market, limit, stop, or stop-limit trading order',
      category: 'trading',
    },
    {
      name: 'bullshift_cancel_order',
      description: 'Cancel a pending trading order by ID',
      category: 'trading',
    },

    // Trading tools — Market data (Phase 125)
    {
      name: 'market_quote',
      description: 'Get real-time price quote for a stock, ETF, forex pair, or crypto',
      category: 'trading',
    },
    {
      name: 'market_historical',
      description: 'Get historical daily OHLCV price data for a symbol (up to 100 days)',
      category: 'trading',
    },
    {
      name: 'market_search',
      description: 'Search for ticker symbols by company name or keyword',
      category: 'trading',
    },

    // Trading tools — Journal (Phase 125)
    {
      name: 'trading_journal_log',
      description: 'Log a completed trade to the trading journal with P&L calculation',
      category: 'trading',
    },

    // Trading tools — BullShift expansion (Phase 145)
    {
      name: 'bullshift_status',
      description: 'BullShift trading tools status (shows enabled/disabled)',
      category: 'trading',
    },
    {
      name: 'bullshift_algo_strategies',
      description: 'List algorithmic trading strategies with state and performance metrics',
      category: 'trading',
    },
    {
      name: 'bullshift_sentiment',
      description: 'Get aggregated sentiment signals with scores and source breakdown',
      category: 'trading',
    },
    {
      name: 'bullshift_list_alerts',
      description: 'List configured alert webhooks and delivery status',
      category: 'trading',
    },
    {
      name: 'bullshift_create_alert',
      description: 'Create a new alert webhook for order, position, or price events',
      category: 'trading',
    },
    {
      name: 'bullshift_market_quote',
      description:
        'Get real-time market quote from BullShift broker (price, bid/ask, volume, change)',
      category: 'trading',
    },
    {
      name: 'bullshift_create_strategy',
      description:
        'Create an algorithmic trading strategy (MA Crossover, Mean Reversion, Breakout, VWAP, etc.)',
      category: 'trading',
    },
    {
      name: 'bullshift_get_strategy',
      description: 'Get detailed info about a specific algo strategy including performance metrics',
      category: 'trading',
    },
    {
      name: 'bullshift_algo_signals',
      description: 'Get recent trading signals generated by active algo strategies',
      category: 'trading',
    },
    {
      name: 'bullshift_sentiment_signals',
      description: 'Get raw sentiment signals from all sources (RSS, Reddit, Twitter, webhooks)',
      category: 'trading',
    },
    {
      name: 'bullshift_alert_rules',
      description: 'List all metric-based alert rules (volume, price, drawdown thresholds)',
      category: 'trading',
    },
    {
      name: 'bullshift_create_alert_rule',
      description: 'Create a metric-based alert rule with condition, threshold, and severity',
      category: 'trading',
    },
    {
      name: 'bullshift_delete_alert_rule',
      description: 'Delete a metric-based alert rule by ID',
      category: 'trading',
    },
    {
      name: 'bullshift_ai_providers',
      description: 'List AI/LLM providers configured in BullShift for trading analysis',
      category: 'trading',
    },
    {
      name: 'bullshift_add_ai_provider',
      description: 'Add an AI/LLM provider (OpenAI, Anthropic, Ollama, etc.) to BullShift',
      category: 'trading',
    },
    {
      name: 'bullshift_configure_ai_provider',
      description: 'Store or update the API key for a BullShift AI provider',
      category: 'trading',
    },
    {
      name: 'bullshift_test_ai_provider',
      description: 'Test connectivity to a configured AI provider in BullShift',
      category: 'trading',
    },
    {
      name: 'bullshift_ai_chat',
      description: 'Send a prompt to a BullShift AI provider for trading analysis or research',
      category: 'trading',
    },

    // Photisnadi task/ritual tools (Phase 145)
    {
      name: 'photisnadi_status',
      description: 'Photisnadi tools status (shows enabled/disabled)',
      category: 'photisnadi',
    },
    {
      name: 'photisnadi_list_tasks',
      description: 'List tasks from Photisnadi with optional status/priority/project filters',
      category: 'photisnadi',
    },
    {
      name: 'photisnadi_create_task',
      description: 'Create a new task in Photisnadi with title, priority, status, and tags',
      category: 'photisnadi',
    },
    {
      name: 'photisnadi_update_task',
      description: 'Update an existing Photisnadi task (status, priority, title, etc.)',
      category: 'photisnadi',
    },
    {
      name: 'photisnadi_get_rituals',
      description: 'List rituals/habits with completion status and streak counts',
      category: 'photisnadi',
    },
    {
      name: 'photisnadi_analytics',
      description: 'Get task analytics: status distribution, overdue, blocked, completed this week',
      category: 'photisnadi',
    },
    {
      name: 'photisnadi_sync',
      description: 'Check Photisnadi connection status and task/ritual summary',
      category: 'photisnadi',
    },

    // Financial charting tools (Phase 125)
    {
      name: 'chart_candlestick',
      description:
        'Generate OHLCV candlestick chart SVG with optional volume bars and moving averages',
      category: 'charting',
    },
    {
      name: 'chart_line',
      description: 'Generate multi-series line chart SVG for price trends and time series',
      category: 'charting',
    },
    {
      name: 'chart_bar',
      description: 'Generate grouped or stacked bar chart SVG for comparisons and allocations',
      category: 'charting',
    },
    {
      name: 'chart_pie',
      description: 'Generate pie or donut chart SVG for portfolio allocation and distributions',
      category: 'charting',
    },
    {
      name: 'chart_scatter',
      description: 'Generate scatter plot SVG for risk vs return and correlation analysis',
      category: 'charting',
    },
    {
      name: 'chart_waterfall',
      description: 'Generate waterfall chart SVG for P&L breakdown and synergy bridges',
      category: 'charting',
    },
    {
      name: 'chart_heatmap',
      description: 'Generate correlation matrix heatmap SVG for asset correlations',
      category: 'charting',
    },
    {
      name: 'chart_sparkline',
      description: 'Generate compact inline sparkline SVG for quick trend indicators',
      category: 'charting',
    },

    // Security tools — Kali Linux toolkit (Phase 58)
    {
      name: 'sec_nmap',
      description: 'Run an nmap port/service scan against an authorized target',
      category: 'security',
    },
    {
      name: 'sec_gobuster',
      description: 'Run gobuster directory/DNS brute-force against an authorized target',
      category: 'security',
    },
    {
      name: 'sec_ffuf',
      description: 'Run ffuf web fuzzer against an authorized target',
      category: 'security',
    },
    {
      name: 'sec_sqlmap',
      description: 'Run sqlmap SQL injection scanner against an authorized target',
      category: 'security',
    },
    {
      name: 'sec_nikto',
      description: 'Run nikto web vulnerability scanner against an authorized target',
      category: 'security',
    },
    {
      name: 'sec_nuclei',
      description: 'Run nuclei template-based vulnerability scanner against an authorized target',
      category: 'security',
    },
    {
      name: 'sec_whatweb',
      description: 'Fingerprint web technologies on an authorized target',
      category: 'security',
    },
    {
      name: 'sec_wpscan',
      description: 'Run WPScan WordPress vulnerability scanner against an authorized target',
      category: 'security',
    },
    {
      name: 'sec_hashcat',
      description: 'Attempt offline hash cracking with hashcat (no live brute-force)',
      category: 'security',
    },
    {
      name: 'sec_john',
      description: 'Attempt offline hash cracking with John the Ripper (no live brute-force)',
      category: 'security',
    },
    {
      name: 'sec_theharvester',
      description: 'Gather OSINT (emails, subdomains, IPs) for a domain using theHarvester',
      category: 'security',
    },
    {
      name: 'sec_dig',
      description:
        'DNS lookup using dig. Params: domain (required), type (A/AAAA/MX/NS/TXT/CNAME, default A), server (optional DNS server).',
      category: 'security',
    },
    {
      name: 'sec_whois',
      description:
        'WHOIS lookup for a domain or IP. Returns registrar, dates, nameservers, and contact info.',
      category: 'security',
    },
    {
      name: 'sec_shodan',
      description: 'Look up a host on Shodan (requires SHODAN_API_KEY)',
      category: 'security',
    },
    {
      name: 'sec_hydra',
      description:
        'Run hydra brute-force attack against an authorized target (requires allowBruteForce)',
      category: 'security',
    },

    // Responsible AI tools (Phase 130)
    {
      name: 'rai_cohort_analysis',
      description:
        'Run cohort-based error analysis on an eval run — slice by model_name, topic_category, user_role, time_of_day, etc.',
      category: 'responsible_ai',
    },
    {
      name: 'rai_fairness_report',
      description:
        'Compute fairness metrics (demographic parity, equalized odds, disparate impact) for an eval run by protected attribute',
      category: 'responsible_ai',
    },
    {
      name: 'rai_shap_explain',
      description:
        'Compute SHAP-style token attributions for a prompt/response pair — shows which tokens most influenced the output',
      category: 'responsible_ai',
    },
    {
      name: 'rai_provenance_query',
      description:
        'Query data provenance records — check which conversations were included/excluded from training datasets',
      category: 'responsible_ai',
    },
    {
      name: 'rai_provenance_summary',
      description:
        'Get a summary of data provenance for a training dataset — included/filtered/synthetic/redacted counts',
      category: 'responsible_ai',
    },
    {
      name: 'rai_user_provenance',
      description:
        "Check if a specific user's data was used in any training dataset — important for GDPR compliance",
      category: 'responsible_ai',
    },
    {
      name: 'rai_model_card',
      description:
        'Generate or retrieve a model card for a personality — intended use, limitations, eval results, fairness, EU AI Act classification',
      category: 'responsible_ai',
    },
    {
      name: 'rai_model_card_markdown',
      description: 'Get a model card rendered as Markdown in Hugging Face Model Card format',
      category: 'responsible_ai',
    },

    // TEE / Confidential Computing tools (Phase 129-D)
    {
      name: 'tee_providers',
      description:
        'List TEE-capable providers, hardware detection status, and attestation cache stats',
      category: 'tee',
    },
    {
      name: 'tee_status',
      description: 'Get attestation status and history for a specific TEE provider',
      category: 'tee',
    },
    {
      name: 'tee_verify',
      description:
        'Force re-verify TEE attestation for a provider (clears cache and runs fresh check)',
      category: 'tee',
    },

    // Phase 131: Advanced Training tools
    {
      name: 'training_start_dpo',
      description:
        'Start a DPO (Direct Preference Optimization) training job using preference pairs',
      category: 'training',
    },
    {
      name: 'training_start_rlhf',
      description: 'Start an RLHF training job using PPO with a reward model',
      category: 'training',
    },
    {
      name: 'training_hyperparam_search',
      description:
        'Create and start a hyperparameter search (grid or random) across training configurations',
      category: 'training',
    },
    {
      name: 'training_list_checkpoints',
      description: 'List checkpoints for a fine-tuning job with step numbers and loss values',
      category: 'training',
    },
    {
      name: 'training_resume_from_checkpoint',
      description: 'Resume a training job from a specific checkpoint',
      category: 'training',
    },

    // Phase 132: Inference Optimization tools
    {
      name: 'ai_batch_inference',
      description: 'Submit a batch of prompts for parallel inference processing',
      category: 'inference',
    },
    {
      name: 'ai_batch_status',
      description: 'Get status and results of a batch inference job',
      category: 'inference',
    },
    {
      name: 'ai_cache_stats',
      description: 'Get LRU and semantic cache statistics including hit rates',
      category: 'inference',
    },
    {
      name: 'ai_warmup_model',
      description: 'Warm the KV cache for an Ollama model to reduce first-response latency',
      category: 'inference',
    },

    // Phase 133: Continual Learning tools
    {
      name: 'training_dataset_refresh',
      description:
        'Create or trigger a dataset refresh job that pulls new conversations into a training dataset',
      category: 'training',
    },
    {
      name: 'training_drift_check',
      description: 'Run an immediate drift check across all personality quality baselines',
      category: 'training',
    },
    {
      name: 'training_drift_baseline',
      description: 'Compute a quality score baseline for a personality for drift detection',
      category: 'training',
    },
    {
      name: 'training_online_update',
      description: 'Start an online LoRA adapter update from recent high-quality conversations',
      category: 'training',
    },

    // Phase 135: Agent Eval Harness tools
    {
      name: 'eval_list_scenarios',
      description: 'List eval scenarios with optional category filter',
      category: 'eval',
    },
    {
      name: 'eval_create_scenario',
      description:
        'Create an eval scenario — a test case for agent behavior with input, expected tool calls, and output assertions',
      category: 'eval',
    },
    {
      name: 'eval_run_scenario',
      description: 'Run a single eval scenario and get the result',
      category: 'eval',
    },
    {
      name: 'eval_list_suites',
      description: 'List eval suites',
      category: 'eval',
    },
    {
      name: 'eval_create_suite',
      description: 'Create an eval suite — a collection of scenarios to run together',
      category: 'eval',
    },
    {
      name: 'eval_run_suite',
      description:
        'Execute an eval suite — runs all scenarios and returns aggregate pass/fail results',
      category: 'eval',
    },
    {
      name: 'eval_list_runs',
      description: 'List historical eval suite runs with results',
      category: 'eval',
    },
    {
      name: 'eval_get_run',
      description:
        'Get detailed results of a specific eval suite run including per-scenario results',
      category: 'eval',
    },

    // DLP tools (Phase 136-F)
    {
      name: 'dlp_classify',
      description:
        'Classify text content for sensitivity level (public/internal/confidential/restricted) with PII and keyword detection',
      category: 'dlp',
    },
    {
      name: 'dlp_scan',
      description:
        'Scan outbound content against DLP policies. Returns allowed/blocked/warned status and findings.',
      category: 'dlp',
    },
    {
      name: 'dlp_policies',
      description: 'List DLP policies with optional active filter',
      category: 'dlp',
    },
    {
      name: 'dlp_egress_stats',
      description:
        'Get egress monitoring statistics aggregated by destination, action, and classification level',
      category: 'dlp',
    },
    {
      name: 'dlp_watermark_embed',
      description: 'Embed an invisible watermark into text for content provenance tracking',
      category: 'dlp',
    },
    {
      name: 'dlp_watermark_extract',
      description: 'Extract a watermark payload from watermarked text to identify provenance',
      category: 'dlp',
    },

    // Agnostic tools
    {
      name: 'agnostic_health',
      description: 'Check if the Agnostic platform is reachable and healthy',
      category: 'qa',
    },
    {
      name: 'agnostic_agents_status',
      description: 'List all Agnostic agents and their current status',
      category: 'qa',
    },
    {
      name: 'agnostic_agents_queues',
      description: 'Get current queue depths for each Agnostic agent',
      category: 'qa',
    },
    {
      name: 'agnostic_dashboard',
      description: 'Get the Agnostic platform dashboard overview',
      category: 'qa',
    },
    {
      name: 'agnostic_session_list',
      description: 'List recent QA sessions from the Agnostic platform',
      category: 'qa',
    },
    {
      name: 'agnostic_session_detail',
      description: 'Get full details and results for a specific QA session',
      category: 'qa',
    },
    {
      name: 'agnostic_generate_report',
      description: 'Generate a QA report for a completed session',
      category: 'qa',
    },
    {
      name: 'agnostic_submit_qa',
      description: 'Submit a QA task to the Agnostic 6-agent team',
      category: 'qa',
    },
    {
      name: 'agnostic_task_status',
      description: 'Poll the status of a submitted QA task',
      category: 'qa',
    },
    {
      name: 'agnostic_delegate_a2a',
      description: 'Delegate a QA task via the Agent-to-Agent protocol',
      category: 'qa',
    },
    {
      name: 'agnostic_session_diff',
      description: 'Compare two sessions to detect regressions, fixes, and new/removed tests',
      category: 'qa',
    },
    {
      name: 'agnostic_structured_results',
      description:
        'Get typed structured results (security, performance, test execution) for a session',
      category: 'qa',
    },
    {
      name: 'agnostic_quality_trends',
      description: 'Get quality trends over time — pass rates, coverage, flakiness',
      category: 'qa',
    },
    {
      name: 'agnostic_security_findings',
      description: 'Extract security findings with severity, CWE IDs, and CVSS scores',
      category: 'qa',
    },
    {
      name: 'agnostic_qa_orchestrate',
      description: 'Submit a QA task with fine-grained agent selection for targeted runs',
      category: 'qa',
    },
    {
      name: 'agnostic_quality_dashboard',
      description: 'Get unified quality dashboard: sessions, pass rates, agent queues, LLM usage',
      category: 'qa',
    },
    {
      name: 'agnostic_provision_credentials',
      description:
        'Provision API credentials for a service via A2A (CREDENTIAL_PROVISIONING_ENABLED)',
      category: 'qa',
    },
    {
      name: 'agnostic_revoke_credentials',
      description: 'Revoke previously provisioned API credentials for a service via A2A',
      category: 'qa',
    },

    // Agnostic REST API proxy tools (registerApiProxyTool)
    {
      name: 'agnostic_proxy_sessions',
      description: 'List recent QA sessions with pagination (proxy)',
      category: 'qa',
    },
    {
      name: 'agnostic_proxy_session_search',
      description: 'Search QA sessions by keyword (proxy)',
      category: 'qa',
    },
    {
      name: 'agnostic_proxy_task_list',
      description: 'List all QA tasks with status (proxy)',
      category: 'qa',
    },
    {
      name: 'agnostic_proxy_agent_detail',
      description: 'Get detailed status for a specific agent (proxy)',
      category: 'qa',
    },
    {
      name: 'agnostic_proxy_agent_registration',
      description: 'Get agent registry status — which agents are registered and active (proxy)',
      category: 'qa',
    },
    {
      name: 'agnostic_proxy_dashboard_overview',
      description: 'Get full dashboard overview including active sessions and agent status (proxy)',
      category: 'qa',
    },
    {
      name: 'agnostic_proxy_llm_gateway',
      description: 'Check AGNOS LLM Gateway health and status (proxy)',
      category: 'qa',
    },
    {
      name: 'agnostic_proxy_reports',
      description: 'List available QA reports (proxy)',
      category: 'qa',
    },
    {
      name: 'agnostic_proxy_alerts',
      description: 'Query recent system alerts with optional severity filter (proxy)',
      category: 'qa',
    },

    // AGNOS (AI-Native OS) tools — agent runtime + LLM gateway
    {
      name: 'agnos_runtime_health',
      description: 'Check AGNOS agent runtime health, component status, and system info',
      category: 'agnos',
    },
    {
      name: 'agnos_gateway_health',
      description: 'Check AGNOS LLM gateway health and provider availability',
      category: 'agnos',
    },
    {
      name: 'agnos_agents_list',
      description: 'List all agents registered with the AGNOS runtime (native + external)',
      category: 'agnos',
    },
    {
      name: 'agnos_agent_detail',
      description:
        'Get details of a specific AGNOS agent (status, capabilities, memory, heartbeat)',
      category: 'agnos',
    },
    {
      name: 'agnos_agent_register',
      description: 'Register a new agent with the AGNOS runtime',
      category: 'agnos',
    },
    {
      name: 'agnos_agent_deregister',
      description: 'Deregister (remove) an agent from the AGNOS runtime',
      category: 'agnos',
    },
    {
      name: 'agnos_agent_memory_list',
      description: 'List all memory keys for an AGNOS agent (persistent KV store)',
      category: 'agnos',
    },
    {
      name: 'agnos_agent_memory_get',
      description: 'Retrieve a specific memory entry from an AGNOS agent KV store',
      category: 'agnos',
    },
    {
      name: 'agnos_agent_memory_set',
      description: 'Store a value in an AGNOS agent persistent KV store',
      category: 'agnos',
    },
    {
      name: 'agnos_agent_memory_delete',
      description: 'Delete a memory entry from an AGNOS agent KV store',
      category: 'agnos',
    },
    {
      name: 'agnos_runtime_metrics',
      description: 'Get AGNOS agent runtime aggregate metrics (agent counts, CPU, memory usage)',
      category: 'agnos',
    },
    {
      name: 'agnos_gateway_metrics',
      description: 'Get AGNOS LLM gateway metrics (cache stats, token accounting, provider health)',
      category: 'agnos',
    },
    {
      name: 'agnos_gateway_models',
      description:
        'List available models on the AGNOS LLM gateway (Ollama, llama.cpp, OpenAI, Anthropic)',
      category: 'agnos',
    },
    {
      name: 'agnos_gateway_chat',
      description: 'Send a chat completion through the AGNOS LLM gateway (OpenAI-compatible)',
      category: 'agnos',
    },
    {
      name: 'agnos_audit_forward',
      description: 'Forward audit events to the AGNOS cryptographic audit chain',
      category: 'agnos',
    },
    {
      name: 'agnos_audit_query',
      description: 'Query the AGNOS audit log with optional filters by agent or action',
      category: 'agnos',
    },
    {
      name: 'agnos_traces_submit',
      description: 'Submit reasoning traces to AGNOS for cross-project visibility',
      category: 'agnos',
    },
    {
      name: 'agnos_traces_query',
      description: 'Query submitted reasoning traces from the AGNOS runtime',
      category: 'agnos',
    },
    {
      name: 'agnos_webhooks_register',
      description: 'Register a webhook with the AGNOS runtime to receive agent events',
      category: 'agnos',
    },
    {
      name: 'agnos_overview',
      description:
        'Get a unified AGNOS platform overview: runtime health, gateway health, agents, metrics, models',
      category: 'agnos',
    },
    {
      name: 'agnos_bridge_profiles',
      description:
        'List available AGNOS bridge profiles with their tool categories and descriptions',
      category: 'agnos',
    },
    {
      name: 'agnos_bridge_discover',
      description:
        'Discover available SecureYeoman MCP tools filtered by bridge profile or category',
      category: 'agnos',
    },
    {
      name: 'agnos_bridge_call',
      description:
        'Call a SecureYeoman MCP tool through the AGNOS bridge with profile-based access control',
      category: 'agnos',
    },
    {
      name: 'agnos_bridge_sync',
      description:
        'Push the current tool manifest to AGNOS daimon filtered by profile',
      category: 'agnos',
    },
    {
      name: 'agnos_bridge_status',
      description:
        'Check AGNOS bridge status including active profile, tool counts, and connectivity',
      category: 'agnos',
    },

    // Google Calendar tools
    {
      name: 'gcal_list_events',
      description: 'List Google Calendar events with optional time range and search query',
      category: 'googlecalendar',
    },
    {
      name: 'gcal_get_event',
      description: 'Get details of a specific Google Calendar event by ID',
      category: 'googlecalendar',
    },
    {
      name: 'gcal_create_event',
      description:
        'Create a Google Calendar event with summary, start/end times, and optional location',
      category: 'googlecalendar',
    },
    {
      name: 'gcal_quick_add',
      description:
        'Create a Google Calendar event from natural language text (e.g. "Meeting tomorrow at 3pm")',
      category: 'googlecalendar',
    },
    {
      name: 'gcal_update_event',
      description: 'Update an existing Google Calendar event',
      category: 'googlecalendar',
    },
    {
      name: 'gcal_delete_event',
      description: 'Delete a Google Calendar event by ID',
      category: 'googlecalendar',
    },
    {
      name: 'gcal_list_calendars',
      description: 'List all calendars accessible to the authenticated user',
      category: 'googlecalendar',
    },

    // Linear tools
    {
      name: 'linear_list_issues',
      description: 'List Linear issues with optional team, status, and assignee filters',
      category: 'linear',
    },
    {
      name: 'linear_get_issue',
      description: 'Get details of a specific Linear issue by ID',
      category: 'linear',
    },
    {
      name: 'linear_create_issue',
      description: 'Create a new Linear issue with title, description, team, and priority',
      category: 'linear',
    },
    {
      name: 'linear_update_issue',
      description: 'Update an existing Linear issue (title, state, priority, assignee)',
      category: 'linear',
    },
    {
      name: 'linear_create_comment',
      description: 'Add a comment to a Linear issue',
      category: 'linear',
    },
    {
      name: 'linear_list_teams',
      description: 'List all teams in the Linear workspace',
      category: 'linear',
    },
    {
      name: 'linear_search_issues',
      description: 'Search Linear issues by text query',
      category: 'linear',
    },

    // Todoist tools
    {
      name: 'todoist_list_tasks',
      description: 'List active Todoist tasks with optional project and filter',
      category: 'todoist',
    },
    {
      name: 'todoist_get_task',
      description: 'Get details of a specific Todoist task by ID',
      category: 'todoist',
    },
    {
      name: 'todoist_create_task',
      description: 'Create a new Todoist task with content, due date, and priority',
      category: 'todoist',
    },
    {
      name: 'todoist_update_task',
      description: 'Update an existing Todoist task',
      category: 'todoist',
    },
    {
      name: 'todoist_complete_task',
      description: 'Mark a Todoist task as complete',
      category: 'todoist',
    },
    {
      name: 'todoist_list_projects',
      description: 'List all Todoist projects',
      category: 'todoist',
    },

    // Jira tools
    {
      name: 'jira_search_issues',
      description: 'Search Jira issues using JQL query syntax',
      category: 'jira',
    },
    {
      name: 'jira_get_issue',
      description: 'Get details of a specific Jira issue by key (e.g. PROJ-123)',
      category: 'jira',
    },
    {
      name: 'jira_create_issue',
      description: 'Create a new Jira issue with project, summary, type, and optional fields',
      category: 'jira',
    },
    { name: 'jira_update_issue', description: 'Update an existing Jira issue', category: 'jira' },
    { name: 'jira_create_comment', description: 'Add a comment to a Jira issue', category: 'jira' },
    {
      name: 'jira_list_projects',
      description: 'List all accessible Jira projects',
      category: 'jira',
    },
    {
      name: 'jira_get_transitions',
      description: 'Get available workflow transitions for a Jira issue',
      category: 'jira',
    },
    {
      name: 'jira_transition_issue',
      description: 'Transition a Jira issue to a new workflow state',
      category: 'jira',
    },

    // Notion tools
    {
      name: 'notion_search',
      description: 'Search Notion pages and databases by text query',
      category: 'notion',
    },
    {
      name: 'notion_get_page',
      description: 'Get a Notion page by ID with properties and metadata',
      category: 'notion',
    },
    {
      name: 'notion_create_page',
      description: 'Create a new Notion page in a database with title and properties',
      category: 'notion',
    },
    {
      name: 'notion_update_page',
      description: 'Update Notion page properties',
      category: 'notion',
    },
    {
      name: 'notion_get_page_blocks',
      description: 'Get the block content (body) of a Notion page',
      category: 'notion',
    },
    {
      name: 'notion_append_blocks',
      description: 'Append block content to a Notion page',
      category: 'notion',
    },
    {
      name: 'notion_query_database',
      description: 'Query a Notion database with filters and sorts',
      category: 'notion',
    },

    // Google Drive tools
    {
      name: 'gdrive_list_files',
      description: 'List files in Google Drive with optional search, folder, and MIME type filters',
      category: 'google-workspace',
    },
    {
      name: 'gdrive_get_file',
      description: 'Get metadata for a specific Google Drive file by ID',
      category: 'google-workspace',
    },
    {
      name: 'gdrive_search',
      description: 'Full-text search across Google Drive files',
      category: 'google-workspace',
    },
    {
      name: 'gdrive_create_folder',
      description: 'Create a new folder in Google Drive',
      category: 'google-workspace',
    },
    {
      name: 'gdrive_upload_file',
      description: 'Upload a file to Google Drive with content',
      category: 'google-workspace',
    },
    {
      name: 'gdrive_delete_file',
      description: 'Delete a file from Google Drive',
      category: 'google-workspace',
    },
    {
      name: 'gdrive_share_file',
      description: 'Share a Google Drive file with a user by email',
      category: 'google-workspace',
    },

    // Google Sheets tools
    {
      name: 'gsheets_get_spreadsheet',
      description: 'Get spreadsheet metadata including sheet names and properties',
      category: 'google-workspace',
    },
    {
      name: 'gsheets_get_values',
      description: 'Read cell values from a Google Sheets range (A1 notation)',
      category: 'google-workspace',
    },
    {
      name: 'gsheets_update_values',
      description: 'Write values to a Google Sheets range',
      category: 'google-workspace',
    },
    {
      name: 'gsheets_append_values',
      description: 'Append rows to a Google Sheets range',
      category: 'google-workspace',
    },
    {
      name: 'gsheets_create_spreadsheet',
      description: 'Create a new Google Sheets spreadsheet',
      category: 'google-workspace',
    },

    // Google Docs tools
    {
      name: 'gdocs_get_document',
      description: 'Get the content and metadata of a Google Docs document',
      category: 'google-workspace',
    },
    {
      name: 'gdocs_create_document',
      description: 'Create a new Google Docs document with optional initial content',
      category: 'google-workspace',
    },

    // Synapse LLM controller tools
    {
      name: 'synapse_status',
      description:
        'Get the status and capabilities of the connected Synapse LLM controller, including GPU count, available memory, loaded models, and supported training methods',
      category: 'synapse',
    },
    {
      name: 'synapse_list_models',
      description:
        'List all models available on the Synapse instance, including their sizes, quantization formats, and whether they are currently loaded for inference',
      category: 'synapse',
    },
    {
      name: 'synapse_pull_model',
      description:
        'Pull (download) a model from HuggingFace or another registry into the Synapse instance',
      category: 'synapse',
    },
    {
      name: 'synapse_infer',
      description: 'Run inference on a model loaded in Synapse. Returns the generated text',
      category: 'synapse',
    },
    {
      name: 'synapse_submit_job',
      description:
        'Submit a training job to Synapse. Supports LoRA, QLoRA, full fine-tune, DPO, and RLHF',
      category: 'synapse',
    },
    {
      name: 'synapse_list_jobs',
      description:
        'List all training jobs on the Synapse instance, including status, progress, and timing',
      category: 'synapse',
    },
    {
      name: 'synapse_job_status',
      description:
        'Get detailed status of a specific Synapse training job, including current step, loss, and epoch',
      category: 'synapse',
    },
    {
      name: 'synapse_cancel_job',
      description: 'Cancel a running training job on the Synapse instance',
      category: 'synapse',
    },

    // Delta self-hosted Git forge tools
    {
      name: 'delta_list_repos',
      description:
        'List repositories on the Delta instance with name, owner, description, stars, forks, and visibility',
      category: 'delta',
    },
    {
      name: 'delta_get_repo',
      description:
        'Get detailed information about a specific Delta repository including default branch, clone URLs, and statistics',
      category: 'delta',
    },
    {
      name: 'delta_list_pulls',
      description:
        'List pull requests for a Delta repository, filterable by state (open, closed, all)',
      category: 'delta',
    },
    {
      name: 'delta_get_pull',
      description:
        'Get detailed information about a specific pull request including diff stats, reviews, and CI checks',
      category: 'delta',
    },
    {
      name: 'delta_merge_pull',
      description: 'Merge a pull request on Delta. Supports merge, rebase, and squash strategies',
      category: 'delta',
    },
    {
      name: 'delta_list_pipelines',
      description: 'List CI/CD pipeline runs for a Delta repository, filterable by status',
      category: 'delta',
    },
    {
      name: 'delta_trigger_pipeline',
      description:
        'Trigger a CI/CD pipeline run on a Delta repository, optionally on a specific ref',
      category: 'delta',
    },
    {
      name: 'delta_cancel_pipeline',
      description: 'Cancel a running CI/CD pipeline by its run ID on Delta',
      category: 'delta',
    },
    {
      name: 'delta_job_logs',
      description: 'Get logs for a specific job within a CI/CD pipeline run on Delta',
      category: 'delta',
    },
    {
      name: 'delta_create_status',
      description: 'Create a commit status check on a specific SHA in a Delta repository',
      category: 'delta',
    },
    {
      name: 'delta_create_repo',
      description: 'Create a new repository on the Delta instance',
      category: 'delta',
    },
    {
      name: 'delta_create_pull',
      description: 'Create a pull request on a Delta repository with head and base branches',
      category: 'delta',
    },
    {
      name: 'delta_pull_diff',
      description: 'Get the unified diff for a pull request on Delta',
      category: 'delta',
    },
    {
      name: 'delta_list_branches',
      description: 'List branches for a Delta repository with latest commit info',
      category: 'delta',
    },
    {
      name: 'delta_list_releases',
      description: 'List releases for a Delta repository with tag, name, and status',
      category: 'delta',
    },
    {
      name: 'delta_create_release',
      description: 'Create a release for a Delta repository with tag and release notes',
      category: 'delta',
    },
    {
      name: 'delta_list_artifacts',
      description: 'List build artifacts for a Delta repository',
      category: 'delta',
    },

    // Voice profile tools
    {
      name: 'voice_profile_create',
      description:
        'Create a new voice profile with name, TTS provider, voice ID, and optional settings',
      category: 'voice',
    },
    {
      name: 'voice_profile_list',
      description: 'List all voice profiles, optionally filtered by TTS provider',
      category: 'voice',
    },
    {
      name: 'voice_profile_switch',
      description: 'Assign a voice profile to the current personality for TTS output',
      category: 'voice',
    },

    // Edge Fleet tools (Phase 14D)
    {
      name: 'edge_list',
      description:
        'List all registered edge nodes with status, capabilities, architecture, memory, GPU, bandwidth, and latency',
      category: 'edge',
    },
    {
      name: 'edge_deploy',
      description:
        'Deploy a task/workload to an edge node with optional auto-routing based on hardware requirements',
      category: 'edge',
    },
    {
      name: 'edge_update',
      description:
        'Trigger an OTA update for an edge node with SHA-256 and Ed25519 signature verification',
      category: 'edge',
    },
    {
      name: 'edge_health',
      description:
        'Get detailed health and status for a specific edge node including capabilities, bandwidth, WireGuard status',
      category: 'edge',
    },
    {
      name: 'edge_decommission',
      description:
        'Decommission an edge node, marking it permanently offline and removing it from task routing',
      category: 'edge',
    },
    // Shruti DAW tools (Phase 16)
    {
      name: 'shruti_session_create',
      description: 'Create a new audio session in Shruti DAW with name, sample rate, and channels',
      category: 'shruti',
    },
    {
      name: 'shruti_session_open',
      description: 'Open an existing Shruti DAW session by file path',
      category: 'shruti',
    },
    {
      name: 'shruti_track_add',
      description: 'Add a track (audio, midi, bus, instrument) to the current Shruti session',
      category: 'shruti',
    },
    {
      name: 'shruti_track_list',
      description: 'List all tracks in the current Shruti session with gain, pan, mute/solo state',
      category: 'shruti',
    },
    {
      name: 'shruti_region_add',
      description:
        'Place an audio file on a track at a specific timeline position in the Shruti session',
      category: 'shruti',
    },
    {
      name: 'shruti_transport',
      description:
        'Control Shruti transport: play, stop, pause, record, seek to position, or set tempo',
      category: 'shruti',
    },
    {
      name: 'shruti_export',
      description: 'Export/bounce the current Shruti session to WAV or FLAC at 16/24/32-bit depth',
      category: 'shruti',
    },
    {
      name: 'shruti_analyze',
      description:
        'Run audio analysis: spectrum (FFT), dynamics (peak/RMS/LUFS), auto-mix suggestions, or composition suggestions',
      category: 'shruti',
    },
    {
      name: 'shruti_mix',
      description:
        'Adjust track mixing in Shruti: set gain (dB), pan, mute, solo, or add an effect (EQ, compressor, reverb, delay, limiter)',
      category: 'shruti',
    },
    {
      name: 'shruti_edit',
      description:
        'Edit operations in Shruti: undo, redo, split region, trim region, set fade in/out',
      category: 'shruti',
    },
  ];
}
