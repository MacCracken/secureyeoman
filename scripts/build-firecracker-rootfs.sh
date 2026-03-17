#!/usr/bin/env bash
# build-firecracker-rootfs.sh — Build minimal rootfs + kernel for Firecracker sandbox
#
# Produces:
#   artifacts/firecracker/rootfs.ext4  (~50 MB, Alpine + Node.js 22)
#   artifacts/firecracker/vmlinux     (~5 MB, stripped uncompressed kernel)
#
# Requirements: docker (builds inside container for reproducibility)
#
# Usage:
#   ./scripts/build-firecracker-rootfs.sh
#   FIRECRACKER_ROOTFS_SIZE=100M ./scripts/build-firecracker-rootfs.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ARTIFACTS_DIR="$PROJECT_ROOT/artifacts/firecracker"
ROOTFS_SIZE="${FIRECRACKER_ROOTFS_SIZE:-64M}"
NODE_VERSION="${FIRECRACKER_NODE_VERSION:-22}"
ALPINE_VERSION="${FIRECRACKER_ALPINE_VERSION:-3.21}"
KERNEL_VERSION="${FIRECRACKER_KERNEL_VERSION:-6.1.102}"

mkdir -p "$ARTIFACTS_DIR"

echo "==> Building Firecracker rootfs (Alpine $ALPINE_VERSION + Node.js $NODE_VERSION)"
echo "    Rootfs size: $ROOTFS_SIZE"
echo "    Output: $ARTIFACTS_DIR/"

# ── Stage 1: Build rootfs via Docker ──────────────────────────────────────────

ROOTFS_IMG="$ARTIFACTS_DIR/rootfs.ext4"

docker run --rm --privileged \
  -v "$ARTIFACTS_DIR:/output" \
  "alpine:$ALPINE_VERSION" \
  sh -c "
set -e

# Install tools
apk add --no-cache e2fsprogs nodejs npm

# Create empty ext4 image
dd if=/dev/zero of=/output/rootfs.ext4 bs=1M count=${ROOTFS_SIZE%M} 2>/dev/null
mkfs.ext4 -q /output/rootfs.ext4

# Mount and populate
mkdir -p /rootfs
mount /output/rootfs.ext4 /rootfs

# Install minimal Alpine base
mkdir -p /rootfs/{bin,sbin,usr/bin,usr/sbin,usr/lib,etc,proc,sys,dev,tmp,run,var}

# Copy busybox + core utilities
cp /bin/busybox /rootfs/bin/
for cmd in sh ash ls cat echo mkdir rm cp mv ln mount umount; do
  ln -s busybox /rootfs/bin/\$cmd
done

# Copy node
cp \$(which node) /rootfs/usr/bin/node
# Copy required shared libraries
for lib in \$(ldd \$(which node) | grep '=>' | awk '{print \$3}'); do
  cp -L \"\$lib\" /rootfs/usr/lib/ 2>/dev/null || true
done
cp -L /lib/ld-musl-*.so.1 /rootfs/lib/ 2>/dev/null || true

# Create overlay-init script (Firecracker boot target)
cat > /rootfs/sbin/overlay-init << 'INITEOF'
#!/bin/sh
mount -t proc proc /proc
mount -t sysfs sys /sys
mount -t devtmpfs dev /dev

# Mount task drive (second virtio block device)
mkdir -p /task
mount /dev/vdb /task 2>/dev/null || true

# Execute task script if present
if [ -f /task/task.mjs ]; then
  /usr/bin/node /task/task.mjs
fi

# Halt after task completes
echo o > /proc/sysrq-trigger
INITEOF
chmod +x /rootfs/sbin/overlay-init

# Create minimal /etc files
echo 'root:x:0:0:root:/root:/bin/sh' > /rootfs/etc/passwd
echo 'root:x:0:' > /rootfs/etc/group
echo 'nameserver 8.8.8.8' > /rootfs/etc/resolv.conf

# Unmount
umount /rootfs
echo 'Rootfs built successfully'
"

echo "==> Rootfs: $(du -h "$ROOTFS_IMG" | cut -f1) $ROOTFS_IMG"

# ── Stage 2: Extract kernel ──────────────────────────────────────────────────

VMLINUX="$ARTIFACTS_DIR/vmlinux"

if [ ! -f "$VMLINUX" ]; then
  echo "==> Downloading Firecracker-compatible kernel $KERNEL_VERSION"
  KERNEL_URL="https://s3.amazonaws.com/spec.ccfc.min/img/quickstart_guide/x86_64/kernels/vmlinux-${KERNEL_VERSION}"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$KERNEL_URL" -o "$VMLINUX" 2>/dev/null || {
      echo "    Kernel download failed. Build manually or provide vmlinux path."
      echo "    See: https://github.com/firecracker-microvm/firecracker/blob/main/docs/rootfs-and-kernel-setup.md"
    }
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$KERNEL_URL" -O "$VMLINUX" 2>/dev/null || {
      echo "    Kernel download failed."
    }
  fi
fi

if [ -f "$VMLINUX" ]; then
  echo "==> Kernel: $(du -h "$VMLINUX" | cut -f1) $VMLINUX"
else
  echo "==> Kernel: not downloaded (provide manually)"
fi

echo ""
echo "==> Done. Configure SecureYeoman:"
echo "    SECUREYEOMAN_FIRECRACKER_KERNEL_PATH=$VMLINUX"
echo "    SECUREYEOMAN_FIRECRACKER_ROOTFS_PATH=$ROOTFS_IMG"
