/**
 * 全局常量导出契约测试（防止占位图路径、分页大小被误改导致线上问题）
 */

const constants = require("../../config/constants");

describe("config/constants", () => {
  test("导出字段齐全且类型正确", () => {
    expect(constants).toEqual(
      expect.objectContaining({
        AI_SERVICE_URL: expect.any(String),
        DEFAULT_AVATAR: expect.any(String),
        PAGE_SIZE: expect.any(Number),
      })
    );
  });

  test("DEFAULT_AVATAR 指向项目内资源", () => {
    expect(constants.DEFAULT_AVATAR).toMatch(/^\/assets\//);
  });

  test("PAGE_SIZE 为正整数", () => {
    expect(Number.isInteger(constants.PAGE_SIZE)).toBe(true);
    expect(constants.PAGE_SIZE).toBeGreaterThan(0);
  });
});
