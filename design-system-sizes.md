# 设计系统 · 平台图片尺寸规范

> 本文档用于 AI 辅助设计开发时的尺寸参考。当用户选择平台后，按此规范生成对应画布尺寸与分辨率配置。

---

## 支持的平台预设

| 平台 | 场景 | 推荐尺寸（px） | 比例 | 分辨率 | 格式 | 文件限制 |
|------|------|--------------|------|--------|------|---------|
| 抖音 | 视频封面 | 1080 × 1920 | 9:16 | 72 DPI | JPG/PNG | ≤ 3MB |
| 抖音 | 话题背景图 | 750 × 1334 | — | 72 DPI | JPG/PNG | ≤ 2MB |
| 抖音 | 个人主页背景 | 1125 × 633 | 16:9 | 72 DPI | JPG/PNG | — |
| 抖音 | 头像 | 400 × 400 | 1:1 | 72 DPI | JPG/PNG | — |
| 抖音 | 小店商品主图 | 800 × 800 | 1:1 | 72 DPI | JPG/PNG | ≤ 3MB |
| 小红书 | 笔记封面（推荐） | 1080 × 1440 | 3:4 | 72 DPI | JPG/PNG | — |
| 小红书 | 笔记封面（方形） | 1080 × 1080 | 1:1 | 72 DPI | JPG/PNG | — |
| 小红书 | 笔记封面（横版） | 1080 × 810 | 4:3 | 72 DPI | JPG/PNG | — |
| 小红书 | 个人主页背景 | — | 5:4 | 72 DPI | JPG/PNG | — |
| 手机海报 | 全屏竖版 | 1080 × 1920 | 9:16 | 72 DPI | JPG/PNG | — |
| 手机海报 | 通用分享图 | 1080 × 1440 | 3:4 | 72 DPI | JPG/PNG | — |
| 手机海报 | 方形分享图 | 1080 × 1080 | 1:1 | 72 DPI | JPG/PNG | — |
| 淘宝 | 商品主图（1~4张） | 800 × 800 | 1:1 | 72 DPI | JPG/PNG | ≤ 3MB |
| 淘宝 | 第5张白底图 | 800 × 800 | 1:1 | 72 DPI | JPG/PNG | ≤ 300KB |
| 淘宝 | 长图 / 竖版主图 | 800 × 1200 | 2:3 | 72 DPI | JPG/PNG | ≤ 3MB |
| 淘宝 | PC 端详情页 | 750 × 不限 | — | 72 DPI | JPG/PNG | — |
| 淘宝 | 手机端详情页 | 640 × ≤1300 | — | 72 DPI | JPG/PNG | — |
| 自定义 | 用户输入 | 自定义 × 自定义 | 自动计算 | 自定义 | 自定义 | — |

---

## 各平台详细规范

### 🎵 抖音

```
视频封面:     1080 × 1920 px  (9:16)  ← 主推，竖屏全屏
话题背景:      750 × 1334 px          ← 最大 2MB
个人主页背景: 1125 × 633  px  (16:9)
头像:          400 × 400  px  (1:1)
小店商品主图:  800 × 800  px  (1:1)  ← 最大 3MB，仅 JPG/JPEG/PNG
小店详情页:    最大 5MB / 张
```

**注意事项：**
- 商品图不允许出现与产品无关的水印、夸大宣传、诱导点击内容
- 图片不能变形、失真或模糊
- 视频内容实际显示区域约为 1080 × 1464，制作时预留安全边距

---

### 📖 小红书

```
笔记封面（推荐）: 1080 × 1440 px  (3:4)  ← 占屏面积最大，优先选择
笔记封面（方形）: 1080 × 1080 px  (1:1)
笔记封面（横版）: 1080 × 810  px  (4:3)  ← 不推荐，展示面积小
个人主页背景:     比例 5:4              ← 左侧区域被头像遮挡，视觉焦点居中/偏右
色彩模式:         RGB
分辨率:           72 DPI
```

**注意事项：**
- 整篇笔记只支持**一种**图片比例，上传前统一尺寸
- 竖版 3:4 比横版 4:3 展示面积约多 40%，更易获得推荐流量
- 字体建议使用可商用免费字体（思源系列、站酷系列）

---

### 📱 手机海报

```
全屏竖版:   1080 × 1920 px  (9:16)  ← 覆盖主流手机全屏
通用分享图: 1080 × 1440 px  (3:4)   ← 适合微信、小红书分享
方形图:     1080 × 1080 px  (1:1)   ← 适合朋友圈、正方形展位
色彩模式:   RGB
分辨率:     72 DPI
```

**iOS 安全区参考：**
- 逻辑宽度 375 pt，@3x 物理像素 = 1125 px
- 顶部状态栏安全区：约 44pt（刘海屏约 59pt）
- 底部 Home 条安全区：约 34pt

---

### 🛍️ 淘宝

```
商品主图（1~4张）:  800 × 800  px  (1:1)   ← 最大 3MB，尺寸 > 700 启用放大镜
第5张白底图:        800 × 800  px  (1:1)   ← 最大 300KB，纯白底，无水印/logo/文字
长图（第6张）:      800 × 1200 px  (2:3)   ← 宽度 ≥ 480px，手机竖图模式专用
服装类竖版主图:     750 × 1000 px  (3:4)   ← 特定类目使用
PC 端详情页:        宽 750 px，高度不限
天猫详情页:         宽 790 px，高度不限
手机端详情页:       宽 640 px，单张高度 ≤ 1300 px（超出需切片）
```

