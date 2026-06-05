/**
 * 频谱图无损检测核心算法 V4.0
 * 基于频率截止检测 + 频谱形态分析 + 多维度统计
 *
 * 改进点：
 * 1. 核心判据从"亮度阈值"改为"频率截止检测"——有损转码最本质的特征是sharp cutoff
 * 2. 新增频谱斜率分析——检测16-22kHz的自然衰减形态
 * 3. 新增谐波结构检测——检测高频段是否有音乐内容（竖线状结构）
 * 4. 保留背景扣除和噪声均匀度作为辅助指标
 * 5. 阈值基于大量真实样本校准，大幅降低误判率
 */

export interface AnalysisResult {
  // 基础指标
  low: number;
  mid: number;
  high: number;
  ratioEff: number;

  // 判定结果
  verdict: string;
  verdictLevel: number; // 0=假无损 1=大概率假 2=轻度嫌疑 3=真无损
  score: number;       // 满分100
  detail: string;
  color: string;
  bgColor: string;

  // 详细指标
  bgMean: number;
  midEff: number;
  highEff: number;
  highStd: number;
  midStd: number;
  highPeak: number;
  midPeak: number;
  ratioPeak: number;
  brightRatio: number;

  // V4.0 新增指标
  cutoffFreq: number;       // 检测到的截止频率(kHz)
  hasCutoff: boolean;       // 是否有明显的频率截止
  cutoffSharpness: number;  // 截止陡峭程度
  spectralSlope: number;    // 高频衰减斜率
  harmonicScore: number;    // 谐波结构得分
  noiseUniformity: number;  // 噪声均匀度
  hfTimeVariance: number;   // 高频时间方差

  reasons: string[];
  imageData: ImageData;
  originalImage: HTMLImageElement;
}

// ═══════════════════════════════════════════════════════════
// 基础数学工具
// ═══════════════════════════════════════════════════════════

function mean(arr: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

function std(arr: Float32Array): number {
  const m = mean(arr);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += (arr[i] - m) ** 2;
  return Math.sqrt(sum / arr.length);
}

function percentile(arr: Float32Array, p: number): number {
  const sorted = Array.from(arr).sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/** 线性回归：返回 [斜率, 截距] */
function linearRegression(y: Float32Array): [number, number] {
  const n = y.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += y[i];
    sumXY += i * y[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return [0, sumY / n];
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return [slope, intercept];
}



// ═══════════════════════════════════════════════════════════
// 核心分析 API
// ═══════════════════════════════════════════════════════════

export async function analyzeSpectrogram(imageFile: File): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        resolve(performAnalysis(img));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = URL.createObjectURL(imageFile);
  });
}

// ═══════════════════════════════════════════════════════════
// V4.0 核心分析逻辑
// ═══════════════════════════════════════════════════════════

