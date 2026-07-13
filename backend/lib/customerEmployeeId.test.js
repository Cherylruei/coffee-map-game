const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  validateCustomerEmployeeId,
  checkChangeCooldown,
  resolveRegistration,
  isUniqueViolation,
  EMPLOYEE_ID_MAX_LENGTH,
  CHANGE_COOLDOWN_DAYS,
} = require('./customerEmployeeId');

// ---------- validateCustomerEmployeeId ----------

test('validateCustomerEmployeeId: 接受純數字並保留開頭的 0', () => {
  const result = validateCustomerEmployeeId('005808');
  assert.deepEqual(result, { ok: true, value: '005808' });
});

test('validateCustomerEmployeeId: 接受英數混合', () => {
  const result = validateCustomerEmployeeId('A1234');
  assert.deepEqual(result, { ok: true, value: 'A1234' });
});

test('validateCustomerEmployeeId: 去除前後空白', () => {
  const result = validateCustomerEmployeeId('  A1234  ');
  assert.deepEqual(result, { ok: true, value: 'A1234' });
});

test('validateCustomerEmployeeId: 空字串回傳 400', () => {
  const result = validateCustomerEmployeeId('');
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.message, '請填寫員工編號');
});

test('validateCustomerEmployeeId: 只有空白回傳 400', () => {
  const result = validateCustomerEmployeeId('   ');
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test('validateCustomerEmployeeId: 非字串（undefined / number）回傳 400', () => {
  assert.equal(validateCustomerEmployeeId(undefined).ok, false);
  assert.equal(validateCustomerEmployeeId(12345).ok, false);
  assert.equal(validateCustomerEmployeeId(null).ok, false);
});

test('validateCustomerEmployeeId: 含特殊字元 / 空格 / 中文 回傳格式錯誤', () => {
  for (const bad of ['A-123', 'A 123', 'A_123', '員編1', 'A@1', 'A.1']) {
    const result = validateCustomerEmployeeId(bad);
    assert.equal(result.ok, false, `應拒絕：${bad}`);
    assert.equal(result.status, 400);
    assert.equal(result.message, '員工編號僅能包含英文字母與數字');
  }
});

test('validateCustomerEmployeeId: 等於上限長度可接受', () => {
  const value = 'A'.repeat(EMPLOYEE_ID_MAX_LENGTH);
  const result = validateCustomerEmployeeId(value);
  assert.deepEqual(result, { ok: true, value });
});

test('validateCustomerEmployeeId: 超過上限長度回傳 400', () => {
  const value = 'A'.repeat(EMPLOYEE_ID_MAX_LENGTH + 1);
  const result = validateCustomerEmployeeId(value);
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test('validateCustomerEmployeeId: 超長但前後空白去除後在上限內可接受', () => {
  const core = 'A'.repeat(EMPLOYEE_ID_MAX_LENGTH);
  const result = validateCustomerEmployeeId(`  ${core}  `);
  assert.deepEqual(result, { ok: true, value: core });
});

// ---------- checkChangeCooldown ----------

test('checkChangeCooldown: 從未登記過（null）視為可修改', () => {
  const result = checkChangeCooldown(null, new Date('2026-07-13T00:00:00Z'));
  assert.deepEqual(result, { ok: true });
});

test(`checkChangeCooldown: 剛好滿 ${CHANGE_COOLDOWN_DAYS} 天可修改`, () => {
  const lastChangedAt = '2026-06-13T00:00:00Z';
  const now = new Date('2026-07-13T00:00:00Z'); // 剛好 30 天後
  const result = checkChangeCooldown(lastChangedAt, now);
  assert.deepEqual(result, { ok: true });
});

test(`checkChangeCooldown: 未滿 ${CHANGE_COOLDOWN_DAYS} 天（差 1 天）擋下並回傳剩餘天數`, () => {
  const lastChangedAt = '2026-06-14T00:00:00Z';
  const now = new Date('2026-07-13T00:00:00Z'); // 只過了 29 天
  const result = checkChangeCooldown(lastChangedAt, now);
  assert.equal(result.ok, false);
  assert.match(result.message, /還需等待 1 天/);
  assert.equal(result.nextEligibleAt, new Date('2026-07-14T00:00:00Z').toISOString());
});

// ---------- resolveRegistration ----------

test('resolveRegistration: 首次登記（未登記、未被占用）成功', () => {
  const result = resolveRegistration({ currentEmployeeId: null, takenByOther: false, value: 'A1234' });
  assert.deepEqual(result, { ok: true });
});

test('resolveRegistration: 首次登記但員編已被其他帳號登記回傳 409', () => {
  const result = resolveRegistration({ currentEmployeeId: null, takenByOther: true, value: 'A1234' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.message, '此員工編號已被其他帳號登記');
});

test('resolveRegistration: 重複送出「同一個」已登記員編視為冪等成功（避免彈窗卡死）', () => {
  const result = resolveRegistration({ currentEmployeeId: '005808', takenByOther: false, value: '005808' });
  assert.deepEqual(result, { ok: true, alreadyRegistered: true });
});

test('resolveRegistration: 冷卻期已過，換成不同且未被占用的員編可修改成功', () => {
  const result = resolveRegistration({
    currentEmployeeId: '005808',
    takenByOther: false,
    value: 'A1234',
    lastChangedAt: '2026-01-01T00:00:00Z',
    now: new Date('2026-07-13T00:00:00Z'),
  });
  assert.deepEqual(result, { ok: true, isChange: true });
});

test('resolveRegistration: 冷卻期未過，換成不同員編回傳 403 並帶回下次可修改時間', () => {
  const result = resolveRegistration({
    currentEmployeeId: '005808',
    takenByOther: false,
    value: 'A1234',
    lastChangedAt: '2026-07-01T00:00:00Z',
    now: new Date('2026-07-13T00:00:00Z'),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.match(result.message, /還需等待/);
  assert.ok(result.nextEligibleAt);
});

test('resolveRegistration: 冷卻期已過但新員編已被其他帳號登記回傳 409', () => {
  const result = resolveRegistration({
    currentEmployeeId: '005808',
    takenByOther: true,
    value: 'A1234',
    lastChangedAt: '2026-01-01T00:00:00Z',
    now: new Date('2026-07-13T00:00:00Z'),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.message, '此員工編號已被其他帳號登記');
});

// ---------- isUniqueViolation ----------

test('isUniqueViolation: Postgres 23505 視為唯一性違反', () => {
  assert.equal(isUniqueViolation({ code: '23505' }), true);
});

test('isUniqueViolation: 其他錯誤碼 / null / undefined 不視為唯一性違反', () => {
  assert.equal(isUniqueViolation({ code: '23503' }), false);
  assert.equal(isUniqueViolation({}), false);
  assert.equal(isUniqueViolation(null), false);
  assert.equal(isUniqueViolation(undefined), false);
});
