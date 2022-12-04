FROM node:16-alpine 
WORKDIR /app
COPY . .
RUN apk add ffmpeg mongodb-tools fish make gcc g++ alpine-sdk python3 py3-pip
RUN npm i -g pnpm
RUN pnpm install
RUN pnpm compile

ENV TZ=Asia/Shanghai

EXPOSE 6789

CMD echo "icalingua-bridge-oicq Image." && sh