import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MenuTab } from './MenuTab';
import type { MenuCategory } from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockCategories: MenuCategory[] = [
  {
    id: 'cat-1',
    name: '熱飲',
    items: [
      { id: 'item-1', name: '拿鐵', price: 120, available: true },
      { id: 'item-2', name: '美式', price: 90, available: false },
    ],
  },
  {
    id: 'cat-2',
    name: '冷飲',
    items: [
      { id: 'item-3', name: '冰拿鐵', price: 130, available: true },
    ],
  },
];

// ── API mock ──────────────────────────────────────────────────────────────────

vi.mock('../utils/api', () => ({
  API_BASE: 'http://localhost',
  api: vi.fn(),
}));

// mock global fetch for initial data loading
const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

function setupFetch(categories = mockCategories) {
  mockFetch.mockResolvedValue({
    json: () => Promise.resolve({ success: true, categories }),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderMenuTab() {
  return render(<MenuTab sessionToken="test-token" />);
}

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('MenuTab', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    setupFetch();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  describe('初始渲染', () => {
    it('顯示所有分類名稱', async () => {
      renderMenuTab();
      await screen.findByText('熱飲系列');
      expect(screen.getByText('冷飲系列')).toBeInTheDocument();
    });

    it('顯示所有品項名稱和價格', async () => {
      renderMenuTab();
      await screen.findByText('拿鐵');
      expect(screen.getByText('美式')).toBeInTheDocument();
      expect(screen.getByText('冰拿鐵')).toBeInTheDocument();
      expect(screen.getByText('$120')).toBeInTheDocument();
      expect(screen.getByText('$90')).toBeInTheDocument();
    });

    it('供應中 / 售完狀態正確顯示', async () => {
      renderMenuTab();
      await screen.findByText('拿鐵');
      const toggleBtns = screen.getAllByRole('button', { name: /供應中|售完/ });
      // item-1 available=true → 供應中, item-2 available=false → 售完
      expect(toggleBtns[0]).toHaveTextContent('供應中');
      expect(toggleBtns[1]).toHaveTextContent('售完');
    });
  });

  // ── Toggle availability (existing behavior) ───────────────────────────────

  describe('切換售完', () => {
    it('點擊切換按鈕後文字改變', async () => {
      renderMenuTab();
      // item-1 (拿鐵) and item-3 (冰拿鐵) are both available — take the first one
      const btns = await screen.findAllByRole('button', { name: '供應中' });
      fireEvent.click(btns[0]);
      expect(btns[0]).toHaveTextContent('售完');
    });
  });

  // ── Inline edit item name ─────────────────────────────────────────────────

  describe('行內編輯品項名稱', () => {
    it('點擊品項名稱後顯示 input 並隱藏文字', async () => {
      renderMenuTab();
      const nameEl = await screen.findByText('拿鐵');
      fireEvent.click(nameEl);
      const input = screen.getByDisplayValue('拿鐵');
      expect(input).toBeInTheDocument();
      expect(input.tagName).toBe('INPUT');
    });

    it('修改 input 後離焦（blur）回到文字模式，顯示新名稱', async () => {
      renderMenuTab();
      const nameEl = await screen.findByText('拿鐵');
      fireEvent.click(nameEl);
      const input = screen.getByDisplayValue('拿鐵');
      fireEvent.change(input, { target: { value: '拿鐵 L' } });
      fireEvent.blur(input);
      expect(screen.getByText('拿鐵 L')).toBeInTheDocument();
    });

    it('按下 Enter 確認編輯', async () => {
      renderMenuTab();
      const nameEl = await screen.findByText('拿鐵');
      fireEvent.click(nameEl);
      const input = screen.getByDisplayValue('拿鐵');
      fireEvent.change(input, { target: { value: '拿鐵特大' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(screen.getByText('拿鐵特大')).toBeInTheDocument();
    });
  });

  // ── Inline edit price ─────────────────────────────────────────────────────

  describe('行內編輯價格', () => {
    it('點擊價格後顯示 number input', async () => {
      renderMenuTab();
      const priceEl = await screen.findByText('$120');
      fireEvent.click(priceEl);
      const input = screen.getByDisplayValue('120');
      expect(input).toBeInTheDocument();
      expect((input as HTMLInputElement).type).toBe('number');
    });

    it('修改價格後離焦，顯示新價格', async () => {
      renderMenuTab();
      const priceEl = await screen.findByText('$120');
      fireEvent.click(priceEl);
      const input = screen.getByDisplayValue('120');
      fireEvent.change(input, { target: { value: '150' } });
      fireEvent.blur(input);
      expect(screen.getByText('$150')).toBeInTheDocument();
    });
  });

  // ── Add item ──────────────────────────────────────────────────────────────

  describe('新增品項', () => {
    it('每個分類底部有「+ 新增品項」按鈕', async () => {
      renderMenuTab();
      await screen.findByText('拿鐵');
      const addBtns = screen.getAllByRole('button', { name: /\+ 新增品項/ });
      expect(addBtns).toHaveLength(2); // 2 categories
    });

    it('點擊新增後，分類中多出一筆預設品項', async () => {
      renderMenuTab();
      await screen.findByText('拿鐵');
      const [firstAddBtn] = screen.getAllByRole('button', { name: /\+ 新增品項/ });
      fireEvent.click(firstAddBtn);
      // 熱飲 originally has 2 items, now should have 3
      const items = screen.getAllByTestId('menu-item');
      const hotItems = items.filter(el => el.closest('[data-catid="cat-1"]'));
      expect(hotItems).toHaveLength(3);
    });
  });

  // ── Delete item ───────────────────────────────────────────────────────────

  describe('刪除品項', () => {
    it('每個品項有刪除按鈕', async () => {
      renderMenuTab();
      await screen.findByText('拿鐵');
      const deleteBtns = screen.getAllByRole('button', { name: /刪除/ });
      expect(deleteBtns).toHaveLength(3); // 3 items total
    });

    it('點擊刪除後，品項從清單消失', async () => {
      renderMenuTab();
      await screen.findByText('拿鐵');
      const [firstDeleteBtn] = screen.getAllByRole('button', { name: /刪除/ });
      fireEvent.click(firstDeleteBtn);
      await waitFor(() => {
        expect(screen.queryByText('拿鐵')).not.toBeInTheDocument();
      });
    });
  });

  // ── Save ──────────────────────────────────────────────────────────────────

  describe('儲存變更', () => {
    it('點擊儲存後呼叫 API PUT /api/menu', async () => {
      const { api } = await import('../utils/api');
      const mockApi = vi.mocked(api);
      mockApi.mockResolvedValue({ success: true } as any);

      renderMenuTab();
      await screen.findByText('拿鐵');
      const saveBtn = screen.getByRole('button', { name: /儲存/ });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(mockApi).toHaveBeenCalledWith(
          '/api/menu',
          'test-token',
          expect.objectContaining({ method: 'PUT' })
        );
      });
    });

    it('儲存成功後顯示「✓ 已儲存」', async () => {
      const { api } = await import('../utils/api');
      vi.mocked(api).mockResolvedValue({ success: true } as any);

      renderMenuTab();
      await screen.findByText('拿鐵');
      fireEvent.click(screen.getByRole('button', { name: /儲存/ }));

      await screen.findByText(/已儲存/);
    });
  });

});
