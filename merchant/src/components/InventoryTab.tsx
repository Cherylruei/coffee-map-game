import { useState, useEffect, useCallback } from 'react';
import { TodayStats, InventoryRecord } from '../types';
import { api } from '../utils/api';

interface Props {
  sessionToken: string;
  staffName: string;
  refreshSignal: number;
}

// 補貨建議計算（基於今日用量）
function calcSuggestion(usedGrams: number, usedMl: number) {
  // 每包 500g、建議緩衝：ceil(used/400) 包
  const coffeeBags = Math.max(1, Math.ceil(usedGrams / 400));
  const coffeeGrams = coffeeBags * 500;
  // 每瓶 900ml、建議緩衝：ceil(used/500) 瓶
  const milkBottles = Math.max(1, Math.ceil(usedMl / 500));
  const milkMl = milkBottles * 900;
  return { coffeeBags, coffeeGrams, milkBottles, milkMl };
}

export function InventoryTab({
  sessionToken,
  staffName,
  refreshSignal,
}: Props) {
  const [todayStats, setTodayStats] = useState<TodayStats | null>(null);
  const [lastInventory, setLastInventory] = useState<InventoryRecord | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  // 盤點輸入
  const [coffeeBags, setCoffeeBags] = useState('');
  const [coffeeGrams, setCoffeeGrams] = useState('');
  const [milkBottles, setMilkBottles] = useState('');
  const [milkMl, setMilkMl] = useState('');
  const [saving, setSaving] = useState(false);

  // 補貨輸入
  const [restockCoffeeBags, setRestockCoffeeBags] = useState('');
  const [restockCoffeeGrams, setRestockCoffeeGrams] = useState('');
  const [restockMilkBottles, setRestockMilkBottles] = useState('');
  const [restockMilkMl, setRestockMilkMl] = useState('');
  const [restocking, setRestocking] = useState(false);
  const [restocked, setRestocked] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [statsRes, lastRes] = await Promise.all([
      api<{ success: boolean } & TodayStats>(
        '/api/admin/stats/today',
        sessionToken,
      ),
      api<{ success: boolean; inventory: InventoryRecord | null }>(
        '/api/inventory/last',
        sessionToken,
      ),
    ]);
    if (statsRes?.success) setTodayStats(statsRes as unknown as TodayStats);
    if (lastRes?.success) setLastInventory(lastRes.inventory ?? null);
    setLoading(false);
  }, [sessionToken]);

  // 靜默重新載入（不顯示全頁載入中）
  const silentReload = useCallback(async () => {
    const [statsRes, lastRes] = await Promise.all([
      api<{ success: boolean } & TodayStats>(
        '/api/admin/stats/today',
        sessionToken,
      ),
      api<{ success: boolean; inventory: InventoryRecord | null }>(
        '/api/inventory/last',
        sessionToken,
      ),
    ]);
    if (statsRes?.success) setTodayStats(statsRes as unknown as TodayStats);
    if (lastRes?.success) setLastInventory(lastRes.inventory ?? null);
  }, [sessionToken]);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  // 補貨計算
  const restockCoffeeInput = parseInt(restockCoffeeBags) || 0;
  const restockCoffeeGramsInput = parseInt(restockCoffeeGrams) || 0;
  const restockMilkInput = parseInt(restockMilkBottles) || 0;
  const restockMilkMlInput = parseInt(restockMilkMl) || 0;
  const restockCoffeeTotalGrams = restockCoffeeInput * 500 + restockCoffeeGramsInput;
  const restockMilkTotalMl = restockMilkInput * 900 + restockMilkMlInput;
  const hasRestockInput = restockCoffeeTotalGrams > 0 || restockMilkTotalMl > 0;

  // 計算今日用量（比對上次剩餘）
  const coffeeBeansInput = parseInt(coffeeBags) || 0;
  const coffeeGramsInput = parseInt(coffeeGrams) || 0;
  const milkBottlesInput = parseInt(milkBottles) || 0;
  const milkMlInput = parseInt(milkMl) || 0;

  let coffeeUsedGrams: number | null = null;
  let milkUsedMl: number | null = null;

  if (lastInventory && (coffeeBeansInput > 0 || coffeeGramsInput > 0)) {
    const prevTotalGrams =
      lastInventory.coffee_beans_bags * 500 + lastInventory.coffee_beans_grams;
    const currTotalGrams = coffeeBeansInput * 500 + coffeeGramsInput;
    coffeeUsedGrams = Math.max(0, prevTotalGrams - currTotalGrams);
  }

  if (lastInventory && (milkBottlesInput > 0 || milkMlInput > 0)) {
    const prevTotalMl =
      lastInventory.milk_bottles * 900 + lastInventory.milk_ml;
    const currTotalMl = milkBottlesInput * 900 + milkMlInput;
    milkUsedMl = Math.max(0, prevTotalMl - currTotalMl);
  }

  const suggestion =
    coffeeUsedGrams !== null && milkUsedMl !== null
      ? calcSuggestion(coffeeUsedGrams, milkUsedMl)
      : null;

  async function handleSubmit() {
    if (!coffeeBags && !coffeeGrams && !milkBottles && !milkMl) {
      alert('請至少輸入一項盤點資料');
      return;
    }
    setSaving(true);
    try {
      const result = await api<{ success: boolean }>(
        '/api/inventory/daily',
        sessionToken,
        {
          method: 'POST',
          body: JSON.stringify({
            coffeeBeansBags: coffeeBeansInput,
            coffeeBeansGrams: coffeeGramsInput,
            milkBottles: milkBottlesInput,
            milkMl: milkMlInput,
            completedBy: staffName,
          }),
        },
      );
      setSaving(false);
      if (result && (result as any).success) {
        setSubmitted(true);
      } else {
        const errorMsg = (result as any)?.message || '提交失敗，請稍後再試';
        console.error('盤點提交失敗:', result);
        alert(errorMsg);
      }
    } catch (error) {
      setSaving(false);
      console.error('盤點提交錯誤:', error);
      alert('提交失敗，請確認網路連線');
    }
  }

  async function handleRestock() {
    if (!hasRestockInput) {
      alert('請至少輸入一項補貨數量');
      return;
    }
    setRestocking(true);
    try {
      // 取得目前庫存，加上補貨量
      const prevBags = lastInventory?.coffee_beans_bags || 0;
      const prevGrams = lastInventory?.coffee_beans_grams || 0;
      const prevMilkBottles = lastInventory?.milk_bottles || 0;
      const prevMilkMl = lastInventory?.milk_ml || 0;

      const prevTotalCoffee = prevBags * 500 + prevGrams;
      const prevTotalMilk = prevMilkBottles * 900 + prevMilkMl;

      const newTotalCoffee = prevTotalCoffee + restockCoffeeTotalGrams;
      const newTotalMilk = prevTotalMilk + restockMilkTotalMl;

      const newCoffeeBags = Math.floor(newTotalCoffee / 500);
      const newCoffeeGrams = newTotalCoffee % 500;
      const newMilkBottles = Math.floor(newTotalMilk / 900);
      const newMilkMl = newTotalMilk % 900;

      const result = await api<{ success: boolean }>(
        '/api/inventory/daily',
        sessionToken,
        {
          method: 'POST',
          body: JSON.stringify({
            coffeeBeansBags: newCoffeeBags,
            coffeeBeansGrams: newCoffeeGrams,
            milkBottles: newMilkBottles,
            milkMl: newMilkMl,
            completedBy: staffName,
          }),
        },
      );
      setRestocking(false);
      if (result && (result as any).success) {
        setRestocked(true);
        setRestockCoffeeBags('');
        setRestockCoffeeGrams('');
        setRestockMilkBottles('');
        setRestockMilkMl('');
        silentReload(); // 重新載入庫存數據（不顯示載入中）
        setTimeout(() => setRestocked(false), 3000);
      } else {
        const errorMsg = (result as any)?.message || '補貨記錄失敗';
        alert(errorMsg);
      }
    } catch (error) {
      setRestocking(false);
      console.error('補貨提交錯誤:', error);
      alert('補貨提交失敗，請確認網路連線');
    }
  }

  if (loading) {
    return (
      <p
        style={{
          color: 'var(--muted)',
          textAlign: 'center',
          padding: '40px 0',
        }}
      >
        載入中…
      </p>
    );
  }

  if (submitted) {
    return (
      <div
        className='card'
        style={{ textAlign: 'center', padding: '40px 20px' }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>
          盤點完成！
        </div>
        <div
          style={{
            color: 'var(--muted)',
            fontSize: '0.85rem',
            marginBottom: 20,
          }}
        >
          資料已保存
        </div>
        {suggestion && (
          <div className='suggestion-box'>
            <div className='suggestion-title'>💡 下次建議攜帶</div>
            <div className='suggestion-row'>
              <span>☕ 咖啡豆</span>
              <span>
                {suggestion.coffeeBags} 包（約 {suggestion.coffeeGrams}g）
              </span>
            </div>
            <div className='suggestion-row'>
              <span>🥛 牛奶</span>
              <span>
                {suggestion.milkBottles} 瓶（約 {suggestion.milkMl}ml）
              </span>
            </div>
          </div>
        )}
        <button
          className='btn outline'
          style={{ marginTop: 16 }}
          onClick={() => {
            setSubmitted(false);
            load();
          }}
        >
          重新查看
        </button>
      </div>
    );
  }

  const today = todayStats?.date || new Date().toISOString().split('T')[0];

  return (
    <>
      {/* 日期標題 */}
      <div className='inv-date-bar'>
        <span>📦 每日盤點</span>
        <span className='inv-date'>{today}</span>
      </div>

      {/* 當日統計 */}
      {todayStats && (
        <div className='card'>
          <h2>📊 當日統計</h2>
          <div className='inv-stats-grid'>
            <div className='inv-stat-item'>
              <div className='inv-stat-num'>{todayStats.totalOrders}</div>
              <div className='inv-stat-lbl'>訂單數</div>
            </div>
            <div className='inv-stat-item'>
              <div className='inv-stat-num'>{todayStats.totalCups}</div>
              <div className='inv-stat-lbl'>總杯數</div>
            </div>
            <div className='inv-stat-item' style={{ gridColumn: 'span 2' }}>
              <div className='inv-stat-num inv-revenue'>
                ${todayStats.totalRevenue.toLocaleString()}
              </div>
              <div className='inv-stat-lbl'>總營收</div>
            </div>
          </div>

          {/* 付款分類 */}
          <div className='inv-section-title'>💰 收款方式</div>
          <div className='inv-breakdown'>
            <div className='inv-breakdown-row'>
              <span>💵 現金</span>
              <span>
                {todayStats.cash.count} 筆・$
                {todayStats.cash.amount.toLocaleString()}
              </span>
            </div>
            <div className='inv-breakdown-row'>
              <span>💚 LINE Pay</span>
              <span>
                {todayStats.linePay.count} 筆・$
                {todayStats.linePay.amount.toLocaleString()}
              </span>
            </div>
          </div>

          {/* 店員統計 */}
          {todayStats.staffBreakdown.length > 0 && (
            <>
              <div className='inv-section-title'>👤 店員收款</div>
              <div className='inv-breakdown'>
                {todayStats.staffBreakdown.map((s) => (
                  <div key={s.name} className='inv-breakdown-row'>
                    <span>{s.name}</span>
                    <span>
                      {s.count} 筆・${s.amount.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 熱銷排行 */}
          {todayStats.topItems.length > 0 && (
            <>
              <div className='inv-section-title'>☕ 熱銷排行</div>
              <div className='inv-breakdown'>
                {todayStats.topItems.map((item, i) => (
                  <div key={item.name} className='inv-breakdown-row'>
                    <span>
                      {i + 1}. {item.name}
                    </span>
                    <span>{item.count} 杯</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 庫存現況 */}
      {lastInventory && (
        <div className='card'>
          <h2>📊 庫存現況</h2>
          <div className='inv-stats-grid'>
            <div className='inv-stat-item'>
              <div className='inv-stat-num'>
                {lastInventory.coffee_beans_bags}
              </div>
              <div className='inv-stat-lbl'>咖啡豆（包）</div>
            </div>
            <div className='inv-stat-item'>
              <div className='inv-stat-num'>
                {lastInventory.coffee_beans_grams}
              </div>
              <div className='inv-stat-lbl'>咖啡豆（克）</div>
            </div>
            <div className='inv-stat-item'>
              <div className='inv-stat-num'>
                {lastInventory.milk_bottles}
              </div>
              <div className='inv-stat-lbl'>牛奶（瓶）</div>
            </div>
            <div className='inv-stat-item'>
              <div className='inv-stat-num'>
                {lastInventory.milk_ml}
              </div>
              <div className='inv-stat-lbl'>牛奶（ml）</div>
            </div>
          </div>
          <div className='inv-stock-summary'>
            <div className='inv-breakdown-row'>
              <span>☕ 咖啡豆總量</span>
              <span>{lastInventory.coffee_beans_bags * 500 + lastInventory.coffee_beans_grams}g</span>
            </div>
            <div className='inv-breakdown-row'>
              <span>🥛 牛奶總量</span>
              <span>{lastInventory.milk_bottles * 900 + lastInventory.milk_ml}ml</span>
            </div>
          </div>
        </div>
      )}

      {/* 補貨區 */}
      <div className='restock-section'>
        <h2>🚚 咖啡豆 / 牛奶補貨</h2>

        {/* 咖啡豆補貨 */}
        <div className='restock-material'>
          <div className='restock-material-title'>☕ 咖啡豆補貨</div>
          <div className='restock-input-row'>
            <div className='restock-input-group'>
              <input
                className='restock-input'
                type='number'
                min='0'
                placeholder='0'
                value={restockCoffeeBags}
                onChange={(e) => setRestockCoffeeBags(e.target.value)}
              />
              <span className='restock-unit'>包</span>
            </div>
            <div className='restock-input-group'>
              <input
                className='restock-input'
                type='number'
                min='0'
                placeholder='0'
                value={restockCoffeeGrams}
                onChange={(e) => setRestockCoffeeGrams(e.target.value)}
              />
              <span className='restock-unit'>克</span>
            </div>
          </div>
          {restockCoffeeTotalGrams > 0 && (
            <div className='restock-total'>
              ＝ {restockCoffeeTotalGrams}g
            </div>
          )}
        </div>

        {/* 牛奶補貨 */}
        <div className='restock-material'>
          <div className='restock-material-title'>🥛 牛奶補貨</div>
          <div className='restock-input-row'>
            <div className='restock-input-group'>
              <input
                className='restock-input'
                type='number'
                min='0'
                placeholder='0'
                value={restockMilkBottles}
                onChange={(e) => setRestockMilkBottles(e.target.value)}
              />
              <span className='restock-unit'>瓶</span>
            </div>
            <div className='restock-input-group'>
              <input
                className='restock-input'
                type='number'
                min='0'
                placeholder='0'
                value={restockMilkMl}
                onChange={(e) => setRestockMilkMl(e.target.value)}
              />
              <span className='restock-unit'>ml</span>
            </div>
          </div>
          {restockMilkTotalMl > 0 && (
            <div className='restock-total'>
              ＝ {restockMilkTotalMl}ml
            </div>
          )}
        </div>

        {/* 補貨匯總 */}
        {hasRestockInput && (
          <div className='restock-total-box'>
            <div className='restock-total-title'>📋 補貨匯總</div>
            {restockCoffeeTotalGrams > 0 && (
              <div className='restock-total-row'>
                <span>☕ 咖啡豆</span>
                <span>+{restockCoffeeInput > 0 ? `${restockCoffeeInput} 包` : ''}{restockCoffeeGramsInput > 0 ? `${restockCoffeeInput > 0 ? ' + ' : ''}${restockCoffeeGramsInput}g` : ''}（共 {restockCoffeeTotalGrams}g）</span>
              </div>
            )}
            {restockMilkTotalMl > 0 && (
              <div className='restock-total-row'>
                <span>🥛 牛奶</span>
                <span>+{restockMilkInput > 0 ? `${restockMilkInput} 瓶` : ''}{restockMilkMlInput > 0 ? `${restockMilkInput > 0 ? ' + ' : ''}${restockMilkMlInput}ml` : ''}（共 {restockMilkTotalMl}ml）</span>
              </div>
            )}
          </div>
        )}

        <button
          className={`btn full${restocked ? ' saved' : ''}`}
          style={{ marginTop: 16 }}
          onClick={handleRestock}
          disabled={restocking || !hasRestockInput}
        >
          {restocking ? '提交中…' : restocked ? '✅ 補貨已記錄' : '確認補貨'}
        </button>
      </div>

      {/* 原料盤點 */}
      <div className='card'>
        <h2>📦 原料盤點</h2>

        {/* 咖啡豆 */}
        <div className='inv-material-section'>
          <div className='inv-material-title'>☕ 咖啡豆剩餘</div>
          <div className='inv-input-row'>
            <div className='inv-input-group'>
              <input
                className='inv-input'
                type='number'
                min='0'
                placeholder='0'
                value={coffeeBags}
                onChange={(e) => setCoffeeBags(e.target.value)}
              />
              <span className='inv-unit'>包</span>
            </div>
            <div className='inv-input-group'>
              <input
                className='inv-input'
                type='number'
                min='0'
                placeholder='0'
                value={coffeeGrams}
                onChange={(e) => setCoffeeGrams(e.target.value)}
              />
              <span className='inv-unit'>克</span>
            </div>
          </div>
          {coffeeUsedGrams !== null && (
            <div className='inv-usage-hint'>
              本日用量：約 {(coffeeUsedGrams / 500).toFixed(1)} 包（
              {coffeeUsedGrams}g）
            </div>
          )}
        </div>

        {/* 牛奶 */}
        <div className='inv-material-section'>
          <div className='inv-material-title'>🥛 牛奶剩餘</div>
          <div className='inv-input-row'>
            <div className='inv-input-group'>
              <input
                className='inv-input'
                type='number'
                min='0'
                placeholder='0'
                value={milkBottles}
                onChange={(e) => setMilkBottles(e.target.value)}
              />
              <span className='inv-unit'>瓶</span>
            </div>
            <div className='inv-input-group'>
              <input
                className='inv-input'
                type='number'
                min='0'
                placeholder='0'
                value={milkMl}
                onChange={(e) => setMilkMl(e.target.value)}
              />
              <span className='inv-unit'>ml</span>
            </div>
          </div>
          {milkUsedMl !== null && (
            <div className='inv-usage-hint'>
              本日用量：約 {(milkUsedMl / 900).toFixed(1)} 瓶（{milkUsedMl}ml）
            </div>
          )}
        </div>

        {/* 建議補貨 */}
        {suggestion && (
          <div className='suggestion-box'>
            <div className='suggestion-title'>💡 下次建議攜帶</div>
            <div className='suggestion-row'>
              <span>☕ 咖啡豆</span>
              <span>
                {suggestion.coffeeBags} 包（約 {suggestion.coffeeGrams}g）
              </span>
            </div>
            <div className='suggestion-row'>
              <span>🥛 牛奶</span>
              <span>
                {suggestion.milkBottles} 瓶（約 {suggestion.milkMl}ml）
              </span>
            </div>
          </div>
        )}

        <button
          className='btn full'
          style={{ marginTop: 16 }}
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? '提交中…' : '確認並完成'}
        </button>
      </div>
    </>
  );
}