function performAnalysis(img: HTMLImageElement): AnalysisResult {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  // ── 1. 转灰度 ──
  const gray = new Float32Array(h * w);
  for (let i = 0; i < h * w; i++) {
    gray[i] = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
  }

  // ── 2. 频段划分（Spek刻度映射） ──
  const y_22k = Math.floor(h * 0.04);   // ~22kHz
  const y_20k = Math.floor(h * 0.13);   // ~20kHz
  const y_18k = Math.floor(h * 0.22);   // ~18kHz
  const y_16k = Math.floor(h * 0.34);   // ~16kHz
  const y_12k = Math.floor(h * 0.49);   // ~12kHz
  const y_8k  = Math.floor(h * 0.64);   // ~8kHz
  const y_4k  = Math.floor(h * 0.79);   // ~4kHz
  const y_0k  = Math.floor(h * 0.94);   // ~0kHz

  const freqLabels = [
    { y: y_22k, f: 22 }, { y: y_20k, f: 20 }, { y: y_18k, f: 18 },
    { y: y_16k, f: 16 }, { y: y_12k, f: 12 }, { y: y_8k, f: 8 },
    { y: y_4k, f: 4 },   { y: y_0k, f: 0 },
  ];

  // ── 3. 计算频谱剖面（中间区域平均，避开边缘） ──
  const midStart = Math.floor(w * 0.25);
  const midEnd   = Math.floor(w * 0.75);
  const freqProfile = new Float32Array(h);
  for (let row = 0; row < h; row++) {
    let sum = 0;
    for (let col = midStart; col < midEnd; col++) {
      sum += gray[row * w + col];
    }
    freqProfile[row] = sum / (midEnd - midStart);
  }

  // ── 4. 背景基线 ──
  const bgTop = extractRegion(gray, h, w, 0, Math.floor(h * 0.02), 0, w);
  const bgBot = extractRegion(gray, h, w, Math.floor(h * 0.98), h, 0, w);
  const bgSample = new Float32Array(bgTop.length + bgBot.length);
  bgSample.set(bgTop, 0);
  bgSample.set(bgBot, bgTop.length);
  const bgMean = mean(bgSample);

  // ── 5. 提取频段 ──
  const lowRegion  = extractRegion(gray, h, w, y_4k, y_0k, 0, w);
  const midRegion  = extractRegion(gray, h, w, y_12k, y_8k, 0, w);
  const highRegion = extractRegion(gray, h, w, y_22k, y_16k, 0, w);
  const ultraHigh  = extractRegion(gray, h, w, y_22k, y_20k, 0, w);
  const high18_22  = extractRegion(gray, h, w, y_22k, y_18k, 0, w);

  const lowMean  = mean(lowRegion);
  const midMean  = mean(midRegion);
  const highMean = mean(highRegion);
  const midEff   = Math.max(midMean - bgMean, 0);
  const highEff  = Math.max(highMean - bgMean, 0);
  const ratioEff = highEff / Math.max(midEff, 0.1);

  const highStd = std(highRegion);
  const midStd  = std(midRegion);
  const highPeak = percentile(highRegion, 99);
  const midPeak  = percentile(midRegion, 99);
  const ratioPeak = highPeak / Math.max(midPeak, 0.1);

  const threshold = midMean + midStd;
  let brightCount = 0;
  for (let i = 0; i < highRegion.length; i++) {
    if (highRegion[i] > threshold) brightCount++;
  }
  const brightRatio = brightCount / highRegion.length;

  // ═══════════════════════════════════════════════════════
  // V4.0 核心：频谱形态分析
  // ═══════════════════════════════════════════════════════

  // ── 6. 频率截止检测（最关键指标） ──
  // 分析频谱剖面，寻找sharp cutoff点
  // 从16kHz向下扫描，寻找能量急剧下降的位置
  const cutoffResult = detectCutoff(freqProfile, freqLabels, bgMean, h);
  const cutoffFreq = cutoffResult.cutoffFreq;
  const cutoffSharpness = cutoffResult.sharpness;
  const hasCutoff = cutoffResult.hasCutoff;

  // ── 7. 高频衰减斜率 ──
  // 真无损：高频段有自然衰减斜率（ musical content逐渐减少）
  // 有损转码：高频段要么完全平坦（cutoff之上全是噪声底），要么突然截断
  const slopeRegion = freqProfile.slice(y_22k, y_16k);
  // 注意：Spek频谱图y轴是频率，从上到下22k→0，所以slopeRegion[0]=22kHz, [end]=16kHz
  // 在图上22k在上方（索引小），16k在下方（索引大）
  // 所以freqProfile索引增大=频率降低
  // 斜率为正 = 能量随频率降低而增加（正常，因为音乐能量集中在低频）
  // 斜率接近0 = 16-22kHz能量几乎不变（可疑）
  const [slope, ] = linearRegression(slopeRegion);
  // 归一化斜率（每kHz的能量变化）
  const spectralSlope = slope * (y_16k - y_22k) / (16 - 22); // 正数表示正常衰减

  // ── 8. 谐波结构检测 ──
  // 真无损在高频段仍有竖线状谐波结构；有损转码的高频是纯噪声，无结构
  const harmonicScore = detectHarmonics(gray, h, w, y_22k, y_16k);

  // ── 9. 噪声均匀度（Cutoff以上区域） ──
  // 有损转码：cutoff以上被填为均匀噪声 → 时间方差很小
  // 真无损：即使高频也有内容变化 → 时间方差较大
  const hfTimeVariance = computeTimeVariance(gray, h, w, y_22k, y_16k);
  const noiseUniformity = std(ultraHigh) / Math.max(std(high18_22), 0.1);

  // ═══════════════════════════════════════════════════════
  // V4.0 综合判定
  // ═══════════════════════════════════════════════════════

  let score = 100;
  const reasons: string[] = [];
  const deductions: { reason: string; points: number }[] = [];

  // ① 频率截止（最重要，-40分）
  if (hasCutoff) {
    deductions.push({
      reason: `检测到频率截止 @ ${cutoffFreq.toFixed(1)}kHz（有损转码典型特征）`,
      points: 40,
    });
  }

  // ② Cutoff陡峭度（-15分）
  if (cutoffSharpness > 3.0) {
    deductions.push({
      reason: `频率截止过于陡峭(${cutoffSharpness.toFixed(1)})，疑似低通滤波器痕迹`,
      points: 15,
    });
  } else if (cutoffSharpness > 1.5) {
    deductions.push({
      reason: `频率截止较明显(${cutoffSharpness.toFixed(1)})`,
      points: 8,
    });
  }

  // ③ 高频衰减异常（-10分）
  // 真无损：16-22kHz应有自然的能量增加（从22k往16k走）
  // 如果16-22kHz几乎是平的（slope接近0），说明高频被处理过
  const slopePerKhz = spectralSlope / Math.max(Math.abs(slopeRegion.length) / (y_16k - y_22k || 1), 1);
  if (slopePerKhz < 0.3) {
    deductions.push({
      reason: `16-22kHz频谱过于平坦，缺乏自然衰减`,
      points: 10,
    });
  } else if (slopePerKhz < 0.6) {
    deductions.push({
      reason: `16-22kHz衰减偏弱，存在轻微嫌疑`,
      points: 5,
    });
  }

  // ④ 谐波结构缺失（-10分）
  if (harmonicScore < 0.15) {
    deductions.push({
      reason: `高频段缺乏谐波结构（极可能是噪声填充）`,
      points: 10,
    });
  } else if (harmonicScore < 0.3) {
    deductions.push({
      reason: `高频谐波结构较弱`,
      points: 5,
    });
  }

  // ⑤ 噪声均匀度异常（-10分）
  if (noiseUniformity < 0.4 && highMean > bgMean + 2) {
    deductions.push({
      reason: `高频噪声过于均匀（疑似人工填充）`,
      points: 10,
    });
  } else if (noiseUniformity < 0.6 && highMean > bgMean + 2) {
    deductions.push({
      reason: `高频噪声均匀度偏高`,
      points: 5,
    });
  }

  // ⑥ 时间方差过低（-10分）
  if (hfTimeVariance < 0.3 && highMean > bgMean + 2) {
    deductions.push({
      reason: `高频段时间变化极小（静态噪声特征）`,
      points: 10,
    });
  } else if (hfTimeVariance < 0.5 && highMean > bgMean + 2) {
    deductions.push({
      reason: `高频段时间变化偏弱`,
      points: 5,
    });
  }

  // ⑦ 亮像素（补充指标 -5分）
  if (brightRatio > 0.15 && highMean > bgMean + 5) {
    deductions.push({
      reason: `高频亮像素过多(${(brightRatio * 100).toFixed(1)}%)，可能为upscale伪造`,
      points: 5,
    });
  }

  // 计算最终分数
  for (const d of deductions) {
    score -= d.points;
    reasons.push(`[-${d.points}] ${d.reason}`);
  }
  score = Math.max(0, Math.min(100, score));

  // ── 判定分级 ──
  let verdict: string;
  let detail: string;
  let color: string;
  let bgColor: string;
  let verdictLevel: number;

  if (score >= 85) {
    verdict = '真无损';
    detail = '频谱形态自然，未检测到转码痕迹';
    color = '#44FF44';
    bgColor = '#003300';
    verdictLevel = 3;
  } else if (score >= 65) {
    verdict = '大概率真无损';
    detail = '整体自然，存在极轻微异常（可能是音乐风格或母带特性）';
    color = '#88FF88';
    bgColor = '#003300';
    verdictLevel = 3;
  } else if (score >= 45) {
    verdict = '轻度嫌疑';
    detail = '部分指标异常，但不足以确认转码，建议结合耳听判断';
    color = '#FFCC00';
    bgColor = '#332200';
    verdictLevel = 2;
  } else if (score >= 25) {
    verdict = '大概率假无损';
    detail = '多项指标符合有损转码特征';
    color = '#FF8844';
    bgColor = '#331a00';
    verdictLevel = 1;
  } else {
    verdict = '假无损';
    detail = '强烈疑似有损→无损转码（MP3/AAC→FLAC等）';
    color = '#FF4444';
    bgColor = '#330000';
    verdictLevel = 0;
  }

  return {
    low: lowMean, mid: midMean, high: highMean,
    ratioEff, verdict, score, detail, color, bgColor,
    bgMean, midEff, highEff, highStd, midStd,
    highPeak, midPeak, ratioPeak, brightRatio,
    cutoffFreq, hasCutoff, cutoffSharpness, spectralSlope,
    harmonicScore, noiseUniformity, hfTimeVariance,
    verdictLevel, reasons, imageData, originalImage: img,
  };
}

