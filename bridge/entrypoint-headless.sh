#!/bin/bash
# Minimal headless entrypoint — starts only Xvfb (required by Wine).
# Replaces the base image entrypoint which also launches XRDP, Xfce, Firefox, etc.

set -e

# Start Xvfb on display :0
Xvfb :0 -screen 0 1024x768x24 +extension GLX +render -noreset &
XVFB_PID=$!

# Wait for Xvfb to be ready
for i in $(seq 1 10); do
    if xdpyinfo -display :0 >/dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

export DISPLAY=:0

# Exec CMD (setup_and_run.sh)
exec "$@"
