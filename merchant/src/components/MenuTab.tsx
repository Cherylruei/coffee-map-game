import { createContext, useContext, useEffect, useState } from 'react';
import { api, API_BASE } from '../utils/api';
import type { MenuCategory, MenuItem } from '../types';

// ═════════════════════════════════════════════════════════════════════════════
// Context  (shared state for all compound sub-components)
// ═════════════════════════════════════════════════════════════════════════════

interface MenuTabContextValue {
  updateItemName: (catId: string, itemId: string, name: string) => void;
  updateItemPrice: (catId: string, itemId: string, price: number) => void;
  toggleAvailable: (catId: string, itemId: string) => void;
  addItem: (catId: string) => void;
  deleteItem: (catId: string, itemId: string) => void;
  markDirty: () => void;
}

const MenuTabContext = createContext<MenuTabContextValue | null>(null);

function useMenuTab() {
  const ctx = useContext(MenuTabContext);
  if (!ctx) throw new Error('Must be used inside MenuTab');
  return ctx;
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-component: ItemEditor  (inline edit for a single field)
// ═════════════════════════════════════════════════════════════════════════════

interface ItemEditorProps {
  type: 'text' | 'number';
  value: string | number;
  onCommit: (value: string) => void;
}

function ItemEditor({ type, value, onCommit }: ItemEditorProps) {
  const [draft, setDraft] = useState(String(value));

  function commit() {
    onCommit(draft);
  }

  return (
    <input
      type={type}
      value={draft}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      className="menu-inline-input"
    />
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-component: Item
// ═════════════════════════════════════════════════════════════════════════════

interface ItemProps {
  catId: string;
  item: MenuItem;
}

function Item({ catId, item }: ItemProps) {
  const { updateItemName, updateItemPrice, toggleAvailable, deleteItem, markDirty } =
    useMenuTab();

  const [editingName, setEditingName] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);

  function commitName(val: string) {
    updateItemName(catId, item.id, val.trim() || item.name);
    markDirty();
    setEditingName(false);
  }

  function commitPrice(val: string) {
    const parsed = parseInt(val, 10);
    updateItemPrice(catId, item.id, isNaN(parsed) ? item.price : parsed);
    markDirty();
    setEditingPrice(false);
  }

  return (
    <div className="menu-tab-item" data-testid="menu-item" data-catid={catId}>
      <div className="menu-tab-item-info">
        {/* Name */}
        {editingName ? (
          <ItemEditor type="text" value={item.name} onCommit={commitName} />
        ) : (
          <span
            className="menu-tab-item-name"
            onClick={() => setEditingName(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && setEditingName(true)}
          >
            {item.name}
          </span>
        )}

        {/* Price */}
        {editingPrice ? (
          <ItemEditor type="number" value={item.price} onCommit={commitPrice} />
        ) : (
          <span
            className="menu-tab-item-price"
            onClick={() => setEditingPrice(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && setEditingPrice(true)}
          >
            ${item.price}
          </span>
        )}
      </div>

      {/* Toggle */}
      <button
        className={`toggle-btn${item.available ? ' on' : ' off'}`}
        onClick={() => { toggleAvailable(catId, item.id); markDirty(); }}
      >
        {item.available ? '供應中' : '售完'}
      </button>

      {/* Delete */}
      <button
        className="delete-btn"
        aria-label="刪除"
        onClick={() => { deleteItem(catId, item.id); markDirty(); }}
      >
        🗑
      </button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-component: Category
// ═════════════════════════════════════════════════════════════════════════════

interface CategoryProps {
  category: MenuCategory;
}

function Category({ category }: CategoryProps) {
  const { addItem, markDirty } = useMenuTab();

  return (
    <div className="menu-tab-category">
      <div className="menu-tab-cat-title">{category.name}系列</div>
      {category.items.length === 0 ? (
        <div className="menu-tab-empty-hint">目前尚未有品項</div>
      ) : (
        category.items.map((item) => (
          <Item key={item.id} catId={category.id} item={item} />
        ))
      )}
      <button
        className="add-item-btn"
        onClick={() => { addItem(category.id); markDirty(); }}
      >
        + 新增品項
      </button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Root component: MenuTab
// ═════════════════════════════════════════════════════════════════════════════

interface Props {
  sessionToken: string;
}

function MenuTabRoot({ sessionToken }: Props) {
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

  // ── State mutators passed via context ──────────────────────────────────────

  function patchItem(
    catId: string,
    itemId: string,
    patch: Partial<MenuItem>
  ) {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id !== catId
          ? cat
          : {
              ...cat,
              items: cat.items.map((item) =>
                item.id !== itemId ? item : { ...item, ...patch }
              ),
            }
      )
    );
  }

  function updateItemName(catId: string, itemId: string, name: string) {
    patchItem(catId, itemId, { name });
  }

  function updateItemPrice(catId: string, itemId: string, price: number) {
    patchItem(catId, itemId, { price });
  }

  function toggleAvailable(catId: string, itemId: string) {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id !== catId
          ? cat
          : {
              ...cat,
              items: cat.items.map((item) =>
                item.id !== itemId ? item : { ...item, available: !item.available }
              ),
            }
      )
    );
  }

  function addItem(catId: string) {
    const newItem: MenuItem = {
      id: `item-${Date.now()}`,
      name: '新品項',
      price: 0,
      available: true,
    };
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id !== catId ? cat : { ...cat, items: [...cat.items, newItem] }
      )
    );
  }

  function deleteItem(catId: string, itemId: string) {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id !== catId
          ? cat
          : { ...cat, items: cat.items.filter((item) => item.id !== itemId) }
      )
    );
  }

  function markDirty() {
    setSaved(false);
  }

  // ── Save ───────────────────────────────────────────────────────────────────

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

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="tab-loading">載入菜單中…</div>;

  const contextValue: MenuTabContextValue = {
    updateItemName,
    updateItemPrice,
    toggleAvailable,
    addItem,
    deleteItem,
    markDirty,
  };

  return (
    <MenuTabContext.Provider value={contextValue}>
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

        <p className="menu-tab-hint">點擊名稱或價格可直接編輯，完成後按儲存</p>

        {categories.map((cat) => (
          <MenuTab.Category key={cat.id} category={cat} />
        ))}
      </div>
    </MenuTabContext.Provider>
  );
}

// ── Attach sub-components (Compound Components pattern) ──────────────────────
MenuTabRoot.Category = Category;
MenuTabRoot.Item = Item;

export const MenuTab = MenuTabRoot;
