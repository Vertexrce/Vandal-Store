FROM node:22-alpine
WORKDIR /app

# Use a current npm release and install exactly the dependency versions in package-lock.json.
RUN npm install --global npm@11
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "start"]
