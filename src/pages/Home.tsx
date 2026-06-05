import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  FileAudio,
  Download,
  Trash2,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Image,
  Loader2,
  Zap,
  Activity,
  Waves,
  Radio,
  TrendingDown,
  Timer,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  type AnalysisResult,
  analyzeSpectrogram,
  generateReportCanvas,
} from '@/lib/spectrogramAnalyzer';

interface AnalyzedFile {
  id: string;
  file: File;
  result: AnalysisResult;
  timestamp: number;
}

export default function Home() {
  const [files, setFiles] = useState<AnalyzedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith('image/')
    );
    if (droppedFiles.length > 0) await analyzeFiles(droppedFiles);
  }, []);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || []).filter((f) =>
        f.type.startsWith('image/')
      );
      if (selectedFiles.length > 0) await analyzeFiles(selectedFiles);
    },
    []
  );

  const analyzeFiles = async (imageFiles: File[]) => {
    setIsAnalyzing(true);
    setCurrentProgress(0);
    const newAnalyses: AnalyzedFile[] = [];
    for (let i = 0; i < imageFiles.length; i++) {
      try {
        const result = await analyzeSpectrogram(imageFiles[i]);
        newAnalyses.push({
          id: `${Date.now()}-${i}`,
          file: imageFiles[i],
          result,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error('分析失败:', err);
      }
      setCurrentProgress(((i + 1) / imageFiles.length) * 100);
    }
    setFiles((prev) => [...newAnalyses, ...prev]);
    setIsAnalyzing(false);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };
  const clearAll = () => setFiles([]);

  const downloadReport = (analyzedFile: AnalyzedFile) => {
    const canvas = generateReportCanvas(analyzedFile.result);
    const link = document.createElement('a');
    link.download = `${analyzedFile.file.name.replace(/\.[^/.]+$/, '')}_分析报告.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const downloadAllReports = () => {
    files.forEach((f, i) => {
      setTimeout(() => downloadReport(f), i * 300);
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-[#111111]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                Spek 频谱图无损检测器
              </h1>
              <p className="text-xs text-zinc-500">
                V4.0 频谱形态分析 | 截止检测 + 谐波分析 + 噪声均匀度
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {files.length > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadAllReports}
                  className="border-zinc-700 bg-zinc-800/50 hover:bg-zinc-700 text-zinc-300"
                >
                  <Download className="w-4 h-4 mr-1.5" />
                  下载全部报告
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearAll}
                  className="border-zinc-700 bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400 hover:text-red-400"
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  清空
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Upload Zone */}
        <Card
          className={`relative border-2 border-dashed transition-all duration-300 cursor-pointer mb-8 ${
            isDragging
              ? 'border-cyan-500 bg-cyan-950/20 shadow-lg shadow-cyan-900/20'
              : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-500 hover:bg-zinc-800/30'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <div className="flex flex-col items-center justify-center py-12 px-4">
            {isAnalyzing ? (
              <div className="flex flex-col items-center gap-4 w-full max-w-md">
                <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
                <p className="text-zinc-400 text-sm">正在分析频谱图...</p>
                <Progress value={currentProgress} className="w-full h-2" />
                <p className="text-zinc-500 text-xs">
                  {Math.round(currentProgress)}%
                </p>
              </div>
            ) : (
              <>
                <div
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-colors ${
                    isDragging
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  <Upload className="w-8 h-8" />
                </div>
                <p className="text-lg font-medium text-zinc-300 mb-1">
                  {isDragging ? '松开以上传' : '拖拽 Spek 频谱图到此处'}
                </p>
                <p className="text-sm text-zinc-500 mb-3">
                  或点击选择图片文件（PNG / JPG / JPEG）
                </p>
                <div className="flex items-center gap-2 text-xs text-zinc-600">
                  <FileAudio className="w-3.5 h-3.5" />
                  <span>支持批量上传，同时分析多张频谱图</span>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Results */}
        {files.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-200 flex items-center gap-2">
                <Zap className="w-5 h-5 text-cyan-400" />
                分析结果 ({files.length} 个文件)
              </h2>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {files.map((af) => (
                <AnalysisCard
                  key={af.id}
                  analyzedFile={af}
                  onRemove={() => removeFile(af.id)}
                  onDownload={() => downloadReport(af)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {files.length === 0 && !isAnalyzing && <EmptyState />}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Analysis Card
// ═══════════════════════════════════════════════════════════

function AnalysisCard({
  analyzedFile,
  onRemove,
  onDownload,
}: {
  analyzedFile: AnalyzedFile;
  onRemove: () => void;
  onDownload: () => void;
}) {
  const { result, file } = analyzedFile;
  const [showDetails, setShowDetails] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const thumbRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = thumbRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = result.originalImage;
    const scale = Math.min(400 / img.naturalWidth, 200 / img.naturalHeight);
    canvas.width = Math.floor(img.naturalWidth * scale);
    canvas.height = Math.floor(img.naturalHeight * scale);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }, [result]);

  const scoreColor =
    result.score >= 85 ? 'text-green-400' :
    result.score >= 65 ? 'text-emerald-300' :
    result.score >= 45 ? 'text-yellow-400' :
    result.score >= 25 ? 'text-orange-400' : 'text-red-400';

  const scoreBarColor =
    result.score >= 85 ? 'bg-green-500' :
    result.score >= 65 ? 'bg-emerald-400' :
    result.score >= 45 ? 'bg-yellow-500' :
    result.score >= 25 ? 'bg-orange-500' : 'bg-red-500';

  return (
    <Card className="bg-zinc-900/80 border-zinc-800 overflow-hidden hover:border-zinc-700 transition-colors">
      {/* Thumbnail */}
      <div className="relative bg-black">
        <canvas ref={thumbRef} className="w-full h-40 object-cover" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
          <Button
            variant="secondary"
            size="sm"
            className="bg-black/60 text-white hover:bg-black/80 backdrop-blur-sm"
            onClick={(e) => { e.stopPropagation(); setShowPreview(true); }}
          >
            <Image className="w-4 h-4 mr-1" /> 查看大图
          </Button>
        </div>
        <div className="absolute top-2 right-2">
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="w-7 h-7 rounded-lg bg-black/60 hover:bg-red-900/80 flex items-center justify-center transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 text-zinc-400 hover:text-red-400" />
          </button>
        </div>
        {/* Score overlay */}
        <div className="absolute top-2 left-2 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-sm">
          <span className={`text-lg font-bold ${scoreColor}`}>{result.score}</span>
          <span className="text-xs text-zinc-500 ml-0.5">/100</span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Filename & Verdict */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium text-zinc-300 truncate flex-1">{file.name}</h3>
          <VerdictBadge score={result.score} />
        </div>

        {/* Main Verdict */}
        <div
          className="flex items-center gap-3 p-3 rounded-lg border"
          style={{ backgroundColor: result.bgColor + '80', borderColor: result.color + '40' }}
        >
          <VerdictIcon score={result.score} />
          <div className="flex-1 min-w-0">
            <span className="text-base font-bold" style={{ color: result.color }}>
              {result.verdict}
            </span>
            <p className="text-xs text-zinc-400 mt-0.5 truncate">{result.detail}</p>
          </div>
        </div>

        {/* Score Bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>综合得分</span>
            <span>
              {result.score >= 85 ? '真无损' :
               result.score >= 65 ? '大概率真' :
               result.score >= 45 ? '轻度嫌疑' :
               result.score >= 25 ? '大概率假' : '假无损'}
            </span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${scoreBarColor}`}
              style={{ width: `${result.score}%` }}
            />
          </div>
        </div>

        {/* V4.0 Key Metrics */}
        <div className="grid grid-cols-2 gap-2">
          <MetricCard
            icon={<Radio className="w-3.5 h-3.5" />}
            label="频率截止"
            value={`${result.cutoffFreq.toFixed(0)}kHz`}
            pass={!result.hasCutoff}
            warn={result.hasCutoff && result.cutoffFreq >= 18}
          />
          <MetricCard
            icon={<Waves className="w-3.5 h-3.5" />}
            label="谐波结构"
            value={`${(result.harmonicScore * 100).toFixed(0)}`}
            pass={result.harmonicScore > 0.2}
          />
          <MetricCard
            icon={<TrendingDown className="w-3.5 h-3.5" />}
            label="高频衰减"
            value={result.spectralSlope.toFixed(2)}
            pass={result.spectralSlope > 0.5}
          />
          <MetricCard
            icon={<Timer className="w-3.5 h-3.5" />}
            label="时间方差"
            value={result.hfTimeVariance.toFixed(2)}
            pass={result.hfTimeVariance > 0.3}
          />
        </div>

        {/* Expandable Details */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors w-full"
        >
          {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showDetails ? '收起详情' : '查看详情'}
        </button>

        {showDetails && (
          <div className="space-y-1.5 pt-1 border-t border-zinc-800">
            <DetailRow label="噪声均匀度" value={result.noiseUniformity.toFixed(2)} />
            <DetailRow label="截止陡峭度" value={result.cutoffSharpness.toFixed(1)} />
            <DetailRow label="有效高/中比" value={result.ratioEff.toFixed(2)} />
            <DetailRow label="亮像素占比" value={`${(result.brightRatio * 100).toFixed(1)}%`} />
            <DetailRow label="峰值能量比" value={result.ratioPeak.toFixed(2)} />

            {result.reasons.length > 0 && (
              <div className="pt-1">
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">扣分项</p>
                {result.reasons.map((r, i) => (
                  <div key={i} className="flex items-start gap-1 text-[11px] text-orange-400/80">
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                    <span className="leading-tight">{r}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <Button
          onClick={onDownload}
          className="w-full bg-cyan-600 hover:bg-cyan-500 text-white"
          size="sm"
        >
          <Download className="w-4 h-4 mr-1.5" />
          下载 V4.0 分析报告
        </Button>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setShowPreview(false)}
        >
          <div className="relative max-w-5xl max-h-[90vh] overflow-auto">
            <img src={result.originalImage.src} alt="频谱图" className="max-w-full rounded-lg" />
            <Button
              className="absolute top-4 right-4 bg-black/60 hover:bg-black/80"
              size="sm"
              onClick={() => setShowPreview(false)}
            >
              关闭
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════
// Sub-Components
// ═══════════════════════════════════════════════════════════

function VerdictBadge({ score }: { score: number }) {
  if (score >= 85) return <Badge className="bg-green-900/60 text-green-300 border-green-700/50">真无损</Badge>;
  if (score >= 65) return <Badge className="bg-emerald-900/60 text-emerald-300 border-emerald-700/50">大概率真</Badge>;
  if (score >= 45) return <Badge className="bg-yellow-900/60 text-yellow-300 border-yellow-700/50">轻度嫌疑</Badge>;
  if (score >= 25) return <Badge className="bg-orange-900/60 text-orange-300 border-orange-700/50">大概率假</Badge>;
  return <Badge className="bg-red-900/60 text-red-300 border-red-700/50">假无损</Badge>;
}

function VerdictIcon({ score }: { score: number }) {
  if (score >= 85) return <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" />;
  if (score >= 65) return <CheckCircle2 className="w-6 h-6 text-emerald-300 shrink-0" />;
  if (score >= 45) return <AlertTriangle className="w-6 h-6 text-yellow-400 shrink-0" />;
  return <XCircle className="w-6 h-6 text-red-400 shrink-0" />;
}

function MetricCard({
  icon,
  label,
  value,
  pass,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  pass: boolean;
  warn?: boolean;
}) {
  const statusColor = pass ? 'text-green-400' : warn ? 'text-yellow-400' : 'text-red-400';
  const bgColor = pass ? 'bg-green-950/30' : warn ? 'bg-yellow-950/30' : 'bg-red-950/30';
  const borderColor = pass ? 'border-green-900/40' : warn ? 'border-yellow-900/40' : 'border-red-900/40';

  return (
    <div className={`flex flex-col p-2.5 rounded-md border ${bgColor} ${borderColor}`}>
      <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
        <span className={statusColor}>{icon}</span>
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-sm font-mono font-semibold ${statusColor}`}>{value}</span>
        <span className={`text-[10px] ${statusColor}`}>{pass ? 'PASS' : warn ? 'WARN' : 'FAIL'}</span>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-300 font-mono">{value}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16">
      <Activity className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-zinc-500 mb-2">暂无分析结果</h3>
      <p className="text-sm text-zinc-600 max-w-lg mx-auto mb-8">
        上传 Spek 生成的频谱图，V4.0 算法将基于频率截止检测、谐波结构分析、
        频谱斜率和噪声均匀度等多维度自动判定音频真伪
      </p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 max-w-3xl mx-auto">
        <AlgoCard icon={<Radio className="w-5 h-5" />} title="频率截止检测" desc="检测低通滤波器截断频率" />
        <AlgoCard icon={<Waves className="w-5 h-5" />} title="谐波结构分析" desc="识别高频音乐内容竖线" />
        <AlgoCard icon={<TrendingDown className="w-5 h-5" />} title="频谱斜率分析" desc="评估高频自然衰减" />
        <AlgoCard icon={<Timer className="w-5 h-5" />} title="时间方差" desc="检测静态噪声填充" />
        <AlgoCard icon={<Activity className="w-5 h-5" />} title="噪声均匀度" desc="识别人工噪声底" />
      </div>

      <div className="mt-8 max-w-xl mx-auto p-4 rounded-lg bg-zinc-900/50 border border-zinc-800 text-left">
        <p className="text-xs text-zinc-500 mb-2 font-semibold">使用说明 / How to use:</p>
        <ol className="text-xs text-zinc-600 space-y-1 list-decimal list-inside">
          <li>用 Spek 生成音频文件的频谱图（PNG/JPG格式）</li>
          <li>将频谱图拖拽到上方区域，或点击选择文件</li>
          <li>工具自动分析并给出综合得分（0-100）</li>
          <li>得分 ≥85: 真无损 | 65-84: 大概率真 | 45-64: 轻度嫌疑 | 25-44: 大概率假 | &lt;25: 假无损</li>
        </ol>
      </div>
    </div>
  );
}

function AlgoCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-center">
      <div className="w-10 h-10 rounded-lg bg-cyan-950/50 text-cyan-400 flex items-center justify-center mx-auto mb-2">
        {icon}
      </div>
      <h4 className="text-sm font-medium text-zinc-300 mb-1">{title}</h4>
      <p className="text-xs text-zinc-500">{desc}</p>
    </div>
  );
}
