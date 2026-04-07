FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /runner

# Install the VNC stack (only active when STREAM_BROWSER=true at runtime).
# Even when not used, apt packages add ~250MB to the image — one-time cost
# in exchange for letting users enable live browser streaming on demand.
#
# - tigervnc-standalone-server: Xvfb + VNC server in one process (Xtigervnc)
# - novnc + websockify: HTML5 VNC client and the WebSocket-to-VNC bridge
# - dbus-x11: prevents dbus warnings from firefox/chrome under X11
# - fluxbox: a tiny window manager so browser windows have a title bar
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    tigervnc-standalone-server \
    tigervnc-common \
    novnc \
    websockify \
    dbus-x11 \
    fluxbox \
    xterm \
    pcmanfm \
    tint2 \
    && rm -rf /var/lib/apt/lists/*

# Hide the noVNC status bar so the iframe shows ONLY the remote desktop.
# Injects a <style> block right before </head> in vnc_lite.html. The block
# also normalises body margins so the canvas fills the viewport edge-to-edge.
RUN sed -i 's|</head>|<style>#noVNC_status_bar{display:none !important;}html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden;}#noVNC_container{height:100vh !important;}</style></head>|' /usr/share/novnc/vnc_lite.html

# Install cucumber + ts-node for TypeScript step definitions
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy runner support code
COPY tsconfig.json ./
COPY support ./support
COPY parse-results.js ./
COPY stream-results.js ./
COPY run.sh ./

RUN chmod +x /runner/run.sh

# The user mounts their tests at /project
# Results are written to /results
# When STREAM_BROWSER=true, noVNC listens on port 6080 (proxied by the platform API)
ENTRYPOINT ["/bin/sh", "/runner/run.sh"]
