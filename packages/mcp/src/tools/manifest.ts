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
    {
      name: 'knowledge_search',
      description:
        'Search the SecureYeoman knowledge base. Optional instanceId param searches a federated peer instance.',
    },
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
      description:
        "Push this sub-agent's health status (uptime, task count, errors) to the orchestrator",
    },
    {
      name: 'diag_query_agent',
      description:
        'Retrieve the most recent health report from a spawned sub-agent by personality ID',
    },
    {
      name: 'diag_ping_integrations',
      description: 'Ping all MCP servers and integrations connected to the active personality',
    },

    // Desktop control tools (vision capability — screen observation)
    {
      name: 'desktop_screenshot',
      description:
        'Capture a screenshot of the screen, window, or region — returns image + AI description',
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

    // Network tools — device automation (46.1)
    {
      name: 'network_device_connect',
      description:
        'Open SSH session to a network device; returns sessionId for subsequent commands',
    },
    {
      name: 'network_show_command',
      description: 'Execute IOS-XE/NX-OS/IOS-XR/EOS show commands on a connected device',
    },
    {
      name: 'network_config_push',
      description: 'Push configuration lines to a device via SSH config mode (dry-run supported)',
    },
    {
      name: 'network_health_check',
      description:
        'Fleet-wide health check: run show version + show interfaces across a list of targets',
    },
    {
      name: 'network_ping_test',
      description: 'Execute ping from a connected device to a target IP; returns loss % and RTT',
    },
    {
      name: 'network_traceroute',
      description: 'Execute traceroute from a connected device; returns hop list with latency',
    },

    // Network tools — discovery & topology (46.2)
    {
      name: 'network_discovery_cdp',
      description: 'Run show cdp neighbors detail; return structured neighbor list',
    },
    {
      name: 'network_discovery_lldp',
      description: 'Run show lldp neighbors detail; return structured neighbor list',
    },
    {
      name: 'network_topology_build',
      description:
        'Recursively discover network topology via CDP from seed devices; returns JSON graph and Mermaid diagram',
    },
    {
      name: 'network_arp_table',
      description: 'Return parsed ARP table (IP → MAC → interface) from a connected device',
    },
    {
      name: 'network_mac_table',
      description: 'Return parsed MAC address table (MAC → VLAN → interface) from a switch',
    },

    // Network tools — routing & switching (46.3)
    {
      name: 'network_routing_table',
      description:
        'Parse show ip route; return structured route entries with protocol, prefix, next-hop, AD/metric',
    },
    {
      name: 'network_ospf_neighbors',
      description:
        'Parse show ip ospf neighbor; return neighbor list with state, dead timer, interface',
    },
    {
      name: 'network_ospf_lsdb',
      description: 'Parse show ip ospf database; return LSA summary by type',
    },
    {
      name: 'network_bgp_peers',
      description: 'Parse show bgp summary; return peer list with ASN, state, prefix count',
    },
    {
      name: 'network_interface_status',
      description:
        'Parse show interfaces; return per-interface admin/oper state, speed, duplex, errors',
    },
    {
      name: 'network_vlan_list',
      description: 'Parse show vlan brief; return VLAN ID, name, active ports',
    },

    // Network tools — security auditing (46.4)
    {
      name: 'network_acl_audit',
      description:
        'Parse show ip access-lists; return ACL entries, match counts, implicit deny analysis',
    },
    {
      name: 'network_aaa_status',
      description: 'Return AAA server list and method config from a connected device',
    },
    {
      name: 'network_port_security',
      description:
        'Parse show port-security; return per-interface violations, max MAC, sticky config',
    },
    {
      name: 'network_stp_status',
      description:
        'Parse show spanning-tree; return root bridge, port roles/states, topology change count',
    },
    {
      name: 'network_software_version',
      description:
        'Parse show version; return OS family, version string, uptime, platform, serial number',
    },

    // Network tools — NetBox source of truth (46.5)
    {
      name: 'netbox_devices_list',
      description: 'Query NetBox devices with optional site/role/tag/status filters',
    },
    {
      name: 'netbox_interfaces_list',
      description: 'Query NetBox interfaces for a device with IP assignments',
    },
    { name: 'netbox_ipam_ips', description: 'Query NetBox IP addresses by prefix, VRF, or device' },
    {
      name: 'netbox_cables',
      description: 'Query NetBox cables with endpoint A/B device and interface',
    },
    {
      name: 'netbox_reconcile',
      description:
        'Compare live CDP topology against NetBox cables; return structured drift report',
    },

    // Network tools — NVD / CVE vulnerability assessment (46.6)
    {
      name: 'nvd_cve_search',
      description: 'Search NVD CVE database by keyword with optional CVSS severity filter',
    },
    {
      name: 'nvd_cve_by_software',
      description: 'Look up CVEs for a specific vendor/product/version using CPE match',
    },
    {
      name: 'nvd_cve_get',
      description: 'Fetch full CVE record by CVE ID including CVSS v3 vector, CWE, and references',
    },

    // Network tools — utilities (46.7)
    {
      name: 'subnet_calculator',
      description:
        'Calculate IPv4 subnet details: network, broadcast, first/last host, mask, wildcard mask, host count',
    },
    {
      name: 'subnet_vlsm',
      description:
        'VLSM planning — carve a parent prefix into subnets sized for given host requirements',
    },
    {
      name: 'wildcard_mask_calc',
      description: 'Convert a subnet mask or prefix length to an ACL wildcard mask',
    },

    // Network tools — PCAP analysis (46.8)
    {
      name: 'pcap_upload',
      description: 'Upload a pcap/pcapng file (base64-encoded) for analysis; returns pcapId',
    },
    {
      name: 'pcap_protocol_hierarchy',
      description: 'Run tshark protocol hierarchy statistics on an uploaded pcap',
    },
    {
      name: 'pcap_conversations',
      description:
        'List IP/TCP/UDP conversations in an uploaded pcap with bytes, packets, duration',
    },
    {
      name: 'pcap_dns_queries',
      description: 'Extract DNS query/response pairs from an uploaded pcap',
    },
    {
      name: 'pcap_http_requests',
      description: 'Extract HTTP request/response metadata from an uploaded pcap',
    },

    // Twingate tools (Phase 45)
    {
      name: 'twingate_resources_list',
      description:
        'List all Twingate Resources; returns id, name, address, group access, protocol rules',
    },
    {
      name: 'twingate_resource_get',
      description:
        'Fetch a single Twingate Resource by id with full protocol policy and group assignments',
    },
    {
      name: 'twingate_groups_list',
      description:
        'List Twingate access groups and which identities/service accounts can reach which resources',
    },
    {
      name: 'twingate_service_accounts_list',
      description:
        'List Twingate service accounts (non-human principals for agent-to-resource access)',
    },
    {
      name: 'twingate_service_account_create',
      description:
        'Create a Twingate service account scoped to specific resources; returns account id for key generation',
    },
    {
      name: 'twingate_service_key_create',
      description:
        'Generate a service key for a service account; stores it in SecretsManager — returned once',
    },
    {
      name: 'twingate_service_key_revoke',
      description: 'Revoke a Twingate service key by id; emits twingate_key_revoked audit event',
    },
    {
      name: 'twingate_connectors_list',
      description:
        'List Twingate Connectors with online/offline status, remote network, and last heartbeat',
    },
    {
      name: 'twingate_remote_networks_list',
      description: 'List Twingate Remote Networks (private network segments behind Connectors)',
    },
    {
      name: 'twingate_mcp_connect',
      description:
        'Open a proxy session to a private MCP server reachable via the Twingate Client tunnel; returns sessionId',
    },
    {
      name: 'twingate_mcp_list_tools',
      description: 'List tools exposed by a private MCP server connected via twingate_mcp_connect',
    },
    {
      name: 'twingate_mcp_call_tool',
      description:
        'Invoke a tool on a connected private MCP server; returns result; emits twingate_mcp_tool_call audit event',
    },
    { name: 'twingate_mcp_disconnect', description: 'Close a Twingate MCP proxy session' },

    // Organizational Intent tools (Phase 48)
    {
      name: 'intent_signal_read',
      description:
        'Read the current value of a named signal from the active organizational intent document',
    },

    // Gmail tools (Phase 63)
    {
      name: 'gmail_profile',
      description: 'Get connected Gmail account email, mode, message and thread counts',
    },
    {
      name: 'gmail_list_messages',
      description: 'List Gmail messages with Gmail search syntax (is:unread, from:alice@...)',
    },
    {
      name: 'gmail_read_message',
      description: 'Read full Gmail message content by ID (headers + body + labels)',
    },
    {
      name: 'gmail_read_thread',
      description: 'Read all messages in a Gmail thread (full conversation chain)',
    },
    {
      name: 'gmail_list_labels',
      description: 'List all Gmail labels including system labels (INBOX, SENT, TRASH)',
    },
    {
      name: 'gmail_compose_draft',
      description: 'Create a Gmail draft (not sent — requires human review)',
    },
    { name: 'gmail_send_email', description: 'Send email immediately via Gmail (auto mode only)' },

    // Twitter / X tools (Phase 63)
    { name: 'twitter_profile', description: 'Get authenticated Twitter / X account profile' },
    {
      name: 'twitter_search',
      description: 'Search recent tweets (supports Twitter search operators)',
    },
    { name: 'twitter_get_tweet', description: 'Get a single tweet by ID' },
    { name: 'twitter_get_user', description: 'Look up a Twitter / X user by username' },
    {
      name: 'twitter_get_mentions',
      description: 'Get mentions of the authenticated Twitter / X account',
    },
    {
      name: 'twitter_get_timeline',
      description: 'Get the authenticated Twitter / X account home timeline',
    },
    {
      name: 'twitter_post_tweet',
      description: 'Post a tweet (or preview in draft mode without posting)',
    },
    { name: 'twitter_like_tweet', description: 'Like a tweet (auto mode only)' },
    { name: 'twitter_retweet', description: 'Retweet a tweet (auto mode only)' },
    { name: 'twitter_unretweet', description: 'Undo a retweet (auto mode only)' },
    {
      name: 'twitter_upload_media',
      description:
        'Upload an image or video to Twitter to attach to a tweet — requires OAuth 1.0a credentials and auto mode',
    },

    // GitHub API tools (Phase 70)
    {
      name: 'github_profile',
      description:
        'Get the connected GitHub account profile — login, name, email, public repos count, access mode, and two_factor_authentication status (boolean). Use to surface 2FA security recommendations.',
    },
    {
      name: 'github_list_repos',
      description: 'List repositories for the authenticated GitHub user',
    },
    { name: 'github_get_repo', description: 'Get details for a specific GitHub repository' },
    { name: 'github_list_prs', description: 'List pull requests for a GitHub repository' },
    { name: 'github_get_pr', description: 'Get details of a specific pull request' },
    { name: 'github_list_issues', description: 'List issues for a GitHub repository' },
    { name: 'github_get_issue', description: 'Get details of a specific issue' },
    { name: 'github_create_issue', description: 'Create a new GitHub issue' },
    {
      name: 'github_create_pr',
      description: 'Create a new pull request (draft mode returns preview)',
    },
    {
      name: 'github_comment',
      description: 'Add a comment to a GitHub issue or PR (auto mode only)',
    },
    {
      name: 'github_list_ssh_keys',
      description: 'List SSH public keys on the connected GitHub account (all modes)',
    },
    {
      name: 'github_add_ssh_key',
      description:
        'Add an SSH public key to the connected GitHub account (draft → preview, suggest → blocked)',
    },
    {
      name: 'github_delete_ssh_key',
      description:
        'Remove an SSH public key from the connected GitHub account by key_id (auto mode only)',
    },
    {
      name: 'github_setup_ssh',
      description:
        'Generate ed25519 SSH key pair in this container, register public key with GitHub, configure ~/.ssh/ for git push/pull via SSH',
    },
    {
      name: 'github_rotate_ssh_key',
      description:
        'Rotate the container SSH key: generate new key, register with GitHub, revoke old key, update ~/.ssh/',
    },
    {
      name: 'github_create_repo',
      description: 'Create a new GitHub repository (draft → preview, suggest → blocked)',
    },
    {
      name: 'github_fork_repo',
      description:
        'Fork a GitHub repository into the authenticated user or org (draft → preview, suggest → blocked)',
    },
    {
      name: 'github_sync_fork',
      description:
        'Sync a fork branch with its upstream repository via the GitHub Merges API (draft → preview, suggest → blocked, 204 = already up-to-date)',
    },

    // Ollama model lifecycle tools (Phase 64)
    {
      name: 'ollama_pull',
      description:
        'Pull (download) an Ollama model from the registry — only available when provider is ollama',
    },
    {
      name: 'ollama_rm',
      description:
        'Remove a locally downloaded Ollama model to free disk space — only available when provider is ollama',
    },

    // Docker management tools (Phase 74)
    {
      name: 'docker_ps',
      description: 'List Docker containers (running by default; use all=true to include stopped)',
    },
    {
      name: 'docker_logs',
      description: 'Fetch recent logs from a Docker container with optional timestamps',
    },
    {
      name: 'docker_inspect',
      description: 'Return detailed metadata for a container or image as JSON',
    },
    {
      name: 'docker_stats',
      description: 'One-shot snapshot of CPU, memory, and network I/O for running containers',
    },
    {
      name: 'docker_images',
      description: 'List locally available Docker images with optional filter',
    },
    { name: 'docker_start', description: 'Start one or more stopped Docker containers' },
    { name: 'docker_stop', description: 'Stop one or more running Docker containers' },
    { name: 'docker_restart', description: 'Restart one or more Docker containers' },
    {
      name: 'docker_exec',
      description: 'Execute a command inside a running Docker container and return its output',
    },
    { name: 'docker_pull', description: 'Pull a Docker image from a registry' },
    { name: 'docker_compose_ps', description: 'List services in a Docker Compose project' },
    {
      name: 'docker_compose_logs',
      description: 'Fetch logs from a Docker Compose project or specific service',
    },
    {
      name: 'docker_compose_up',
      description: 'Start Docker Compose services in detached mode (with optional build)',
    },
    {
      name: 'docker_compose_down',
      description: 'Stop and remove containers and networks for a Docker Compose project',
    },

    // Knowledge Base tools (Phase 82)
    {
      name: 'kb_search',
      description:
        'Semantic search across the knowledge base (documents + entries). Returns chunks ranked by relevance.',
    },
    {
      name: 'kb_add_document',
      description:
        'Ingest a URL or raw text into the knowledge base. URL is fetched and indexed; raw text is stored directly.',
    },
    {
      name: 'kb_list_documents',
      description:
        'List all documents ingested into the knowledge base with status and chunk counts.',
    },
    {
      name: 'kb_delete_document',
      description: 'Delete a document from the knowledge base and remove all its indexed chunks.',
    },
  ];
}
