import { desktopEnvironmentKey } from '@/utils/apiKeyStorage';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Download, Sparkles, Search, FileText, Clipboard, Image, Video, Globe, Music, Type } from 'lucide-react';
import { useMindMapStore } from '../store/mindMapStore';
import { GeminiService, type StreamProgress } from '../services/geminiService';
import { getStoredApiKey, hasAiAccess } from '../services/aiAccess';
import { documentService } from '../services/documentService';
import { CONTENT_MODES, VIDEO_PLATFORMS } from '../types';
import type { ContentMode, VideoPlatform } from '../types';
import { MAP_TEMPLATES, autoPickTemplate, buildTemplateStructure } from '../templates/mapTemplates';
import type { MapTemplate } from '../templates/mapTemplates';
import { PROMPT_PRESETS, DEFAULT_CUSTOM_PROMPT } from '../prompts/promptPresets';
import type { PromptMode } from '../prompts/promptPresets';

type InputTab = 'text' | 'image' | 'document' | 'youtube' | 'webpage' | 'audio';

export const InputPanel: React.FC = () => {
    const {
        geminiApiKey,
        contentMode,
        setContentMode,
        aiMaxDepth,
        setAiMaxDepth,
        aiDetailLevel,
        setAiDetailLevel,
        aiPromptMode,
        setAiPromptMode,
        aiCustomPrompt,
        setAiCustomPrompt,
        createFromStructure,
        addCreationRecord,
    } = useMindMapStore();
    const envApiKey = (typeof import.meta !== 'undefined' && desktopEnvironmentKey(import.meta.env?.VITE_GEMINI_API_KEY)) as string | undefined;
    const storedApiKey = getStoredApiKey();
    const apiKey = geminiApiKey || envApiKey || storedApiKey;
    const hasApiKey = hasAiAccess(apiKey);

    const [activeTab, setActiveTab] = useState<InputTab>('text');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 🚀 流式生成状态
    const [streamProgress, setStreamProgress] = useState<{ nodeCount: number; isStreaming: boolean }>({
        nodeCount: 0,
        isStreaming: false
    });
    const [useStreaming, setUseStreaming] = useState(true); // 默认开启流式生成
    const [useWebSearch, setUseWebSearch] = useState(false); // 联网搜索增强（默认关闭，消耗更多配额）
    const [showCustomPromptEditor, setShowCustomPromptEditor] = useState(false); // 自定义 Prompt 编辑器

    // 文本输入
    const [textInput, setTextInput] = useState('');
    const [selectedTemplateId, setSelectedTemplateId] = useState(MAP_TEMPLATES[0]?.id ?? '');

    // 图片输入
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [, setImageFile] = useState<File | null>(null);
    const [imageInstruction, setImageInstruction] = useState('');
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [imageAnalysisMode, setImageAnalysisMode] = useState<'ocr' | 'poster-video'>('ocr');

    // 文档输入
    const [documentFile, setDocumentFile] = useState<File | null>(null);
    const [documentText, setDocumentText] = useState<string>('');
    const [documentMode, setDocumentMode] = useState<'file' | 'paste'>('file');
    const documentInputRef = useRef<HTMLInputElement>(null);

    // YouTube 输入
    const [youtubeUrl, setYoutubeUrl] = useState('');

    // 网页输入
    const [webpageUrl, setWebpageUrl] = useState('');
    const [webpageContent, setWebpageContent] = useState('');
    const [webpageFetchStatus, setWebpageFetchStatus] = useState<'idle' | 'fetching' | 'success' | 'error'>('idle');

    // 音频输入
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [audioPreview, setAudioPreview] = useState<string | null>(null);
    const audioInputRef = useRef<HTMLInputElement>(null);

    // 短视频创意模式 - 平台选择
    const [videoPlatform, setVideoPlatform] = useState<VideoPlatform>('douyin');
    const currentModeConfig = CONTENT_MODES.find(m => m.mode === contentMode);
    const selectedTemplate = MAP_TEMPLATES.find((template) => template.id === selectedTemplateId) || MAP_TEMPLATES[0];

    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<{ tab?: InputTab }>).detail;
            if (!detail?.tab) return;
            setActiveTab(detail.tab);
        };
        window.addEventListener('mindmap-input-tab', handler as EventListener);
        return () => window.removeEventListener('mindmap-input-tab', handler as EventListener);
    }, []);

    // ===================================
    // 文本处理
    // ===================================
    const handleTextGenerate = async () => {
        if (!textInput.trim() || !hasApiKey) return;

        setIsLoading(true);
        setError(null);
        setStreamProgress({ nodeCount: 0, isStreaming: false });

        try {
            const service = new GeminiService(apiKey);

            // 短视频创意模式使用专属方法（不支持流式）
            if (contentMode === 'video-creative') {
                const structure = await service.generateVideoCreative(textInput, videoPlatform);
                createFromStructure(structure, 'text', textInput);
                addCreationRecord({
                    type: 'create',
                    userInput: textInput,
                    aiResponse: JSON.stringify(structure),
                    sourceType: 'text',
                    contentMode: contentMode,
                    platform: videoPlatform as any,
                    resultSummary: `生成了 "${structure.title}" 短视频创意思维导图`,
                });
            } else if (useWebSearch) {
                // 🌐 联网搜索增强模式 - 使用 Google Search 获取最新信息
                const result = await service.generateWithWebSearch(textInput, contentMode, aiDetailLevel);
                createFromStructure(result, 'text', textInput);
                addCreationRecord({
                    type: 'create',
                    userInput: textInput,
                    aiResponse: JSON.stringify(result),
                    sourceType: 'text',
                    contentMode: contentMode,
                    resultSummary: `🌐 联网生成了 "${result.title}" 思维导图，引用 ${result.searchInfo?.sources?.length || 0} 个来源`,
                });
            } else if (useStreaming) {
                // 🚀 流式生成模式 - Mapify 核心体验
                setStreamProgress({ nodeCount: 0, isStreaming: true });

                const handleProgress = (progress: StreamProgress) => {
                    if (progress.type === 'node') {
                        setStreamProgress(prev => ({
                            ...prev,
                            nodeCount: progress.totalNodes || prev.nodeCount + 1
                        }));
                    } else if (progress.type === 'complete' || progress.type === 'error') {
                        setStreamProgress(prev => ({ ...prev, isStreaming: false }));
                    }
                };

                const structure = await service.generateFromTextStreaming(
                    textInput,
                    contentMode,
                    handleProgress,
                    aiDetailLevel
                );

                createFromStructure(structure, 'text', textInput);
                addCreationRecord({
                    type: 'create',
                    userInput: textInput,
                    aiResponse: JSON.stringify(structure),
                    sourceType: 'text',
                    contentMode: contentMode,
                    resultSummary: `生成了 "${structure.title}" 思维导图，包含 ${structure.children?.length || 0} 个一级分支`,
                });
            } else {
                // 传统一次性生成（支持多种 Prompt 模式）
                const structure = await service.generateFromText(
                    textInput,
                    contentMode,
                    aiMaxDepth,
                    aiDetailLevel,
                    aiPromptMode,
                    aiCustomPrompt || undefined
                );
                createFromStructure(structure, 'text', textInput);
                addCreationRecord({
                    type: 'create',
                    userInput: textInput,
                    aiResponse: JSON.stringify(structure),
                    sourceType: 'text',
                    contentMode: contentMode,
                    resultSummary: `生成了 "${structure.title}" 思维导图，包含 ${structure.children?.length || 0} 个一级分支（${PROMPT_PRESETS.find(p => p.id === aiPromptMode)?.label || '默认'}模式）`,
                });
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '生成失败');
            setStreamProgress(prev => ({ ...prev, isStreaming: false }));
        } finally {
            setIsLoading(false);
        }
    };

    const applyTemplate = (template: MapTemplate | undefined, topic: string) => {
        if (!template) return;
        const structure = buildTemplateStructure(template, topic || template.label);
        createFromStructure(structure, 'text', topic || template.label);
    };

    const handleApplyTemplate = () => {
        applyTemplate(selectedTemplate, textInput.trim());
    };

    const handleAutoTemplate = () => {
        const template = autoPickTemplate(textInput, contentMode);
        if (!template) return;
        setSelectedTemplateId(template.id);
        applyTemplate(template, textInput.trim());
    };

    // ===================================
    // 图片处理
    // ===================================
    const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('请选择图片文件');
            return;
        }

        setImageFile(file);

        const reader = new FileReader();
        reader.onload = (event) => {
            setImagePreview(event.target?.result as string);
        };
        reader.readAsDataURL(file);
    }, []);

    const normalizeImageUrl = (raw: string): string | null => {
        const trimmed = raw.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith('data:image/')) return trimmed;

        const imageFormulaMatch = trimmed.match(/=IMAGE\(\s*\"([^\"]+)\"/i);
        if (imageFormulaMatch?.[1]) return imageFormulaMatch[1];

        const driveIdMatch = trimmed.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([^/&?]+)/i);
        if (driveIdMatch?.[1]) {
            return `https://drive.google.com/uc?export=download&id=${driveIdMatch[1]}`;
        }

        const lh3Match = trimmed.match(/https:\/\/lh3\.googleusercontent\.com\/[^\s]+/i);
        if (lh3Match?.[0]) return lh3Match[0];

        const sheetsImageMatch = trimmed.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/([^/]+)\/.*gid=([0-9]+)/i);
        if (sheetsImageMatch?.[1]) {
            return `https://docs.google.com/spreadsheets/d/${sheetsImageMatch[1]}/export?format=png&gid=${sheetsImageMatch[2]}`;
        }

        if (/drive\.google\.com\/uc\?/.test(trimmed)) return trimmed;

        return trimmed;
    };

    const fetchImageAsDataUrl = async (url: string): Promise<string | null> => {
        try {
            const response = await fetch(url);
            if (!response.ok) return null;
            const blob = await response.blob();
            if (!blob.type.startsWith('image/')) return null;
            return await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('读取失败'));
                reader.readAsDataURL(blob);
            });
        } catch {
            return null;
        }
    };

    const processClipboard = useCallback(async (clipboardData: DataTransfer | null) => {
        const items = clipboardData?.items || [];
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (!file) continue;
                const reader = new FileReader();
                reader.onload = (event) => {
                    setImagePreview(event.target?.result as string);
                };
                reader.readAsDataURL(file);
                return;
            }
        }

        const text = clipboardData?.getData('text') || '';
        const url = normalizeImageUrl(text);
        if (url) {
            const dataUrl = url.startsWith('data:image/')
                ? url
                : await fetchImageAsDataUrl(url);
            if (dataUrl) {
                setImagePreview(dataUrl);
                return;
            }
            setError('无法获取该链接的图片，请确保是公开图片链接或直接复制图片。');
        }
    }, [normalizeImageUrl, fetchImageAsDataUrl]);

    const handlePasteImage = useCallback(async (e: React.ClipboardEvent) => {
        await processClipboard(e.clipboardData);
        e.preventDefault();
    }, [processClipboard]);

    useEffect(() => {
        if (activeTab !== 'image') return;
        const handleWindowPaste = (e: ClipboardEvent) => {
            processClipboard(e.clipboardData);
        };
        window.addEventListener('paste', handleWindowPaste);
        return () => window.removeEventListener('paste', handleWindowPaste);
    }, [activeTab, processClipboard]);

    const handleImageDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (!file || !file.type.startsWith('image/')) {
            setError('请拖入图片文件');
            return;
        }

        setImageFile(file);

        const reader = new FileReader();
        reader.onload = (event) => {
            setImagePreview(event.target?.result as string);
        };
        reader.readAsDataURL(file);
    }, []);

    const handleImageGenerate = async () => {
        if (!imagePreview || !hasApiKey) return;

        setIsLoading(true);
        setError(null);

        try {
            const service = new GeminiService(apiKey);

            // 根据分析模式选择不同的处理方法
            let result;
            if (imageAnalysisMode === 'poster-video') {
                // 海报→视频化创意分析
                result = await service.analyzePosterForVideo(imagePreview, videoPlatform);
            } else {
                // 普通 OCR 识别
                result = await service.recognizeImage(imagePreview, imageInstruction.trim() || undefined);
            }

            if (result.success && result.structure) {
                createFromStructure(result.structure, 'image', result.rawText, imagePreview);
            } else {
                setError(result.error || '图片识别失败');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '图片识别失败');
        } finally {
            setIsLoading(false);
        }
    };

    const clearImage = () => {
        setImagePreview(null);
        setImageFile(null);
        setImageInstruction('');
        if (imageInputRef.current) {
            imageInputRef.current.value = '';
        }
    };

    // ===================================
    // 文档处理
    // ===================================
    const handleDocumentSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const validTypes = ['.pdf', '.docx', '.txt'];
        const isValid = validTypes.some(ext => file.name.toLowerCase().endsWith(ext));

        if (!isValid) {
            setError('仅支持 PDF、Word、TXT 格式');
            return;
        }

        setDocumentFile(file);
        setIsLoading(true);
        setError(null);

        try {
            const result = await documentService.parseDocument(file);
            if (result.success && result.text) {
                setDocumentText(result.text);
            } else {
                setError(result.error || '文档解析失败');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '文档解析失败');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const handleDocumentGenerate = async () => {
        if (!documentText.trim() || !hasApiKey) return;

        setIsLoading(true);
        setError(null);

        try {
            const service = new GeminiService(apiKey);
            const structure = await service.generateFromText(documentText, contentMode, aiMaxDepth, aiDetailLevel);
            createFromStructure(structure, 'document', documentText);
        } catch (err) {
            setError(err instanceof Error ? err.message : '生成失败');
        } finally {
            setIsLoading(false);
        }
    };

    const clearDocument = () => {
        setDocumentFile(null);
        setDocumentText('');
        if (documentInputRef.current) {
            documentInputRef.current.value = '';
        }
    };

    // ===================================
    // YouTube 处理
    // ===================================
    const handleYouTubeGenerate = async () => {
        if (!youtubeUrl.trim() || !hasApiKey) return;

        // 验证 YouTube URL
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
        if (!youtubeRegex.test(youtubeUrl)) {
            setError('请输入有效的 YouTube 链接');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const service = new GeminiService(apiKey);
            const structure = await service.analyzeYouTubeVideo(youtubeUrl, contentMode);
            createFromStructure(structure, 'youtube', youtubeUrl);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'YouTube 视频分析失败');
        } finally {
            setIsLoading(false);
        }
    };

    // ===================================
    // 网页处理
    // ===================================
    const fetchWebpageContent = async () => {
        if (!webpageUrl.trim()) return;

        setWebpageFetchStatus('fetching');
        setError(null);

        try {
            // 使用 CORS 代理获取网页内容
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(webpageUrl)}`;
            const response = await fetch(proxyUrl);
            const data = await response.json();

            if (data.contents) {
                // 简单提取文本内容
                const parser = new DOMParser();
                const doc = parser.parseFromString(data.contents, 'text/html');

                // 移除 script 和 style 标签
                doc.querySelectorAll('script, style, nav, footer, header').forEach(el => el.remove());

                const textContent = doc.body?.textContent?.replace(/\s+/g, ' ').trim() || '';
                setWebpageContent(textContent.slice(0, 20000)); // 限制长度
                setWebpageFetchStatus('success');
            } else {
                throw new Error('无法获取网页内容');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '获取网页内容失败');
            setWebpageFetchStatus('error');
        }
    };

    const handleWebpageGenerate = async () => {
        if (!webpageContent.trim() || !hasApiKey) return;

        setIsLoading(true);
        setError(null);

        try {
            const service = new GeminiService(apiKey);
            const structure = await service.analyzeWebpage(webpageUrl, webpageContent, contentMode);
            createFromStructure(structure, 'webpage', webpageContent);
        } catch (err) {
            setError(err instanceof Error ? err.message : '网页分析失败');
        } finally {
            setIsLoading(false);
        }
    };

    const clearWebpage = () => {
        setWebpageUrl('');
        setWebpageContent('');
        setWebpageFetchStatus('idle');
    };

    // ===================================
    // 音频处理
    // ===================================
    const handleAudioSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const validTypes = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/m4a', 'audio/ogg', 'audio/webm'];
        if (!validTypes.some(type => file.type.startsWith(type.replace('/', '/')))) {
            // 检查扩展名
            const ext = file.name.toLowerCase().split('.').pop();
            if (!['mp3', 'wav', 'm4a', 'ogg', 'webm'].includes(ext || '')) {
                setError('仅支持 MP3、WAV、M4A、OGG、WebM 格式');
                return;
            }
        }

        setAudioFile(file);

        const reader = new FileReader();
        reader.onload = (event) => {
            setAudioPreview(event.target?.result as string);
        };
        reader.readAsDataURL(file);
    }, []);

    const handleAudioGenerate = async () => {
        if (!audioPreview || !hasApiKey) return;

        setIsLoading(true);
        setError(null);

        try {
            const service = new GeminiService(apiKey);
            const mimeType = audioFile?.type || 'audio/mp3';
            const structure = await service.analyzeAudio(audioPreview, mimeType, contentMode);
            createFromStructure(structure, 'audio', audioFile?.name || '音频文件');
        } catch (err) {
            setError(err instanceof Error ? err.message : '音频分析失败');
        } finally {
            setIsLoading(false);
        }
    };

    const clearAudio = () => {
        setAudioFile(null);
        setAudioPreview(null);
        if (audioInputRef.current) {
            audioInputRef.current.value = '';
        }
    };

    // ===================================
    // 渲染
    // ===================================
    return (
        <div className="input-panel">
            <div className="input-panel-header">
                <h3><Download size={16} /> 输入内容</h3>
            </div>

            <div className="input-panel-content">
                {!hasApiKey && (
                    <div className="ai-warning">
                        <span className="warning-icon">⚠️</span>
                        <p>未检测到主工具箱 API 密钥，请在右上角设置。</p>
                    </div>
                )}
                {/* 内容模式选择 */}
                <div className="content-mode-selector">
                    <label>内容模式：</label>
                    <select
                        value={contentMode}
                        onChange={(e) => setContentMode(e.target.value as ContentMode)}
                    >
                        {CONTENT_MODES.map((mode) => (
                            <option key={mode.mode} value={mode.mode}>
                                {mode.isNew ? '🆕 ' : ''}{mode.label}
                            </option>
                        ))}
                    </select>

                    {/* 短视频创意模式 - 平台选择 */}
                    {currentModeConfig?.requiresPlatform && (
                        <>
                            <label>目标平台：</label>
                            <select
                                value={videoPlatform}
                                onChange={(e) => setVideoPlatform(e.target.value as VideoPlatform)}
                                className="platform-select"
                            >
                                {VIDEO_PLATFORMS.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.emoji} {p.label}
                                    </option>
                                ))}
                            </select>
                        </>
                    )}

                    {/* 通用模式的深度/详细度选项 */}
                    {!currentModeConfig?.requiresPlatform && (
                        <>
                            <label>生成深度：</label>
                            <select
                                value={aiMaxDepth}
                                onChange={(e) => setAiMaxDepth(Number(e.target.value))}
                            >
                                <option value={3}>三级</option>
                                <option value={4}>四级</option>
                                <option value={5}>五级</option>
                            </select>
                            <label>详细度：</label>
                            <select
                                value={aiDetailLevel}
                                onChange={(e) => setAiDetailLevel(e.target.value as typeof aiDetailLevel)}
                            >
                                <option value="brief">简洁</option>
                                <option value="standard">标准</option>
                                <option value="detailed">详细</option>
                                <option value="extreme">极详细</option>
                            </select>
                        </>
                    )}

                    <span className="mode-hint">
                        {currentModeConfig?.description}
                    </span>
                </div>

                {/* 输入类型标签 */}
                <div className="input-tabs">
                    <button
                        className={`input-tab ${activeTab === 'text' ? 'active' : ''}`}
                        onClick={() => setActiveTab('text')}
                    >
                        ✍️ 文本
                    </button>
                    <button
                        className={`input-tab ${activeTab === 'image' ? 'active' : ''}`}
                        onClick={() => setActiveTab('image')}
                    >
                        🖼️ 图片
                    </button>
                    <button
                        className={`input-tab ${activeTab === 'document' ? 'active' : ''}`}
                        onClick={() => setActiveTab('document')}
                    >
                        📄 文档
                    </button>
                    <button
                        className={`input-tab ${activeTab === 'youtube' ? 'active' : ''} tooltip-bottom`}
                        onClick={() => setActiveTab('youtube')}
                        data-tip="YouTube 视频转导图"
                    >
                        🎬 视频
                    </button>
                    <button
                        className={`input-tab ${activeTab === 'webpage' ? 'active' : ''} tooltip-bottom`}
                        onClick={() => setActiveTab('webpage')}
                        data-tip="网页链接转导图"
                    >
                        🌐 网页
                    </button>
                    <button
                        className={`input-tab ${activeTab === 'audio' ? 'active' : ''} tooltip-bottom`}
                        onClick={() => setActiveTab('audio')}
                        data-tip="音频转导图"
                    >
                        🎵 音频
                    </button>
                </div>

                {/* 文本输入 */}
                {activeTab === 'text' && (
                    <div className="input-section">
                        <textarea
                            className="text-input"
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            placeholder="输入任意文字内容...&#10;&#10;可以是：&#10;- 一个话题或主题&#10;- 一段文章或策划案&#10;- 笔记要点&#10;- 想法和灵感"
                            rows={8}
                        />
                        <div className="template-panel">
                            <div className="template-header">
                                <div className="template-title">📚 模板库</div>
                                <div className="template-hint">不消耗 AI 配额</div>
                            </div>
                            <div className="template-row">
                                <select
                                    className="template-select"
                                    value={selectedTemplate?.id || ''}
                                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                                >
                                    {MAP_TEMPLATES.map((template) => (
                                        <option key={template.id} value={template.id}>
                                            {template.label}
                                        </option>
                                    ))}
                                </select>
                                <button className="template-btn" onClick={handleApplyTemplate} disabled={!selectedTemplate}>
                                    应用模板
                                </button>
                            </div>
                            {selectedTemplate?.description && (
                                <div className="template-desc">{selectedTemplate.description}</div>
                            )}
                            <button className="template-btn ghost" onClick={handleAutoTemplate}>
                                智能匹配并填充
                            </button>
                        </div>

                        {/* 🎯 Prompt 模式选择器 */}
                        <div className="prompt-mode-selector">
                            <div className="prompt-mode-header">
                                <span className="prompt-mode-title">
                                    🎯 Prompt 模式
                                </span>
                                {aiPromptMode === 'custom' && (
                                    <button
                                        onClick={() => setShowCustomPromptEditor(!showCustomPromptEditor)}
                                        className={`prompt-mode-edit-btn ${showCustomPromptEditor ? 'active' : ''}`}
                                    >
                                        {showCustomPromptEditor ? '收起' : '编辑 Prompt'}
                                    </button>
                                )}
                            </div>
                            <div className="prompt-mode-grid">
                                {PROMPT_PRESETS.map(preset => (
                                    <button
                                        key={preset.id}
                                        onClick={() => {
                                            setAiPromptMode(preset.id);
                                            if (preset.id === 'custom' && !aiCustomPrompt) {
                                                setAiCustomPrompt(DEFAULT_CUSTOM_PROMPT);
                                            }
                                        }}
                                        className={`prompt-preset-btn ${aiPromptMode === preset.id ? 'active' : ''}`}
                                    >
                                        <div className="prompt-preset-icon">
                                            {preset.icon} {preset.label}
                                        </div>
                                        <div className="prompt-preset-desc">
                                            {preset.description}
                                        </div>
                                    </button>
                                ))}
                            </div>
                            {/* 自定义 Prompt 编辑器 */}
                            {aiPromptMode === 'custom' && showCustomPromptEditor && (
                                <div className="custom-prompt-editor">
                                    <div className="custom-prompt-header">
                                        <span className="custom-prompt-hint">
                                            使用 {'{text}'} 或 {'{input}'} 代表用户输入
                                        </span>
                                        <button
                                            onClick={() => setAiCustomPrompt(DEFAULT_CUSTOM_PROMPT)}
                                            className="custom-prompt-reset-btn"
                                        >
                                            重置为默认
                                        </button>
                                    </div>
                                    <textarea
                                        value={aiCustomPrompt}
                                        onChange={(e) => setAiCustomPrompt(e.target.value)}
                                        placeholder="输入你的自定义 Prompt..."
                                        className="custom-prompt-textarea"
                                    />
                                </div>
                            )}
                        </div>

                        {/* 🚀 流式生成开关 */}
                        <div className={`input-toggle-control ${useStreaming ? 'active-streaming' : ''}`}>
                            <label className="input-toggle-label">
                                <input
                                    type="checkbox"
                                    checked={useStreaming}
                                    onChange={(e) => {
                                        setUseStreaming(e.target.checked);
                                        if (e.target.checked) setUseWebSearch(false);
                                    }}
                                    className="input-toggle-checkbox"
                                />
                                <span>🚀 流式生成</span>
                            </label>
                            <span className="input-toggle-desc">
                                {useStreaming ? '实时看到节点生成' : '一次性生成完整结构'}
                            </span>
                        </div>

                        {/* 🌐 联网搜索开关 */}
                        <div className={`input-toggle-control ${useWebSearch ? 'active-websearch' : ''}`}>
                            <label className="input-toggle-label">
                                <input
                                    type="checkbox"
                                    checked={useWebSearch}
                                    onChange={(e) => {
                                        setUseWebSearch(e.target.checked);
                                        if (e.target.checked) setUseStreaming(false);
                                    }}
                                    className="input-toggle-checkbox websearch"
                                />
                                <span>🌐 联网增强</span>
                            </label>
                            <span className="input-toggle-desc">
                                {useWebSearch ? '搜索最新信息，节点带来源' : '使用 AI 内部知识'}
                            </span>
                        </div>

                        <button
                            className="generate-btn primary"
                            onClick={handleTextGenerate}
                            disabled={isLoading || !textInput.trim()}
                        >
                            {isLoading ? (
                                <>
                                    <span className="spinner"></span>
                                    {streamProgress.isStreaming ? (
                                        <span>
                                            🌳 正在生成... <strong className="stream-node-count">{streamProgress.nodeCount}</strong> 个节点
                                        </span>
                                    ) : (
                                        <span>正在生成...</span>
                                    )}
                                </>
                            ) : (
                                <>
                                    <Sparkles size={16} /> AI 生成思维导图
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* 图片输入 */}
                {activeTab === 'image' && (
                    <div className="input-section">
                        {!imagePreview ? (
                            <div
                                className="image-drop-zone"
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={handleImageDrop}
                                onClick={() => imageInputRef.current?.click()}
                                onPaste={handlePasteImage}
                            >
                                <input
                                    ref={imageInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageSelect}
                                    hidden
                                />
                                <div className="drop-icon">🖼️</div>
                                <p className="drop-text">点击/拖拽/粘贴图片</p>
                                <p className="drop-hint">支持粘贴图片、图片链接或 =IMAGE("url")</p>
                                <p className="drop-hint">也可直接在此页按 Ctrl/⌘+V 粘贴</p>
                            </div>
                        ) : (
                            <div className="image-preview-container">
                                <img src={imagePreview} alt="预览" className="image-preview" />
                                <button className="clear-btn" onClick={clearImage}>
                                    ✕ 清除
                                </button>
                            </div>
                        )}

                        {/* 图片分析模式选择 */}
                        <div className="image-mode-selector">
                            <button
                                className={`mode-btn ${imageAnalysisMode === 'ocr' ? 'active' : ''}`}
                                onClick={() => setImageAnalysisMode('ocr')}
                            >
                                <Search size={14} /> 文字识别
                            </button>
                            <button
                                className={`mode-btn ${imageAnalysisMode === 'poster-video' ? 'active' : ''}`}
                                onClick={() => setImageAnalysisMode('poster-video')}
                            >
                                🎬 海报→视频化
                            </button>
                        </div>

                        {imageAnalysisMode === 'ocr' && (
                            <textarea
                                className="text-input"
                                placeholder="可选：输入指令，让 AI 按指定方向扩展（例如：聚焦风险、只提步骤、补充案例）"
                                value={imageInstruction}
                                onChange={(e) => setImageInstruction(e.target.value)}
                            />
                        )}

                        {imageAnalysisMode === 'poster-video' && (
                            <div className="poster-video-options">
                                <label>目标平台：</label>
                                <select
                                    value={videoPlatform}
                                    onChange={(e) => setVideoPlatform(e.target.value as VideoPlatform)}
                                >
                                    {VIDEO_PLATFORMS.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.emoji} {p.label}
                                        </option>
                                    ))}
                                </select>
                                <p className="hint">上传海报/封面，AI 将生成 3 种视频化创意方向</p>
                            </div>
                        )}

                        <button
                            className="generate-btn primary"
                            onClick={handleImageGenerate}
                            disabled={isLoading || !imagePreview}
                        >
                            {isLoading ? (
                                <>
                                    <span className="spinner"></span>
                                    正在分析...
                                </>
                            ) : (
                                <>
                                    {imageAnalysisMode === 'poster-video' ? <><Video size={14} /> 生成视频创意</> : <><Search size={14} /> AI 识别并生成导图</>}
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* 文档输入 */}
                {activeTab === 'document' && (
                    <div className="input-section">
                        <div className="input-tabs">
                            <button
                                className={`input-tab ${documentMode === 'file' ? 'active' : ''}`}
                                onClick={() => setDocumentMode('file')}
                            >
                                📄 上传文档
                            </button>
                            <button
                                className={`input-tab ${documentMode === 'paste' ? 'active' : ''}`}
                                onClick={() => {
                                    setDocumentMode('paste');
                                    setDocumentFile(null);
                                }}
                            >
                                <Clipboard size={14} /> 粘贴内容
                            </button>
                        </div>

                        {documentMode === 'file' ? (
                            !documentFile ? (
                                <div
                                    className="document-drop-zone"
                                    onClick={() => documentInputRef.current?.click()}
                                >
                                    <input
                                        ref={documentInputRef}
                                        type="file"
                                        accept=".pdf,.docx,.txt"
                                        onChange={handleDocumentSelect}
                                        hidden
                                    />
                                    <div className="drop-icon">📄</div>
                                    <p className="drop-text">点击选择文档</p>
                                    <p className="drop-hint">
                                        支持：PDF、Word (.docx)、TXT
                                    </p>
                                </div>
                            ) : (
                                <div className="document-info">
                                    <div className="document-name">
                                        <span className="file-icon">📄</span>
                                        {documentFile.name}
                                    </div>
                                    {documentText && (
                                        <div className="document-preview">
                                            {documentText.slice(0, 300)}
                                            {documentText.length > 300 && '...'}
                                        </div>
                                    )}
                                    <button className="clear-btn" onClick={clearDocument}>
                                        ✕ 清除
                                    </button>
                                </div>
                            )
                        ) : (
                            <div className="input-section">
                                <textarea
                                    className="text-input"
                                    placeholder="粘贴你的文档内容，AI 将自动分析并生成导图..."
                                    value={documentText}
                                    onChange={(e) => setDocumentText(e.target.value)}
                                />
                                <button className="clear-btn" onClick={clearDocument}>
                                    ✕ 清除
                                </button>
                            </div>
                        )}
                        <button
                            className="generate-btn primary"
                            onClick={handleDocumentGenerate}
                            disabled={isLoading || !documentText.trim()}
                        >
                            {isLoading ? (
                                <>
                                    <span className="spinner"></span>
                                    正在处理...
                                </>
                            ) : (
                                <>
                                    📊 AI 分析并生成导图
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* YouTube 视频输入 */}
                {activeTab === 'youtube' && (
                    <div className="input-section">
                        <div className="url-input-group">
                            <span className="url-icon">🎬</span>
                            <input
                                type="url"
                                className="url-input"
                                value={youtubeUrl}
                                onChange={(e) => setYoutubeUrl(e.target.value)}
                                placeholder="粘贴 YouTube 视频链接..."
                            />
                        </div>
                        <p className="input-hint">
                            支持格式：youtube.com/watch?v=xxx 或 youtu.be/xxx
                        </p>
                        <button
                            className="generate-btn primary"
                            onClick={handleYouTubeGenerate}
                            disabled={isLoading || !youtubeUrl.trim()}
                        >
                            {isLoading ? (
                                <>
                                    <span className="spinner"></span>
                                    正在分析视频...
                                </>
                            ) : (
                                <>
                                    🎬 AI 分析视频并生成导图
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* 网页链接输入 */}
                {activeTab === 'webpage' && (
                    <div className="input-section">
                        <div className="url-input-group">
                            <span className="url-icon">🌐</span>
                            <input
                                type="url"
                                className="url-input"
                                value={webpageUrl}
                                onChange={(e) => setWebpageUrl(e.target.value)}
                                placeholder="粘贴网页链接..."
                            />
                            <button
                                className="fetch-btn"
                                onClick={fetchWebpageContent}
                                disabled={webpageFetchStatus === 'fetching' || !webpageUrl.trim()}
                            >
                                {webpageFetchStatus === 'fetching' ? '获取中...' : '获取'}
                            </button>
                        </div>

                        {webpageFetchStatus === 'success' && webpageContent && (
                            <div className="webpage-preview">
                                <div className="preview-header">
                                    <span>📄 已获取内容</span>
                                    <button className="clear-btn-sm" onClick={clearWebpage}>✕</button>
                                </div>
                                <div className="preview-content">
                                    {webpageContent.slice(0, 500)}
                                    {webpageContent.length > 500 && '...'}
                                </div>
                            </div>
                        )}

                        <button
                            className="generate-btn primary"
                            onClick={handleWebpageGenerate}
                            disabled={isLoading || !webpageContent.trim()}
                        >
                            {isLoading ? (
                                <>
                                    <span className="spinner"></span>
                                    正在分析网页...
                                </>
                            ) : (
                                <>
                                    🌐 AI 分析网页并生成导图
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* 音频输入 */}
                {activeTab === 'audio' && (
                    <div className="input-section">
                        {!audioFile ? (
                            <div
                                className="audio-drop-zone"
                                onClick={() => audioInputRef.current?.click()}
                            >
                                <input
                                    ref={audioInputRef}
                                    type="file"
                                    accept="audio/*"
                                    onChange={handleAudioSelect}
                                    hidden
                                />
                                <div className="drop-icon">🎵</div>
                                <p className="drop-text">点击选择音频文件</p>
                                <p className="drop-hint">
                                    支持：MP3、WAV、M4A、OGG、WebM
                                </p>
                            </div>
                        ) : (
                            <div className="audio-preview-container">
                                <div className="audio-info">
                                    <span className="file-icon">🎵</span>
                                    <span className="file-name">{audioFile.name}</span>
                                    <span className="file-size">
                                        ({(audioFile.size / 1024 / 1024).toFixed(2)} MB)
                                    </span>
                                </div>
                                {audioPreview && (
                                    <audio controls className="audio-player">
                                        <source src={audioPreview} type={audioFile.type} />
                                    </audio>
                                )}
                                <button className="clear-btn" onClick={clearAudio}>
                                    ✕ 清除
                                </button>
                            </div>
                        )}

                        <button
                            className="generate-btn primary"
                            onClick={handleAudioGenerate}
                            disabled={isLoading || !audioPreview}
                        >
                            {isLoading ? (
                                <>
                                    <span className="spinner"></span>
                                    正在分析音频...
                                </>
                            ) : (
                                <>
                                    🎵 AI 分析音频并生成导图
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* 错误提示 */}
                {error && (
                    <div className="input-error">
                        <span>❌</span>
                        <p>{error}</p>
                    </div>
                )}
            </div>
        </div>
    );
};
