#!/bin/bash
set -e

echo "=== Initializing Wine prefix ==="
wineboot --init 2>/dev/null || true
wineserver -w 2>/dev/null || true
echo "Wine prefix ready."

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

    # Kill installer and wait for Wine to settle
    kill $INSTALLER_PID 2>/dev/null || true
    sleep 2
    wineserver -k 2>/dev/null || true
    sleep 5

    if [ -z "$MT5_PATH" ]; then
        echo "ERROR: MT5 terminal not found after install."
        exit 1
    fi
fi

# Derive MT5 directory
MT5_DIR=$(dirname "$MT5_PATH")
echo "MT5 directory: $MT5_DIR"

# Set up the MQL5/Files directory path for bridge_server
MT5_FILES_DIR="$MT5_DIR/MQL5/Files"
export MT5_FILES_DIR
echo "MT5 Files directory: $MT5_FILES_DIR"

# Copy EA source to MT5 Experts directory
EXPERTS_DIR="$MT5_DIR/MQL5/Experts"
mkdir -p "$EXPERTS_DIR"
cp /app/mql5/DataExporter.mq5 "$EXPERTS_DIR/"
echo "EA source copied to $EXPERTS_DIR/"

# Compile EA using MetaEditor
echo "=== Compiling DataExporter EA ==="
METAEDITOR=$(find /root/.wine -name "metaeditor64.exe" 2>/dev/null | head -1)
if [ -n "$METAEDITOR" ]; then
    # MetaEditor needs the MQL5 directory path relative to MT5 installation
    wine "$METAEDITOR" /compile:"MQL5\\Experts\\DataExporter.mq5" /log 2>/dev/null || true
    wineserver -w 2>/dev/null || true

    # Check if compilation succeeded
    if [ -f "$EXPERTS_DIR/DataExporter.ex5" ]; then
        echo "EA compiled successfully."
    else
        echo "WARNING: MetaEditor compilation may have failed. Trying with pre-compiled EA..."
        # Fall back to pre-compiled .ex5 if available
        if [ -f "/app/mql5/DataExporter.ex5" ]; then
            cp /app/mql5/DataExporter.ex5 "$EXPERTS_DIR/"
            echo "Pre-compiled EA copied."
        else
            echo "WARNING: No pre-compiled EA available. EA must be compiled."
        fi
    fi
else
    echo "WARNING: metaeditor64.exe not found. Trying pre-compiled EA..."
    if [ -f "/app/mql5/DataExporter.ex5" ]; then
        cp /app/mql5/DataExporter.ex5 "$EXPERTS_DIR/"
        echo "Pre-compiled EA copied."
    else
        echo "WARNING: No pre-compiled EA available."
    fi
fi

# Create auto-login config from env vars
CONFIG_FILE="$MT5_DIR/auto_config.ini"
if [ -n "$MT5_LOGIN" ] && [ -n "$MT5_PASSWORD" ] && [ -n "$MT5_SERVER" ]; then
    echo "=== Creating auto-login config ==="
    cat > "$CONFIG_FILE" << EOF
[Common]
Login=$MT5_LOGIN
Password=$MT5_PASSWORD
Server=$MT5_SERVER
EOF
    echo "Config created for login $MT5_LOGIN on $MT5_SERVER"
fi

# Create chart profile with EA auto-attached
echo "=== Setting up chart profile with DataExporter EA ==="
PROFILES_DIR="$MT5_DIR/MQL5/Profiles/Charts/Default"
mkdir -p "$PROFILES_DIR"

# Write a chart file that auto-attaches the EA
cat > "$PROFILES_DIR/chart01.chr" << 'CHREOF'
<chart>
id=1
symbol=EURUSD
period=60
<expert>
name=DataExporter
flags=339
window_num=0
<inputs>
</inputs>
</expert>
</chart>
CHREOF
echo "Chart profile created with DataExporter EA attached."

# Start MT5 terminal
echo "=== Starting MT5 terminal ==="
MT5_PATH=$(find /root/.wine -name "terminal64.exe" 2>/dev/null | head -1)
if [ -z "$MT5_PATH" ]; then
    MT5_PATH=$(find /root/.wine -name "terminal.exe" 2>/dev/null | head -1)
fi

if [ -n "$MT5_PATH" ]; then
    echo "Starting MT5: $MT5_PATH"
    if [ -f "$CONFIG_FILE" ]; then
        wine "$MT5_PATH" /portable "/config:$CONFIG_FILE" &
    else
        wine "$MT5_PATH" /portable &
    fi
    MT5_PID=$!
    sleep 20

    # Verify terminal is still running
    if kill -0 $MT5_PID 2>/dev/null; then
        echo "MT5 terminal running (pid=$MT5_PID)"
    else
        echo "WARNING: MT5 terminal exited. Retrying..."
        if [ -f "$CONFIG_FILE" ]; then
            wine "$MT5_PATH" /portable "/config:$CONFIG_FILE" &
        else
            wine "$MT5_PATH" /portable &
        fi
        MT5_PID=$!
        sleep 15
        if kill -0 $MT5_PID 2>/dev/null; then
            echo "MT5 terminal running on retry (pid=$MT5_PID)"
        else
            echo "WARNING: MT5 terminal failed to stay running."
        fi
    fi
else
    echo "ERROR: MT5 terminal not available."
    exit 1
fi

# Start bridge HTTP server (Linux Python) in foreground
echo "=== Starting bridge HTTP server ==="
exec python3 /app/bridge_server.py