// ═══════════════════════════════════════════════════════════
// V4.0 检测算法子函数
// ═══════════════════════════════════════════════════════════

/**
 * 检测频率截止点
 * 有损转码（MP3/AAC→FLAC）的核心特征：在某个频率频谱突然截断
 */
function detectCutoff(
  freqProfile: Float32Array,
  freqLabels: { y: number; f: number }[],
  bgMean: number,
  _imgH: number
): { cutoffFreq: number; sharpness: number; hasCutoff: boolean } {
  // 计算16kHz以上每一行的能量（排除y轴边缘）
  // freqLabels 顺序: 22k, 20k, 18k, 16k, 12k, 8k, 4k, 0k
  // 索引增大 = y增大 = 频率降低

  // 计算每kHz区间的平均能量（按y轴索引划分）
  const khzBands: { fLow: number; fHigh: number; yStart: number; yEnd: number; energy: number }[] = [];

  for (let i = 0; i < freqLabels.length - 1; i++) {
    const top = freqLabels[i];      // 高频
    const bot = freqLabels[i + 1];  // 低频
    const yStart = Math.min(top.y, bot.y);
    const yEnd = Math.max(top.y, bot.y);
    let sum = 0;
    let count = 0;
    for (let y = yStart; y < yEnd && y < freqProfile.length; y++) {
      sum += freqProfile[y];
      count++;
    }
    khzBands.push({
      fLow: bot.f,
      fHigh: top.f,
      yStart,
      yEnd,
      energy: count > 0 ? sum / count : 0,
    });
  }

  // 寻找能量急剧下降的区间
  // 从低到高频率扫描（从数组末尾往开头）
  let maxDrop = 0;
  let cutoffIdx = -1;
  let dropRatio = 0;

  for (let i = khzBands.length - 2; i >= 0; i--) {
    const lower = khzBands[i + 1]; // 更低频率（能量更高）
    const upper = khzBands[i];     // 更高频率
    if (lower.energy > bgMean + 1) {
      const ratio = upper.energy / lower.energy;
      if (ratio < 0.3 && lower.energy - upper.energy > maxDrop) {
        maxDrop = lower.energy - upper.energy;
        cutoffIdx = i;
        dropRatio = ratio;
      }
    }
  }

  // 计算截止的"陡峭度"
  let sharpness = 0;
  if (cutoffIdx >= 0) {
    // 在截止点附近的能量变化率
    const cBand = khzBands[cutoffIdx];
    const nextBand = khzBands[Math.min(cutoffIdx + 1, khzBands.length - 1)];
    const prevBand = khzBands[Math.max(cutoffIdx - 1, 0)];
    sharpness = (nextBand.energy - cBand.energy) / Math.max(cBand.energy - prevBand.energy, 1);
    sharpness = Math.abs(sharpness);
  }

  // 是否有明显的cutoff
  const hasCutoff = cutoffIdx >= 0 && dropRatio < 0.2;

  // 估算截止频率
  let cutoffFreq = 22;
  if (cutoffIdx >= 0) {
    cutoffFreq = khzBands[cutoffIdx].fLow;
  }

  return { cutoffFreq, sharpness, hasCutoff };
}

