FROM node:24-alpine
RUN apk add --no-cache dumb-init
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.js ./
COPY src ./src
COPY gladys-assistant-integration.json ./
ENV NODE_ENV=production
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
