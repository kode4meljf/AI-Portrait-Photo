/**
 * app.json 路由与页面文件冒烟测试：防止 tab/分包路径拼写错误导致无法编译
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../..");

function readAppJson() {
  const raw = fs.readFileSync(path.join(ROOT, "app.json"), "utf8");
  return JSON.parse(raw);
}

function assertFileExists(relativePath, label) {
  const full = path.join(ROOT, relativePath);
  expect(fs.existsSync(full)).toBe(true);
}

describe("app.json 页面声明", () => {
  const app = readAppJson();

  test("主包 pages 均存在对应 .js", () => {
    for (const p of app.pages) {
      assertFileExists(`${p}.js`, p);
      assertFileExists(`${p}.json`, p);
    }
  });

  test("分包 pages 均存在对应 .js", () => {
    for (const sub of app.subpackages || []) {
      const root = sub.root.replace(/\/$/, "");
      for (const page of sub.pages) {
        const rel = `${root}/${page}`;
        assertFileExists(`${rel}.js`, rel);
        assertFileExists(`${rel}.json`, rel);
      }
    }
  });

  test("tabBar 指向的 pagePath 在主包 pages 中", () => {
    const tabPaths = (app.tabBar && app.tabBar.list) || [];
    for (const item of tabPaths) {
      expect(app.pages).toContain(item.pagePath);
    }
  });
});
