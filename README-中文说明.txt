Pello / Ring Rush 中文说明

项目目标：
- 提供一个休闲弹棋 1v1 游戏。
- 支持 Android APK、网页版在线对战、本地和 AI 训练。
- 支持金币入场、赢家奖励、平台服务费。
- 支持官网、在线游戏和后端服务一键部署。

主要入口：
- 官网：首页 /
- 在线游戏：/online.html
- APK 下载：/download/Pello.apk
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

Android 内部测试 APK：
- npm run android:build:debug:local
- 构建输出：android/app/build/outputs/apk/debug/app-debug.apk
- 官网下载包：public/download/Pello.apk

服务器部署：
1. 从 GitHub 拉取 codex/pello 分支。
2. 在项目根目录执行：sudo bash deploy.sh
3. 默认公网域名：https://pello.xincreates.com
4. 如果服务器负责 HTTPS 证书：sudo SSL_EMAIL=你的邮箱 bash deploy.sh

注意：
- 官网公开页面只展示游戏介绍、截图、在线试玩和 APK 下载，不展示部署说明。
- 当前 APK 是内部测试安装包，正式上架前还需要 release 签名和 AAB。
- 当前竞技数据默认使用 JSON 文件保存，大规模上线前建议替换为数据库。