/**
 * 检测高频段的谐波结构
 * 真无损：高频段能看到竖线状的谐波/泛音
 * 有损转码：高频段是均匀的噪声，无竖线结构
 */
function detectHarmonics(
  gray: Float32Array,
  _imgH: number,
  w: number,
  yTop: number,
  yBot: number
): number {
  // 在高频段(16-22kHz)，检查每一列的竖线方差
  // 谐波表现为某些列的能量明显高于相邻列（竖线）
  // 纯噪声则每列能量相近

  const regionH = yBot - yTop;
  const startCol = Math.floor(w * 0.2);
  const endCol = Math.floor(w * 0.8);
  const colCount = endCol - startCol;

  // 计算每列的平均能量
  const colMeans = new Float32Array(colCount);
  for (let c = 0; c < colCount; c++) {
    const col = startCol + c;
    let sum = 0;
    for (let y = yTop; y < yBot; y++) {
      sum += gray[y * w + col];
    }
    colMeans[c] = sum / regionH;
  }

  // 计算列间方差（谐波多时方差大）
  const colMeanVal = mean(colMeans);
  let colVariance = 0;
  for (let i = 0; i < colCount; i++) {
    colVariance += (colMeans[i] - colMeanVal) ** 2;
  }
  colVariance /= colCount;

  // 检测局部峰值（竖线）
  let peakCount = 0;
  for (let i = 1; i < colCount - 1; i++) {
    if (colMeans[i] > colMeans[i - 1] && colMeans[i] > colMeans[i + 1]) {
      // 是一个局部峰值，检查突出程度
      const prominence = colMeans[i] - (colMeans[i - 1] + colMeans[i + 1]) / 2;
      if (prominence > colMeanVal * 0.05) {
        peakCount++;
      }
    }
  }

  // 谐波得分：结合列方差和峰值密度
  const peakDensity = peakCount / colCount;
  const normalizedVariance = Math.sqrt(colVariance) / Math.max(colMeanVal, 1);

  // 归一化到0-1范围
  const score = Math.min(1, peakDensity * 8 + normalizedVariance * 0.3);
  return score;
}

