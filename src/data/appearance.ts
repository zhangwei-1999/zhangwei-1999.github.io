/** Visual tuning only: values do not change any personal content. */
export const appearance = {
  water: {
    ambient: {
      enabled: true,
      // 随机水波的平均间隔；调小会更频繁。随机浮动避免机械的循环感。
      intervalMs: 2400,
      intervalVariation: 0.28,
      // Surface propagation speed in CSS pixels per second; shared by all waves.
      speed: 58,
      // 波源大小随机范围，控制初始扰动与可见扩散范围；并非圆圈的固定终点。
      // 小屏幕等比例缩小，实际波前由共享波场连续计算。
      diameter: [280, 680] as const,
      opacity: 0.38,
    },
    click: {
      enabled: true,
      // 小幅点击直接进入背景波场；紫色随点击产生的波前传播。
      // diameter 控制初始扰动大小，不是裁剪波纹的硬边界。
      diameter: 76,
      strength: 2.8,
      tint: [146, 111, 196] as const,
      // 限制快速连点注入的能量，防止波纹累积得过强。
      burstWindowMs: 950,
      maxPerBurst: 2,
    },
  },
  glass: {
    // 局部高光平滑跟随，不移动正文。
    response: 0.18,
    // 页面空白处也会响应：仅背景光层缓慢偏移与转向。
    flowTravel: 48,
    flowAngle: 5,
    flowResponse: 0.075,
    // 导航边缘的折射位移，作用于背后的内容，不影响导航文字。
    refraction: 8,
  },
};
