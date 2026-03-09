#!/bin/bash
set -e

# Skip wineboot --init if Wine prefix already exists (pre-built in image).
# Under QEMU, wineboot --init takes 30-60s even on an existing prefix.
if [ -d "/root/.wine/drive_c" ]; then
    echo "=== Wine prefix already exists, skipping init ==="
else
    echo "=== Initializing Wine prefix ==="
    wineboot --init 2>/dev/null || true
    wineserver -w 2>/dev/null || true
    echo "Wine prefix ready."
fi

# Install MT5 terminal if not present
MT5_PATH=$(find /root/.wine -name "terminal64.exe" 2>/dev/null | head -1)
if [ -z "$MT5_PATH" ]; then
    echo "=== Installing MT5 terminal (this may take a few minutes) ==="
    wine /mt5/mt5setup.exe /auto 2>/dev/null &
    INSTALLER_PID=$!

    # Wait for terminal64.exe to appear
    for i in $(seq 1 180); do
        sleep 1
        MT5_PATH=$(find /root/.wine -name "terminal64.exe" 2>/dev/null | head -1)
        if [ -n "$MT5_PATH" ]; then
            echo "MT5 terminal found: $MT5_PATH (took ${i}s)"
            break
        fi
    done

    if [ -z "$MT5_PATH" ]; then
        echo "ERROR: MT5 terminal not found after install."
        exit 1
    fi

    # Wait for installer to finish extracting all files (terminal64.exe appears
    # before it's fully written). Poll until installer exits instead of a fixed sleep.
    echo "Waiting for installer to finish..."
    for i in $(seq 1 90); do
        sleep 2
        if ! kill -0 $INSTALLER_PID 2>/dev/null; then
            echo "Installer process exited (waited ~$((i*2))s after terminal64.exe found)"
            break
        fi
    done
    kill $INSTALLER_PID 2>/dev/null || true
    wait $INSTALLER_PID 2>/dev/null || true
    # Kill winemenubuilder — these linger and block wineserver -w indefinitely
    pkill -f winemenubuilder 2>/dev/null || true
    # Timeout wineserver -w to avoid hanging if other Wine processes linger
    timeout 30 wineserver -w 2>/dev/null || true
    echo "MT5 installation complete."
fi

# Derive MT5 directory
MT5_DIR=$(dirname "$MT5_PATH")
export MT5_DIR
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

# Compile EA — skip if pre-compiled .ex5 already exists from build time
if [ -f "$EXPERTS_DIR/DataExporter.ex5" ]; then
    echo "=== EA already compiled (pre-built in image), skipping compilation ==="
else
    echo "=== Compiling DataExporter EA ==="
    # MetaEditor64.exe (note capital letters) ships with MT5
    METAEDITOR="$MT5_DIR/MetaEditor64.exe"
    if [ -f "$METAEDITOR" ]; then
        # MetaEditor /compile expects path relative to MT5 dir; run from MT5_DIR
        cd "$MT5_DIR"
        wine "$METAEDITOR" /compile:"MQL5\\Experts\\DataExporter.mq5" /log 2>/dev/null || true
        wineserver -w 2>/dev/null || true
        cd /app

        # Check if compilation succeeded
        if [ -f "$EXPERTS_DIR/DataExporter.ex5" ]; then
            echo "EA compiled successfully."
        else
            echo "WARNING: MetaEditor compilation failed. Check MQL5/Logs/ for details."
            # Fall back to pre-compiled .ex5 if available
            if [ -f "/app/mql5/DataExporter.ex5" ]; then
                cp /app/mql5/DataExporter.ex5 "$EXPERTS_DIR/"
                echo "Pre-compiled EA copied."
            else
                echo "WARNING: No pre-compiled EA available. EA must be compiled."
            fi
        fi
    else
        echo "WARNING: metaeditor64.exe not found at $METAEDITOR"
        ls -la "$MT5_DIR/"*.exe 2>/dev/null || echo "No .exe files in MT5 dir"
        if [ -f "/app/mql5/DataExporter.ex5" ]; then
            cp /app/mql5/DataExporter.ex5 "$EXPERTS_DIR/"
            echo "Pre-compiled EA copied."
        else
            echo "WARNING: No pre-compiled EA available."
        fi
    fi
