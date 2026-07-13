// 會員員工編號（customer_employee_id）登記的純邏輯
// 抽離自路由以便單元測試：格式驗證、登記決策、唯一性違反判斷

// 員編僅允許英文字母與數字（純數字或英數混合）
const EMPLOYEE_ID_PATTERN = /^[A-Za-z0-9]+$/;

// 最大長度，須與資料庫欄位 VARCHAR(50) 一致
const EMPLOYEE_ID_MAX_LENGTH = 50;

// Postgres unique_violation 錯誤碼
const UNIQUE_VIOLATION = '23505';

// 員編修改冷卻期（天）：登記或修改後，需間隔這麼久才能再次修改
const CHANGE_COOLDOWN_DAYS = 30;
const CHANGE_COOLDOWN_MS = CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

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
 * 判斷距離上次登記/修改是否已過冷卻期。
 * @param {string|null} lastChangedAt 最近一次登記/修改的時間（ISO 字串，無則 null）
 * @param {Date} [now]
 * @returns {{ ok: true } | { ok: false, message: string, nextEligibleAt: string }}
 */
function checkChangeCooldown(lastChangedAt, now = new Date()) {
  if (!lastChangedAt) return { ok: true };

  const nextEligibleAt = new Date(new Date(lastChangedAt).getTime() + CHANGE_COOLDOWN_MS);
  if (now < nextEligibleAt) {
    const daysLeft = Math.ceil((nextEligibleAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    return {
      ok: false,
      message: `員工編號修改後需間隔 ${CHANGE_COOLDOWN_DAYS} 天才能再次修改，還需等待 ${daysLeft} 天`,
      nextEligibleAt: nextEligibleAt.toISOString(),
    };
  }
  return { ok: true };
}

/**
 * 依資料庫事實決定登記/修改結果（不含實際寫入）。
 * @param {object} facts
 * @param {string|null} facts.currentEmployeeId 該帳號目前已登記的員編（無則 null）
 * @param {boolean} facts.takenByOther 此員編是否已被其他帳號登記
 * @param {string} facts.value 這次提交的員編
 * @param {string|null} [facts.lastChangedAt] 該帳號最近一次登記/修改的時間（ISO 字串）
 * @param {Date} [facts.now]
 * @returns {{ ok: true, alreadyRegistered?: boolean, isChange?: boolean } | { ok: false, status: number, message: string, customerEmployeeId?: string, nextEligibleAt?: string }}
 */
function resolveRegistration({ currentEmployeeId, takenByOther, value, lastChangedAt = null, now = new Date() }) {
  // 重複送出「同一個」員編視為冪等成功，
  // 避免前端彈窗因快取未同步而重新跳出時，把客人卡在無法關閉的錯誤畫面
  if (currentEmployeeId === value) {
    return { ok: true, alreadyRegistered: !!currentEmployeeId };
  }

  // 尚未登記過：檢查是否被其他帳號占用即可
  if (!currentEmployeeId) {
    if (takenByOther) {
      return { ok: false, status: 409, message: '此員工編號已被其他帳號登記' };
    }
    return { ok: true };
  }

  // 已登記，要換成不同員編：先檢查冷卻期，未到期就不需要再檢查是否被占用
  const cooldown = checkChangeCooldown(lastChangedAt, now);
  if (!cooldown.ok) {
    return { ok: false, status: 403, message: cooldown.message, nextEligibleAt: cooldown.nextEligibleAt };
  }
  if (takenByOther) {
    return { ok: false, status: 409, message: '此員工編號已被其他帳號登記' };
  }
  return { ok: true, isChange: true };
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
  CHANGE_COOLDOWN_DAYS,
  validateCustomerEmployeeId,
  checkChangeCooldown,
  resolveRegistration,
  isUniqueViolation,
};
