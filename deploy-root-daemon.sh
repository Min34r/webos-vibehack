#!/usr/bin/env bash
# Deploy and manage the on-device root daemon, swap, and overlay app for LG webOS TV.
# Usage:
#   ./deploy-root-daemon.sh [TV_IP] [install|start|stop|status|uninstall]
# Examples:
#   ./deploy-root-daemon.sh 192.168.1.4 install
#   ./deploy-root-daemon.sh 192.168.1.4 status

set -euo pipefail
cd "$(dirname "$0")"

SCRIPT_DIR="$(pwd)"
DAEMON_SRC="$SCRIPT_DIR/root-daemon/90-vibehack-homewatch.sh"
SWAP_SRC="$SCRIPT_DIR/root-daemon/80-enable-swap.sh"
INIT_DIR="/var/lib/webosbrew/init.d"
DAEMON_DEST="$INIT_DIR/90-vibehack-homewatch.sh"
SWAP_DEST="$INIT_DIR/80-enable-swap.sh"

# Determine target TV IP
TARGET_IP="${1:-${TV_HOST:-${TV_IP:-192.168.1.4}}}"
ACTION="${2:-install}"

# If first argument is an action like "install" or "status"
if [[ "$TARGET_IP" =~ ^(install|start|stop|restart|status|uninstall)$ ]]; then
    ACTION="$TARGET_IP"
    TARGET_IP="${TV_HOST:-${TV_IP:-192.168.1.4}}"
fi

# Detect SSH key
SSH_KEY="${SSH_KEY:-}"
if [ -z "$SSH_KEY" ]; then
    for candidate in "/home/min/${TARGET_IP}.key" "/home/min/slopbro/${TARGET_IP}.key" "/home/min/192.168.1.4.key" "$HOME/.ssh/id_rsa"; do
        if [ -f "$candidate" ]; then
            SSH_KEY="$candidate"
            break
        fi
    done
fi

SSH_OPTS=(-o ConnectTimeout=5 -o StrictHostKeyChecking=no)
[ -n "$SSH_KEY" ] && SSH_OPTS+=(-i "$SSH_KEY")

# Check which port works (22 for webosbrew, 9922 for developer mode)
SSH_PORT="${SSH_PORT:-}"
find_ssh_port() {
    if [ -n "$SSH_PORT" ]; then return 0; fi
    for p in 22 9922; do
        if ssh "${SSH_OPTS[@]}" -p "$p" "root@$TARGET_IP" "true" 2>/dev/null; then
            SSH_PORT="$p"
            return 0
        fi
    done
    return 1
}

run_ssh() {
    ssh "${SSH_OPTS[@]}" -p "$SSH_PORT" "root@$TARGET_IP" "$@"
}

copy_scp() {
    scp "${SSH_OPTS[@]}" -P "$SSH_PORT" "$1" "root@$TARGET_IP:$2"
}

echo "==> Target TV: root@$TARGET_IP (Action: $ACTION)"

if ! find_ssh_port; then
    echo "ERROR: Unable to reach TV via SSH on $TARGET_IP (ports 22 or 9922)."
    echo "Please check if the TV is powered on and connected to the network."
    exit 1
fi
echo "==> Connected to TV on port $SSH_PORT"

case "$ACTION" in
    install)
        echo "==> Packaging updated overlay app..."
        rm -rf build && mkdir -p build
        if command -v ares-package >/dev/null; then
            ares-package app -o build
        else
            npx -y -p @webos-tools/cli ares-package app -o build
        fi

        IPK_FILE=$(ls build/com.gathin.tvhome_*.ipk 2>/dev/null | head -n 1)
        if [ -f "$IPK_FILE" ]; then
            echo "==> Deploying overlay app to TV..."
            copy_scp "$IPK_FILE" "/tmp/app.ipk"
            run_ssh "luna-send -i -f luna://com.webos.appInstallService/dev/install '{\"id\":\"com.gathin.tvhome\",\"ipkUrl\":\"/tmp/app.ipk\"}' 2>&1" || true
        fi

        echo "==> Creating init directory if needed..."
        run_ssh "mkdir -p $INIT_DIR"

        echo "==> Deploying swap helper to prevent OOM kills..."
        copy_scp "$SWAP_SRC" "$SWAP_DEST"
        run_ssh "chmod +x $SWAP_DEST && $SWAP_DEST"

        echo "==> Copying daemon script to $DAEMON_DEST..."
        copy_scp "$DAEMON_SRC" "$DAEMON_DEST"

        echo "==> Setting executable permissions..."
        run_ssh "chmod +x $DAEMON_DEST"

        echo "==> Starting daemon on TV..."
        run_ssh "$DAEMON_DEST restart"

        echo "==> Checking status..."
        run_ssh "$DAEMON_DEST status"

        echo ""
        echo "=========================================================="
        echo " SUCCESS! Your custom menu is now configured as an OVERLAY"
        echo " and the root daemon & swap are active on the TV."
        echo " Pressing Menu / Home will no longer kill your active app!"
        echo "=========================================================="
        ;;

    start)
        echo "==> Starting daemon on TV..."
        run_ssh "$DAEMON_DEST start"
        run_ssh "$DAEMON_DEST status"
        ;;

    stop)
        echo "==> Stopping daemon on TV..."
        run_ssh "$DAEMON_DEST stop"
        ;;

    restart)
        echo "==> Restarting daemon on TV..."
        run_ssh "$DAEMON_DEST restart"
        run_ssh "$DAEMON_DEST status"
        ;;

    status)
        echo "==> Checking daemon status on TV..."
        run_ssh "$DAEMON_DEST status"
        ;;

    uninstall)
        echo "==> Stopping daemon..."
        run_ssh "$DAEMON_DEST stop" || true
        echo "==> Removing daemon and swap scripts..."
        run_ssh "rm -f $DAEMON_DEST $SWAP_DEST /tmp/vibehack-homewatch.pid /tmp/vibehack-homewatch.log"
        echo "Daemon uninstalled."
        ;;

    *)
        echo "Unknown action: $ACTION. Supported: install, start, stop, restart, status, uninstall"
        exit 1
        ;;
esac