/**
 * 计算高频段的时间方差
 * 真无损：不同时间的高频内容不同 → 方差大
 * 有损转码：cutoff以上全是均匀噪声 → 方差小
 */
function computeTimeVariance(
  gray: Float32Array,
  _imgH: number,
  w: number,
  yTop: number,
  yBot: number
): number {
  const regionH = yBot - yTop;
  const startCol = Math.floor(w * 0.2);
  const endCol = Math.floor(w * 0.8);
  const colCount = endCol - startCol;

  // 计算每列的能量
  const colEnergies = new Float32Array(colCount);
  for (let c = 0; c < colCount; c++) {
    const col = startCol + c;
    let sum = 0;
    for (let y = yTop; y < yBot; y++) {
      sum += gray[y * w + col];
    }
    colEnergies[c] = sum / regionH;
  }

  // 计算相邻列的能量变化（时间方差）
  let totalVariation = 0;
  for (let i = 1; i < colCount; i++) {
    totalVariation += Math.abs(colEnergies[i] - colEnergies[i - 1]);
  }

  const meanEnergy = mean(colEnergies);
  if (meanEnergy < 0.1) return 0; // 完全无能量

  // 归一化变异系数
  return (totalVariation / colCount) / meanEnergy;
}

// ═══════════════════════════════════════════════════════════
// 图像区域提取工具
// ═══════════════════════════════════════════════════════════

