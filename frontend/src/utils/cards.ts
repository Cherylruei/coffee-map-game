// 卡片資料 - 12 張咖啡產地卡
export interface Card {
  id: number;
  name: string;
  rarity: 'SSR' | 'SR' | 'R' | 'N';
  origin: string;
  description: string;
  weight: number;
  image: string;
}

export const CARDS: Record<number, Card> = {
  1: {
    id: 1,
    name: '巴拿馬藝伎',
    rarity: 'SSR',
    origin: '巴拿馬',
    description: '世界上最昂貴的咖啡品種之一，具有獨特的花香和柑橘風味。',
    weight: 2.5,
    image: '/cards/geisha.jpg'
  },
  2: {
    id: 2,
    name: '牙買加藍山',
    rarity: 'SSR',
    origin: '牙買加',
    description: '生長於海拔2000米以上，口感醇厚，酸度適中。',
    weight: 2.5,
    image: '/cards/blue-mountain.jpg'
  },
  3: {
    id: 3,
    name: '耶加雪菲',
    rarity: 'SR',
    origin: '衣索比亞',
    description: '帶有明亮的檸檬酸和花香，被譽為咖啡界的花旦。',
    weight: 5,
    image: '/cards/yirgacheffe.jpg'
  },
  4: {
    id: 4,
    name: '科納',
    rarity: 'SR',
    origin: '夏威夷',
    description: '火山土壤賦予獨特風味，口感順滑，略帶堅果香。',
    weight: 5,
    image: '/cards/kona.jpg'
  },
  5: {
    id: 5,
    name: '肯亞AA',
    rarity: 'SR',
    origin: '肯亞',
    description: '酸度明亮，帶有莓果和黑醋栗風味，層次豐富。',
    weight: 5,
    image: '/cards/kenya-aa.jpg'
  },
  6: {
    id: 6,
    name: '哥倫比亞',
    rarity: 'R',
    origin: '哥倫比亞',
    description: '平衡的酸度和甜度，帶有焦糖和巧克力風味。',
    weight: 10,
    image: '/cards/colombia.jpg'
  },
  7: {
    id: 7,
    name: '瓜地馬拉',
    rarity: 'R',
    origin: '瓜地馬拉',
    description: '火山土壤培育，帶有煙燻味和巧克力香氣。',
    weight: 10,
    image: '/cards/guatemala.jpg'
  },
  8: {
    id: 8,
    name: '曼特寧',
    rarity: 'R',
    origin: '印尼',
    description: '醇厚濃郁，帶有草本和泥土芳香，口感厚實。',
    weight: 10,
    image: '/cards/mandheling.jpg'
  },
  9: {
    id: 9,
    name: '哥斯大黎加',
    rarity: 'R',
    origin: '哥斯大黎加',
    description: '明亮的酸度，帶有蜂蜜和柑橘風味，乾淨清爽。',
    weight: 10,
    image: '/cards/costa-rica.jpg'
  },
  10: {
    id: 10,
    name: '巴西',
    rarity: 'N',
    origin: '巴西',
    description: '世界最大咖啡產國，口感溫和，帶有堅果和巧克力味。',
    weight: 16.7,
    image: '/cards/brazil.jpg'
  },
  11: {
    id: 11,
    name: '越南',
    rarity: 'N',
    origin: '越南',
    description: '以羅布斯塔豆為主，口感濃烈，咖啡因含量高。',
    weight: 16.7,
    image: '/cards/vietnam.jpg'
  },
  12: {
    id: 12,
    name: '坦尚尼亞',
    rarity: 'N',
    origin: '坦尚尼亞',
    description: '酸度明亮，帶有葡萄柚和黑醋栗風味。',
    weight: 16.6,
    image: '/cards/tanzania.jpg'
  }
};

// 稀有度顏色配置
export const RARITY_COLORS = {
  SSR: {
    bg: 'linear-gradient(135deg, #ffd700 0%, #ffed4e 50%, #ffd700 100%)',
    border: '#ffd700',
    glow: '0 0 20px rgba(255, 215, 0, 0.8)',
    text: '#8b6914'
  },
  SR: {
    bg: 'linear-gradient(135deg, #e6e6fa 0%, #dda0dd 50%, #e6e6fa 100%)',
    border: '#ba55d3',
    glow: '0 0 15px rgba(221, 160, 221, 0.6)',
    text: '#6a0dad'
  },
  R: {
    bg: 'linear-gradient(135deg, #4169e1 0%, #6495ed 50%, #4169e1 100%)',
    border: '#4169e1',
    glow: '0 0 10px rgba(65, 105, 225, 0.5)',
    text: '#000080'
  },
  N: {
    bg: 'linear-gradient(135deg, #d3d3d3 0%, #a9a9a9 50%, #d3d3d3 100%)',
    border: '#808080',
    glow: 'none',
    text: '#505050'
  }
};

// 抽卡權重邏輯
export function weightedRandom(): number {
  const totalWeight = Object.values(CARDS).reduce((sum, card) => sum + card.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const card of Object.values(CARDS)) {
    random -= card.weight;
    if (random <= 0) {
      return card.id;
    }
  }
  
  return 1; // fallback
}
