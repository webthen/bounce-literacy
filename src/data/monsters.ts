export interface MonsterItem {
  id: string;
  name: string;
  icon: string;
  desc: string;
}

export const MONSTER_LIST: MonsterItem[] = [
  { id: 'm_mushroom', name: '弹弹红菇', icon: '🍄', desc: '初入游戏即获' },
  { id: 'm_star', name: '闪光星仔', icon: '⭐', desc: '累计消除 3 个字' },
  { id: 'm_turtle', name: '坚果萌龟', icon: '🐢', desc: '通过第 4 关' },
  { id: 'm_cloud', name: '悠悠棉花云', icon: '☁️', desc: '累计消除 10 个字' },
  { id: 'm_sheep', name: '上山跳跳羊', icon: '🐑', desc: '通关全部 10 关' }
];
