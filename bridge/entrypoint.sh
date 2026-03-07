#!/bin/bash
set -e

export DISPLAY=:0

# Start virtual display
Xvfb :0 -screen 0 1024x768x24 &
sleep 2

# Start MetaTrader 5 terminal
MT5_PATH=$(find /root/.wine -name "terminal64.exe" 2>/dev/null | head -1)
if [ -z "$MT5_PATH" ]; then
    MT5_PATH=$(find /root/.wine -name "terminal.exe" 2>/dev/null | head -1)
fi

if [ -n "$MT5_PATH" ]; then
    echo "Starting MT5 terminal: $MT5_PATH"
    wine "$MT5_PATH" /portable &
    sleep 10
else
    echo "WARNING: MT5 terminal not found"
fi

# Start bridge server (it spawns the Wine Python worker internally)
cd /app
exec python3 bridge_server.py