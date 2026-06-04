# Ring Rush - 架构与开发文档 (Architecture & Development Guide)

## 1. 核心架构模式 (Architecture Pattern)

Ring Rush 采用 **"胖客户端 (Fat Client) + 权威状态广播中心 (Authoritative Broadcast Server)"** 的架构模式。

- **前端 (Fat Client)**: 负责所有的物理引擎计算 (`physics.js`)、AI逻辑 (`ai.js`)、渲染 (`game.js`, `board.js`) 和用户输入处理 (`input.js`)。
- **后端 (`server.js`)**: 不进行物理运算，仅充当 WebSocket 消息的广播中心和房间状态（Room State）的最终权威记录者。

### 为什么采用这种架构？
由于弹珠类游戏对物理碰撞的实时性要求极高（哪怕1帧的延迟都会造成手感变差），所以所有的碰撞计算都在本地进行。当一回合结束并且所有的物理效果静止后，客户端会将自己最终的游戏状态（`getState()`）发送给服务器，服务器再将该状态同步给另一名玩家。

---

## 2. 模块化划分 (Module Breakdown)

为了解决初期 `game.js` 文件过于庞大（超过1100行）的问题，前端代码现已进行了深度的模块化拆分，所有核心系统都拥有了独立的管理器。

- **`src/main.js`**: 游戏入口文件，负责处理屏幕适配和初始化 `StartScreen` 和 `Game`。
- **`src/game.js`**: 游戏主循环（Game Loop），主要负责协调各个 Manager。不再包含具体的 UI 和特殊逻辑。
- **`src/network.js` (NetworkManager)**: 封装 WebSocket 连接、断线重连、以及接收各类服务端指令的逻辑。
- **`src/dice.js` (DiceManager)**: 封装开局摇骰子决定先手的逻辑（包含等待倒计时、平局重掷、在线同步）。
- **`src/chat.js` (ChatManager)**: 封装快捷聊天 UI 渲染和淡出逻辑。
- **`src/modals.js` (ModalManager)**: 封装弹窗 UI（如投降二次确认框）。
- **`src/physics.js` & `src/board.js`**: 处理基于 AABB 的边界检测和圆与圆之间的弹性碰撞 (Restitution)。

---

## 3. 网络同步与断线重连机制 (Network & Reconnection)

在线对战中的状态同步和断线重连是本项目最复杂的系统之一。

### 3.1 同步流程
1. 玩家 A 发射棋子。
2. 玩家 A 本地物理引擎开始运转。同时向服务端发送 `piece_launch` 事件，将棋子初始的速度向量同步给玩家 B。
3. 玩家 B 收到 `piece_launch`，通过自己本地的物理引擎演算轨迹。
4. **权威校验**: 当玩家 A 本地所有棋子静止（`physics.allStopped()`），判定回合结束。玩家 A 调用 `getState()`，将最新的分数、棋子最终坐标发送给服务端 (`update_state`)。
5. 服务端将该状态存入 `room.lastGameState` 缓存，并广播给玩家 B。
6. 玩家 B 收到 `full_sync`，强制修正自己本地可能的微小误差。

### 3.2 视角与身份绑定 (Perspective Binding)
- **概念**: 游戏界面始终呈现“我方在下，敌方在上”的视角。但底层数据是以绝对方向存储的。
- **身份**: 房间房主为 `A` (默认蓝方)，加入者为 `B` (默认红方)。
- **视角 (`this.perspective`)**: 谁在摇骰子阶段胜出（先手），谁就是主视角（`bottom`），另一个就是 `top`。

### 3.3 重连修复日志 (CRITICAL FIXES)
**历史上出现过的严重 Bug 及其解决方案**，请未来维护此代码时务必注意：

1. **Bug**: 重连后两个设备变成了一个用户，或者我作为蓝方发射出去却是红方的棋子。
   **根因**: 重连时，客户端重新收到了 `onFullSync`，但是丢失了本地的 `this.perspective` 变量，导致双方都默认为 `bottom`，从而控制了同一个方向的棋子。
   **解决方案**: 在 `game.js` 的 `onFullSync` 处理函数中，必须读取 `dice.results.first`，并重新计算 `this.perspective = (dice.results.first === this.playerIndex) ? 'bottom' : 'top';`。

2. **Bug**: 重连后一直卡在“等待对手掷骰子”。
   **根因**: 服务端没有缓存游戏状态，导致断线一方回来后什么数据也拿不到，被强制退回到默认的骰子等待阶段。
   **解决方案**: 在 `server.js` 中加入了 `lastGameState`。当玩家重连 `reconnect` 成功时，如果游戏已经处于开战状态，服务端会立刻向客户端下发 `full_sync`，客户端直接进入对战场景，绕过掷骰子阶段。

3. **Bug**: 未进入棋盘时，重置的位置不对。
   **根因**: 棋子回收时 Y 坐标写死了 `BOARD_Y + BOARD_HEIGHT + 20`，但常量中实际上规定的是 `LAUNCH_ZONE_OFFSET = 25`。且没有重置 X 坐标。
   **解决方案**: 在 `checkRoundEnd` 中，确保失败的棋子精准重置到出生点 (`BOARD_Y - 25` 或 `BOARD_Y + BOARD_HEIGHT + 25`)，并通过 `this.input.sliderValue = 0.5` 强制重置 X 轴坐标到滑轨正中央。

---

## 4. 后续开发建议 (Future Guidelines)

- **避免在 `game.js` 堆积 DOM 操作**：任何新增的 HTML UI 元素，必须新建 Manager（例如 `src/leaderboard.js`）并在 `game.js` 中实例化。
- **服务端修改**：修改 `server.js` 时，务必考虑异常情况（例如玩家半途掉线、双人同时掉线、在摇骰子阶段掉线等）。
- **同步验证**：在添加任何影响物理运行结果的逻辑时（例如新的地形、新的阻力机制），务必确保玩家 A 和 B 能同时接收到完全相同的初始向量。
