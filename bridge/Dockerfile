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

# Copy app files
COPY bridge_server.py /app/bridge_server.py
COPY mql5/ /app/mql5/
COPY setup_and_run.sh /app/setup_and_run.sh
RUN chmod +x /app/setup_and_run.sh

EXPOSE 8080

ENV WINEDLLOVERRIDES="mscoree,mshtml="
ENV WINEPREFIX=/root/.wine
ENV DISPLAY=:0

# Base image entrypoint env vars
ENV RUN_AS_ROOT=yes
ENV USE_XVFB=yes
ENV XVFB_SERVER=:0
ENV XVFB_SCREEN=0
ENV XVFB_RESOLUTION=1024x768x24

# Base image ENTRYPOINT (/usr/bin/entrypoint) handles Xvfb, then execs CMD
CMD ["/app/setup_and_run.sh"]