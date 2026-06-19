Pello / Ring Rush 中文说明

项目目标：
- 提供一个休闲弹棋 1v1 游戏。
- 支持 Android APK、网页在线对战、本地 AI 训练。
- 支持金币入场、赢家奖励、平台服务费。
- 支持整站和后端服务一起部署。

主要入口：
- 官网：首页 /
- 在线游戏：/online.html
- APK 下载：/download/pello-debug.apk
- 健康检查：/api/competitive/health

本地启动：
1. 安装依赖：npm install
2. 启动 Vite：npm run dev
3. 打开官网：http://127.0.0.1:5173/
4. 打开游戏：http://127.0.0.1:5173/online.html

后端启动：
1. cd server
2. npm install
3. node server.js
4. 默认地址：http://127.0.0.1:3000

测试：
- npm run test:game-ai
- npm run test:competitive
- npm run build

Android debug APK：
- npm run android:build:debug:local
- 输出文件：android/app/build/outputs/apk/debug/app-debug.apk

服务器部署：
1. 写入服务器地址：
   npm run app-server:write-env
2. 构建网站和游戏：
   npm run build
3. 启动服务：
   NODE_ENV=production PORT=3000 HOST=0.0.0.0 npm run server:start
4. 反向代理需要同时支持 HTTP 和 WebSocket。

注意：
- 当前 APK 下载路由默认读取 debug APK。
- 正式发布 Play Store 前还需要 release 签名和 AAB。
- 当前竞技数据默认使用 JSON 文件保存，大规模上线前建议替换为数据库。
