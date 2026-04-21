import React, { useState, useEffect } from 'react';
import { Camera, BookOpen, Clock, Printer, Trash2, Plus, ArrowRight, RotateCcw, X, LayoutGrid, FileText, Settings, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MistakeQuestion, Variation, OCRResult } from './types';
import { recognizeMistake, generateVariations } from './lib/gemini';
import { saveQuestion, getQuestions, deleteQuestions } from './lib/storage';
import { cn, formatDate } from './lib/utils';
import { useDropzone } from 'react-dropzone';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export default function App() {
  const [activeTab, setActiveTab] = useState<'identify' | 'history'>('identify');
  const [history, setHistory] = useState<MistakeQuestion[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isGeneratingVariations, setIsGeneratingVariations] = useState(false);
  const [viewingDetail, setViewingDetail] = useState<MistakeQuestion | null>(null);

  useEffect(() => {
    setHistory(getQuestions());
  }, []);

  const onDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        setImage(base64);
        handleOCR(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: false
  } as any);

  const handleOCR = async (base64: string) => {
    setIsProcessing(true);
    setOcrResult(null);
    setVariations([]);
    try {
      const result = await recognizeMistake(base64);
      setOcrResult(result);
    } catch (err) {
      console.error(err);
      alert('识别失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateVariations = async () => {
    if (!ocrResult) return;
    setIsGeneratingVariations(true);
    try {
      const vars = await generateVariations(ocrResult.question, ocrResult.knowledgePoint);
      setVariations(vars);
    } catch (err) {
      console.error(err);
      alert('生成举一反三失败');
    } finally {
      setIsGeneratingVariations(false);
    }
  };

  const handleSave = () => {
    if (!ocrResult || variations.length === 0) return;
    const newQuestion: MistakeQuestion = {
      id: crypto.randomUUID(),
      question: ocrResult.question,
      options: ocrResult.options,
      userAnswer: ocrResult.userAnswer,
      standardAnswer: ocrResult.standardAnswer,
      knowledgePoint: ocrResult.knowledgePoint,
      createdAt: Date.now(),
      originalImage: image || undefined,
      variations: variations
    };
    saveQuestion(newQuestion);
    setHistory(getQuestions());
    setOcrResult(null);
    setImage(null);
    setVariations([]);
    setActiveTab('history');
  };

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleDelete = () => {
    if (selectedIds.size === 0) return;
    if (!confirm('确定要删除选中的错题吗？')) return;
    deleteQuestions(Array.from(selectedIds));
    setHistory(getQuestions());
    setSelectedIds(new Set());
  };

  const generatePDF = async () => {
    if (selectedIds.size === 0) return;
    const doc = new jsPDF('p', 'mm', 'a4');
    const selectedQuestions = history.filter(q => selectedIds.has(q.id));
    
    const container = document.createElement('div');
    container.style.width = '210mm';
    container.style.padding = '20mm';
    container.style.backgroundColor = 'white';
    container.style.fontFamily = 'serif';
    container.style.color = '#000';
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    document.body.appendChild(container);

    const title = document.createElement('h2');
    title.innerText = '智学错题变式练习本';
    title.style.textAlign = 'center';
    title.style.marginBottom = '30px';
    container.appendChild(title);

    selectedQuestions.forEach((q, i) => {
      const section = document.createElement('div');
      section.style.marginBottom = '30px';
      section.style.borderBottom = '1px solid #ddd';
      section.style.paddingBottom = '20px';
      
      section.innerHTML = `
        <div style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">${i + 1}. [${q.knowledgePoint}]</div>
        <div style="font-size: 14px; margin-bottom: 20px;">${q.question}</div>
        ${q.options ? `<div style="font-size: 12px; margin-left: 20px; margin-bottom: 20px;">${q.options.join('&nbsp;&nbsp;&nbsp;&nbsp;')}</div>` : ''}
        
        <div style="background: #fcfcfc; border: 1px dashed #ccc; padding: 15px; border-radius: 8px;">
          <div style="font-size: 12px; font-weight: bold; color: #333; margin-bottom: 10px; text-decoration: underline;">举一反三变式练习：</div>
          ${q.variations.map((v, vi) => `
            <div style="margin-bottom: 20px;">
              <div style="font-size: 13px;">(${vi + 1}) ${v.question}</div>
              <div style="font-size: 11px; color: #555; margin-top: 10px; border-top: 1px dotted #eee; padding-top: 5px;">
                <b>答案：</b>${v.answer}<br/>
                <b style="color: #d32f2f;">易错点解析：</b>${v.analysis}
              </div>
            </div>
          `).join('')}
        </div>
      `;
      container.appendChild(section);
    });

    try {
      const canvas = await html2canvas(container, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        doc.addPage();
        doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      doc.save(`智学错题本_${new Date().toLocaleDateString()}.pdf`);
    } catch (e) {
      console.error(e);
    } finally {
      document.body.removeChild(container);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Left Navigation Rail */}
      <nav className="w-20 bg-white border-r border-slate-200 flex flex-col items-center py-8 gap-10 z-50">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
          <BookOpen className="w-6 h-6 text-white" />
        </div>
        <div className="flex flex-col gap-8">
          <button 
            onClick={() => { setActiveTab('identify'); setViewingDetail(null); }}
            className={cn(
              "p-3 transition-all rounded-lg",
              activeTab === 'identify' ? "bg-indigo-50 text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Camera size={24} />
          </button>
          <button 
            onClick={() => { setActiveTab('history'); setViewingDetail(null); }}
            className={cn(
              "p-3 transition-all rounded-lg",
              activeTab === 'history' ? "bg-indigo-50 text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <LayoutGrid size={24} />
          </button>
        </div>
        <div className="mt-auto mb-8 flex flex-col gap-6 items-center">
          <button className="p-3 text-slate-400 hover:text-slate-600">
            <Settings size={22} />
          </button>
          <div className="w-10 h-10 bg-slate-100 rounded-full border border-slate-200 flex items-center justify-center text-slate-400">
            <User size={20} />
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-xl font-bold text-slate-800">
              {activeTab === 'identify' ? '错题识别与举一反三' : '错题管理中心'}
            </h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] mt-1">
              Mistake Recognition & Variant Practice
            </p>
          </div>
          <div className="flex items-center gap-4">
            {activeTab === 'identify' && (
              <>
                <button 
                  onClick={() => { setImage(null); setOcrResult(null); setVariations([]); }}
                  className="px-5 py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  重新拍照
                </button>
                <button 
                  onClick={handleSave}
                  disabled={!ocrResult || variations.length === 0}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium shadow-md shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:shadow-none"
                >
                  保存并同步
                </button>
              </>
            )}
            {activeTab === 'history' && (
              <>
                {selectedIds.size > 0 && (
                   <button 
                    onClick={handleDelete}
                    className="px-5 py-2 border border-red-100 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
                   >
                     删除已选 ({selectedIds.size})
                   </button>
                )}
                <button 
                  onClick={generatePDF}
                  disabled={selectedIds.size === 0}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium shadow-md shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:shadow-none"
                >
                  导出 PDF ({selectedIds.size})
                </button>
              </>
            )}
          </div>
        </header>

        {/* Workspace Container */}
        <div className="flex-1 flex overflow-hidden">
          <AnimatePresence mode="wait">
            {activeTab === 'identify' ? (
              <motion.div
                key="workspace-identify"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex gap-6 p-6 overflow-hidden"
              >
                {/* Left: Input Area */}
                <section className="w-1/3 flex flex-col gap-6">
                  <div className="flex-1 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col overflow-hidden">
                    <div className="text-[10px] font-extrabold text-slate-400 uppercase mb-4 flex items-center gap-2 tracking-widest">
                      <span className={cn("w-2 h-2 rounded-full", isProcessing ? "bg-amber-400 animate-pulse" : "bg-emerald-500")}></span>
                      {isProcessing ? "正在分析错题..." : "错题识别输入层"}
                    </div>

                    {!image ? (
                      <div 
                        {...getRootProps()}
                        className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50/30 transition-all cursor-pointer p-8 text-center"
                      >
                        <input {...getInputProps()} />
                        <Camera className="w-12 h-12 text-slate-300 mb-4" />
                        <p className="text-sm font-medium text-slate-600">点击或拖拽拍摄照片</p>
                        <p className="text-[10px] text-slate-400 mt-2">支持数学公式、中文及英文题干</p>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col overflow-hidden">
                         <div className="relative h-48 bg-slate-100 rounded-xl overflow-hidden border border-slate-100 shrink-0 mb-4">
                            <img src={image} alt="Preview" className="w-full h-full object-contain" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                         </div>
                         
                         {ocrResult ? (
                           <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
                              <div className="p-3 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block tracking-wider">题目草案</label>
                                <textarea 
                                  value={ocrResult.question}
                                  onChange={(e) => setOcrResult({...ocrResult, question: e.target.value})}
                                  className="w-full bg-transparent border-none outline-none text-sm leading-relaxed text-slate-700 italic h-24 resize-none"
                                />
                                <div className="mt-4 pt-3 border-t border-slate-200">
                                  <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-bold uppercase">知识点</span>
                                  <input 
                                    value={ocrResult.knowledgePoint}
                                    onChange={(e) => setOcrResult({...ocrResult, knowledgePoint: e.target.value})}
                                    className="mt-1 text-sm font-semibold w-full bg-transparent border-none outline-none text-indigo-900"
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="p-2 border border-slate-100 rounded-lg">
                                   <label className="text-[10px] font-bold text-slate-400 block mb-1">我的作答</label>
                                   <input value={ocrResult.userAnswer || ''} onChange={e => setOcrResult({...ocrResult, userAnswer: e.target.value})} className="w-full bg-transparent outline-none text-xs" />
                                </div>
                                <div className="p-2 border border-slate-100 rounded-lg">
                                   <label className="text-[10px] font-bold text-slate-400 block mb-1">标准答案</label>
                                   <input value={ocrResult.standardAnswer || ''} onChange={e => setOcrResult({...ocrResult, standardAnswer: e.target.value})} className="w-full bg-transparent outline-none text-xs font-bold text-emerald-600" />
                                </div>
                              </div>
                              <button 
                                onClick={handleGenerateVariations}
                                disabled={isGeneratingVariations}
                                className="w-full py-3 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-indigo-600 transition-all flex items-center justify-center gap-2 mt-2"
                              >
                                {isGeneratingVariations ? <RotateCcw size={14} className="animate-spin text-indigo-300" /> : <RotateCcw size={14} />}
                                {isGeneratingVariations ? "正在生成变式..." : "生成举一反三题目"}
                              </button>
                           </div>
                         ) : (
                           <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs italic">
                              {isProcessing ? "正在精准识别..." : "等待照片识别结果"}
                           </div>
                         )}
                      </div>
                    )}
                  </div>
                </section>

                {/* Right: AI Variants & Analysis */}
                <section className="flex-1 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
                  {variations.length > 0 ? (
                    <>
                      <div className="flex items-center justify-between shrink-0">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                          智能举一反三 ({variations.length})
                        </h3>
                        {isGeneratingVariations ? (
                          <div className="text-[10px] text-indigo-600 animate-pulse">正在生成新题目...</div>
                        ) : (
                          <button 
                            onClick={handleGenerateVariations}
                            className="text-xs text-indigo-600 font-semibold hover:underline flex items-center gap-1"
                          >
                            <RotateCcw size={12} />
                            换一批题目
                          </button>
                        )}
                      </div>

                      {variations.map((v, i) => (
                        <motion.div 
                          key={v.id}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm group hover:border-indigo-200 transition-all"
                        >
                          <div className="flex justify-between items-start mb-4">
                            <span className="text-[10px] font-extrabold text-indigo-500 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-widest">变式 {i + 1}</span>
                            <span className="text-[10px] text-slate-400 font-mono">ID: {v.id.split('-')[0]}</span>
                          </div>
                          <p className="text-sm text-slate-800 leading-relaxed font-medium mb-5">
                            {v.question}
                          </p>
                          <div className="bg-orange-50 border-l-4 border-orange-400 p-4 rounded-r-xl">
                            <div className="flex justify-between items-center mb-2">
                              <p className="text-[10px] font-extrabold text-orange-800 uppercase tracking-widest flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-orange-400 rounded-full"></span> 核心解析 & 易错分析
                              </p>
                              <span className="text-[10px] font-bold text-orange-700 bg-white/50 px-1.5 py-0.5 rounded">答案: {v.answer}</span>
                            </div>
                            <p className="text-[11px] text-orange-950 leading-relaxed italic">
                              {v.analysis}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-300 border border-dashed border-slate-200 rounded-3xl m-8">
                       <FileText size={48} className="opacity-20 mb-4" />
                       <p className="text-sm">确认错题识别后，点击左侧按钮生成学习变式</p>
                    </div>
                  )}
                </section>
              </motion.div>
            ) : (
              <motion.div
                key="workspace-history"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col p-6 overflow-hidden"
              >
                {viewingDetail ? (
                   <div className="flex-1 bg-white rounded-3xl border border-slate-200 p-8 shadow-sm flex flex-col overflow-hidden relative">
                      <button 
                         onClick={() => setViewingDetail(null)}
                         className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-all"
                      >
                         <X size={24} />
                      </button>
                      
                      <div className="flex gap-10 h-full overflow-hidden">
                        {/* Detail Left: Original */}
                        <div className="w-1/3 flex flex-col gap-6 overflow-y-auto pr-4 custom-scrollbar">
                           <div>
                              <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-2 block">知识点回顾</span>
                              <h2 className="text-2xl font-bold text-slate-900 leading-tight">{viewingDetail.knowledgePoint}</h2>
                              <p className="text-[10px] text-slate-400 mt-2 font-mono uppercase">{formatDate(viewingDetail.createdAt)}</p>
                           </div>
                           
                           {viewingDetail.originalImage && (
                             <div className="rounded-2xl overflow-hidden border border-slate-100 shadow-inner shrink-0">
                                <img src={viewingDetail.originalImage} alt="Original" className="w-full h-auto" />
                             </div>
                           )}

                           <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-2">原题题干</label>
                              <p className="text-sm leading-relaxed text-slate-700 italic">{viewingDetail.question}</p>
                           </div>
                        </div>

                        {/* Detail Right: Analysis & Variants */}
                        <div className="flex-1 overflow-y-auto space-y-6 pr-4 custom-scrollbar">
                           <div className="flex items-center gap-3 text-sm font-bold text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-50 pb-4">
                              <span className="w-2 h-2 bg-indigo-500 rounded-full"></span> 举一反三变式练习详情
                           </div>
                           
                           {viewingDetail.variations.map((v, i) => (
                             <div key={v.id} className="p-6 rounded-2xl bg-white border border-slate-100 shadow-sm border-l-4 border-l-indigo-600">
                                <div className="text-[10px] font-bold text-indigo-400 uppercase mb-3">变式习题 {i + 1}</div>
                                <p className="text-sm font-medium text-slate-800 leading-relaxed mb-4">{v.question}</p>
                                <div className="grid grid-cols-2 gap-4">
                                   <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
                                      <span className="text-[10px] font-bold text-emerald-600 uppercase block mb-1">参考答案</span>
                                      <p className="text-sm font-bold text-emerald-800">{v.answer}</p>
                                   </div>
                                   <div className="p-3 bg-orange-50/50 rounded-xl border border-orange-100">
                                      <span className="text-[10px] font-bold text-orange-600 uppercase block mb-1">关键解析</span>
                                      <p className="text-[11px] text-orange-950 italic leading-relaxed">{v.analysis}</p>
                                   </div>
                                </div>
                             </div>
                           ))}
                        </div>
                      </div>
                   </div>
                ) : (
                  <>
                    {/* History Actions Header */}
                    <div className="flex items-center justify-between mb-6 px-2">
                       <div className="flex items-center gap-4">
                          <button 
                            onClick={() => {
                              if (selectedIds.size === history.length && history.length > 0) setSelectedIds(new Set());
                              else setSelectedIds(new Set(history.map(q => q.id)));
                            }}
                            className="text-xs font-bold text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors"
                          >
                            {selectedIds.size === history.length && history.length > 0 ? "取消全选" : `全选题目 (${history.length})`}
                          </button>
                       </div>
                       <div className="text-xs text-slate-400 font-medium">
                          当前选中 <span className="text-indigo-600 font-bold">{selectedIds.size}</span> 题
                       </div>
                    </div>

                    {history.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-3xl border border-dashed border-slate-200 m-12">
                         <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-4">
                            <Clock size={32} />
                         </div>
                         <p className="text-sm font-medium text-slate-500">暂无错题记录</p>
                         <button 
                           onClick={() => setActiveTab('identify')}
                           className="mt-4 text-xs font-bold text-indigo-600 hover:underline px-4 py-2 bg-indigo-50 rounded-lg"
                         >
                           立即拍照识别
                         </button>
                      </div>
                    ) : (
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pr-2 custom-scrollbar pb-12">
                        {history.map((q) => (
                          <motion.div 
                            key={q.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn(
                              "bg-white rounded-2xl border p-5 shadow-sm transition-all relative flex flex-col h-56 cursor-pointer group",
                              selectedIds.has(q.id) ? "border-indigo-400 ring-2 ring-indigo-50 bg-indigo-50/10" : "border-slate-200 hover:border-indigo-200 hover:shadow-md"
                            )}
                            onClick={() => setViewingDetail(q)}
                          >
                             <div className="flex justify-between items-start mb-3 shrink-0">
                                <div className="space-y-0.5">
                                   <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">知识板块</div>
                                   <h4 className="text-sm font-bold text-slate-800 line-clamp-1 group-hover:text-indigo-600 transition-colors">{q.knowledgePoint}</h4>
                                </div>
                                <button 
                                  onClick={(e) => toggleSelect(q.id, e)}
                                  className={cn(
                                    "w-6 h-6 rounded-full border flex items-center justify-center transition-all shrink-0",
                                    selectedIds.has(q.id) ? "bg-indigo-600 border-indigo-600" : "bg-white border-slate-200 hover:border-indigo-400"
                                  )}
                                >
                                   {selectedIds.has(q.id) && <Plus className="text-white rotate-45" size={14} />}
                                </button>
                             </div>
                             
                             <div className="flex-1 overflow-hidden">
                                <p className="text-xs text-slate-500 line-clamp-4 leading-relaxed italic">
                                   {q.question}
                                </p>
                             </div>

                             <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-1.5">
                                   <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></span>
                                   <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{q.variations.length} 变式练习</span>
                                </div>
                                <span className="text-[9px] font-mono text-slate-300 uppercase">{formatDate(q.createdAt).split(' ')[0]}</span>
                             </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Status Bar */}
        <footer className="h-10 bg-slate-100 border-t border-slate-200 px-8 flex items-center justify-between text-[10px] text-slate-400 font-medium shrink-0">
          <div className="flex gap-6 uppercase tracking-wider">
            <span>错题录入总数：{history.length}</span>
            <span>本次回话变式：{variations.length}</span>
            <span>选中任务：{selectedIds.size}</span>
          </div>
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-1.5">
                <span className={cn("w-2 h-2 rounded-full", isProcessing || isGeneratingVariations ? "bg-amber-400 animate-pulse" : "bg-green-500")}></span>
                <span>AI 核心已就绪</span>
             </div>
             <div className="w-px h-3 bg-slate-200" />
             <span className="uppercase tracking-widest">Version 1.0.4 - Clean Minimalism</span>
          </div>
        </footer>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb/hover {
          background: #cbd5e1;
        }
      `}</style>
    </div>
  );
}
