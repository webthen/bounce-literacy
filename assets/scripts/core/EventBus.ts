/**
 * 全局轻量级事件分发器
 */

type EventCallback = (data?: any) => void;

export class EventBus {
    private static _handlers: Map<string, EventCallback[]> = new Map();

    public static on(event: string, cb: EventCallback) {
        if (!this._handlers.has(event)) {
            this._handlers.set(event, []);
        }
        this._handlers.get(event)!.push(cb);
    }

    public static off(event: string, cb: EventCallback) {
        const list = this._handlers.get(event);
        if (!list) return;
        this._handlers.set(event, list.filter(fn => fn !== cb));
    }

    public static emit(event: string, data?: any) {
        const list = this._handlers.get(event);
        if (list) {
            // 复制一份数组避免迭代中被取消订阅影响
            const copy = [...list];
            copy.forEach(fn => fn(data));
        }
    }

    public static clear() {
        this._handlers.clear();
    }
}

/** 游戏事件常量定义 */
export enum GameEvents {
    BALL_LAUNCHED       = 'BALL_LAUNCHED',       // 弹珠发射
    BALL_HIT_TARGET     = 'BALL_HIT_TARGET',     // 撞击字块
    BALL_HIT_OBSTACLE   = 'BALL_HIT_OBSTACLE',   // 撞击障碍物
    BALL_HIT_BUMPER     = 'BALL_HIT_BUMPER',     // 撞击超级弹力球
    BALL_OUT_OF_BOUNDS  = 'BALL_OUT_OF_BOUNDS',  // 掉出下边界/超时
    WORD_ELIMINATED     = 'WORD_ELIMINATED',     // 目标字消除
    COMBO_CHANGED       = 'COMBO_CHANGED',       // 连击变动
    SCORE_CHANGED       = 'SCORE_CHANGED',       // 分数变动
    LEVEL_CLEARED       = 'LEVEL_CLEARED',       // 关卡通过
    WEAK_HINT_TRIGGER   = 'WEAK_HINT_TRIGGER',   // 弱提示触发
}