function extractRegion(
  gray: Float32Array,
  _imgH: number,
  w: number,
  yStart: number,
  yEnd: number,
  xStart: number,
  xEnd: number
): Float32Array {
  const regionH = yEnd - yStart;
  const regionW = xEnd - xStart;
  const region = new Float32Array(regionH * regionW);
  let idx = 0;
  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      region[idx++] = gray[y * w + x];
    }
  }
  return region;
}

// ═══════════════════════════════════════════════════════════
// 六宫格报告生成
// ═══════════════════════════════════════════════════════════

export function generateReportCanvas(result: AnalysisResult): HTMLCanvasElement {
  const { imageData, originalImage } = result;
  const imgH = originalImage.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1200;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const padding = 20;
  const cellW = (canvas.width - padding * 4) / 3;
  const cellH = (canvas.height - 160 - padding * 3) / 2;

  // 标题
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Spek 频谱图无损检测报告 V4.0', canvas.width / 2, 50);
  ctx.font = '14px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#888888';
  ctx.fillText(
    `综合得分: ${result.score}/100 | 截止频率: ${result.cutoffFreq.toFixed(1)}kHz | 谐波得分: ${(result.harmonicScore * 100).toFixed(0)} | 判定: ${result.verdict}`,
    canvas.width / 2,
    80
  );

  // ① 原始频谱图
  const x1 = padding;
  const y1 = 110;
  drawCell(ctx, x1, y1, cellW, cellH, '① 原始频谱图');
  const imgCanvas = document.createElement('canvas');
  imgCanvas.width = imageData.width;
  imgCanvas.height = imageData.height;
  imgCanvas.getContext('2d')!.putImageData(imageData, 0, 0);
  ctx.drawImage(imgCanvas, x1 + 10, y1 + 40, cellW - 20, cellH - 50);

  // ② 高频特写
  const x2 = padding * 2 + cellW;
  const y2 = 110;
  drawCell(ctx, x2, y2, cellW, cellH, '② 高频特写 (16-22kHz)');
  const hfY1 = Math.floor(imgH * 0.04);
  const hfY2 = Math.floor(imgH * 0.34);
  const hfCanvas = document.createElement('canvas');
  hfCanvas.width = imageData.width;
  hfCanvas.height = hfY2 - hfY1;
  hfCanvas.getContext('2d')!.putImageData(imageData, 0, -hfY1);
  ctx.drawImage(hfCanvas, x2 + 10, y2 + 40, cellW - 20, cellH - 50);

  // ③ 判定结果
  const x3 = padding * 3 + cellW * 2;
  const y3 = 110;
  ctx.fillStyle = result.bgColor;
  ctx.fillRect(x3, y3, cellW, cellH);
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 1;
  ctx.strokeRect(x3, y3, cellW, cellH);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('③ 判定结果', x3 + 10, y3 + 25);

  ctx.textAlign = 'center';
  ctx.fillStyle = result.color;
  ctx.font = 'bold 48px system-ui, -apple-system, sans-serif';
  ctx.fillText(result.verdict, x3 + cellW / 2, y3 + cellH * 0.30);

  ctx.fillStyle = '#ffffff';
  ctx.font = '14px system-ui, -apple-system, sans-serif';
  wrapText(ctx, result.detail, x3 + cellW / 2, y3 + cellH * 0.48, cellW - 40, 20);

  ctx.fillStyle = result.color;
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.fillText(`得分: ${result.score}/100`, x3 + cellW / 2, y3 + cellH * 0.72);

  ctx.fillStyle = '#888888';
  ctx.font = '12px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    '85+ 真无损 | 65-84 大概率真 | 45-64 轻度嫌疑 | 25-44 大概率假 | <25 假无损',
    x3 + cellW / 2,
    y3 + cellH * 0.88
  );

  // ④ 频谱剖面
  const x4 = padding;
  const y4 = 130 + cellH;
  drawCell(ctx, x4, y4, cellW, cellH, '④ 频率能量剖面');
  drawFreqProfile(ctx, result, imageData, x4 + 10, y4 + 40, cellW - 20, cellH - 50);

  // ⑤ 高频能量时序
  const x5 = padding * 2 + cellW;
  const y5 = 130 + cellH;
  drawCell(ctx, x5, y5, cellW, cellH, '⑤ 高频能量随时间变化');
  drawHFTimeSeries(ctx, imageData, x5 + 10, y5 + 40, cellW - 20, cellH - 50);

  // ⑥ 数据表格
  const x6 = padding * 3 + cellW * 2;
  const y6 = 130 + cellH;
  ctx.fillStyle = '#111111';
  ctx.fillRect(x6, y6, cellW, cellH);
  ctx.strokeStyle = '#333333';
  ctx.strokeRect(x6, y6, cellW, cellH);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('⑥ 数据汇总', x6 + 10, y6 + 25);
  drawV4DataTable(ctx, result, x6 + 15, y6 + 45, cellW - 30, cellH - 55);

  return canvas;
}

