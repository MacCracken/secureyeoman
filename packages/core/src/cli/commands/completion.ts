/**
 * Completion Command — Generate shell completion scripts for bash, zsh, and fish.
 */

import type { Command, CommandContext } from '../router.js';
import { extractBoolFlag } from '../utils.js';

const COMMANDS = [
  'start',
  'health',
  'config',
  'integration',
  'repl',
  'init',
  'status',
  'role',
  'extension',
  'execute',
  'a2a',
  'browser',
  'memory',
  'scraper',
  'multimodal',
  'model',
  'policy',
  'completion',
  'plugin',
  'help',
];

const CONFIG_SUBCOMMANDS = ['validate'];
const INTEGRATION_SUBCOMMANDS = ['list', 'show', 'create', 'delete', 'start', 'stop'];
const ROLE_SUBCOMMANDS = ['list', 'show', 'assign', 'unassign', 'create', 'delete'];
const EXTENSION_SUBCOMMANDS = ['list', 'show', 'create', 'delete', 'enable', 'disable'];
const MODEL_SUBCOMMANDS = ['info', 'list', 'switch', 'default'];
const POLICY_SUBCOMMANDS = ['get', 'set', 'dynamic-tools'];
const PLUGIN_SUBCOMMANDS = ['list', 'info', 'add', 'remove'];
const COMPLETION_SHELLS = ['bash', 'zsh', 'fish'];

function bashScript(): string {
  return `# SecureYeoman bash completion
# Source this file or add to ~/.bashrc:
#   source <(secureyeoman completion bash)

_secureyeoman_completions() {
  local cur prev words cword
  _init_completion 2>/dev/null || {
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
    words=("\${COMP_WORDS[@]}")
    cword=$COMP_CWORD
  }

  local commands="${COMMANDS.join(' ')}"

  if [[ $cword -eq 1 ]]; then
    COMPREPLY=($(compgen -W "$commands" -- "$cur"))
    return
  fi

  local command="\${words[1]}"
  case "$command" in
    config|cfg)
      COMPREPLY=($(compgen -W "${CONFIG_SUBCOMMANDS.join(' ')} --config --check-secrets --json --help" -- "$cur"))
      ;;
    integration|int)
      COMPREPLY=($(compgen -W "${INTEGRATION_SUBCOMMANDS.join(' ')} --url --token --json --help" -- "$cur"))
      ;;
    role)
      COMPREPLY=($(compgen -W "${ROLE_SUBCOMMANDS.join(' ')} --url --token --json --help" -- "$cur"))
      ;;
    extension|ext)
      COMPREPLY=($(compgen -W "${EXTENSION_SUBCOMMANDS.join(' ')} --url --token --json --help" -- "$cur"))
      ;;
    model)
      COMPREPLY=($(compgen -W "${MODEL_SUBCOMMANDS.join(' ')} --url --token --json --help" -- "$cur"))
      ;;
    policy|pol)
      COMPREPLY=($(compgen -W "${POLICY_SUBCOMMANDS.join(' ')} --url --token --json --help" -- "$cur"))
      ;;
    plugin)
      COMPREPLY=($(compgen -W "${PLUGIN_SUBCOMMANDS.join(' ')} --dir --json --help" -- "$cur"))
      ;;
    completion)
      COMPREPLY=($(compgen -W "${COMPLETION_SHELLS.join(' ')} --help" -- "$cur"))
      ;;
    health|h)
      COMPREPLY=($(compgen -W "--url --token --json --help" -- "$cur"))
      ;;
    start)
      COMPREPLY=($(compgen -W "--port --host --config --help" -- "$cur"))
      ;;
    *)
      COMPREPLY=($(compgen -W "--url --token --json --help" -- "$cur"))
      ;;
  esac
}

complete -F _secureyeoman_completions secureyeoman
`;
}

