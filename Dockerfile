# Install dependencies only when needed
FROM node:18-alpine as builder

RUN apk add make g++ alpine-sdk python3 py3-pip   
WORKDIR  /app
COPY . .
RUN corepack enable
RUN cd icalingua-bridge-oicq && \ 
    pnpm i && \
    pnpm compile
ENV NODE_ENV=production
RUN mv /app/icalingua-bridge-oicq/build /tmp/build && cp -f .npmrc /tmp/build/ && cd /tmp/build && pnpm i && rm -f .npmrc

# Production image, copy all the files and run next
FROM node:18-alpine as runner

WORKDIR /app
RUN apk add ffmpeg curl
COPY --from=builder /tmp/build ./build
COPY --from=builder /app/icalingua-bridge-oicq/config.yaml ./
ENV TZ=Asia/Shanghai

EXPOSE 6789

CMD echo "icalingua-bridge-oicq Image." && sh
