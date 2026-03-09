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
    rm -f /tmp/.X98-lock && \
    Xvfb :98 -screen 0 1024x768x24 & XVFB_PID=$! && sleep 1 && \
    export DISPLAY=:98 && \
    cd "$MT5_DIR" && \
    (wine "$METAEDITOR" /compile:"MQL5\\Experts\\DataExporter.mq5" /log 2>/dev/null || true) && \
    (wineserver -w 2>/dev/null || true) && \
    (kill $XVFB_PID 2>/dev/null || true) && \
    if [ -f "$EXPERTS_DIR/DataExporter.ex5" ]; then \
        echo "EA pre-compiled successfully."; \
    else \
        echo "WARNING: EA pre-compilation failed, will compile at runtime."; \
    fi

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