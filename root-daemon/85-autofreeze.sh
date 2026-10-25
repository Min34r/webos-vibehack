#!/bin/sh
# /var/lib/webosbrew/init.d/85-autofreeze.sh
# Autostart wrapper for autofreeze daemon on rooted LG webOS TV

JS_FILE="/var/lib/webosbrew/autofreeze.js"
PID_FILE="/tmp/autofreeze.pid"
LOG_FILE="/tmp/autofreeze.log"

case "$1" in
    stop)
        if [ -f "$PID_FILE" ]; then
            pid=$(cat "$PID_FILE" 2>/dev/null)
            [ -n "$pid" ] && kill "$pid" 2>/dev/null
            rm -f "$PID_FILE"
        fi
        ;;
    status)
        if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE" 2>/dev/null)" 2>/dev/null; then
            echo "Autofreeze is RUNNING (PID: $(cat "$PID_FILE"))."
            tail -n 10 "$LOG_FILE" 2>/dev/null
        else
            echo "Autofreeze is STOPPED."
        fi
        ;;
    *)
        # Default start
        if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE" 2>/dev/null)" 2>/dev/null; then
            exit 0
        fi
        [ -f "$JS_FILE" ] || exit 1
        node "$JS_FILE" >> "$LOG_FILE" 2>&1 &
        echo "$!" > "$PID_FILE"
        ;;
esac
