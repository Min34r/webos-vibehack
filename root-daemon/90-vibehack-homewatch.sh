#!/bin/sh
# /var/lib/webosbrew/init.d/90-vibehack-homewatch.sh
# Native on-device Home button watcher & menu launcher for rooted LG webOS TVs.
# Runs directly on the TV under webosbrew init, consuming ~0% CPU and < 1MB RAM.

CONF_FILE="/var/lib/webosbrew/homewatch.conf"
[ -f "$CONF_FILE" ] && . "$CONF_FILE"

LAUNCHER="${LAUNCHER:-com.gathin.tvhome}"
LG_HOME="${LG_HOME:-com.webos.app.home}"
ESCAPE_MS="${ESCAPE_MS:-3000}"
PID_FILE="/tmp/vibehack-homewatch.pid"
LOG_FILE="/tmp/vibehack-homewatch.log"

get_uptime_ms() {
    read -r _up _ < /proc/uptime 2>/dev/null || { echo 0; return; }
    _int="${_up%.*}"
    _dec="${_up#*.}00"
    _cs="${_dec:0:2}"
    echo "$(( _int * 1000 + _cs * 10 ))"
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

run_daemon() {
    echo "$$" > "$PID_FILE"
    log "Starting on-device Home watcher (PID: $$)..."
    log "Config: LAUNCHER=$LAUNCHER, ESCAPE_MS=${ESCAPE_MS}ms"

    last_launch=0

    # Trap termination signals to clean up cleanly
    trap 'log "Terminating watcher..."; rm -f "$PID_FILE"; exit 0' INT TERM QUIT

    while true; do
        log "Subscribing to foreground app events via Luna bus..."
        
        # Subscribe to application manager events
        luna-send -i 'luna://com.webos.service.applicationmanager/getForegroundAppInfo' '{"subscribe":true}' 2>/dev/null | while read -r line; do
            case "$line" in
                *'"appId":"'"$LG_HOME"'"'*)
                    now=$(get_uptime_ms)
                    diff=$(( now - last_launch ))

                    if [ "$last_launch" -gt 0 ] && [ "$diff" -lt "$ESCAPE_MS" ]; then
                        log "Double-press detected (${diff}ms < ${ESCAPE_MS}ms) - allowing native LG Home"
                        last_launch=0
                        continue
                    fi

                    last_launch=$now
                    log "LG Home detected -> launching $LAUNCHER"
                    luna-send -n 1 'luna://com.webos.service.applicationmanager/launch' "{\"id\":\"$LAUNCHER\"}" >/dev/null 2>&1
                    ;;
            esac
        done

        log "Luna subscription stream disconnected. Retrying in 2 seconds..."
        sleep 2
    done
}

start_daemon() {
    if [ -f "$PID_FILE" ]; then
        pid=$(cat "$PID_FILE" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "Home watcher is already running (PID: $pid)."
            return 0
        fi
        rm -f "$PID_FILE"
    fi

    # Rotate log if it exceeds 64KB
    if [ -f "$LOG_FILE" ] && [ "$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)" -gt 65536 ]; then
        tail -n 100 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
    fi

    "$0" _foreground >> "$LOG_FILE" 2>&1 &
    bg_pid=$!
    echo "$bg_pid" > "$PID_FILE"
    echo "Home watcher started (PID: $bg_pid)."
}

stop_daemon() {
    if [ -f "$PID_FILE" ]; then
        pid=$(cat "$PID_FILE" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "Stopping Home watcher (PID: $pid)..."
            kill "$pid" 2>/dev/null
            sleep 1
            kill -9 "$pid" 2>/dev/null
        fi
        rm -f "$PID_FILE"
        echo "Home watcher stopped."
    else
        echo "Home watcher is not running."
    fi
}

status_daemon() {
    if [ -f "$PID_FILE" ]; then
        pid=$(cat "$PID_FILE" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "Home watcher is RUNNING (PID: $pid)."
            echo "--- Recent Log Entries (/tmp/vibehack-homewatch.log) ---"
            tail -n 15 "$LOG_FILE" 2>/dev/null || echo "No logs yet."
            return 0
        fi
    fi
    echo "Home watcher is STOPPED."
    return 1
}

case "$1" in
    start)
        start_daemon
        ;;
    stop)
        stop_daemon
        ;;
    restart)
        stop_daemon
        sleep 1
        start_daemon
        ;;
    status)
        status_daemon
        ;;
    _foreground)
        run_daemon
        ;;
    *)
        # Default action when invoked by webosbrew /init.d during boot
        start_daemon
        ;;
esac
