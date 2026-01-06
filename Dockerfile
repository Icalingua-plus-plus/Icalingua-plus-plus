# Install dependencies only when needed
FROM node:24-alpine as builder

RUN apk add make g++ alpine-sdk python3 py3-pip
WORKDIR  /app
COPY . .
RUN corepack enable
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN --mount=type=cache,id=pnpm,target=/pnpm/store,sharing=locked \
    cd icalingua-bridge-oicq && \
    pnpm i && \
    pnpm build && \
    mv /app/icalingua-bridge-oicq/build /tmp/build && \
    cd /tmp/build && npm i

# Production image, copy all the files and run next
FROM node:24-alpine as runner

WORKDIR /app
RUN apk add ffmpeg curl
COPY --from=builder /tmp/build ./build
ENV TZ=Asia/Shanghai

EXPOSE 6789

CMD echo "icalingua-bridge-oicq Image." && sh
