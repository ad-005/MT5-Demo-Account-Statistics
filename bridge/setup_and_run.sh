#!/bin/bash
set -e

# Start Xvfb
rm -f /tmp/.X0-lock 2>/dev/null || true
Xvfb :0 -screen 0 1024x768x24 &
sleep 2
export DISPLAY=:0

echo "=== Initializing Wine prefix ==="
wineboot --init 2>/dev/null || true
wineserver -w 2>/dev/null || true
echo "Wine prefix ready."

# Copy embedded Python into Wine's C: drive
WINPYTHON_DIR="/root/.wine/drive_c/Python312"
if [ ! -d "$WINPYTHON_DIR" ]; then
    echo "=== Setting up Windows Python ==="
    cp -r /opt/winpython "$WINPYTHON_DIR"

    PTH_FILE="$WINPYTHON_DIR/python312._pth"
    if [ -f "$PTH_FILE" ]; then
        sed -i 's/#import site/import site/' "$PTH_FILE"
    fi

    echo "=== Installing pip ==="
    wine "$WINPYTHON_DIR/python.exe" "$WINPYTHON_DIR/get-pip.py" --no-warn-script-location 2>/dev/null || true
    wineserver -w 2>/dev/null || true

    echo "=== Installing MetaTrader5 package ==="
    wine "$WINPYTHON_DIR/python.exe" -m pip install "numpy<2" MetaTrader5 --no-warn-script-location 2>/dev/null || true
    wineserver -w 2>/dev/null || true
    echo "Windows Python setup complete."
else
    echo "Windows Python already set up."
fi

export WINE_PYTHON="wine C:\\\\Python312\\\\python.exe"

# Install MT5 terminal if not present
MT5_PATH=$(find /root/.wine -name "terminal64.exe" 2>/dev/null | head -1)
if [ -z "$MT5_PATH" ]; then
    echo "=== Installing MT5 terminal (this may take a few minutes) ==="
    wine /mt5/mt5setup.exe /auto 2>/dev/null &
    INSTALLER_PID=$!

    for i in $(seq 1 180); do
        sleep 1
        MT5_PATH=$(find /root/.wine -name "terminal64.exe" 2>/dev/null | head -1)
        if [ -n "$MT5_PATH" ]; then
            echo "MT5 terminal installed: $MT5_PATH (took ${i}s)"
            break
        fi
    done

    # Kill installer and reset Wine (don't use wineserver -w, it blocks forever)
    kill $INSTALLER_PID 2>/dev/null || true
    wineserver -k 2>/dev/null || true
    sleep 2

    if [ -z "$MT5_PATH" ]; then
        echo "WARNING: MT5 terminal not found after install."
    fi
fi

# Start MT5 terminal
echo "=== Starting MT5 terminal ==="
MT5_PATH=$(find /root/.wine -name "terminal64.exe" 2>/dev/null | head -1)
if [ -z "$MT5_PATH" ]; then
    MT5_PATH=$(find /root/.wine -name "terminal.exe" 2>/dev/null | head -1)
fi

if [ -n "$MT5_PATH" ]; then
    echo "Starting MT5: $MT5_PATH"
    wine "$MT5_PATH" /portable &
    sleep 15
else
    echo "WARNING: MT5 terminal not available."
fi

echo "=== Starting bridge server ==="
exec python3 /app/bridge_server.py
