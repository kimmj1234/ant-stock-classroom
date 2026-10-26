@echo off
chcp 65001 >nul
rem 게임 서버를 켜고, 고정 인터넷 주소(ngrok)로 열어 줍니다. 이 창을 닫으면 서버와 주소가 꺼집니다.
rem 주소: https://dispense-enjoyably-overcoat.ngrok-free.dev  (바뀌지 않음)
cd /d "%~dp0"
start "second-life-server" /min node server.js
ping -n 4 127.0.0.1 >nul
ngrok http 5000 --url=https://dispense-enjoyably-overcoat.ngrok-free.dev
