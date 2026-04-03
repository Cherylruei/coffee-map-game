import { useEffect, useState } from 'react';
import './MenuOverlay.css';

interface MenuItem {
  id: string;
  name: string;
  price: number;
  available: boolean;
}

interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// 靜態菜單資料 — 直接維護此處，不需後端
const STATIC_MENU: MenuCategory[] = [
  {
    id: 'americano',
    name: '美式',
    items: [
      { id: 'ice_americano', name: '冰美式', price: 35, available: true },
      { id: 'hot_americano', name: '熱美式', price: 35, available: true },
      { id: 'bubble_americano', name: '泡泡美式', price: 40, available: true },
      {
        id: 'honey_bubble_americano',
        name: '蜂蜜泡泡美式',
        price: 45,
        available: true,
      },
    ],
  },
  {
    id: 'latte',
    name: '拿鐵',
    items: [
      { id: 'ice_latte', name: '冰拿鐵', price: 45, available: true },
      { id: 'hot_latte', name: '熱拿鐵', price: 45, available: true },
      {
        id: 'ice_brown_sugar_latte',
        name: '冰黑糖拿鐵',
        price: 50,
        available: true,
      },
      {
        id: 'hot_brown_sugar_latte',
        name: '熱黑糖拿鐵',
        price: 50,
        available: true,
      },
      {
        id: 'ice_hazelnut_latte',
        name: '冰榛果拿鐵',
        price: 50,
        available: true,
      },
      {
        id: 'hot_hazelnut_latte',
        name: '熱榛果拿鐵',
        price: 50,
        available: true,
      },
      { id: 'ice_honey_latte', name: '冰蜂蜜拿鐵', price: 55, available: true },
      { id: 'hot_honey_latte', name: '熱蜂蜜拿鐵', price: 55, available: true },
    ],
  },
  {
    id: 'custom',
    name: '客製',
    items: [
      { id: 'single_shot', name: 'Single Shot', price: 15, available: true },
    ],
  },
];

const isLocal =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';
const API_BASE =
  import.meta.env.VITE_API_URL ||
  (isLocal
    ? 'http://localhost:3001/api'
    : 'https://coffee-map-game-backend.vercel.app/api');

export function MenuOverlay({ isOpen, onClose }: Props) {
  const [categories, setCategories] = useState<MenuCategory[]>(STATIC_MENU);

  useEffect(() => {
    if (!isOpen) return;
    fetch(`${API_BASE}/menu`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.categories)) {
          setCategories(data.categories);
        }
      })
      .catch(() => {
        /* 打不到 API 時保留 STATIC_MENU */
      });
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className='menu-overlay' onClick={onClose}>
      <div className='menu-sheet' onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className='menu-header'>
          <span className='menu-title'>☕ 今日菜單</span>
          <button className='menu-close' onClick={onClose} aria-label='關閉'>
            ✕
          </button>
        </div>

        <div className='menu-body'>
          {/* 營業時間 */}
          <div className='menu-hours'>
            <span className='menu-hours-icon'>🕐</span>
            <div>
              <div className='menu-hours-title'>營業時間</div>
              <div className='menu-hours-detail'>每週一、三 12:30–13:20</div>
            </div>
          </div>

          <hr className='menu-divider' />

          {categories.map((cat) => (
            <div key={cat.id} className='menu-category'>
              <div className='menu-cat-title'>☕ {cat.name}系列</div>
              <div className='menu-items'>
                {cat.items.map((item) => (
                  <div
                    key={item.id}
                    className={`menu-item${item.available ? '' : ' sold-out'}`}
                  >
                    <span className='menu-item-name'>{item.name}</span>
                    <span className='menu-item-right'>
                      <span className='menu-item-price'>${item.price}</span>
                      {!item.available && (
                        <span className='menu-soldout-badge'>售完</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* 客製化 */}
          <div className='menu-custom'>
            <div className='menu-custom-title'>➕ 客製化選項</div>
            <div className='menu-custom-item'>
              • Double Shot &nbsp;
              <span className='menu-custom-price'>+$15</span>
            </div>
          </div>

          <hr className='menu-divider' />

          {/* 提示 */}
          <div className='menu-tips'>
            <div className='menu-tip'>⚠️ 請記得自備環保杯</div>
            <div className='menu-tip'>💡 到櫃台點單即可抽卡</div>
          </div>
        </div>
      </div>
    </div>
  );
}
