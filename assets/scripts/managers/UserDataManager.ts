import { _decorator, sys } from 'cc';
import { IWordStudyStat } from '../core/GameDefines';

export interface IMonsterItem {
    id: string;
    name: string;
    desc: string;
    icon: string;
    unlockRequirement: string;
    isUnlocked: boolean;
}

export class UserDataManager {
    private static _instance: UserDataManager | null = null;
    public static get instance(): UserDataManager {
        if (!this._instance) {
            this._instance = new UserDataManager();
        }
        return this._instance;
    }

    private readonly STORAGE_KEY = 'BOUNCE_LITERACY_USERDATA_V1';

    private _data = {
        totalEliminations: 0,
        starsPerLevel: {} as Record<number, number>,
        unlockedMonsters: ['m_mushroom'] as string[],
        selectedBook: '小羊上山2',
        playTimeTodaySec: 0,
        studyStats: {} as Record<string, IWordStudyStat>
    };

    private _monsters: IMonsterItem[] = [
        { id: 'm_mushroom', name: '弹弹红菇', desc: '喜欢在草地里跳跃的元气蘑菇', icon: '🍄', unlockRequirement: '初入游戏即获', isUnlocked: true },
        { id: 'm_star', name: '闪光星仔', desc: '连续反弹命中 3 次时会出现的幸运星', icon: '⭐', unlockRequirement: '累计消除 5 个汉字', isUnlocked: false },
        { id: 'm_turtle', name: '坚果萌龟', desc: '背着坚硬外壳，反弹力极强', icon: '🐢', unlockRequirement: '通过第 4 关', isUnlocked: false },
        { id: 'm_cloud', name: '悠悠棉花云', desc: '漂浮在空中的轻盈伙伴', icon: '☁️', unlockRequirement: '累计消除 15 个汉字', isUnlocked: false },
        { id: 'm_sheep', name: '上山跳跳羊', desc: '《小羊上山》的超级好朋友', icon: '🐑', unlockRequirement: '通关全部 10 关', isUnlocked: false }
    ];

    constructor() {
        this.load();
    }

    public load() {
        const raw = sys.localStorage.getItem(this.STORAGE_KEY);
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                this._data = { ...this._data, ...parsed };
            } catch (e) {
                console.warn('Failed to parse user data:', e);
            }
        }
        this.updateMonstersUnlockState();
    }

    public save() {
        sys.localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._data));
    }

    public recordElimination() {
        this._data.totalEliminations++;
        this.checkMonsterUnlocks();
        this.save();
    }

    public recordLevelCleared(levelId: number, stars: number) {
        const oldStars = this._data.starsPerLevel[levelId] || 0;
        if (stars > oldStars) {
            this._data.starsPerLevel[levelId] = stars;
        }
        this.checkMonsterUnlocks();
        this.save();
    }

    public get totalEliminations(): number {
        return this._data.totalEliminations;
    }

    public get monsters(): IMonsterItem[] {
        return this._monsters;
    }

    private checkMonsterUnlocks() {
        let changed = false;
        if (this._data.totalEliminations >= 5 && !this._data.unlockedMonsters.includes('m_star')) {
            this._data.unlockedMonsters.push('m_star');
            changed = true;
        }
        if (this._data.starsPerLevel[4] > 0 && !this._data.unlockedMonsters.includes('m_turtle')) {
            this._data.unlockedMonsters.push('m_turtle');
            changed = true;
        }
        if (this._data.totalEliminations >= 15 && !this._data.unlockedMonsters.includes('m_cloud')) {
            this._data.unlockedMonsters.push('m_cloud');
            changed = true;
        }
        if (this._data.starsPerLevel[10] > 0 && !this._data.unlockedMonsters.includes('m_sheep')) {
            this._data.unlockedMonsters.push('m_sheep');
            changed = true;
        }

        if (changed) {
            this.updateMonstersUnlockState();
            this.save();
        }
    }

    private updateMonstersUnlockState() {
        this._monsters.forEach(m => {
            m.isUnlocked = this._data.unlockedMonsters.includes(m.id);
        });
    }

    /** 生成家长验证算术题 (防止儿童误入) */
    public generateParentGateQuestion(): { question: string; answer: number; options: number[] } {
        const a = Math.floor(Math.random() * 5) + 2;
        const b = Math.floor(Math.random() * 5) + 1;
        const ans = a * b;
        const numToCn = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
        const qStr = `请问：${numToCn[a]} 乘以 ${numToCn[b]} 等于几？`;

        const set = new Set<number>([ans]);
        while (set.size < 4) {
            const fake = ans + Math.floor(Math.random() * 9) - 4;
            if (fake > 0 && fake !== ans) {
                set.add(fake);
            }
        }
        const options = Array.from(set).sort(() => Math.random() - 0.5);

        return {
            question: qStr,
            answer: ans,
            options: options
        };
    }
}
