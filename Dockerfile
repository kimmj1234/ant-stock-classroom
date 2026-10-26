# 나의 두번째 인생 — 외부 라이브러리 없이 Node만 씀. 데이터(계정·세계·시장)는 /data 에 파일로 저장 → 배포할 때 이 폴더를 꼭 디스크(볼륨)로 연결해야 함
FROM node:24-alpine
WORKDIR /app
COPY . .
ENV HOST=0.0.0.0 PORT=8080 DATA_DIR=/data NODE_ENV=production
VOLUME /data
EXPOSE 8080
CMD ["node", "server.js"]
