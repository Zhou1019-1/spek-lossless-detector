# Spek 频谱图无损检测器 / Spek Spectrogram Lossless Detector

<p align="center">
  <img src="https://img.shields.io/badge/Version-4.0-blue?style=flat-square" alt="Version 4.0">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT License">
  <img src="https://img.shields.io/badge/Stack-React%20+%20TypeScript%20+%20Canvas-61DAFB?style=flat-square" alt="Tech Stack">
  <img src="https://img.shields.io/badge/Deployment-GitHub%20Pages-222222?style=flat-square" alt="GitHub Pages">
</p>

<p align="center">
  <b>基于频谱形态分析的真假无损音频检测工具</b><br>
  <b>A True/False Lossless Audio Detection Tool Based on Spectral Morphology Analysis</b>
</p>

---

## 在线演示 / Online Demo

**访问地址 / Visit**: [[https://Zhou1019-1.github.io/spek-lossless-detector](https://zhou1019-1.github.io/spek-lossless-detector/)]


---

## 功能特性 / Features

| 特性 / Feature | 说明 / Description |
|---|---|
| 拖拽上传 / Drag & Drop | 直接将 Spek 频谱图拖入页面 / Directly drop Spek spectrograms |
| 批量分析 / Batch Analysis | 同时分析多张频谱图 / Analyze multiple images at once |
| 六宫格报告 / 6-Panel Report | 生成详细的可视化分析报告 / Generate detailed visual reports |
| 纯前端运行 / Pure Frontend | 无需后端服务器，浏览器内完成分析 / No backend needed, all in browser |
| 免费部署 / Free Deployment | 支持 GitHub Pages 免费托管 / Free hosting on GitHub Pages |

---

## V4.0 核心算法 / V4.0 Core Algorithm

V4.0 针对 V3.0 的误判问题进行了全面重构，核心改进如下：

V4.0 has been completely rebuilt to address false positives in V3.0:

### 检测维度 / Detection Dimensions

1. **频率截止检测 / Frequency Cutoff Detection** (权重最高 / Highest weight)
   - 检测有损转码的典型低通滤波器截断特征
   - Detects the typical low-pass filter cutoff signature of lossy-to-lossless transcoding

2. **谐波结构分析 / Harmonic Structure Analysis**
   - 检测高频段是否存在音乐内容的竖线状谐波结构
   - Detects vertical harmonic structures (musical content) in the high-frequency band

3. **频谱斜率分析 / Spectral Slope Analysis**
   - 评估 16-22kHz 频段的自然衰减形态
   - Evaluates the natural decay pattern of the 16-22kHz band

4. **噪声均匀度 / Noise Uniformity**
   - 检测 cutoff 以上区域是否被均匀噪声填充
   - Detects if the area above cutoff is filled with uniform noise

5. **时间方差 / Time Variance**
   - 检测高频段随时间的变化程度（静态噪声 vs 音乐内容）
   - Measures temporal variation in the high-frequency band

### 判定标准 / Grading Scale

| 得分 / Score | 等级 / Grade | 说明 / Description |
|---|---|---|
| 85-100 | 真无损 / True Lossless | 频谱形态自然，无转码痕迹 / Natural spectrum, no transcoding traces |
| 65-84 | 大概率真 / Likely True | 整体自然，极轻微异常 / Mostly natural, very minor anomalies |
| 45-64 | 轻度嫌疑 / Mild Suspicion | 部分指标异常，建议结合耳听 / Some anomalies, use with listening test |
| 25-44 | 大概率假 / Likely Fake | 多项指标符合有损转码特征 / Multiple signs of lossy-to-lossless transcoding |
| 0-24 | 假无损 / Fake Lossless | 强烈疑似有损转码 / Strong evidence of lossy transcoding |

---

## 使用方法 / How to Use

### 1. 生成频谱图 / Generate Spectrogram

使用 [Spek](http://spek.cc/) 打开音频文件，保存频谱图为 PNG/JPG 格式：

Use [Spek](http://spek.cc/) to open your audio file and save the spectrogram as PNG/JPG:

```
File → Save → 选择 PNG 格式
```

### 2. 上传分析 / Upload & Analyze

1. 打开在线工具 / Open the web tool
2. 将频谱图拖拽到上传区域 / Drag spectrogram images to the upload zone
3. 等待自动分析 / Wait for automatic analysis
4. 查看得分和详细指标 / Review the score and detailed metrics
5. 下载六宫格报告（可选）/ Download the 6-panel report (optional)

---

## 技术栈 / Tech Stack

- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS** + **shadcn/ui**
- **Canvas API** 图像分析（纯浏览器端，无服务器）
- **Canvas API** for image analysis (pure client-side, no server)

---

## 本地开发 / Local Development

```bash
# 克隆仓库 / Clone repository
git clone https://github.com/your-username/spek-lossless-detector.git
cd spek-lossless-detector

# 安装依赖 / Install dependencies
npm install

# 启动开发服务器 / Start dev server
npm run dev

# 构建生产版本 / Build for production
npm run build
```

---

## 部署到 GitHub Pages / Deploy to GitHub Pages

### 方法一：自动部署（推荐）/ Method 1: Auto Deployment (Recommended)

本项目已配置 GitHub Actions 工作流，推送代码后自动部署：

This project includes a GitHub Actions workflow for automatic deployment:

```bash
# 1. Fork 本仓库 / Fork this repository
# 2. 在仓库设置中启用 GitHub Pages / Enable GitHub Pages in repository settings
#    Settings → Pages → Source: GitHub Actions
# 3. 推送代码到 main 分支 / Push code to main branch
# 4. Actions 自动构建并部署 / Actions will build and deploy automatically
```

### 方法二：手动部署 / Method 2: Manual Deployment

```bash
# 1. 构建项目 / Build project
npm run build

# 2. 将 dist 目录内容推送到 gh-pages 分支
#    Push dist contents to gh-pages branch
npx gh-pages -d dist
```

---

## 注意事项 / Important Notes

- **分析仅在浏览器本地进行**，频谱图不会上传到任何服务器
  - **Analysis is performed entirely in your browser**, images are never uploaded
- 本工具作为**辅助判断**，建议结合耳听验证
  - This tool is for **reference only**, always verify by listening
- 某些音乐风格（如电子音乐）天然高频较少，可能影响判定
  - Some genres (e.g., electronic) naturally have less high-frequency content
- 母带处理（Mastering）方式不同也会影响频谱形态
  - Different mastering techniques also affect spectral morphology

---

## 算法历史 / Algorithm History

| 版本 / Version | 核心改进 / Key Improvements |
|---|---|
| V1.0 | 基础均值比较 / Basic mean comparison |
| V2.0 | 加入标准差和峰值 / Added std deviation and peak detection |
| V3.0 | 多维度打分（均值+背景扣除+标准差+峰值+亮像素）/ Multi-dimensional scoring |
| **V4.0** | **频谱形态分析（截止检测+谐波+斜率+噪声均匀度）/ Spectral morphology analysis** |

---

## 开源协议 / License

[MIT License](LICENSE)

---

<p align="center">
  Made with passion for music quality
</p>
