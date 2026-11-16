# 乌鸡的圣诞 🎄

答 10 道关于乌鸡的题 → 把想送的礼物挂上圣诞树。纯 HTML/CSS/JS + 一个零依赖的 Node 小后端。

## 运行
```bash
node server.js          # 打开 http://localhost:3000
```
- 乌鸡本人拆礼物入口: `http://localhost:3000/?owner=1`(礼物要点“拆开”才显示内容)
- 预览挂满礼物的效果: `/?demo=1#tree`(不会保存)

## 改题目
只改 [`js/config.js`](js/config.js):`answer` 是正确选项序号(0=A, 1=B, 2=C, 3=D)。

## 礼物存在哪?
- 用 `node server.js` 跑 → 存在 `data/gifts.json`,所有朋友看到同一棵树。
- 只丢静态文件(Netlify 等)→ 自动退回浏览器本地存储,只有自己设备可见。
- 想上线给朋友用:把整个文件夹部署到任意支持 Node 的平台(Render / Railway / 自己的服务器),
  `PORT` 和 `DATA_DIR` 可用环境变量配置(记得给 `DATA_DIR` 挂持久化磁盘)。

## 素材
`tools/make_assets.py` 把原图(`assets/_*.jpg`)切成透明 PNG;一般不用再跑。
