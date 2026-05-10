const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const templates = [
    {
      id: "1",
      name: "油画质感",
      thumb: "https://picsum.photos/400/400?random=61",
      prompt: "油画风格，笔触细腻，色彩浓郁，古典艺术感，暖色调，梵高式厚涂技法，光影对比强烈，适合肖像画"
    },
    {
      id: "2",
      name: "杂志封面",
      thumb: "https://picsum.photos/400/400?random=62",
      prompt: "时尚杂志封面风格，高饱和度，光影立体，现代都市感，高级冷色调，精致妆容，超模气质，大标题留白空间"
    },
    {
      id: "3",
      name: "古风唯美",
      thumb: "https://picsum.photos/400/400?random=63",
      prompt: "古风唯美，仙气飘飘，淡雅水墨，中国传统文化元素，汉服，桃花，古琴，云雾缭绕，工笔画质感"
    },
    {
      id: "4",
      name: "法式浪漫",
      thumb: "https://picsum.photos/400/400?random=64",
      prompt: "法式浪漫，复古田园，柔和光线，蕾丝花边，浪漫氛围，薰衣草花田，午后阳光，柔焦效果，莫兰迪色系"
    }
  ];

  const collection = db.collection('templates');
  // 先清空（可选，注意谨慎）
  // const existing = await collection.get();
  // for (let doc of existing.data) {
  //   await collection.doc(doc._id).remove();
  // }

  for (const t of templates) {
    // 使用 id 作为 _id，避免重复
    await collection.doc(t.id).set({
      data: t
    }).catch(e => console.error(e));
  }

  return { success: true, message: '模板初始化完成' };
};