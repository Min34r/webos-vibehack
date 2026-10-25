#!/bin/sh
# /var/lib/webosbrew/init.d/80-enable-swap.sh
# Automatically creates and enables 512MB swap on internal storage for rooted webOS TVs.
# This prevents the kernel Low Memory Killer (LMK) from killing background apps.

SWAPFILE="/media/internal/swapfile"

if [ ! -f "$SWAPFILE" ]; then
    # Try fallocate first, fall back to dd
    fallocate -l 512M "$SWAPFILE" 2>/dev/null || dd if=/dev/zero of="$SWAPFILE" bs=1M count=512 2>/dev/null
    chmod 600 "$SWAPFILE"
    mkswap "$SWAPFILE" >/dev/null 2>&1
fi

if [ -f "$SWAPFILE" ] && ! swapon -s 2>/dev/null | grep -q "$SWAPFILE"; then
    swapon "$SWAPFILE" 2>/dev/null
    # Configure swappiness (prefer keeping active RAM pages)
    [ -f /proc/sys/vm/swappiness ] && echo 60 > /proc/sys/vm/swappiness
fi
