FROM nginx:alpine

LABEL org.opencontainers.image.source="https://github.com/shamimazmii/neon-dodge"

RUN rm -rf /usr/share/nginx/html/*
COPY dist/ /usr/share/nginx/html/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]