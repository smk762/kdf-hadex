# Web build stage
FROM node:20-alpine AS web-build
WORKDIR /app

# copy web sources and install dependencies
COPY rootfs/www/package.json rootfs/www/package-lock.json* ./
COPY rootfs/www/ ./

# required build tools for some native deps (kept minimal)
RUN apk add --no-cache python3 make g++ || true

RUN npm ci --no-audit --no-fund
# generate Lit CSS module and build
RUN npm run gen-styles && npm run build

# Use the official Komodo DeFi Framework image as the runtime base
ARG BUILD_FROM
FROM ${BUILD_FROM:-komodoofficial/komodo-defi-framework:dev-latest}

# Install required tools for HA integration
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        jq \
        xz-utils \
        python3 \
        python3-venv \
        python3-pip \
        python3-yaml \
        python3-requests; \
    rm -rf /var/lib/apt/lists/*; \
    apt-get clean; \
    :

# Create virtual environment and install pykomodefi, PyYAML and requests
RUN python3 -m venv /opt/kdf-venv \
    && /opt/kdf-venv/bin/pip install --upgrade pip setuptools wheel --no-cache-dir \
    && /opt/kdf-venv/bin/pip install --no-cache-dir pykomodefi PyYAML requests fastapi "uvicorn[standard]"

# Install bashio for Home Assistant integration
RUN set -eux; \
    mkdir -p /tmp; \
    curl --fail --show-error -L -o /tmp/bashio.tar.gz "https://github.com/hassio-addons/bashio/archive/v0.16.2.tar.gz"; \
    mkdir -p /tmp/bashio; \
    tar zxvf /tmp/bashio.tar.gz --strip 1 -C /tmp/bashio; \
    mv /tmp/bashio/lib /usr/lib/bashio; \
    ln -sf /usr/lib/bashio/bashio /usr/bin/bashio; \
    rm -fr /tmp/bashio.tar.gz /tmp/bashio

# Create data directory for logs
RUN mkdir -p /data/logs \
    && chmod 700 /data/logs

# Install s6-overlay for process management (to match HA addon expectations)
ARG S6_OVERLAY_VERSION=3.1.6.2
RUN set -eux; \
    curl --fail --show-error -L -o /tmp/s6-overlay-noarch.tar.xz "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz"; \
    curl --fail --show-error -L -o /tmp/s6-overlay-x86_64.tar.xz "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-x86_64.tar.xz"; \
    tar -C / -Jxpf /tmp/s6-overlay-noarch.tar.xz; \
    tar -C / -Jxpf /tmp/s6-overlay-x86_64.tar.xz; \
    rm -f /tmp/s6-overlay-*.tar.xz

# Copy our service files + init scripts + config files AFTER s6-overlay installation
COPY rootfs/ /

# Copy built web files from the web-build stage into the runtime location
# dist contains production bundles; vendor and styles are copied as well
COPY --from=web-build /app/dist /root/www/dist
COPY --from=web-build /app/vendor /root/www/vendor
COPY --from=web-build /app/kdf-styles.css /root/www/kdf-styles.css
COPY --from=web-build /app/panel.html /root/www/panel.html
COPY --from=web-build /app/panel.html /root/www/dist/index.html

# Ensure /root/www exists and set sane permissions on copied files
RUN mkdir -p /root/www; \
    find /root/www -type f -exec chmod 644 {} + || true; \
    find /root/www -type d -exec chmod 755 {} + || true

# Fix permissions for init scripts and service files
RUN set -ex; \
    # make init scripts executable where present (ignore missing ones) ;\
    for d in /etc/cont-init.d /etc/services.d/kdf /etc/services.d/ha-integration /etc/services.d/panel-server; do \
      [ -d "$d" ] && chmod -R 750 "$d" || true; \
    done; \
    # make service scripts executable (ignore if missing) ;\
    for f in /usr/local/bin/kdf-ha-integration.py /usr/local/bin/panel-server.py /usr/local/bin/configure-panel.py /usr/local/bin/test-panel-server.py; do \
      [ -f "$f" ] && chmod 750 "$f" || true; \
    done; \
    # harden common directories
    chmod -R go-w /etc/cont-init.d || true

# Expose KDF RPC port and ingress port
EXPOSE 7783 8099

# Use s6-overlay as entrypoint for HA addon compatibility
ENTRYPOINT ["/init"]