# Background worker image (pg-boss jobs: scans, reports, emails, webhooks). Needs Chromium.
# Build from the repository root so the fix guides in packages/ are included:
#   docker build -f backend/Dockerfile -t worker .
FROM node:24-bookworm-slim

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund
# Chromium plus the system libraries it needs, matching the installed Playwright version.
RUN npx playwright install --with-deps chromium

COPY backend/ ./
COPY packages/fix-guides/guides /app/packages/fix-guides/guides
RUN npm run build && npm prune --omit=dev && chown -R node:node /app

ENV NODE_ENV=production
USER node
CMD ["node", "dist/worker/index.js"]
