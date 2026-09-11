FROM node:22-alpine

LABEL org.opencontainers.image.source="https://github.com/shamimazmii/neon-dodge"

WORKDIR /app
COPY server.cjs ./
COPY dist/ ./dist/
RUN mkdir -p /app/data

ENV HOST=0.0.0.0
ENV PORT=80
ENV LEADERBOARD_FILE=/app/data/leaderboard.json

VOLUME ["/app/data"]
EXPOSE 80

CMD ["node", "server.cjs"]
