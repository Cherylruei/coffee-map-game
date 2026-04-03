import { useEffect, useState } from 'react';
import { api, API_BASE } from '../utils/api';
import type { MenuCategory } from '../types';

interface Props {
  sessionToken: string;
}

export function MenuTab({ sessionToken }: Props) {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/menu`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setCategories(data.categories);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function toggleAvailable(catId: string, itemId: string) {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id !== catId
          ? cat
          : {
              ...cat,
              items: cat.items.map((item) =>
                item.id !== itemId
                  ? item
                  : { ...item, available: !item.available }
              ),
            }
      )
    );
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    const res = await api<{ success: boolean; message?: string }>(
      '/api/menu',
      sessionToken,
      { method: 'PUT', body: JSON.stringify({ categories }) }
    );
    setSaving(false);
    if (res && (res as any).success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      alert((res as any)?.message || '儲存失敗，請確認 Supabase settings 表已建立');
    }
  }

  if (loading) return <div className="tab-loading">載入菜單中…</div>;

  return (
    <div className="menu-tab">
      <div className="menu-tab-header">
        <h2>菜單管理</h2>
        <button
          className={`save-btn${saved ? ' saved' : ''}`}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '儲存中…' : saved ? '✓ 已儲存' : '儲存變更'}
        </button>
      </div>

      <p className="menu-tab-hint">點擊開關切換售完狀態，完成後按儲存</p>

      {categories.map((cat) => (
        <div key={cat.id} className="menu-tab-category">
          <div className="menu-tab-cat-title">{cat.name}系列</div>
          {cat.items.map((item) => (
            <div key={item.id} className="menu-tab-item">
              <div className="menu-tab-item-info">
                <span className="menu-tab-item-name">{item.name}</span>
                <span className="menu-tab-item-price">${item.price}</span>
              </div>
              <button
                className={`toggle-btn${item.available ? ' on' : ' off'}`}
                onClick={() => toggleAvailable(cat.id, item.id)}
              >
                {item.available ? '供應中' : '售完'}
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
