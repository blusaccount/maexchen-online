FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY package*.json ./
COPY bot/scripts ./bot/scripts
RUN npm ci --omit=dev

COPY . .

RUN addgroup -S app && adduser -S app -G app \
    && chown -R app:app /app

USER app

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
