FROM node:16-alpine 
WORKDIR /app
RUN apk add ffmpeg mongodb-tools make gcc g++ alpine-sdk python3 py3-pip  && \
    rm -rf * && \
    git clone https://github.com/Icalingua-plus-plus/Icalingua-plus-plus.git --depth 1  && \
    cd Icalingua-plus-plus && \
    ls | grep -v  "icalingua-bridge-oicq" | grep -v "package*" | grep -v "pnpm*" | awk  '{system("rm -rf "$1)}' && \
    cd icalingua-bridge-oicq && \
    npm i pnpm -g && \
    pnpm i && \
    pnpm compile

ENV TZ=Asia/Shanghai

EXPOSE 6789

CMD echo "icalingua-bridge-oicq Image." && sh