FROM node:20-slim

WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy application source
COPY server.js ./
COPY server/ ./server/
COPY public/ ./public/
COPY games/ ./games/
COPY shared/ ./shared/
COPY bot/ ./bot/

# Create userinput directory for runtime data
RUN mkdir -p userinput

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
