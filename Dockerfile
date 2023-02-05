# Install dependencies only when needed
FROM node:16-alpine as builder

RUN apk add make g++ alpine-sdk python3 py3-pip   
WORKDIR  /app
COPY . .
RUN npm i pnpm -g 
RUN cd icalingua-bridge-oicq && \ 
    pnpm i && \
    pnpm compile

# Production image, copy all the files and run next
FROM node:16-alpine as runner

WORKDIR /app
RUN apk add ffmpeg alpine-sdk python3 py3-pip curl
COPY --from=builder /app/icalingua-bridge-oicq ./
RUN npm i
COPY --from=builder /app/node_modules/@icalingua ./node_modules/@icalingua
RUN apk del alpine-sdk python3 py3-pip
ENV TZ=Asia/Shanghai

EXPOSE 6789

CMD echo "icalingua-bridge-oicq Image." && sh