function zshScript(): string {
  return `#compdef secureyeoman
# SecureYeoman zsh completion
# Add to ~/.zshrc:
#   autoload -Uz compinit && compinit
#   source <(secureyeoman completion zsh)

_secureyeoman() {
  local state

  _arguments \\
    '1: :->command' \\
    '*: :->args'

  case $state in
    command)
      local commands=(
        ${COMMANDS.map((c) => `'${c}'`).join('\n        ')}
      )
      _describe 'command' commands
      ;;
    args)
      case $words[2] in
        config|cfg)
          _arguments \\
            '1: :(${CONFIG_SUBCOMMANDS.join(' ')})' \\
            '--config[Config file path]:file:_files' \\
            '--check-secrets[Validate required environment variables]' \\
            '--json[Output raw JSON]' \\
            '--help[Show help]'
          ;;
        integration|int)
          _arguments \\
            '1: :(${INTEGRATION_SUBCOMMANDS.join(' ')})' \\
            '--url[Server URL]:url:' \\
            '--token[Auth token]:token:' \\
            '--platform[Platform name]:platform:' \\
            '--name[Integration name]:name:' \\
            '--json[Output raw JSON]' \\
            '--help[Show help]'
          ;;
        role)
          _arguments \\
            '1: :(${ROLE_SUBCOMMANDS.join(' ')})' \\
            '--url[Server URL]:url:' \\
            '--token[Auth token]:token:' \\
            '--json[Output raw JSON]' \\
            '--help[Show help]'
          ;;
        extension|ext)
          _arguments \\
            '1: :(${EXTENSION_SUBCOMMANDS.join(' ')})' \\
            '--url[Server URL]:url:' \\
            '--token[Auth token]:token:' \\
            '--json[Output raw JSON]' \\
            '--help[Show help]'
          ;;
        model)
          _arguments \\
            '1: :(${MODEL_SUBCOMMANDS.join(' ')})' \\
            '--url[Server URL]:url:' \\
            '--token[Auth token]:token:' \\
            '--json[Output raw JSON]' \\
            '--help[Show help]'
          ;;
        policy|pol)
          _arguments \\
            '1: :(${POLICY_SUBCOMMANDS.join(' ')})' \\
            '--url[Server URL]:url:' \\
            '--token[Auth token]:token:' \\
            '--json[Output raw JSON]' \\
            '--help[Show help]'
          ;;
        plugin)
          _arguments \\
            '1: :(${PLUGIN_SUBCOMMANDS.join(' ')})' \\
            '--dir[Plugin directory]:dir:_files -/' \\
            '--json[Output raw JSON]' \\
            '--help[Show help]'
          ;;
        completion)
          _arguments \\
            '1: :(${COMPLETION_SHELLS.join(' ')})' \\
            '--help[Show help]'
          ;;
        health|h)
          _arguments \\
            '--url[Server URL]:url:' \\
            '--token[Auth token]:token:' \\
            '--json[Output raw JSON]' \\
            '--help[Show help]'
          ;;
        start)
          _arguments \\
            '--port[Port number]:port:' \\
            '--host[Host address]:host:' \\
            '--config[Config file]:file:_files' \\
            '--help[Show help]'
          ;;
        *)
          _arguments \\
            '--url[Server URL]:url:' \\
            '--token[Auth token]:token:' \\
            '--json[Output raw JSON]' \\
            '--help[Show help]'
          ;;
      esac
      ;;
  esac
}

_secureyeoman "$@"
`;
}

