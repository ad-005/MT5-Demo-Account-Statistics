FROM scottyhardy/docker-wine:stable-10.0-20250525

ENV DEBIAN_FRONTEND=noninteractive

# Base image provides Wine stable + Xvfb. Install additional tools.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3 python3-pip python3-venv \
        wget \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Linux-side Python packages in a venv (PEP 668 compliance)
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Download MT5 installer
RUN mkdir -p /mt5 && \
    wget -O /mt5/mt5setup.exe \
        "https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe"

ENV WINEDLLOVERRIDES="mscoree,mshtml="
ENV WINEPREFIX=/root/.wine
ENV DISPLAY=:99

# Pre-install Wine prefix + MT5 terminal at build time.
# This avoids ~2 min of setup on every container start.
# Requires Xvfb since Wine needs a display even headless.
RUN Xvfb :99 -screen 0 1024x768x24 & \
    XVFB_PID=$! && \
    sleep 2 && \
    echo "=== Initializing Wine prefix ===" && \
    wineboot --init 2>/dev/null && \
    wineserver -w 2>/dev/null || true && \
    echo "=== Installing MT5 terminal ===" && \
    wine /mt5/mt5setup.exe /auto 2>/dev/null & \
    INSTALLER_PID=$! && \
    MT5_PATH="" && \
    for i in $(seq 1 300); do \
        sleep 1; \
        MT5_PATH=$(find /root/.wine -name "terminal64.exe" 2>/dev/null | head -1); \
        if [ -n "$MT5_PATH" ]; then \
            echo "MT5 found: $MT5_PATH (took ${i}s)"; \
            break; \
        fi; \
    done && \
    echo "Waiting for installer to finish..." && \
    for i in $(seq 1 120); do \
        sleep 2; \
        if ! kill -0 $INSTALLER_PID 2>/dev/null; then \
            echo "Installer exited (waited ~$((i*2))s after find)"; \
            break; \
        fi; \
    done && \
    kill $INSTALLER_PID 2>/dev/null || true && \
    wait $INSTALLER_PID 2>/dev/null || true && \
    pkill -f winemenubuilder 2>/dev/null || true && \
    timeout 30 wineserver -w 2>/dev/null || true && \
    echo "MT5 installation complete." && \
    kill $XVFB_PID 2>/dev/null || true

# Pre-compile EA at build time
COPY mql5/ /app/mql5/
RUN set -e && \
    MT5_DIR=$(dirname "$(find /root/.wine -name 'terminal64.exe' 2>/dev/null | head -1)") && \
    EXPERTS_DIR="$MT5_DIR/MQL5/Experts" && \
    mkdir -p "$EXPERTS_DIR" && \
    cp /app/mql5/DataExporter.mq5 "$EXPERTS_DIR/" && \
    METAEDITOR="$MT5_DIR/MetaEditor64.exe" && \
    rm -f /tmp/.X99-lock && \
    Xvfb :99 -screen 0 1024x768x24 & XVFB_PID=$! && sleep 2 && \
    wineboot -u 2>/dev/null && \
    timeout 30 wineserver -w 2>/dev/null || true && \
    echo "=== Compiling EA with MetaEditor ===" && \
    cd "$MT5_DIR" && \
    timeout 120 wine "$METAEDITOR" /compile:"MQL5\\Experts\\DataExporter.mq5" /log 2>/dev/null || true && \
    timeout 30 wineserver -w 2>/dev/null || true && \
    kill $XVFB_PID 2>/dev/null || true && \
    if [ -f "$EXPERTS_DIR/DataExporter.ex5" ]; then \
        echo "EA pre-compiled successfully."; \
    else \
        echo "WARNING: EA pre-compilation failed, will compile at runtime."; \
        ls -la "$MT5_DIR/MQL5/Logs/" 2>/dev/null || true; \
    fi

# Pre-bake chart profile, common.ini, and inject EA into existing profiles.
# Saves ~5s on every container startup. Pure filesystem writes — no Wine needed.
RUN set -e && \
    MT5_DIR=$(dirname "$(find /root/.wine -name 'terminal64.exe' 2>/dev/null | head -1)") && \
    echo "Pre-baking configs into: $MT5_DIR" && \
    \
    # 1. Chart profile with EA attached (UTF-16LE with BOM, CRLF line endings)
    PROFILES_DIR="$MT5_DIR/Profiles/Charts/Default" && \
    mkdir -p "$PROFILES_DIR" && \
    python3 -c "
import codecs
chart = '<chart>\r\nid=1\r\nsymbol=EURUSD\r\nperiod_type=1\r\nperiod_size=1\r\ndigits=5\r\n<expert>\r\nname=DataExporter\r\nflags=339\r\nwindow_num=0\r\n<inputs>\r\n</inputs>\r\n</expert>\r\n<window>\r\nheight=100\r\n<indicator>\r\nname=Main\r\npath=\r\napply=1\r\nshow_data=1\r\n</indicator>\r\n</window>\r\n</chart>\r\n'
with open('$PROFILES_DIR/chart01.chr', 'wb') as f:
    f.write(codecs.BOM_UTF16_LE)
    f.write(chart.encode('utf-16-le'))
print('Chart profile pre-baked.')
" && \
    \
    # 2. Inject EA into any chart profiles created during MT5 install
    python3 -c "
import codecs, os, glob
expert_section = '<expert>\r\nname=DataExporter\r\nflags=339\r\nwindow_num=0\r\n<inputs>\r\n</inputs>\r\n</expert>'
for chr_path in glob.glob('$MT5_DIR/Profiles/Charts/*/chart*.chr'):
    try:
        with open(chr_path, 'rb') as f:
            raw = f.read()
        try:
            content = raw.decode('utf-16-le').lstrip('\ufeff')
        except:
            content = raw.decode('utf-8', errors='replace')
        if '<expert>' in content:
            continue
        if '</chart>' in content:
            content = content.replace('</chart>', expert_section + '\r\n</chart>')
            with open(chr_path, 'wb') as f:
                f.write(codecs.BOM_UTF16_LE)
                f.write(content.encode('utf-16-le'))
            print(f'  Injected EA into {os.path.basename(chr_path)}')
    except Exception as e:
        print(f'  Warning: {chr_path}: {e}')
print('EA injection complete.')
" && \
    \
    # 3. common.ini — create fresh with AutoTrading enabled
    mkdir -p "$MT5_DIR/Config" && \
    python3 -c "
import codecs
content = '[Common]\r\nExpertsEnabled=1\r\nExpertsTrades=1\r\n'
with open('$MT5_DIR/Config/common.ini', 'wb') as f:
    f.write(codecs.BOM_UTF16_LE)
    f.write(content.encode('utf-16-le'))
print('common.ini pre-baked with AutoTrading enabled.')
"

# Copy remaining app files
COPY bridge_server.py /app/bridge_server.py
COPY setup_and_run.sh /app/setup_and_run.sh
RUN chmod +x /app/setup_and_run.sh

EXPOSE 8080

# Reset DISPLAY for runtime (base image entrypoint uses :0)
ENV DISPLAY=:0

# Base image entrypoint env vars
ENV RUN_AS_ROOT=yes
ENV USE_XVFB=yes
ENV XVFB_SERVER=:0
ENV XVFB_SCREEN=0
ENV XVFB_RESOLUTION=1024x768x24

# Base image ENTRYPOINT (/usr/bin/entrypoint) handles Xvfb, then execs CMD
CMD ["/app/setup_and_run.sh"]