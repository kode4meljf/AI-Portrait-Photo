/**
 * 统一请求封装测试（mock wx.request / wx.getStorageSync）
 */

describe("request", () => {
  let request;

  beforeEach(() => {
    jest.resetModules();
    global.wx = {
      getStorageSync: jest.fn(() => "mock-token"),
      request: jest.fn(),
    };
    ({ request } = require("../../utils/request"));
  });

  afterEach(() => {
    delete global.wx;
  });

  test("成功 200 时 resolve 响应体", async () => {
    wx.request.mockImplementation((opts) => {
      opts.success({ statusCode: 200, data: { ok: true } });
    });

    const data = await request({ url: "/api/ping", method: "GET" });
    expect(data).toEqual({ ok: true });
    expect(wx.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://your-api-domain.com/api/ping",
        method: "GET",
        header: expect.objectContaining({
          Authorization: "mock-token",
        }),
      })
    );
  });

  test("非 200 时 reject", async () => {
    wx.request.mockImplementation((opts) => {
      opts.success({ statusCode: 500, data: {} });
    });

    await expect(request({ url: "/fail" })).rejects.toEqual(
      expect.objectContaining({ statusCode: 500 })
    );
  });

  test("wx.request fail 时 reject", async () => {
    const err = new Error("network");
    wx.request.mockImplementation((opts) => {
      opts.fail(err);
    });

    await expect(request({ url: "/x" })).rejects.toBe(err);
  });

  test("未传 method 时默认 GET", async () => {
    wx.request.mockImplementation((opts) => {
      expect(opts.method).toBe("GET");
      opts.success({ statusCode: 200, data: {} });
    });
    await request({ url: "/only-url" });
  });
});