fi

# Create auto-login + EA startup config
# Use a path without spaces to avoid Wine quoting issues
CONFIG_FILE="/root/.wine/drive_c/mt5config.ini"
echo "=== Creating startup config ==="
cat > "$CONFIG_FILE" << EOF
[Common]
Login=${MT5_LOGIN:-0}
Password=${MT5_PASSWORD:-}
Server=${MT5_SERVER:-}
[StartUp]
Expert=DataExporter
Symbol=EURUSD
Period=H1
ShutdownTerminal=0
EOF
echo "Config created: login=${MT5_LOGIN:-0}, server=${MT5_SERVER:-}, EA=DataExporter"

# Chart profiles and common.ini are pre-baked in the Docker image.
# Only create them at runtime if missing (fallback for non-prebaked images).
PROFILES_DIR="$MT5_DIR/Profiles/Charts/Default"
COMMON_INI="$MT5_DIR/Config/common.ini"
if [ -f "$PROFILES_DIR/chart01.chr" ] && [ -f "$COMMON_INI" ]; then
    echo "=== Chart profiles and common.ini pre-baked, skipping setup ==="
else
    echo "=== Creating chart profile and common.ini (not pre-baked) ==="
    mkdir -p "$PROFILES_DIR"
    python3 -c "
import codecs
chart = '<chart>\r\nid=1\r\nsymbol=EURUSD\r\nperiod_type=1\r\nperiod_size=1\r\ndigits=5\r\n<expert>\r\nname=DataExporter\r\nflags=339\r\nwindow_num=0\r\n<inputs>\r\n</inputs>\r\n</expert>\r\n<window>\r\nheight=100\r\n<indicator>\r\nname=Main\r\npath=\r\napply=1\r\nshow_data=1\r\n</indicator>\r\n</window>\r\n</chart>\r\n'
with open('$PROFILES_DIR/chart01.chr', 'wb') as f:
    f.write(codecs.BOM_UTF16_LE)
    f.write(chart.encode('utf-16-le'))
print('Chart profile created.')
"
    mkdir -p "$MT5_DIR/Config"
    python3 -c "
import codecs
content = '[Common]\r\nExpertsEnabled=1\r\nExpertsTrades=1\r\n'
with open('$COMMON_INI', 'wb') as f:
    f.write(codecs.BOM_UTF16_LE)
    f.write(content.encode('utf-16-le'))
print('common.ini created with AutoTrading enabled.')
"
fi

# Start MT5 terminal
MT5_PATH=$(find /root/.wine -name "terminal64.exe" 2>/dev/null | head -1)
if [ -z "$MT5_PATH" ]; then
    MT5_PATH=$(find /root/.wine -name "terminal.exe" 2>/dev/null | head -1)
fi

if [ -z "$MT5_PATH" ]; then
    echo "ERROR: MT5 terminal not available."
    exit 1
fi

start_terminal() {
    echo "Starting MT5: $MT5_PATH"
    wine "$MT5_PATH" /portable "/config:C:\\mt5config.ini" &
}

# Start bridge HTTP server immediately — it handles "not ready yet" gracefully
# via its /health endpoint returning {"status": "degraded"} until EA data appears.
echo "=== Starting bridge HTTP server ==="
python3 /app/bridge_server.py &
BRIDGE_PID=$!

start_terminal

# Background watchdog: restart terminal if it dies (e.g., after LiveUpdate)
(
    while true; do
        sleep 30
        if ! pgrep -f terminal64.exe > /dev/null 2>&1; then
            echo "Watchdog: MT5 terminal not running, restarting..."
            start_terminal
        fi
    done
) &
WATCHDOG_PID=$!
echo "Terminal watchdog started (pid=$WATCHDOG_PID)"

# Keep bridge as the foreground process
wait $BRIDGE_PID