// 會員員工編號（customer_employee_id）登記的純邏輯
// 抽離自路由以便單元測試：格式驗證、登記決策、唯一性違反判斷

// 員編僅允許英文字母與數字（純數字或英數混合）
const EMPLOYEE_ID_PATTERN = /^[A-Za-z0-9]+$/;

// 最大長度，須與資料庫欄位 VARCHAR(50) 一致
const EMPLOYEE_ID_MAX_LENGTH = 50;

// Postgres unique_violation 錯誤碼
const UNIQUE_VIOLATION = '23505';

/**
 * 驗證並正規化員編輸入。
 * @param {unknown} raw 使用者輸入
 * @returns {{ ok: true, value: string } | { ok: false, status: number, message: string }}
 */
function validateCustomerEmployeeId(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';

  if (!value) {
    return { ok: false, status: 400, message: '請填寫員工編號' };
  }
  if (!EMPLOYEE_ID_PATTERN.test(value)) {
    return { ok: false, status: 400, message: '員工編號僅能包含英文字母與數字' };
  }
  if (value.length > EMPLOYEE_ID_MAX_LENGTH) {
    return { ok: false, status: 400, message: `員工編號長度不可超過 ${EMPLOYEE_ID_MAX_LENGTH} 個字元` };
  }
  return { ok: true, value };
}

/**
 * 依資料庫事實決定登記結果（不含實際寫入）。
 * @param {object} facts
 * @param {string|null} facts.currentEmployeeId 該帳號目前已登記的員編（無則 null）
 * @param {boolean} facts.takenByOther 此員編是否已被其他帳號登記
 * @returns {{ ok: true } | { ok: false, status: number, message: string, customerEmployeeId?: string }}
 */
function resolveRegistration({ currentEmployeeId, takenByOther }) {
  // 已登記者不可修改
  if (currentEmployeeId) {
    return {
      ok: false,
      status: 409,
      message: '員工編號已登記，無法修改',
      customerEmployeeId: currentEmployeeId,
    };
  }
  // 一個員編只能綁一個 LINE 帳號
  if (takenByOther) {
    return { ok: false, status: 409, message: '此員工編號已被其他帳號登記' };
  }
  return { ok: true };
}

/**
 * 判斷寫入錯誤是否為唯一性違反（競態下由 DB 部分唯一索引擋下）。
 * @param {{ code?: string } | null | undefined} error
 * @returns {boolean}
 */
function isUniqueViolation(error) {
  return !!error && error.code === UNIQUE_VIOLATION;
}

module.exports = {
  EMPLOYEE_ID_PATTERN,
  EMPLOYEE_ID_MAX_LENGTH,
  UNIQUE_VIOLATION,
  validateCustomerEmployeeId,
  resolveRegistration,
  isUniqueViolation,
};
