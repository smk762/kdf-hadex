# Use the official Komodo DeFi Framework image
FROM komodoofficial/komodo-defi-framework:dev-latest

# Install required tools for HA integration
RUN apt-get update && apt-get install -y curl jq xz-utils \
    && rm -rf /var/lib/apt/lists/*

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
    && rm /tmp/s6-overlay-*.tar.xz

# Copy our service files + init scripts + config files AFTER s6-overlay installation
COPY rootfs/ /

# Fix permissions for init scripts and service files
RUN chmod +x /etc/cont-init.d/* /etc/services.d/kdf/* /usr/local/bin/kdf-version

# Expose KDF RPC port
EXPOSE 7783

# Use s6-overlay as entrypoint for HA addon compatibility
ENTRYPOINT ["/init"]