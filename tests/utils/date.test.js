/**
 * 日期工具单元测试（对应 utils/date.js 在订单、相册、统计中的展示逻辑）
 */

const {
  formatDate,
  getCurrentMonthStart,
  getCurrentDate,
  daysBetween,
  getOffsetDate,
} = require("../../utils/date");

describe("formatDate", () => {
  test("空值返回空字符串", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("")).toBe("");
  });

  test("非法日期返回空字符串", () => {
    expect(formatDate("not-a-date")).toBe("");
    expect(formatDate({})).toBe("");
  });

  test("Date 对象按默认 yyyy-MM-dd 格式化", () => {
    const d = new Date(2026, 4, 12, 15, 6, 7); // 月 0-based → 5 月
    expect(formatDate(d)).toBe("2026-05-12");
  });

  test("时间戳与 ISO 字符串", () => {
    // 注意：实现里 `if (!date)` 会把数字 0 当成无效，与 new Date(0) 不同
    expect(formatDate(0, "yyyy-MM-dd")).toBe("");
    expect(formatDate(86400000, "yyyy-MM-dd")).toBe("1970-01-02");
    expect(formatDate("2026-01-02T03:04:05.000Z", "yyyy-MM-dd HH:mm:ss")).toMatch(
      /^2026-01-0[12] \d{2}:\d{2}:\d{2}$/
    );
  });

  test("自定义 pattern 替换顺序", () => {
    const d = new Date(2026, 0, 9, 8, 5, 4);
    expect(formatDate(d, "MM/dd yyyy")).toBe("01/09 2026");
    expect(formatDate(d, "yyyy-MM-dd HH:mm:ss")).toBe("2026-01-09 08:05:04");
  });
});

describe("getCurrentMonthStart / getCurrentDate / getOffsetDate", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // 与 package.json 中 TZ=UTC 一致，避免各 CI 本地时区导致断言漂移
    jest.setSystemTime(new Date(Date.UTC(2026, 4, 12, 12, 0, 0)));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("getCurrentMonthStart 为当月第一天", () => {
    expect(getCurrentMonthStart()).toBe("2026-05-01");
  });

  test("getCurrentDate 为当天日期字符串", () => {
    expect(getCurrentDate()).toBe("2026-05-12");
  });

  test("getOffsetDate 正偏移", () => {
    expect(getOffsetDate(3)).toBe("2026-05-15");
  });

  test("getOffsetDate 负偏移", () => {
    expect(getOffsetDate(-5)).toBe("2026-05-07");
  });
});

describe("daysBetween", () => {
  test("同字符串日期的天数差", () => {
    expect(daysBetween("2026-05-01", "2026-05-10")).toBe(9);
  });

  test("顺序颠倒仍取绝对值", () => {
    expect(daysBetween("2026-05-10", "2026-05-01")).toBe(9);
  });
});
