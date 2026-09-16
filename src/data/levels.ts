export interface BlockDef {
  id: string;
  type: 'TARGET' | 'OBSTACLE' | 'BUMPER';
  word?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: 'BOX' | 'CIRCLE';
  rotation?: number;
}

export interface LevelDef {
  levelId: number;
  title: string;
  targetWords: string[];
  ballSequence: string[];
  blocks: BlockDef[];
}

export const LEVELS: LevelDef[] = [
  {
    levelId: 1, title: "山水日月", targetWords: ["日", "月", "山", "水"], ballSequence: ["山", "水", "日", "月", "山", "水"],
    blocks: [
      { id: "t1", type: "TARGET", word: "日", x: -300, y: 150, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t2", type: "TARGET", word: "月", x: -100, y: 210, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t3", type: "TARGET", word: "山", x: 100, y: 210, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t4", type: "TARGET", word: "水", x: 300, y: 150, width: 84, height: 84, shape: "CIRCLE", rotation: 0 }
    ]
  },
  {
    levelId: 2, title: "天地大小", targetWords: ["天", "大", "小", "人", "土"], ballSequence: ["大", "天", "小", "人", "土", "天", "大"],
    blocks: [
      { id: "t1", type: "TARGET", word: "天", x: 0, y: 230, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t2", type: "TARGET", word: "大", x: -180, y: 170, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t3", type: "TARGET", word: "小", x: 180, y: 170, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t4", type: "TARGET", word: "人", x: -340, y: 110, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t5", type: "TARGET", word: "土", x: 340, y: 110, width: 84, height: 84, shape: "CIRCLE", rotation: 0 }
    ]
  },
  {
    levelId: 3, title: "五行自然", targetWords: ["木", "火", "土", "水", "石"], ballSequence: ["木", "火", "土", "水", "石", "火", "木"],
    blocks: [
      { id: "bmp1", type: "BUMPER", x: 0, y: 40, width: 60, height: 60, shape: "CIRCLE", rotation: 0 },
      { id: "t1", type: "TARGET", word: "木", x: -240, y: 210, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t2", type: "TARGET", word: "火", x: 0, y: 250, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t3", type: "TARGET", word: "土", x: 240, y: 210, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t4", type: "TARGET", word: "水", x: -160, y: 110, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t5", type: "TARGET", word: "石", x: 160, y: 110, width: 84, height: 84, shape: "CIRCLE", rotation: 0 }
    ]
  },
  {
    levelId: 4, title: "身心五官", targetWords: ["口", "手", "目", "人", "大"], ballSequence: ["口", "手", "目", "人", "大", "目", "手"],
    blocks: [
      { id: "obs1", type: "OBSTACLE", x: 0, y: 20, width: 140, height: 35, shape: "BOX", rotation: 0 },
      { id: "t1", type: "TARGET", word: "目", x: -130, y: 220, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t2", type: "TARGET", word: "口", x: 130, y: 220, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t3", type: "TARGET", word: "手", x: 0, y: 130, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t4", type: "TARGET", word: "人", x: -320, y: 140, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t5", type: "TARGET", word: "大", x: 320, y: 140, width: 84, height: 84, shape: "CIRCLE", rotation: 0 }
    ]
  },
  {
    levelId: 5, title: "生机牧场", targetWords: ["牛", "羊", "马", "鸟", "田", "木"], ballSequence: ["牛", "羊", "马", "鸟", "田", "木", "羊", "牛"],
    blocks: [
      { id: "bmp1", type: "BUMPER", x: -140, y: 0, width: 55, height: 55, shape: "CIRCLE", rotation: 0 },
      { id: "bmp2", type: "BUMPER", x: 140, y: 0, width: 55, height: 55, shape: "CIRCLE", rotation: 0 },
      { id: "t1", type: "TARGET", word: "牛", x: -280, y: 220, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t2", type: "TARGET", word: "羊", x: 0, y: 240, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t3", type: "TARGET", word: "马", x: 280, y: 220, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t4", type: "TARGET", word: "鸟", x: -200, y: 110, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t5", type: "TARGET", word: "田", x: 0, y: 90, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t6", type: "TARGET", word: "木", x: 200, y: 110, width: 84, height: 84, shape: "CIRCLE", rotation: 0 }
    ]
  },
  {
    levelId: 6, title: "山川田园", targetWords: ["山", "水", "石", "田", "日", "月"], ballSequence: ["山", "水", "石", "田", "日", "月", "山", "日"],
    blocks: [
      { id: "bmp1", type: "BUMPER", x: -120, y: -10, width: 55, height: 55, shape: "CIRCLE", rotation: 0 },
      { id: "bmp2", type: "BUMPER", x: 120, y: -10, width: 55, height: 55, shape: "CIRCLE", rotation: 0 },
      { id: "t1", type: "TARGET", word: "日", x: 0, y: 250, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t2", type: "TARGET", word: "月", x: -220, y: 180, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t3", type: "TARGET", word: "山", x: 220, y: 180, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t4", type: "TARGET", word: "水", x: -360, y: 90, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t5", type: "TARGET", word: "田", x: 360, y: 90, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t6", type: "TARGET", word: "石", x: 0, y: 110, width: 84, height: 84, shape: "CIRCLE", rotation: 0 }
    ]
  },
  {
    levelId: 7, title: "眼疾手快", targetWords: ["人", "大", "天", "小", "手", "口"], ballSequence: ["天", "人", "大", "小", "手", "口", "天", "大"],
    blocks: [
      { id: "obs1", type: "OBSTACLE", x: -180, y: 10, width: 100, height: 30, shape: "BOX", rotation: 20 },
      { id: "obs2", type: "OBSTACLE", x: 180, y: 10, width: 100, height: 30, shape: "BOX", rotation: -20 },
      { id: "t1", type: "TARGET", word: "天", x: -300, y: 220, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t2", type: "TARGET", word: "大", x: -100, y: 180, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t3", type: "TARGET", word: "人", x: 100, y: 180, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t4", type: "TARGET", word: "小", x: 300, y: 220, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t5", type: "TARGET", word: "手", x: -200, y: 90, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t6", type: "TARGET", word: "口", x: 200, y: 90, width: 84, height: 84, shape: "CIRCLE", rotation: 0 }
    ]
  },
  {
    levelId: 8, title: "万物生灵", targetWords: ["马", "鸟", "牛", "羊", "人", "山", "水"], ballSequence: ["马", "鸟", "牛", "羊", "人", "山", "水", "鸟", "马"],
    blocks: [
      { id: "bmp1", type: "BUMPER", x: 0, y: 15, width: 60, height: 60, shape: "CIRCLE", rotation: 0 },
      { id: "t1", type: "TARGET", word: "马", x: -360, y: 190, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t2", type: "TARGET", word: "鸟", x: -180, y: 230, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t3", type: "TARGET", word: "牛", x: 0, y: 250, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t4", type: "TARGET", word: "羊", x: 180, y: 230, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t5", type: "TARGET", word: "人", x: 360, y: 190, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t6", type: "TARGET", word: "山", x: -150, y: 100, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t7", type: "TARGET", word: "水", x: 150, y: 100, width: 84, height: 84, shape: "CIRCLE", rotation: 0 }
    ]
  },
  {
    levelId: 9, title: "万物生长", targetWords: ["木", "火", "土", "水", "石", "田", "日"], ballSequence: ["木", "火", "土", "水", "石", "田", "日", "水", "木"],
    blocks: [
      { id: "bmp1", type: "BUMPER", x: -200, y: -20, width: 55, height: 55, shape: "CIRCLE", rotation: 0 },
      { id: "bmp2", type: "BUMPER", x: 200, y: -20, width: 55, height: 55, shape: "CIRCLE", rotation: 0 },
      { id: "t1", type: "TARGET", word: "日", x: 0, y: 250, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t2", type: "TARGET", word: "木", x: -240, y: 190, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t3", type: "TARGET", word: "火", x: 240, y: 190, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t4", type: "TARGET", word: "土", x: -360, y: 100, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t5", type: "TARGET", word: "水", x: 360, y: 100, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t6", type: "TARGET", word: "石", x: -120, y: 100, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t7", type: "TARGET", word: "田", x: 120, y: 100, width: 84, height: 84, shape: "CIRCLE", rotation: 0 }
    ]
  },
  {
    levelId: 10, title: "小羊上山大满贯", targetWords: ["日", "月", "山", "水", "田", "大", "天", "羊"], ballSequence: ["山", "水", "日", "月", "田", "大", "天", "羊", "山", "日"],
    blocks: [
      { id: "bmp1", type: "BUMPER", x: -190, y: 10, width: 55, height: 55, shape: "CIRCLE", rotation: 0 },
      { id: "bmp2", type: "BUMPER", x: 190, y: 10, width: 55, height: 55, shape: "CIRCLE", rotation: 0 },
      { id: "t1", type: "TARGET", word: "日", x: -280, y: 240, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t2", type: "TARGET", word: "山", x: 0, y: 260, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t3", type: "TARGET", word: "月", x: 280, y: 240, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t4", type: "TARGET", word: "水", x: -400, y: 140, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t5", type: "TARGET", word: "天", x: -140, y: 150, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t6", type: "TARGET", word: "大", x: 140, y: 150, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t7", type: "TARGET", word: "田", x: 400, y: 140, width: 84, height: 84, shape: "CIRCLE", rotation: 0 },
      { id: "t8", type: "TARGET", word: "羊", x: 0, y: 140, width: 84, height: 84, shape: "CIRCLE", rotation: 0 }
    ]
  }
];
