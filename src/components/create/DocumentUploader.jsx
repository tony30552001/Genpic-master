import { useState, useRef, useCallback } from "react";
import { FileText, Upload, X, FileType, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 文件上傳與分析元件
 * @param {Object} props
 * @param {Function} props.onAnalyze - 分析文件的回調函式
 * @param {boolean} props.isAnalyzing - 是否正在分析
 * @param {string} props.analysisPhase - 當前分析階段
 */
export default function DocumentUploader({
  onAnalyze,
  isAnalyzing,
  analysisPhase,
  disabled = false
}) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

  // 支援的檔案格式
  const supportedFormats = [
    { ext: "pdf", label: "PDF", color: "text-red-500" },
    { ext: "docx", label: "Word", color: "text-blue-500" },
    { ext: "pptx", label: "PowerPoint", color: "text-orange-500" },
    { ext: "txt", label: "Text", color: "text-gray-500" },
    { ext: "md", label: "Markdown", color: "text-gray-500" },
    { ext: "png", label: "PNG", color: "text-green-500" },
    { ext: "jpg", label: "JPG", color: "text-green-500" },
  ];

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = useCallback((e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  }, []);

  const handleFile = (file) => {
    // 驗證檔案大小 (50MB)
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert("檔案大小超過 50MB 限制");
      return;
    }

    // 驗證檔案格式
    const supportedExtensions = ["pdf", "docx", "pptx", "txt", "md", "png", "jpg", "jpeg"];
    const ext = file.name.split(".").pop().toLowerCase();
    if (!supportedExtensions.includes(ext)) {
      alert("不支援的檔案格式。請上傳 PDF、DOCX、PPTX、TXT 或圖片檔案。");
      return;
    }

    setSelectedFile(file);
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;

    try {
      await onAnalyze(selectedFile);
    } catch (err) {
      // 錯誤已在父層處理
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileIcon = (fileName) => {
    const ext = fileName.split(".").pop().toLowerCase();
    switch (ext) {
      case "pdf":
        return <FileText className="h-8 w-8 text-red-500" />;
      case "docx":
      case "doc":
        return <FileText className="h-8 w-8 text-blue-500" />;
      case "pptx":
      case "ppt":
        return <FileText className="h-8 w-8 text-orange-500" />;
      case "png":
      case "jpg":
      case "jpeg":
        return <FileType className="h-8 w-8 text-green-500" />;
      default:
        return <FileText className="h-8 w-8 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* 上傳區域 */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-6 transition-colors ${dragActive
            ? "border-blue-500 bg-blue-50"
            : selectedFile
              ? "border-green-500 bg-green-50"
              : "border-slate-300 hover:border-slate-400"
          } ${disabled || isAnalyzing ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !disabled && !isAnalyzing && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={handleChange}
          accept=".pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg"
          disabled={disabled || isAnalyzing}
        />

        <div className="flex flex-col items-center justify-center space-y-3">
          {isAnalyzing ? (
            <>
              <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
              <p className="text-sm font-medium text-blue-600">{analysisPhase || "分析中..."}</p>
            </>
          ) : selectedFile ? (
            <div className="flex items-center space-x-4">
              {getFileIcon(selectedFile.name)}
              <div className="text-left">
                <p className="font-medium text-slate-900">{selectedFile.name}</p>
                <p className="text-sm text-slate-500">{formatFileSize(selectedFile.size)}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  clearFile();
                }}
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <Upload className="h-12 w-12 text-slate-400" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">
                  點擊或拖曳檔案至此處
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  支援 PDF、Word、PowerPoint、文字檔案與圖片
                </p>
                <p className="text-xs text-slate-400">最大 50MB</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 支援格式標籤 */}
      {!selectedFile && !isAnalyzing && (
        <div className="flex flex-wrap gap-2 justify-center">
          {supportedFormats.map((format) => (
            <span
              key={format.ext}
              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600"
            >
              {format.label}
            </span>
          ))}
        </div>
      )}

      {/* 分析按鈕 */}
      {selectedFile && !isAnalyzing && (
        <Button
          onClick={handleAnalyze}
          disabled={disabled || isAnalyzing}
          className="w-full"
        >
          <FileText className="h-4 w-4 mr-2" />
          分析文件並提取場景
        </Button>
      )}
    </div>
  );
}
