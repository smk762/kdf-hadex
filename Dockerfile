# Use the official Komodo DeFi Framework image
FROM komodoofficial/komodo-defi-framework:dev-latest

# Install required tools for HA integration
RUN apt-get update && apt-get install -y \
        curl \
        jq \
        xz-utils \
        ca-certificates \
        python3 \
        python3-pip \
        python3-venv \
        python3-yaml \
        python3-requests \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create virtual environment and install pykomodefi, PyYAML and requests
RUN python3 -m venv /opt/kdf-venv \
    && /opt/kdf-venv/bin/pip install --upgrade pip \
    && /opt/kdf-venv/bin/pip install pykomodefi PyYAML requests

# Install bashio for Home Assistant integration
RUN curl -J -L -o /tmp/bashio.tar.gz \
        "https://github.com/hassio-addons/bashio/archive/v0.16.2.tar.gz" \
    && mkdir /tmp/bashio \
    && tar zxvf /tmp/bashio.tar.gz --strip 1 -C /tmp/bashio \
    && mv /tmp/bashio/lib /usr/lib/bashio \
    && ln -s /usr/lib/bashio/bashio /usr/bin/bashio \
    && rm -fr /tmp/bashio.tar.gz /tmp/bashio

# Create data directory for logs
RUN mkdir -p /data/logs

# Install s6-overlay for process management (to match HA addon expectations)
ARG S6_OVERLAY_VERSION=3.1.6.2
RUN curl -L -o /tmp/s6-overlay-noarch.tar.xz \
        "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz" \
    && curl -L -o /tmp/s6-overlay-x86_64.tar.xz \
        "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-x86_64.tar.xz" \
    && tar -C / -Jxpf /tmp/s6-overlay-noarch.tar.xz \
    && tar -C / -Jxpf /tmp/s6-overlay-x86_64.tar.xz \
    && rm -f /tmp/s6-overlay-*.tar.xz

# Copy our service files + init scripts + config files AFTER s6-overlay installation
COPY rootfs/ /

# Copy web files to the runtime location
RUN mkdir -p /root/www && \
    if [ -d /www ]; then \
        cp -r /www/* /root/www/; \
        chmod -R 644 /root/www/*; \
        echo "Web files copied to /root/www/"; \
        ls -la /root/www/; \
    else \
        echo "Warning: /www directory not found during build"; \
        echo "Available directories:"; \
        ls -la /; \
    fi

# Fix permissions for init scripts and service files
RUN set -ex && \
    # chmod only existing service directories (ignore missing ones) \
    for d in /etc/cont-init.d /etc/services.d/kdf /etc/services.d/ha-integration /etc/services.d/panel-server; do \
      [ -d "$d" ] && chmod -R +x "$d" || true; \
    done && \
    # make scripts executable (these should exist in image) \
    chmod +x /usr/local/bin/kdf-version /usr/local/bin/kdf-ha-integration.py /usr/local/bin/panel-server.py /usr/local/bin/configure-panel.py /usr/local/bin/test-panel-server.py || true


# Expose KDF RPC port and ingress port
EXPOSE 7783
EXPOSE 8099

# Use s6-overlay as entrypoint for HA addon compatibility
ENTRYPOINT ["/init"]