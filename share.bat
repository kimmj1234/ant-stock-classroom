@echo off
chcp 65001 >nul
rem 게임 서버를 켜고, 누구나 들어올 수 있는 임시 주소(https://....trycloudflare.com)를 엽니다.
rem 아래에 나오는 trycloudflare.com 주소를 친구에게 보내세요. 이 창을 닫으면 주소가 사라집니다.
cd /d "%~dp0"
start "ant-server" node server.js
cloudflared tunnel --url http://localhost:5000
