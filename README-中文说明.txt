Pello / Ring Rush 中文说明

项目目标
- 提供一个休闲弹棋 1v1 游戏。
- 支持 Android APK、网页版在线对战、本地和 AI 训练。
- 支持金币入场和赢家奖励，对外页面只展示花费和获得。
- 支持官网、在线游戏、管理后台和后端服务一键部署。

主要入口
- 官网：/
- 在线游戏：/online.html
- 管理后台：/admin.html
- APK 下载：/download/Pello.apk
- 健康检查：/api/competitive/health

本地启动
1. 安装依赖：npm install
2. 启动 Vite：npm run dev
3. 打开官网：http://127.0.0.1:5173/
4. 打开游戏：http://127.0.0.1:5173/online.html
5. 打开管理后台：http://127.0.0.1:5173/admin.html

后端启动
1. cd server
2. npm install
3. node server.js
4. 默认地址：http://127.0.0.1:3000

管理后台
- 部署脚本会生成或复用 PELLO_ADMIN_TOKEN。
- 管理页需要输入 token 才能访问用户数据。
- 可查看用户、删除用户、重置用户、增加金币、设置余额和重置余额。
- 管理操作会先清理队列和活跃对局，避免保留错误的 reserved 金币。

测试
- npm run build
- npm run test:game-ai
- npm run test:competitive
- npm run test:apk-size

Android 内部测试 APK
- npm run android:build:debug:local
- 构建输出：android/app/build/outputs/apk/debug/app-debug.apk
- 官网下载包：public/download/Pello.apk
- 构建脚本会避免把 public/download/Pello.apk 再打进 APK 内部。

服务器部署
1. 从 GitHub 拉取 codex/pello 分支。
2. 在项目根目录执行：sudo bash deploy.sh
3. 默认公网域名：https://pello.xincreates.com
4. 脚本会优先寻找空闲端口，只让 Pello 占用最终打印的一个 Node 端口。
5. 脚本会停止旧的 Pello 服务或旧 Pello 进程，但不会停止服务器上的其他服务。
6. 默认不配置 nginx，适合 Cloudflare Tunnel。
7. Cloudflare Tunnel 需要指向脚本打印的地址，例如：http://127.0.0.1:3003
8. 脚本会打印官网、游戏、管理后台、健康检查、APK 地址和管理 token。

如果服务器要自己使用 nginx 和证书：
- sudo SETUP_NGINX=1 SSL_EMAIL=你的邮箱 bash deploy.sh

注意
- Pello 服务只应该占用部署脚本最终打印的一个 Node 端口。
- 官网公开页面只展示游戏介绍、玩法、截图、在线试玩和 APK 下载，不展示部署说明。
- 当前 APK 是内部测试安装包，正式上架前还需要 release 签名和 AAB。
- 当前竞技数据默认使用 JSON 文件保存，大规模上线前建议迁移到数据库。