function fishScript(): string {
  const commandCompletions = COMMANDS.map(
    (c) => `complete -c secureyeoman -f -n '__fish_use_subcommand' -a '${c}'`
  ).join('\n');

  return `# SecureYeoman fish completion
# Add to ~/.config/fish/completions/secureyeoman.fish
# or run: secureyeoman completion fish > ~/.config/fish/completions/secureyeoman.fish

function __fish_secureyeoman_no_subcommand
  for i in (commandline -opc)
    switch $i
      case ${COMMANDS.join(' ')}
        return 1
    end
  end
  return 0
end

function __fish_use_subcommand
  __fish_secureyeoman_no_subcommand
end

# Top-level commands
${commandCompletions}

# config subcommands
complete -c secureyeoman -f -n '__fish_seen_subcommand_from config cfg' -a '${CONFIG_SUBCOMMANDS.join(' ')}'
complete -c secureyeoman -n '__fish_seen_subcommand_from config cfg' -l config -d 'Config file path'
complete -c secureyeoman -n '__fish_seen_subcommand_from config cfg' -l check-secrets -d 'Validate required environment variables'
complete -c secureyeoman -n '__fish_seen_subcommand_from config cfg' -l json -d 'Output raw JSON'

# integration subcommands
complete -c secureyeoman -f -n '__fish_seen_subcommand_from integration int' -a '${INTEGRATION_SUBCOMMANDS.join(' ')}'
complete -c secureyeoman -n '__fish_seen_subcommand_from integration int' -l url -d 'Server URL'
complete -c secureyeoman -n '__fish_seen_subcommand_from integration int' -l token -d 'Auth token'
complete -c secureyeoman -n '__fish_seen_subcommand_from integration int' -l platform -d 'Platform name'
complete -c secureyeoman -n '__fish_seen_subcommand_from integration int' -l name -d 'Integration name'
complete -c secureyeoman -n '__fish_seen_subcommand_from integration int' -l json -d 'Output raw JSON'

# role subcommands
complete -c secureyeoman -f -n '__fish_seen_subcommand_from role' -a '${ROLE_SUBCOMMANDS.join(' ')}'
complete -c secureyeoman -n '__fish_seen_subcommand_from role' -l url -d 'Server URL'
complete -c secureyeoman -n '__fish_seen_subcommand_from role' -l token -d 'Auth token'
complete -c secureyeoman -n '__fish_seen_subcommand_from role' -l json -d 'Output raw JSON'

# plugin subcommands
complete -c secureyeoman -f -n '__fish_seen_subcommand_from plugin' -a '${PLUGIN_SUBCOMMANDS.join(' ')}'
complete -c secureyeoman -n '__fish_seen_subcommand_from plugin' -l dir -d 'Plugin directory'
complete -c secureyeoman -n '__fish_seen_subcommand_from plugin' -l json -d 'Output raw JSON'

# completion shells
complete -c secureyeoman -f -n '__fish_seen_subcommand_from completion' -a '${COMPLETION_SHELLS.join(' ')}'

# model subcommands
complete -c secureyeoman -f -n '__fish_seen_subcommand_from model' -a '${MODEL_SUBCOMMANDS.join(' ')}'

# policy subcommands
complete -c secureyeoman -f -n '__fish_seen_subcommand_from policy pol' -a '${POLICY_SUBCOMMANDS.join(' ')}'

# health flags
complete -c secureyeoman -n '__fish_seen_subcommand_from health h' -l url -d 'Server URL'
complete -c secureyeoman -n '__fish_seen_subcommand_from health h' -l token -d 'Auth token'
complete -c secureyeoman -n '__fish_seen_subcommand_from health h' -l json -d 'Output raw JSON'

# start flags
complete -c secureyeoman -n '__fish_seen_subcommand_from start' -l port -d 'Port number'
complete -c secureyeoman -n '__fish_seen_subcommand_from start' -l host -d 'Host address'
complete -c secureyeoman -n '__fish_seen_subcommand_from start' -l config -d 'Config file'

# Global --help
complete -c secureyeoman -l help -s h -d 'Show help'
`;
}

const USAGE = `
Usage: secureyeoman completion <shell>

Shells:
  bash    Bash completion script
  zsh     Zsh completion script
  fish    Fish completion script

Examples:
  # Bash — add to ~/.bashrc:
  source <(secureyeoman completion bash)

  # Zsh — add to ~/.zshrc (after compinit):
  source <(secureyeoman completion zsh)

  # Fish — install permanently:
  secureyeoman completion fish > ~/.config/fish/completions/secureyeoman.fish

  -h, --help    Show this help
`;

export const completionCommand: Command = {
  name: 'completion',
  description: 'Generate shell completion scripts',
  usage: 'secureyeoman completion <bash|zsh|fish>',

  async run(ctx: CommandContext): Promise<number> {
    let argv = ctx.argv;

    const helpResult = extractBoolFlag(argv, 'help', 'h');
    if (helpResult.value || argv.length === 0) {
      ctx.stdout.write(USAGE + '\n');
      return 0;
    }
    argv = helpResult.rest;

    const shell = argv[0];

    switch (shell) {
      case 'bash':
        ctx.stdout.write(bashScript());
        return 0;
      case 'zsh':
        ctx.stdout.write(zshScript());
        return 0;
      case 'fish':
        ctx.stdout.write(fishScript());
        return 0;
      default:
        ctx.stderr.write(`Unknown shell: ${shell ?? ''}. Supported: bash, zsh, fish\n`);
        return 1;
    }
  },
};
