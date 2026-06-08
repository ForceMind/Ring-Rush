/**
 * Ring Rush - 启动界面
 * 游戏模式选择、在线大厅、房间管理界面
 */
import { CANVAS_WIDTH, CANVAS_HEIGHT, CENTER_X, CENTER_Y, VERSION, AI_DIFFICULTY } from './constants.js';
import { NetworkManager } from './network.js';

export class StartScreen {
    constructor(canvas, onStart) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.onStart = onStart;
        this.selectedMode = null;
        this.selectedDifficulty = 'medium';
        this.buttons = [];
        this.rooms = [];
        this.network = new NetworkManager();
        this.isConnecting = false;
        this.errorMessage = null;
        this.animPhase = 0;
        this.currentScreen = 'main'; // 'main' | 'online_lobby' | 'in_room'
        this.currentRoom = null; // 当前进入的房间
        this.isReady = false; // 是否已准备
        this.canStartGame = false; // 房主是否可以开始游戏

        this.handleClick = this.handleClick.bind(this);
        this.handleTouch = this.handleTouch.bind(this);
        this.canvas.addEventListener('click', this.handleClick);
        this.canvas.addEventListener('touchstart', this.handleTouch, { passive: false });
    }

    handleTouch(e) {
        e.preventDefault();
        const touch = e.touches[0];
        this.handleClick({ clientX: touch.clientX, clientY: touch.clientY });
    }

    async connectToServer() {
        if (this.network.isConnected) return; // 防止重复连接
        this.isConnecting = true;
        this.errorMessage = null;
        console.log('connectToServer - starting');
        this.draw();

        try {
            await this.network.connect();
            this.isConnecting = false;
            console.log('connectToServer - connected successfully, isConnected:', this.network.isConnected);

            this.network.onRoomList = (rooms) => {
                this.rooms = rooms;
                console.log('onRoomList - rooms:', rooms);
                this.draw();
            };

            this.network.onMessage = (message) => {
                this.handleNetworkMessage(message);
            };

            this.network.onError = (message) => {
                this.errorMessage = message;
                console.log('onError - message:', message);
                this.draw();
            };

            this.draw();
        } catch (error) {
            this.isConnecting = false;
            this.errorMessage = '无法连接到服务器';
            console.log('connectToServer - error:', error);
            this.draw();
        }
    }

    handleNetworkMessage(message) {
        switch (message.type) {
            case 'reconnect_success':
                if (message.room && message.room.state === 'playing') {
                    // Re-enter the ongoing game
                    this.gameStartMessage = {
                        playerIndex: message.playerIndex,
                        opponentName: message.opponentName
                    };
                    this.currentScreen = 'main';
                    if (this.onStart) {
                        const cb = this.onStart;
                        this.onStart = null;
                        cb('online', null);
                    }
                } else if (message.room) {
                    // Re-enter the room lobby
                    this.currentRoom = message.room;
                    this.currentScreen = 'in_room';
                    this.isReady = false;
                    this.draw();
                }
                break;
            case 'room_created':
                this.currentRoom = message.room;
                this.currentScreen = 'in_room';
                this.isReady = false;
                this.draw();
                break;
            case 'room_joined':
                this.currentRoom = message.room;
                this.currentScreen = 'in_room';
                this.isReady = false;
                this.draw();
                break;
            case 'player_joined':
                if (this.currentRoom) {
                    this.currentRoom.guestName = message.player.name;
                    this.currentRoom.playerCount = 2;
                    this.draw();
                }
                break;
            case 'player_left':
                if (this.currentRoom) {
                    this.currentRoom.guestName = null;
                    this.currentRoom.playerCount = 1;
                    this.isReady = false;
                    this.draw();
                }
                break;
            case 'player_ready':
                if (this.currentRoom) {
                    if (message.playerIndex === 'A') {
                        this.currentRoom.hostReady = true;
                    } else {
                        this.currentRoom.guestReady = true;
                    }
                    this.draw();
                }
                break;
            case 'cancel_ready':
                if (this.currentRoom) {
                    if (message.playerIndex === 'A') {
                        this.currentRoom.hostReady = false;
                    } else {
                        this.currentRoom.guestReady = false;
                    }
                    this.draw();
                }
                break;
            case 'game_start':
                this.gameStartMessage = message;
                this.currentScreen = 'main';
                this.currentRoom = null;
                this.isReady = false;
                this.canStartGame = false;
                if (this.onStart) {
                    const cb = this.onStart;
                    this.onStart = null;
                    cb('online', null);
                }
                break;
            case 'can_start_game':
                // 房主可以开始游戏
                this.canStartGame = true;
                this.draw();
                break;
        }
    }

    draw() {
        const ctx = this.ctx;
        this.animPhase += 0.02;

        // 背景
        ctx.fillStyle = '#0f0f1a';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // 背景动画
        for (let i = 0; i < 30; i++) {
            const x = (Math.sin(i * 0.5 + this.animPhase) + 1) * CANVAS_WIDTH / 2;
            const y = (Math.cos(i * 0.3 + this.animPhase * 0.7) + 1) * CANVAS_HEIGHT / 2;
            const size = Math.sin(i + this.animPhase) * 1.5 + 2;
            const alpha = Math.sin(i * 0.8 + this.animPhase) * 0.2 + 0.2;

            ctx.fillStyle = `rgba(74, 144, 217, ${alpha})`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        this.buttons = [];

        if (this.currentScreen === 'main') {
            this.drawMainMenu(ctx);
        } else if (this.currentScreen === 'online_lobby') {
            this.drawOnlineLobby(ctx);
        } else if (this.currentScreen === 'in_room') {
            this.drawInRoom(ctx);
        }

        if (this.showTutorial) {
            this.drawTutorial(ctx);
        }
    }

    drawMainMenu(ctx) {
        // 标题 - 居中
        ctx.save();
        ctx.shadowColor = '#f0e68c';
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#f0e68c';
        ctx.font = 'bold 52px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PELLO', CENTER_X, 200);
        ctx.restore();

        ctx.fillStyle = '#aaa';
        ctx.font = '20px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`弹棋 v${VERSION}`, CENTER_X, 260);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText('选择游戏模式', CENTER_X, 340);

        // 游戏模式按钮 - 居中
        this.drawButton(ctx, CENTER_X - 150, 380, 300, 50, '本地双人对战', '#4a90d9', 'local');
        this.drawButton(ctx, CENTER_X - 150, 445, 300, 50, 'Bot 对战', '#d94a4a', 'bot');
        this.drawButton(ctx, CENTER_X - 150, 510, 300, 50, '在线对战', '#4CAF50', 'online');

        // Bot 难度选择
        if (this.selectedMode === 'bot') {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 20px sans-serif';
            ctx.fillText('选择难度', CENTER_X, 600);

            const difficulties = ['easy', 'medium', 'hard'];
            const labels = ['简单', '中等', '困难'];
            const colors = ['#4CAF50', '#FF9800', '#f44336'];

            for (let i = 0; i < 3; i++) {
                const x = CENTER_X - 150 + i * 110;
                const isSelected = this.selectedDifficulty === difficulties[i];
                this.drawButton(ctx, x, 630, 90, 40, labels[i], colors[i], `diff_${difficulties[i]}`, isSelected);
            }

            this.drawButton(ctx, CENTER_X - 100, 700, 200, 50, '开始游戏', '#f0e68c', 'start');
        }

        // 操作说明
        ctx.fillStyle = '#666';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('拖拽棋子发射 | 力度含随机偏移 | 得分推进小人', CENTER_X, CANVAS_HEIGHT - 50);

        // 玩法介绍按钮 (右上角)
        this.drawButton(ctx, CANVAS_WIDTH - 110, 20, 90, 36, '❓ 玩法介绍', '#3266a8', 'tutorial');
    }

    drawTutorial(ctx) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        const cx = CANVAS_WIDTH / 2;
        const cy = CANVAS_HEIGHT / 2;
        
        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        ctx.roundRect(cx - 160, cy - 220, 320, 440, 12);
        ctx.fill();
        ctx.strokeStyle = '#4a90d9';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#f0e68c';
        ctx.font = 'bold 26px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('玩法介绍', cx, cy - 170);

        ctx.fillStyle = '#fff';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'left';
        
        const lines = [
            "🎯 基础操作",
            "  按住己方棋子向后拖拽，松手发射。",
            "",
            "⭕ 得分机制",
            "  棋子停留在中心的不同圆环内，",
            "  即可获得对应分数 (2、3、4、5分)。",
            "",
            "⚔️ 策略对抗",
            "  可以利用撞击把对方棋子击飞出",
            "  得分区，或者阻挡对方路线。",
            "",
            "🏆 获胜条件",
            "  率先积满 6 分的一方即可获胜！"
        ];
        
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('🎯') || lines[i].includes('⭕') || lines[i].includes('⚔️') || lines[i].includes('🏆')) {
                ctx.fillStyle = '#f0e68c';
                ctx.font = 'bold 18px sans-serif';
            } else {
                ctx.fillStyle = '#ddd';
                ctx.font = '15px sans-serif';
            }
            ctx.fillText(lines[i], cx - 130, cy - 120 + i * 22);
        }

        // 清空其他按钮，只保留关闭按钮
        this.buttons = [];
        this.drawButton(ctx, cx - 60, cy + 150, 120, 45, '明白了', '#4CAF50', 'close_tutorial');
    }

    drawOnlineLobby(ctx) {
        // 标题
        ctx.save();
        ctx.shadowColor = '#4CAF50';
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#4CAF50';
        ctx.font = 'bold 36px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('在线大厅', CENTER_X, 50);
        ctx.restore();

        // 返回按钮
        this.drawButton(ctx, 30, 25, 80, 40, '← 返回', '#666666', 'back_to_main');

        // 连接状态
        if (this.isConnecting) {
            ctx.fillStyle = '#aaa';
            ctx.font = '18px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('正在连接服务器...', CENTER_X, 150);
        } else if (!this.network.isConnected) {
            // 未连接状态
            ctx.fillStyle = '#fff';
            ctx.font = '18px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('请先连接服务器', CENTER_X, 150);
            this.drawButton(ctx, CENTER_X - 100, 200, 200, 50, '连接服务器', '#4CAF50', 'connect');
        } else {
            // 已连接状态
            ctx.fillStyle = '#4CAF50';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText('● 已连接', 130, 45);

            // 房间列表标题
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 20px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('房间列表', CENTER_X, 100);

            // 房间列表区域
            const listX = 30;
            const listY = 120;
            const listW = CANVAS_WIDTH - 60;
            const listH = CANVAS_HEIGHT - 260;

            // 列表背景
            ctx.fillStyle = '#1a1a2e';
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(listX, listY, listW, listH, 10);
            ctx.fill();
            ctx.stroke();

            if (this.rooms.length === 0) {
                ctx.fillStyle = '#666';
                ctx.font = '16px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('暂无房间，点击下方按钮创建', CENTER_X, listY + listH / 2);
            } else {
                // 绘制房间列表
                const roomHeight = 65;
                const maxVisibleRooms = Math.floor((listH - 20) / roomHeight);

                for (let i = 0; i < Math.min(this.rooms.length, maxVisibleRooms); i++) {
                    const room = this.rooms[i];
                    const ry = listY + 10 + i * roomHeight;

                    // 房间背景
                    const isWaiting = room.state === 'waiting';
                    const isFull = room.playerCount >= room.maxPlayers;
                    const bgColor = isWaiting ? '#2a2a4a' : '#3a2a2a';
                    const borderColor = isWaiting ? '#4CAF50' : (isFull ? '#f44336' : '#FF9800');

                    ctx.fillStyle = bgColor;
                    ctx.strokeStyle = borderColor;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.roundRect(listX + 10, ry, listW - 20, roomHeight - 8, 8);
                    ctx.fill();
                    ctx.stroke();

                    // 房间名
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 16px sans-serif';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(room.name, listX + 25, ry + 22);

                    // 房间状态
                    ctx.font = '13px sans-serif';
                    let stateText = '';
                    let stateColor = '#4CAF50';
                    if (room.state === 'waiting') {
                        stateText = '等待加入';
                        stateColor = '#4CAF50';
                    } else if (room.state === 'playing') {
                        stateText = '游戏中';
                        stateColor = '#FF9800';
                    } else {
                        stateText = '已结束';
                        stateColor = '#888';
                    }
                    ctx.fillStyle = stateColor;
                    ctx.fillText(stateText, listX + 25, ry + 45);

                    // 人数
                    ctx.fillStyle = '#aaa';
                    ctx.font = '14px sans-serif';
                    ctx.textAlign = 'right';
                    ctx.fillText(`${room.playerCount}/${room.maxPlayers}`, listX + listW - 100, ry + 34);

                    // 加入按钮（只对等待中的房间显示）
                    if (isWaiting && !isFull) {
                        this.drawButton(ctx, listX + listW - 85, ry + 15, 65, 32, '加入', '#4CAF50', `room_${room.id}`);
                    }

                    ctx.textAlign = 'center';
                }
            }

            // 底部按钮区域 - 创建房间按钮
            this.drawButton(ctx, CENTER_X - 120, CANVAS_HEIGHT - 120, 240, 50, '创建房间', '#FF9800', 'create_room');
        }

        // 错误消息
        if (this.errorMessage) {
            ctx.fillStyle = '#f44336';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.errorMessage, CENTER_X, CANVAS_HEIGHT - 30);
        }
    }

    drawInRoom(ctx) {
        if (!this.currentRoom) return;

        // 标题
        ctx.save();
        ctx.shadowColor = '#4CAF50';
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#4CAF50';
        ctx.font = 'bold 32px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.currentRoom.name, CENTER_X, 50);
        ctx.restore();

        // 返回按钮
        this.drawButton(ctx, 30, 25, 80, 40, '← 离开', '#f44336', 'leave_room');

        // 房间信息
        ctx.fillStyle = '#fff';
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`房间 ID: ${this.currentRoom.id}`, CENTER_X, 110);

        // 玩家列表
        ctx.fillStyle = '#aaa';
        ctx.font = '16px sans-serif';
        ctx.fillText('玩家列表', CENTER_X, 160);

        // 玩家1（房主）
        const p1Name = this.currentRoom.hostName || '等待中...';
        const p1Ready = this.currentRoom.hostReady;
        ctx.fillStyle = '#1a1a2e';
        ctx.strokeStyle = p1Ready ? '#4CAF50' : '#666';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(CENTER_X - 200, 180, 400, 60, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`玩家1 (房主): ${p1Name}`, CENTER_X - 180, 210);

        ctx.textAlign = 'right';
        ctx.fillStyle = p1Ready ? '#4CAF50' : '#888';
        ctx.fillText(p1Ready ? '✓ 已准备' : '等待中', CENTER_X + 180, 210);

        // 玩家2
        const p2Name = this.currentRoom.guestName || '等待中...';
        const p2Ready = this.currentRoom.guestReady;
        ctx.fillStyle = '#1a1a2e';
        ctx.strokeStyle = p2Ready ? '#4CAF50' : '#666';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(CENTER_X - 200, 260, 400, 60, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`玩家2: ${p2Name}`, CENTER_X - 180, 290);

        ctx.textAlign = 'right';
        ctx.fillStyle = p2Ready ? '#4CAF50' : '#888';
        ctx.fillText(p2Ready ? '✓ 已准备' : '等待中', CENTER_X + 180, 290);

        // 操作按钮
        ctx.textAlign = 'center';
        if (this.currentRoom.state === 'waiting') {
            // 等待中 - 显示准备按钮或开始游戏按钮
            const isHost = this.network.playerIndex === 'A';
            const bothReady = this.currentRoom.hostReady && this.currentRoom.guestReady;

            if (isHost && bothReady && this.canStartGame) {
                // 房主且双方都准备好了，显示开始游戏按钮
                this.drawButton(ctx, CENTER_X - 100, 360, 200, 50, '开始游戏', '#4CAF50', 'start_game');
            } else if (!this.isReady) {
                this.drawButton(ctx, CENTER_X - 100, 360, 200, 50, '准备', '#4CAF50', 'ready');
            } else {
                this.drawButton(ctx, CENTER_X - 100, 360, 200, 50, '取消准备', '#FF9800', 'cancel_ready');
            }
        } else if (this.currentRoom.state === 'playing') {
            ctx.fillStyle = '#FF9800';
            ctx.font = 'bold 20px sans-serif';
            ctx.fillText('游戏中...', CENTER_X, 380);
        } else {
            ctx.fillStyle = '#888';
            ctx.font = 'bold 20px sans-serif';
            ctx.fillText('游戏已结束', CENTER_X, 380);
        }

        // 房间状态提示
        ctx.fillStyle = '#666';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (this.currentRoom.state === 'waiting') {
            const bothReady = this.currentRoom.hostReady && this.currentRoom.guestReady;
            if (bothReady) {
                ctx.fillStyle = '#4CAF50';
                ctx.fillText('双方已准备，游戏即将开始...', CENTER_X, CANVAS_HEIGHT - 100);
            } else if (this.currentRoom.guestName) {
                ctx.fillText('等待玩家准备...', CENTER_X, CANVAS_HEIGHT - 100);
            } else {
                ctx.fillText('等待其他玩家加入...', CENTER_X, CANVAS_HEIGHT - 100);
            }
        } else if (this.currentRoom.state === 'playing') {
            ctx.fillText('游戏正在进行中', CENTER_X, CANVAS_HEIGHT - 100);
        }
    }

    drawButton(ctx, x, y, w, h, text, color, id, selected = false) {
        this.buttons.push({ x, y, w, h, id });

        // 按钮背景
        const gradient = ctx.createLinearGradient(x, y, x, y + h);
        if (selected) {
            gradient.addColorStop(0, color);
            gradient.addColorStop(1, this.darkenColor(color, 0.3));
        } else {
            gradient.addColorStop(0, `${color}66`);
            gradient.addColorStop(1, `${color}33`);
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 8);
        ctx.fill();

        if (selected) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
        } else {
            ctx.strokeStyle = `${color}88`;
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + w / 2, y + h / 2);
    }

    darkenColor(hex, factor) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgb(${Math.floor(r * (1 - factor))}, ${Math.floor(g * (1 - factor))}, ${Math.floor(b * (1 - factor))})`;
    }

    async handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = CANVAS_WIDTH / rect.width;
        const scaleY = CANVAS_HEIGHT / rect.height;
        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;

        if (this.showTutorial) {
            let clickedClose = false;
            for (const btn of this.buttons) {
                if (btn.id === 'close_tutorial' && mouseX >= btn.x && mouseX <= btn.x + btn.w &&
                    mouseY >= btn.y && mouseY <= btn.y + btn.h) {
                    clickedClose = true;
                }
            }
            // 无论点按钮还是点背景都关掉
            this.showTutorial = false;
            this.draw();
            return;
        }

        for (const btn of this.buttons) {
            if (mouseX >= btn.x && mouseX <= btn.x + btn.w &&
                mouseY >= btn.y && mouseY <= btn.y + btn.h) {

                // 主菜单按钮
                if (btn.id === 'local') {
                    this.canvas.removeEventListener('click', this.handleClick);
                    this.canvas.removeEventListener('touchstart', this.handleTouch);
                    this.onStart('local', null);
                    return;
                } else if (btn.id === 'bot') {
                    this.selectedMode = 'bot';
                    this.draw();
                } else if (btn.id === 'online') {
                    window.location.href = 'online.html';
                } else if (btn.id.startsWith('diff_')) {
                    this.selectedDifficulty = btn.id.replace('diff_', '');
                    this.draw();
                } else if (btn.id === 'start') {
                    this.canvas.removeEventListener('click', this.handleClick);
                    this.canvas.removeEventListener('touchstart', this.handleTouch);
                    this.onStart('bot', this.selectedDifficulty);
                    return;
                }

                // 在线大厅按钮
                if (btn.id === 'back_to_main') {
                    this.currentScreen = 'main';
                    this.selectedMode = null;
                    this.draw();
                } else if (btn.id === 'connect') {
                    await this.connectToServer();
                } else if (btn.id === 'create_room') {
                    this.network.createRoom();
                } else if (btn.id.startsWith('room_')) {
                    const roomId = parseInt(btn.id.replace('room_', ''));
                    this.network.joinRoom(roomId);
                }

                // 房间内按钮
                if (btn.id === 'leave_room') {
                    this.network.leaveRoom();
                    this.currentScreen = 'online_lobby';
                    this.currentRoom = null;
                    this.isReady = false;
                    this.canStartGame = false;
                    this.draw();
                } else if (btn.id === 'ready') {
                    this.network.sendReady();
                    this.isReady = true;
                    this.draw();
                } else if (btn.id === 'cancel_ready') {
                    this.network.sendCancelReady();
                    this.isReady = false;
                    this.canStartGame = false;
                    this.draw();
                } else if (btn.id === 'start_game') {
                    console.log('点击了开始游戏按钮');
                    this.canStartGame = false;
                    this.draw();
                    this.network.sendStartGame();
                }
            }
        }
    }

    cleanup() {
        this.canvas.removeEventListener('click', this.handleClick);
        this.canvas.removeEventListener('touchstart', this.handleTouch);
    }
}
