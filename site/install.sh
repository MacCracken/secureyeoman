#!/bin/bash
# install.sh — SecureYeoman one-line installer
#
# Usage:
#   curl -fsSL https://secureyeoman.ai/install | bash
#   curl -fsSL https://secureyeoman.ai/install | bash -s -- --dir /usr/local/bin
#
# Options:
#   --dir <path>    Installation directory (default: /usr/local/bin)
#   --version <v>  Specific version to install (default: latest)

set -e

INSTALL_DIR="/usr/local/bin"
VERSION=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Detect OS and architecture
_UNAME_S=$(uname -s)
ARCH=$(uname -m | sed 's/x86_64/x64/;s/aarch64/arm64/;s/arm64/arm64/')

case "$_UNAME_S" in
  Linux*)   OS="linux" ;;
  Darwin*)  OS="darwin" ;;
  MINGW*|MSYS*|CYGWIN*)
    OS="windows"
    INSTALL_DIR="${INSTALL_DIR:-$USERPROFILE/bin}"
    ;;
  *)
    echo "Unsupported OS: $_UNAME_S (supported: linux, darwin, windows via Git Bash)"
    exit 1
    ;;
esac

if [[ "$OS" == "windows" ]]; then
  BINARY_NAME="secureyeoman-windows-${ARCH}.exe"
else
  BINARY_NAME="secureyeoman-${OS}-${ARCH}"
fi

# Get latest version if not specified
if [[ -z "$VERSION" ]]; then
  VERSION=$(curl -sf https://api.github.com/repos/MacCracken/secureyeoman/releases/latest \
    | grep '"tag_name"' | cut -d'"' -f4)
  if [[ -z "$VERSION" ]]; then
    echo "Could not determine latest version. Specify with --version <tag>"
    exit 1
  fi
fi

URL="https://github.com/MacCracken/secureyeoman/releases/download/${VERSION}/${BINARY_NAME}"
if [[ "$OS" == "windows" ]]; then
  DEST="${INSTALL_DIR}/secureyeoman.exe"
else
  DEST="${INSTALL_DIR}/secureyeoman"
fi

echo "Installing secureyeoman ${VERSION} (${OS}/${ARCH})..."
echo "  Source: ${URL}"
echo "  Destination: ${DEST}"

mkdir -p "$INSTALL_DIR"

# Download
if command -v curl &>/dev/null; then
  curl -fsSL "$URL" -o "$DEST"
elif command -v wget &>/dev/null; then
  wget -qO "$DEST" "$URL"
else
  echo "Error: curl or wget is required"
  exit 1
fi

[[ "$OS" != "windows" ]] && chmod +x "$DEST"

echo ""
echo "✓ secureyeoman ${VERSION} installed at ${DEST}"
echo ""
echo "Next steps:"
echo "  secureyeoman init          # Interactive setup wizard"
echo "  secureyeoman start         # Start the server (requires PostgreSQL)"
echo ""
echo "For SQLite (no external DB):"
echo "  DATABASE_URL='' secureyeoman start"
