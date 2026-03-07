FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install base tools and add WineHQ staging repo
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        software-properties-common \
        gpg-agent \
        wget \
        cabextract \
        xvfb \
        python3 python3-pip \
        unzip \
        ca-certificates \
    && dpkg --add-architecture i386 \
    && mkdir -pm755 /etc/apt/keyrings \
    && wget -O /etc/apt/keyrings/winehq-archive.key https://dl.winehq.org/wine-builds/winehq.key \
    && wget -NP /etc/apt/sources.list.d/ https://dl.winehq.org/wine-builds/ubuntu/dists/jammy/winehq-jammy.sources \
    && apt-get update \
    && apt-get install -y --install-recommends winehq-staging \
    && rm -rf /var/lib/apt/lists/*

# Install Linux-side Python packages (bridge server)
COPY requirements.txt /app/requirements.txt
RUN pip3 install --no-cache-dir -r /app/requirements.txt

# Download MT5 installer
RUN mkdir -p /mt5 && \
    wget -O /mt5/mt5setup.exe \
        "https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe"

# Download and set up Windows Python (embedded zip)
RUN mkdir -p /opt/winpython && \
    wget -O /tmp/python.zip \
        "https://www.python.org/ftp/python/3.12.3/python-3.12.3-embed-amd64.zip" && \
    unzip /tmp/python.zip -d /opt/winpython && \
    rm /tmp/python.zip && \
    wget -O /opt/winpython/get-pip.py https://bootstrap.pypa.io/get-pip.py

# Copy app files
COPY bridge_server.py /app/bridge_server.py
COPY mt5_worker.py /app/mt5_worker.py
COPY setup_and_run.sh /app/setup_and_run.sh
RUN chmod +x /app/setup_and_run.sh

EXPOSE 8080

ENV WINEDLLOVERRIDES="mscoree,mshtml="
ENV WINEPREFIX=/root/.wine
ENV DISPLAY=:0

CMD ["/app/setup_and_run.sh"]
