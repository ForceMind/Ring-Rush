/**
 * Ring Rush - shared mobile game constants.
 */
export const VERSION = '0.10.5';

// Canvas
export const CANVAS_WIDTH = 450;
export const CANVAS_HEIGHT = 960;

// Board layout. The mobile board preserves the original 450:500 playfield
// proportions, then scales gameplay geometry by the same factor.
export const BOARD_REFERENCE_WIDTH = 450;
export const BOARD_REFERENCE_HEIGHT = 500;
export const BOARD_X = 48;
export const BOARD_Y = 266;
export const BOARD_WIDTH = 356;
export const BOARD_HEIGHT = 396;
export const BOARD_SCALE = BOARD_WIDTH / BOARD_REFERENCE_WIDTH;

const scaleBoardValue = (value) => Math.round(value * BOARD_SCALE);

// Pieces
export const PIECE_RADIUS = scaleBoardValue(18);
export const RUNNER_RADIUS = scaleBoardValue(12);
export const PIECES_PER_PLAYER = 10;

// Launch lanes
export const LAUNCH_ZONE_WIDTH = scaleBoardValue(50);
export const LAUNCH_ZONE_HEIGHT = scaleBoardValue(60);
export const LAUNCH_ZONE_OFFSET = scaleBoardValue(25);
export const LAUNCH_LANE_WIDTH = LAUNCH_ZONE_WIDTH * 4;
export const LAUNCH_LANE_HALF_WIDTH = LAUNCH_LANE_WIDTH / 2;
export const LAUNCH_LANE_GAP = scaleBoardValue(25);
export const TOP_LAUNCH_LANE_Y = BOARD_Y - LAUNCH_ZONE_HEIGHT - LAUNCH_LANE_GAP;
export const BOTTOM_LAUNCH_LANE_Y = BOARD_Y + BOARD_HEIGHT + LAUNCH_LANE_GAP;
export const TOP_LAUNCH_Y = TOP_LAUNCH_LANE_Y + LAUNCH_ZONE_HEIGHT / 2;
export const BOTTOM_LAUNCH_Y = BOTTOM_LAUNCH_LANE_Y + LAUNCH_ZONE_HEIGHT / 2;

// Physics
export const FRICTION = 0.985;
export const RESTITUTION = 0.8;
export const MAX_SPEED = 22;
export const SPEED_THRESHOLD = 0.1;
export const LAUNCH_MULTIPLIER = 0.12;
export const MAX_DRAG_DISTANCE = 250;
export const POWER_RANDOM_RANGE = 0.10;
export const MIN_POWER_JITTER = 0.5;
export const MAX_POWER_JITTER = 1.5;

// Interaction
export const CLICK_RADIUS = 40;
export const RUNNER_SMOOTH_FACTOR = 0.1;
export const RUNNER_SNAP_THRESHOLD = 0.05;

// Win condition
export const WIN_THRESHOLD = 6;

// Scoring zones
export const SCORING_ZONES = {
    center:   { radius: scaleBoardValue(18),  score: 5, color: 'rgba(255, 215, 0, 0.5)' },
    hexagon:  { radius: scaleBoardValue(55),  score: 4, color: 'rgba(144, 238, 144, 0.35)' },
    pentagon: { radius: scaleBoardValue(115), score: 3, color: 'rgba(135, 206, 250, 0.3)' },
    square:   { radius: scaleBoardValue(160), score: 2, color: 'rgba(221, 160, 221, 0.25)' }
};

// Board center
export const CENTER_X = BOARD_X + BOARD_WIDTH / 2;
export const CENTER_Y = BOARD_Y + BOARD_HEIGHT / 2;

// Score track
export const TRACK_X = 10;
export const TRACK_Y = 288;
export const TRACK_WIDTH = 30;
export const TRACK_HEIGHT = 350;
export const TRACK_STEPS = 13; // -6 to 6

// AI difficulty
export const AI_DIFFICULTY = {
    easy: { name: '简单', accuracy: 0.5, powerControl: 0.4, thinkTime: 1500, color: '#4CAF50' },
    medium: { name: '中等', accuracy: 0.7, powerControl: 0.6, thinkTime: 1000, color: '#FF9800' },
    hard: { name: '困难', accuracy: 0.9, powerControl: 0.85, thinkTime: 600, color: '#f44336' }
};