**注意事项：**
- 主图 > 800×800 时自动开启局部放大功能，建议至少达到此尺寸
- 白底图需：无 logo、无水印、无公司名、无联系方式、无二维码、无阴影、无 P 图痕迹
- 手机端详情页超出 1300px 高度需用 PS 切片后分批上传
- 格式推荐 JPG/JPEG/PNG，体积小且清晰度高

---

### ✏️ 自定义尺寸

当用户选择「自定义」时，接受以下输入：

```
width:   number   // 宽度，单位 px
height:  number   // 高度，单位 px
dpi:     number   // 分辨率，默认 72
unit:    string   // 'px' | 'mm' | 'cm'（默认 px）
```

**比例计算逻辑（伪代码）：**

```js
function calcRatio(width, height) {
  function gcd(a, b) { return b === 0 ? a : gcd(b, a % b) }
  const g = gcd(width, height)
  return {
    ratio: `${width / g}:${height / g}`,
    decimal: (width / height).toFixed(3),
    orientation: width > height ? '横版' : width < height ? '竖版' : '正方形'
  }
}
```

---

## 设计系统接入建议

### 平台选择器数据结构

```ts
type Platform = 'douyin' | 'xiaohongshu' | 'mobile-poster' | 'taobao' | 'custom'

interface CanvasPreset {
  platform: Platform
  label: string
  scene: string
  width: number
  height: number
  ratio: string
  dpi: number
  maxFileSize?: string   // e.g. '3MB'
  formats: string[]      // e.g. ['jpg', 'png']
  notes?: string
}
```

### 推荐预设列表（可直接导入）

```ts
const PRESETS: CanvasPreset[] = [
  // 抖音
  { platform: 'douyin', label: '抖音', scene: '视频封面', width: 1080, height: 1920, ratio: '9:16', dpi: 72, maxFileSize: '3MB', formats: ['jpg', 'png'] },
  { platform: 'douyin', label: '抖音', scene: '小店商品主图', width: 800, height: 800, ratio: '1:1', dpi: 72, maxFileSize: '3MB', formats: ['jpg', 'png'] },

  // 小红书
  { platform: 'xiaohongshu', label: '小红书', scene: '笔记封面（推荐）', width: 1080, height: 1440, ratio: '3:4', dpi: 72, formats: ['jpg', 'png'], notes: '竖版展示面积最大，推荐优先使用' },
  { platform: 'xiaohongshu', label: '小红书', scene: '笔记封面（方形）', width: 1080, height: 1080, ratio: '1:1', dpi: 72, formats: ['jpg', 'png'] },

  // 手机海报
  { platform: 'mobile-poster', label: '手机海报', scene: '全屏竖版', width: 1080, height: 1920, ratio: '9:16', dpi: 72, formats: ['jpg', 'png'] },
  { platform: 'mobile-poster', label: '手机海报', scene: '通用分享图', width: 1080, height: 1440, ratio: '3:4', dpi: 72, formats: ['jpg', 'png'] },
  { platform: 'mobile-poster', label: '手机海报', scene: '方形分享图', width: 1080, height: 1080, ratio: '1:1', dpi: 72, formats: ['jpg', 'png'] },

  // 淘宝
  { platform: 'taobao', label: '淘宝', scene: '商品主图', width: 800, height: 800, ratio: '1:1', dpi: 72, maxFileSize: '3MB', formats: ['jpg', 'png'] },
  { platform: 'taobao', label: '淘宝', scene: '白底图（第5张）', width: 800, height: 800, ratio: '1:1', dpi: 72, maxFileSize: '300KB', formats: ['jpg', 'png'], notes: '纯白背景，无任何水印文字' },
  { platform: 'taobao', label: '淘宝', scene: '长图', width: 800, height: 1200, ratio: '2:3', dpi: 72, maxFileSize: '3MB', formats: ['jpg', 'png'] },
  { platform: 'taobao', label: '淘宝', scene: 'PC 端详情页', width: 750, height: 0, ratio: '—', dpi: 72, formats: ['jpg', 'png'], notes: '高度不限，实际内容高度决定' },
  { platform: 'taobao', label: '淘宝', scene: '手机端详情页', width: 640, height: 1300, ratio: '—', dpi: 72, formats: ['jpg', 'png'], notes: '单张高度不超过 1300px' },

  // 自定义
  { platform: 'custom', label: '自定义', scene: '自由输入', width: 0, height: 0, ratio: '自动', dpi: 72, formats: ['jpg', 'png', 'webp', 'svg'] },
]
```

---

## AI Prompt 使用示例

当用户在设计工具中选择平台后，可将以下内容作为上下文传给 AI：

```
用户选择了平台：[平台名称]，场景：[场景名称]
画布尺寸应为：[width] × [height] px，比例 [ratio]，分辨率 72 DPI，RGB 色彩模式。
请按照此规范生成设计内容，注意安全边距保持在距边缘 5% 以内。
```

---

*数据来源：抖音、小红书、淘宝官方规范及 2025 年最新实操整理*
*最后更新：2025-05*
