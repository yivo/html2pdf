FROM surnet/alpine-node-wkhtmltopdf:22.22.0-0.12.6-small

RUN apk --no-cache add \
    msttcorefonts-installer \
    fontconfig \
    git \
    ca-certificates \
    ttf-dejavu \
    ttf-droid \
    ttf-freefont \
    ttf-liberation \
    ttf-opensans \
    font-noto \
    font-noto-cjk && \
    update-ms-fonts && \
    update-ca-certificates

COPY fonts /usr/share/fonts

RUN fc-cache -f

ARG NODE_ENV=production
ARG APP_PORT=8080
ENV NODE_ENV=${NODE_ENV} APP_PORT=${APP_PORT} APP_ROOT=/home/app TZ=UTC

EXPOSE $APP_PORT

WORKDIR $APP_ROOT

COPY package.json package-lock.json $APP_ROOT/

RUN npm install --omit=dev

COPY . $APP_ROOT

CMD ["node", "index.js"]
