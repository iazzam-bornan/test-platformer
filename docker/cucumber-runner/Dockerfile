FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /runner

# Install cucumber + ts-node for TypeScript step definitions
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy runner support code
COPY tsconfig.json ./
COPY support ./support
COPY parse-results.js ./
COPY run.sh ./

RUN chmod +x /runner/run.sh

# The user mounts their tests at /project
# Results are written to /results
ENTRYPOINT ["/bin/sh", "/runner/run.sh"]