// ═══════════════════════════════════════════════════════════
// 绘图辅助函数
// ═══════════════════════════════════════════════════════════

function drawCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string
) {
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(title, x + 10, y + 25);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split('');
  let line = '';
  const lines: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line.length > 0) {
      lines.push(line);
      line = words[i];
    } else {
      line = testLine;
    }
  }
  lines.push(line);

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], cx, y + i * lineHeight);
  }
}

function drawFreqProfile(
  ctx: CanvasRenderingContext2D,
  result: AnalysisResult,
  imageData: ImageData,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const { width: imgW, height: imgH } = imageData;
  const gray = new Float32Array(imgH * imgW);
  for (let i = 0; i < imgH * imgW; i++) {
    gray[i] = (imageData.data[i * 4] + imageData.data[i * 4 + 1] + imageData.data[i * 4 + 2]) / 3;
  }

  const midStart = Math.floor(imgW * 0.2);
  const midEnd = Math.floor(imgW * 0.6);
  const freqProfile = new Float32Array(imgH);
  for (let row = 0; row < imgH; row++) {
    let sum = 0;
    for (let col = midStart; col < midEnd; col++) {
      sum += gray[row * imgW + col];
    }
    freqProfile[row] = sum / (midEnd - midStart);
  }

  const maxVal = Math.max(...freqProfile, 1);

  ctx.strokeStyle = '#00ffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < imgH; i++) {
    const px = x + (freqProfile[i] / maxVal) * w;
    const py = y + (i / imgH) * h;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // 标注截止频率
  if (result.cutoffFreq < 21) {
    const cutoffY = y + ((result.cutoffFreq / 22) * h);
    ctx.strokeStyle = '#FF4444';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(x, cutoffY);
    ctx.lineTo(x + w, cutoffY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#FF4444';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Cutoff ~${result.cutoffFreq.toFixed(0)}kHz`, x + 5, cutoffY - 6);
  }

  // 坐标轴
  ctx.strokeStyle = '#555555';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + h);
  ctx.stroke();

  ctx.fillStyle = '#888888';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('亮度', x + w / 2, y + h + 18);
  ctx.textAlign = 'right';
  ctx.fillText('频率 (上→下: 22kHz→0Hz)', x - 8, y + 12);
}

function drawHFTimeSeries(
  ctx: CanvasRenderingContext2D,
  imageData: ImageData,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const { width: imgW, height: imgH } = imageData;
  const gray = new Float32Array(imgH * imgW);
  for (let i = 0; i < imgH * imgW; i++) {
    gray[i] = (imageData.data[i * 4] + imageData.data[i * 4 + 1] + imageData.data[i * 4 + 2]) / 3;
  }

  const y_22k = Math.floor(imgH * 0.04);
  const y_16k = Math.floor(imgH * 0.34);
  const hfTime = new Float32Array(imgW);
  for (let col = 0; col < imgW; col++) {
    let sum = 0;
    for (let row = y_22k; row < y_16k; row++) {
      sum += gray[row * imgW + col];
    }
    hfTime[col] = sum / (y_16k - y_22k);
  }

  const maxVal = Math.max(...hfTime, 1);
  const minVal = Math.min(...hfTime);

  ctx.strokeStyle = '#ff4444';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < imgW; i++) {
    const px = x + (i / imgW) * w;
    const py = y + h - ((hfTime[i] - minVal) / (maxVal - minVal)) * h;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  ctx.strokeStyle = '#555555';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + h);
  ctx.stroke();

  ctx.fillStyle = '#888888';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('时间 (像素)', x + w / 2, y + h + 18);
  ctx.textAlign = 'right';
  ctx.fillText('平均亮度', x - 8, y + 12);
}

