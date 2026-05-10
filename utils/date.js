/**
 * @file 日期工具函数
 * @description 提供日期格式化、获取当前日期等常用方法
 */

/**
 * 格式化日期
 * @param {Date|string|number} date - 日期对象、时间戳或日期字符串
 * @param {string} pattern - 格式模式，如 "yyyy-MM-dd HH:mm"、"MM/dd" 等
 * @returns {string} 格式化后的日期字符串
 */
const formatDate = (date, pattern = "yyyy-MM-dd") => {
  if (!date) return "";
  
  let d;
  if (date instanceof Date) {
    d = date;
  } else if (typeof date === "string" || typeof date === "number") {
    d = new Date(date);
  } else {
    return "";
  }
  
  // 检查日期是否有效
  if (isNaN(d.getTime())) return "";
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const minute = String(d.getMinutes()).padStart(2, "0");
  const second = String(d.getSeconds()).padStart(2, "0");
  
  return pattern
    .replace("yyyy", year)
    .replace("MM", month)
    .replace("dd", day)
    .replace("HH", hour)
    .replace("mm", minute)
    .replace("ss", second);
};

/**
 * 获取当前月份的第一天（格式：yyyy-MM-dd）
 * @returns {string}
 */
const getCurrentMonthStart = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
};

/**
 * 获取当前日期（格式：yyyy-MM-dd）
 * @returns {string}
 */
const getCurrentDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

/**
 * 计算两个日期之间的天数差
 * @param {string|Date} startDate - 开始日期
 * @param {string|Date} endDate - 结束日期
 * @returns {number}
 */
const daysBetween = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * 获取相对当前日期的偏移日期
 * @param {number} days - 偏移天数（负数表示过去）
 * @returns {string} 格式 yyyy-MM-dd
 */
const getOffsetDate = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return formatDate(date, "yyyy-MM-dd");
};

module.exports = {
  formatDate,
  getCurrentMonthStart,
  getCurrentDate,
  daysBetween,
  getOffsetDate
};