/**
 * Ring Rush - Constants
 * 游戏全局常量定义
 */
export const VERSION = '0.9.27';
// ===== 画布尺寸 =====
export const CANVAS_WIDTH = 600;
export const CANVAS_HEIGHT = 900;

// ===== 棋子相关 =====
export const PIECE_RADIUS = 18;
export const RUNNER_RADIUS = 12;
export const PIECES_PER_PLAYER = 10;

// ===== 棋盘布局 =====
export const BOARD_X = 75;
export const BOARD_Y = 200;
export const BOARD_WIDTH = 450;
export const BOARD_HEIGHT = 500;

// ===== 发射区 =====
export const LAUNCH_ZONE_WIDTH = 50;
export const LAUNCH_ZONE_HEIGHT = 60;
export const LAUNCH_ZONE_OFFSET = 25;

// ===== 物理参数 =====
export const FRICTION = 0.985;
export const RESTITUTION = 0.8;
export const MAX_SPEED = 22;
export const SPEED_THRESHOLD = 0.1;
export const LAUNCH_MULTIPLIER = 0.12;
export const MAX_DRAG_DISTANCE = 250;
export const POWER_RANDOM_RANGE = 0.10;
export const MIN_POWER_JITTER = 0.5;
export const MAX_POWER_JITTER = 1.5;

// ===== 交互参数 =====
export const CLICK_RADIUS = 40;
export const RUNNER_SMOOTH_FACTOR = 0.1;
export const RUNNER_SNAP_THRESHOLD = 0.05;

// ===== 胜利条件 =====
export const WIN_THRESHOLD = 6;

// ===== 得分区域 =====
export const SCORING_ZONES = {
    center:   { radius: 18,  score: 5, color: 'rgba(255, 215, 0, 0.5)' },
    hexagon:  { radius: 55,  score: 4, color: 'rgba(144, 238, 144, 0.35)' },
    pentagon: { radius: 115, score: 3, color: 'rgba(135, 206, 250, 0.3)' },
    square:   { radius: 160, score: 2, color: 'rgba(221, 160, 221, 0.25)' }
};

// ===== 棋盘中心坐标 =====
export const CENTER_X = BOARD_X + BOARD_WIDTH / 2;
export const CENTER_Y = BOARD_Y + BOARD_HEIGHT / 2;

// ===== 滑轨（力度条）参数 =====
export const TRACK_X = 20;
export const TRACK_Y = 280;
export const TRACK_WIDTH = 40;
export const TRACK_HEIGHT = 350;
export const TRACK_STEPS = 13; // -6到+6

// ===== AI 难度配置 =====
export const AI_DIFFICULTY = {
    easy: { name: '简单', accuracy: 0.5, powerControl: 0.4, thinkTime: 1500, color: '#4CAF50' },
    medium: { name: '中等', accuracy: 0.7, powerControl: 0.6, thinkTime: 1000, color: '#FF9800' },
    hard: { name: '困难', accuracy: 0.9, powerControl: 0.85, thinkTime: 600, color: '#f44336' }
};