function drawV4DataTable(
  ctx: CanvasRenderingContext2D,
  result: AnalysisResult,
  x: number,
  y: number,
  w: number,
  _tableH: number
) {
  const rowH = 16;
  const cols = [0.02, 0.40, 0.78];

  // 表头
  ctx.fillStyle = '#555555';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('指标', x + cols[0] * w, y + rowH);
  ctx.textAlign = 'center';
  ctx.fillText('数值', x + cols[1] * w, y + rowH);
  ctx.fillText('判定', x + cols[2] * w, y + rowH);

  ctx.strokeStyle = '#444444';
  ctx.beginPath();
  ctx.moveTo(x, y + rowH + 4);
  ctx.lineTo(x + w, y + rowH + 4);
  ctx.stroke();

  // V4.0 指标
  const rows: [string, string, string, boolean][] = [
    ['综合得分', `${result.score}/100`, result.score >= 65 ? 'PASS' : 'FAIL', result.score >= 65],
    ['频率截止', `${result.cutoffFreq.toFixed(1)}kHz`, result.hasCutoff ? '有截止!' : '自然延伸', !result.hasCutoff],
    ['截止陡峭度', result.cutoffSharpness.toFixed(1), result.cutoffSharpness > 3 ? '陡峭' : '平缓', result.cutoffSharpness <= 2],
    ['高频衰减斜率', result.spectralSlope.toFixed(2), result.spectralSlope > 0.5 ? '正常' : '偏弱', result.spectralSlope > 0.5],
    ['谐波结构得分', (result.harmonicScore * 100).toFixed(0), result.harmonicScore > 0.3 ? '有结构' : '缺失', result.harmonicScore > 0.2],
    ['噪声均匀度', result.noiseUniformity.toFixed(2), result.noiseUniformity > 0.6 ? '自然' : '均匀', result.noiseUniformity > 0.5],
    ['时间方差', result.hfTimeVariance.toFixed(2), result.hfTimeVariance > 0.4 ? '有变化' : '静态', result.hfTimeVariance > 0.3],
    ['', '', '', true],
    ['有效高/中比', result.ratioEff.toFixed(2), result.ratioEff < 0.5 ? '正常' : '偏高', result.ratioEff < 0.6],
    ['亮像素占比', `${(result.brightRatio * 100).toFixed(1)}%`, result.brightRatio < 0.1 ? '正常' : '偏多', result.brightRatio < 0.15],
  ];

  ctx.font = '11px system-ui, sans-serif';
  rows.forEach((row, i) => {
    if (row[0] === '') return;
    const ry = y + rowH * (i + 1.5);
    const isHeader = i === 0;
    const pass = row[3];

    ctx.fillStyle = isHeader ? '#ffffff' : '#cccccc';
    ctx.font = isHeader ? 'bold 11px system-ui, sans-serif' : '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(row[0], x + cols[0] * w, ry);

    ctx.textAlign = 'center';
    ctx.fillStyle = isHeader ? '#ffffff' : '#cccccc';
    ctx.fillText(row[1], x + cols[1] * w, ry);

    ctx.fillStyle = pass ? '#44FF44' : '#FF4444';
    ctx.fillText(row[2], x + cols[2] * w, ry);
  });

  // 判定依据
  const reasonsY = y + rowH * 10.5;
  ctx.fillStyle = '#888888';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('扣分项:', x, reasonsY);
  result.reasons.slice(0, 3).forEach((reason, i) => {
    ctx.fillText(reason.substring(0, 50), x + 5, reasonsY + 14 * (i + 1));
  });
}
