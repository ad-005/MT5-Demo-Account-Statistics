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

# Create chart profile with EA auto-attached
# MT5 in portable mode uses Profiles/ (not MQL5/Profiles/)
echo "=== Setting up chart profile with DataExporter EA ==="
PROFILES_DIR="$MT5_DIR/Profiles/Charts/Default"
mkdir -p "$PROFILES_DIR"

# Write chart file in UTF-16LE (MT5's native format) with EA attached
python3 -c "
import codecs
chart = '''<chart>
id=1
symbol=EURUSD
period_type=1
period_size=1
digits=5
<expert>
name=DataExporter
flags=339
window_num=0
<inputs>
</inputs>
</expert>
<window>
height=100
<indicator>
name=Main
path=
apply=1
show_data=1
</indicator>
</window>
</chart>
'''
with open('$PROFILES_DIR/chart01.chr', 'wb') as f:
    f.write(codecs.BOM_UTF16_LE)
    f.write(chart.encode('utf-16-le'))
print('Chart profile created with DataExporter EA attached.')
"

# Inject EA into all existing chart profiles (MT5 may have created them during install)
echo "=== Injecting EA into all chart profiles ==="
python3 << 'PYEOF'
import codecs, os, glob

expert_section = """<expert>
name=DataExporter
flags=339
window_num=0
<inputs>
</inputs>
</expert>"""

mt5_dir = os.environ.get("MT5_DIR", "")
if not mt5_dir:
    import subprocess
    result = subprocess.run(["find", "/root/.wine", "-name", "terminal64.exe"], capture_output=True, text=True)
    mt5_dir = os.path.dirname(result.stdout.strip().split("\n")[0]) if result.stdout.strip() else ""

for chr_path in glob.glob(f"{mt5_dir}/Profiles/Charts/*/chart*.chr"):
    try:
        with open(chr_path, "rb") as f:
            raw = f.read()
        # Try UTF-16LE decoding
        try:
            content = raw.decode("utf-16-le").lstrip("\ufeff")
        except:
            content = raw.decode("utf-8", errors="replace")

        if "<expert>" in content:
            continue  # Already has an expert

        # Insert expert section before </chart>
        if "</chart>" in content:
            content = content.replace("</chart>", expert_section + "\n</chart>")
            with open(chr_path, "wb") as f:
                f.write(codecs.BOM_UTF16_LE)
                f.write(content.encode("utf-16-le"))
            print(f"  Injected EA into {os.path.basename(os.path.dirname(chr_path))}/{os.path.basename(chr_path)}")
    except Exception as e:
        print(f"  Warning: could not process {chr_path}: {e}")

print("EA injection complete.")
PYEOF

# Enable AutoTrading in common.ini
echo "=== Enabling AutoTrading in terminal config ==="
COMMON_INI="$MT5_DIR/Config/common.ini"
if [ -f "$COMMON_INI" ]; then
    python3 -c "
import codecs
path = '$COMMON_INI'
with open(path, 'rb') as f:
    raw = f.read()
try:
    content = raw.decode('utf-16-le').lstrip('\ufeff')
except:
    content = raw.decode('utf-8', errors='replace')
if 'ExpertsEnabled' not in content:
    content = content.replace('[Common]', '[Common]\nExpertsEnabled=1\nExpertsTrades=1', 1)
    with open(path, 'wb') as f:
        f.write(codecs.BOM_UTF16_LE)
        f.write(content.encode('utf-16-le'))
    print('AutoTrading enabled in common.ini')
else:
    print('AutoTrading already enabled')
"
else
    echo "WARNING: common.ini not found, creating..."
    python3 -c "
import codecs
content = '[Common]\nExpertsEnabled=1\nExpertsTrades=1\n'
with open('$COMMON_INI', 'wb') as f:
    f.write(codecs.BOM_UTF16_LE)
    f.write(content.encode('utf-16-le'))
print('common.ini created with AutoTrading enabled')
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