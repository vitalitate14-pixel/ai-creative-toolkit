import { desktopEnvironmentKey } from '@/utils/apiKeyStorage';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { useMindMapStore } from '../store/mindMapStore';
import { LAYOUT_GROUPS } from '../types';
import { AIToolsMenu } from './AIToolsMenu';
import { TemplatePicker } from './TemplatePicker';
import { NodeSearch } from './NodeSearch';
import { GeminiService } from '../services/geminiService';
import { getStoredApiKey, hasAiAccess } from '../services/aiAccess';
import {
    Search, Copy, Check, Undo2, Redo2,
    FilePlus, FileText, FolderOpen, Save,
    Plus, Pencil, Trash2, Target, Sparkles, List,
    Download, Upload, Sun, Moon, ChevronDown
} from 'lucide-react';

export const Toolbar: React.FC = () => {
    const {
        currentMap,
        savedMaps,
        selectedNodeId,
        themeMode,
        layoutDirection,
        createNewMap,
        createDemoMap,
        loadMap,
        loadMapData,
        saveCurrentMap,
        deleteMap,
        addNode,
        updateNode,
        deleteNode,
        setThemeMode,
        setLayoutDirection,
        getMapAsJSON,
        getMapAsMarkdown,
        importFromJSON,
        // 撤销/重做
        undo,
        redo,
        canUndo,
        canRedo,
        // 折叠/展开
        collapseAll,
        expandAll,
        collapseToLevel,
        // 大纲 & 聚焦
        showOutline,
        toggleOutline,
        focusNodeId,
        setFocusNode,
    } = useMindMapStore();

    const [showNewMapModal, setShowNewMapModal] = useState(false);
    const [showMapsModal, setShowMapsModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [newMapName, setNewMapName] = useState('');
    const [editLabel, setEditLabel] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [copySuccess, setCopySuccess] = useState(false);
    const [pngScale, setPngScale] = useState(5);
    const [pngMaxSize, setPngMaxSize] = useState(24000);
    const [pngRecommendedScale, setPngRecommendedScale] = useState<number | null>(null);
    const [expandMenuOpen, setExpandMenuOpen] = useState(false);
    const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
    const [expandMenuPos, setExpandMenuPos] = useState({ top: 0, left: 0, maxHeight: 320 });
    const [layoutMenuPos, setLayoutMenuPos] = useState({ top: 0, left: 0, maxHeight: 320 });
    const expandTriggerRef = useRef<HTMLButtonElement>(null);
    const layoutTriggerRef = useRef<HTMLButtonElement>(null);
    const expandMenuRef = useRef<HTMLDivElement>(null);
    const layoutMenuRef = useRef<HTMLDivElement>(null);

    const selectedNode = currentMap?.nodes[selectedNodeId || ''];
    const layoutOptions = LAYOUT_GROUPS.flatMap((group) =>
        group.layouts.map((layout) => ({ ...layout, group: group.label }))
    );
    const currentLayout = layoutOptions.find((layout) => layout.type === layoutDirection);

    // 键盘快捷键：Ctrl+F 打开搜索，Ctrl+Z 撤销，Ctrl+Y/Ctrl+Shift+Z 重做
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 搜索
            if ((e.ctrlKey || e.metaKey) && e.key === 'f' && currentMap) {
                e.preventDefault();
                setShowSearch(true);
                return;
            }
            // 撤销
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
                return;
            }
            // 重做 (Ctrl+Y 或 Ctrl+Shift+Z)
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                redo();
                return;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentMap, undo, redo]);

    useEffect(() => {
        if (!expandMenuOpen && !layoutMenuOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as globalThis.Node;
            if (
                expandMenuOpen &&
                expandMenuRef.current &&
                !expandMenuRef.current.contains(target) &&
                expandTriggerRef.current &&
                !expandTriggerRef.current.contains(target)
            ) {
                setExpandMenuOpen(false);
            }
            if (
                layoutMenuOpen &&
                layoutMenuRef.current &&
                !layoutMenuRef.current.contains(target) &&
                layoutTriggerRef.current &&
                !layoutTriggerRef.current.contains(target)
            ) {
                setLayoutMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [expandMenuOpen, layoutMenuOpen]);

    const getDropdownPos = (trigger: HTMLButtonElement | null) => {
        if (!trigger) return { top: 0, left: 0, maxHeight: 320 };
        const rect = trigger.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom - 20;
        return {
            top: rect.bottom + 8,
            left: rect.left,
            maxHeight: Math.max(200, spaceBelow),
        };
    };

    const toggleExpandMenu = () => {
        if (!expandMenuOpen) {
            setExpandMenuPos(getDropdownPos(expandTriggerRef.current));
        }
        setExpandMenuOpen(!expandMenuOpen);
        setLayoutMenuOpen(false);
    };

    const toggleLayoutMenu = () => {
        if (!layoutMenuOpen) {
            setLayoutMenuPos(getDropdownPos(layoutTriggerRef.current));
        }
        setLayoutMenuOpen(!layoutMenuOpen);
        setExpandMenuOpen(false);
    };

    const expandMenuItems = [
        {
            id: 'expand',
            label: '全部展开',
            desc: '展开所有节点',
            icon: '⬇️',
            action: () => expandAll(),
        },
        {
            id: 'collapse',
            label: '全部收起',
            desc: '仅保留主分支',
            icon: '⬆️',
            action: () => collapseAll(),
        },
        {
            id: 'level-1',
            label: '只显示 1 层',
            desc: '仅显示根节点与一级主题',
            icon: '1️⃣',
            action: () => collapseToLevel(1),
        },
        {
            id: 'level-2',
            label: '展开到 2 层',
            desc: '显示到二级主题',
            icon: '2️⃣',
            action: () => collapseToLevel(2),
        },
        {
            id: 'level-3',
            label: '展开到 3 层',
            desc: '显示到三级主题',
            icon: '3️⃣',
            action: () => collapseToLevel(3),
        },
    ];

    const handleCreateMap = () => {
        if (newMapName.trim()) {
            createNewMap(newMapName.trim());
            setNewMapName('');
            setShowNewMapModal(false);
        }
    };

    const handleAddChild = () => {
        if (selectedNodeId) {
            const newId = addNode(selectedNodeId, '新主题');
            useMindMapStore.getState().selectNode(newId);
        }
    };

    const handleEditNode = () => {
        if (selectedNode) {
            setEditLabel(selectedNode.label);
            setEditNotes(selectedNode.notes || '');
            setShowEditModal(true);
        }
    };

    const handleSaveEdit = () => {
        if (selectedNodeId && editLabel.trim()) {
            updateNode(selectedNodeId, {
                label: editLabel.trim(),
                notes: editNotes.trim() || undefined,
            });
            setShowEditModal(false);
        }
    };

    const handleDeleteNode = () => {
        if (selectedNodeId && currentMap && selectedNodeId !== currentMap.rootId) {
            if (confirm('确定要删除这个节点及其所有子节点吗？')) {
                deleteNode(selectedNodeId);
            }
        }
    };

    const handleFitView = useCallback(() => {
        window.dispatchEvent(new CustomEvent('mindmap-fit-view'));
    }, []);

    useEffect(() => {
        if (!showExportModal) return;
        const timer = window.setTimeout(() => {
            const canvas = document.querySelector('.react-flow') as HTMLElement | null;
            if (!canvas) {
                setPngRecommendedScale(null);
                return;
            }
            const viewport = canvas.querySelector('.react-flow__viewport') as HTMLElement | null;
            const nodeContainer = canvas.querySelector('.react-flow__nodes') as HTMLElement | null;
            if (!viewport || !nodeContainer) {
                setPngRecommendedScale(null);
                return;
            }
            const nodes = nodeContainer.querySelectorAll('.react-flow__node');
            if (nodes.length === 0) {
                setPngRecommendedScale(null);
                return;
            }

            const transform = viewport.style.transform || '';
            const scaleMatch = transform.match(/scale\(([\d.]+)\)/);
            const translateMatch = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
            const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
            const translateX = translateMatch ? parseFloat(translateMatch[1]) : 0;
            const translateY = translateMatch ? parseFloat(translateMatch[2]) : 0;

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const canvasRect = canvas.getBoundingClientRect();

            nodes.forEach(node => {
                const rect = (node as HTMLElement).getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    const nodeX = (rect.left - canvasRect.left - translateX * scale) / scale;
                    const nodeY = (rect.top - canvasRect.top - translateY * scale) / scale;
                    const nodeWidth = rect.width / scale;
                    const nodeHeight = rect.height / scale;
                    minX = Math.min(minX, nodeX);
                    minY = Math.min(minY, nodeY);
                    maxX = Math.max(maxX, nodeX + nodeWidth);
                    maxY = Math.max(maxY, nodeY + nodeHeight);
                }
            });

            const padding = 60;
            const contentWidth = maxX - minX + padding * 2;
            const contentHeight = maxY - minY + padding * 2;
            const maxEdge = Math.max(contentWidth, contentHeight);
            const maxSize = Number.isFinite(pngMaxSize) && pngMaxSize > 0 ? Math.max(2048, pngMaxSize) : 0;

            if (maxEdge > 0 && maxSize > 0) {
                const maxScale = maxSize / maxEdge;
                const recommended = Math.max(1, Math.min(6, maxScale));
                setPngRecommendedScale(recommended);
            } else {
                setPngRecommendedScale(null);
            }
        }, 60);

        return () => window.clearTimeout(timer);
    }, [showExportModal, pngMaxSize]);

    // ========================================
    // 导出核心辅助函数：基于布局数据生成 SVG
    // ========================================
    const getFlowData = () => {
        const getter = (window as any).__mindMapGetFlowData;
        if (typeof getter !== 'function') return null;
        return getter() as { nodes: Node[]; edges: Edge[] };
    };

    const escapeXml = (text: string) =>
        text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

    const wrapText = (text: string, maxChars: number) => {
        if (!text) return [''];
        const lines: string[] = [];
        let current = '';
        const chars = Array.from(text);
        chars.forEach((ch) => {
            if (current.length >= maxChars) {
                lines.push(current);
                current = ch;
            } else {
                current += ch;
            }
        });
        if (current) lines.push(current);
        return lines;
    };

    const buildExportSvg = (flowNodes: Node[], flowEdges: Edge[]) => {
        if (flowNodes.length === 0) {
            throw new Error('没有节点可导出');
        }

        const padding = 120;
        const fontFamily = "Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif";
        const backgroundColor = themeMode === 'dark' ? '#0f0f23' : '#f8fafc';

        const getSize = (node: Node) => {
            const style = node.style as React.CSSProperties | undefined;
            const widthValue = node.width ?? style?.width;
            const heightValue = node.height ?? style?.height;
            const width = typeof widthValue === 'number'
                ? widthValue
                : typeof widthValue === 'string'
                    ? parseFloat(widthValue)
                    : 180;
            const height = typeof heightValue === 'number'
                ? heightValue
                : typeof heightValue === 'string'
                    ? parseFloat(heightValue)
                    : 50;
            return { width, height };
        };

        const computeTextMetrics = (node: Node, width: number) => {
            const data = node.data as any;
            const style = (data?.style || {}) as any;
            const rawLabel = String(data?.label || '');
            const rawNotes = data?.notes ? String(data.notes) : '';
            const fontSize = style.fontSize || (data?.isRoot ? 18 : 14);
            const fontWeight = style.fontWeight || (data?.isRoot ? 600 : 500);
            const noteFontSize = Math.max(10, Math.round(fontSize * 0.75));
            const lineHeight = fontSize * 1.4; // 增加行高
            const noteLineHeight = noteFontSize * 1.35;
            // 中文字符宽度约等于字号，英文约 0.6 倍，取折中值
            const charWidth = fontSize * 0.85;
            const noteCharWidth = noteFontSize * 0.85;
            const maxChars = Math.max(4, Math.floor((width - 32) / charWidth));
            const labelLines = wrapText(rawLabel, maxChars);
            const noteMaxChars = Math.max(6, Math.floor((width - 32) / noteCharWidth));
            const noteLines = rawNotes ? wrapText(rawNotes, noteMaxChars) : [];
            const textHeight =
                labelLines.length * lineHeight +
                (noteLines.length ? noteLines.length * noteLineHeight + 10 : 0);
            return { labelLines, noteLines, fontSize, fontWeight, noteFontSize, lineHeight, noteLineHeight, textHeight };
        };

        const exportNodes = flowNodes.map((node) => {
            const base = getSize(node);
            const metrics = computeTextMetrics(node, base.width);
            const minHeight = metrics.textHeight + 36; // 增加垂直内边距
            const height = Math.max(base.height, minHeight);
            const width = base.width;
            const x = node.position.x + (base.width - width) / 2;
            const y = node.position.y + (base.height - height) / 2;
            return {
                ...node,
                position: { x, y },
                __export: { width, height, metrics },
            } as Node & { __export: { width: number; height: number; metrics: ReturnType<typeof computeTextMetrics> } };
        });

        const bounds = exportNodes.reduce((acc, node) => {
            const { width, height } = (node as any).__export;
            const x = node.position.x;
            const y = node.position.y;
            return {
                minX: Math.min(acc.minX, x),
                minY: Math.min(acc.minY, y),
                maxX: Math.max(acc.maxX, x + width),
                maxY: Math.max(acc.maxY, y + height),
            };
        }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

        const width = bounds.maxX - bounds.minX + padding * 2;
        const height = bounds.maxY - bounds.minY + padding * 2;
        const viewBoxX = bounds.minX - padding;
        const viewBoxY = bounds.minY - padding;

        const getHandlePoint = (node: Node, handleId?: string) => {
            const { width, height } = (node as any).__export;
            const x = node.position.x;
            const y = node.position.y;
            const handle = handleId || '';
            if (handle.includes('left')) return { x: x, y: y + height / 2 };
            if (handle.includes('right')) return { x: x + width, y: y + height / 2 };
            if (handle.includes('top')) return { x: x + width / 2, y: y };
            if (handle.includes('bottom')) return { x: x + width / 2, y: y + height };
            return { x: x + width / 2, y: y + height / 2 };
        };

        const nodeMap = new Map(exportNodes.map((node) => [node.id, node]));

        const edgePaths = flowEdges.map((edge) => {
            const source = nodeMap.get(edge.source);
            const target = nodeMap.get(edge.target);
            if (!source || !target) return '';

            const sourcePoint = getHandlePoint(source, edge.sourceHandle);
            const targetPoint = getHandlePoint(target, edge.targetHandle);
            const dx = targetPoint.x - sourcePoint.x;
            const dy = targetPoint.y - sourcePoint.y;
            const stroke = (edge.style as React.CSSProperties | undefined)?.stroke
                || currentMap?.style?.lineColor
                || (target.data as any)?.color
                || '#8b8da9';
            const strokeWidth = (edge.style as React.CSSProperties | undefined)?.strokeWidth
                || currentMap?.style?.lineWidth
                || 2;

            let path = '';
            if (edge.type === 'straight') {
                path = `M ${sourcePoint.x} ${sourcePoint.y} L ${targetPoint.x} ${targetPoint.y}`;
            } else if (edge.type === 'step') {
                if (Math.abs(dx) > Math.abs(dy)) {
                    const midX = sourcePoint.x + dx / 2;
                    path = `M ${sourcePoint.x} ${sourcePoint.y} L ${midX} ${sourcePoint.y} L ${midX} ${targetPoint.y} L ${targetPoint.x} ${targetPoint.y}`;
                } else {
                    const midY = sourcePoint.y + dy / 2;
                    path = `M ${sourcePoint.x} ${sourcePoint.y} L ${sourcePoint.x} ${midY} L ${targetPoint.x} ${midY} L ${targetPoint.x} ${targetPoint.y}`;
                }
            } else {
                const c1x = sourcePoint.x + dx * 0.5;
                const c1y = sourcePoint.y;
                const c2x = targetPoint.x - dx * 0.5;
                const c2y = targetPoint.y;
                path = `M ${sourcePoint.x} ${sourcePoint.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${targetPoint.x} ${targetPoint.y}`;
            }

            return `<path d="${escapeXml(String(path))}" fill="none" stroke="${escapeXml(String(stroke))}" stroke-width="${escapeXml(String(strokeWidth))}" stroke-linecap="round" />`;
        }).join('');

        const nodeShapes = exportNodes.map((node) => {
            const { width, height, metrics } = (node as any).__export;
            const x = node.position.x;
            const y = node.position.y;
            const data = node.data as any;
            const style = (data?.style || {}) as any;
            const shape = style.shape || 'rectangle';
            const fill = style.fill || data?.color || '#6366f1';
            const stroke = style.borderColor || 'rgba(255,255,255,0.35)';
            const strokeWidth = style.borderWidth ?? 2;
            const dashArray = style.borderStyle === 'dashed'
                ? '6 4'
                : style.borderStyle === 'dotted'
                    ? '2 4'
                    : undefined;

            const textColor = style.color || (style.fill ? '#111827' : '#ffffff');
            const startY = y + height / 2 - metrics.textHeight / 2 + metrics.lineHeight / 2;
            const centerX = x + width / 2;

            const labelText = `
                <text x="${escapeXml(String(centerX))}" y="${escapeXml(String(startY))}" text-anchor="middle" fill="${escapeXml(String(textColor))}" font-size="${escapeXml(String(metrics.fontSize))}" font-weight="${escapeXml(String(metrics.fontWeight))}" font-family="${fontFamily}">
                    ${metrics.labelLines.map((line, idx) => `<tspan x="${escapeXml(String(centerX))}" dy="${idx === 0 ? 0 : metrics.lineHeight}">${escapeXml(line)}</tspan>`).join('')}
                </text>
            `;

            const notesText = metrics.noteLines.length ? `
                <text x="${escapeXml(String(centerX))}" y="${startY + metrics.labelLines.length * metrics.lineHeight + 6}" text-anchor="middle" fill="${escapeXml(String(textColor))}" opacity="0.8" font-size="${escapeXml(String(metrics.noteFontSize))}" font-family="${fontFamily}">
                    ${metrics.noteLines.map((line, idx) => `<tspan x="${escapeXml(String(centerX))}" dy="${idx === 0 ? 0 : metrics.noteLineHeight}">${escapeXml(line)}</tspan>`).join('')}
                </text>
            ` : '';

            let shapeSvg = '';
            if (shape === 'ellipse') {
                shapeSvg = `<ellipse cx="${escapeXml(String(centerX))}" cy="${y + height / 2}" rx="${width / 2}" ry="${height / 2}" fill="${escapeXml(String(fill))}" stroke="${escapeXml(String(stroke))}" stroke-width="${escapeXml(String(strokeWidth))}" ${dashArray ? `stroke-dasharray="${dashArray}"` : ''} />`;
            } else if (shape === 'diamond') {
                const points = [
                    `${escapeXml(String(centerX))} ${escapeXml(String(y))}`,
                    `${x + width} ${y + height / 2}`,
                    `${escapeXml(String(centerX))} ${y + height}`,
                    `${escapeXml(String(x))} ${y + height / 2}`,
                ].join(' ');
                shapeSvg = `<polygon points="${escapeXml(String(points))}" fill="${escapeXml(String(fill))}" stroke="${escapeXml(String(stroke))}" stroke-width="${escapeXml(String(strokeWidth))}" ${dashArray ? `stroke-dasharray="${dashArray}"` : ''} />`;
            } else if (shape === 'underline') {
                shapeSvg = `<rect x="${escapeXml(String(x))}" y="${escapeXml(String(y))}" width="${escapeXml(String(width))}" height="${escapeXml(String(height))}" fill="none" stroke="none" />` +
                    `<line x1="${escapeXml(String(x))}" y1="${y + height}" x2="${x + width}" y2="${y + height}" stroke="${escapeXml(String(stroke))}" stroke-width="${Math.max(2, strokeWidth)}" />`;
            } else {
                const radius = shape === 'rounded' ? 14 : 8;
                shapeSvg = `<rect x="${escapeXml(String(x))}" y="${escapeXml(String(y))}" width="${escapeXml(String(width))}" height="${escapeXml(String(height))}" rx="${radius}" ry="${radius}" fill="${escapeXml(String(fill))}" stroke="${escapeXml(String(stroke))}" stroke-width="${escapeXml(String(strokeWidth))}" ${dashArray ? `stroke-dasharray="${dashArray}"` : ''} />`;
            }

            return `${shapeSvg}${labelText}${notesText}`;
        }).join('');

        const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${escapeXml(String(width))}" height="${escapeXml(String(height))}" viewBox="${viewBoxX} ${viewBoxY} ${escapeXml(String(width))} ${escapeXml(String(height))}" shape-rendering="geometricPrecision" text-rendering="geometricPrecision">
  <rect width="100%" height="100%" fill="${backgroundColor}" />
  ${edgePaths}
  ${nodeShapes}
</svg>`;

        return { svg, width, height };
    };

    const handleExportPNG = async () => {
        try {
            expandAll();
            await new Promise(resolve => setTimeout(resolve, 300));

            const flowData = getFlowData();
            if (!flowData) {
                alert('未获取到导图布局数据，请刷新后重试');
                return;
            }

            const { svg, width, height } = buildExportSvg(flowData.nodes, flowData.edges);
            const requestedScale = Number.isFinite(pngScale) ? Math.max(2, pngScale) : 2;
            const maxSize = Number.isFinite(pngMaxSize) && pngMaxSize > 0 ? pngMaxSize : 16384;
            const maxEdge = Math.max(width, height);
            const exportScale = maxSize > 0 && maxEdge > 0
                ? Math.min(1, maxSize / (maxEdge * requestedScale))
                : 1;
            const scaledWidth = width * exportScale;
            const scaledHeight = height * exportScale;
            const pixelRatio = requestedScale;

            const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);

            const img = new Image();
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error('SVG 加载失败'));
                img.src = url;
            });

            const pngCanvas = document.createElement('canvas');
            pngCanvas.width = Math.max(1, Math.round(scaledWidth * pixelRatio));
            pngCanvas.height = Math.max(1, Math.round(scaledHeight * pixelRatio));

            const ctx = pngCanvas.getContext('2d');
            if (!ctx) throw new Error('无法创建 Canvas 上下文');

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.fillStyle = themeMode === 'dark' ? '#0f0f23' : '#f8fafc';
            ctx.fillRect(0, 0, pngCanvas.width, pngCanvas.height);
            ctx.scale(pixelRatio, pixelRatio);
            ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);

            URL.revokeObjectURL(url);

            const pngDataUrl = pngCanvas.toDataURL('image/png', 1.0);
            const link = document.createElement('a');
            link.download = `${currentMap?.name || 'mindmap'}.png`;
            link.href = pngDataUrl;
            link.click();
        } catch (err) {
            console.error('Export failed:', err);
            alert('导出图片失败: ' + (err as Error).message);
        }
        setShowExportModal(false);
    };

    const handleExportJSON = () => {
        const json = getMapAsJSON();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `${currentMap?.name || 'mindmap'}.json`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        setShowExportModal(false);
    };

    const handleExportMarkdown = () => {
        const md = getMapAsMarkdown();
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `${currentMap?.name || 'mindmap'}.md`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        setShowExportModal(false);
    };

    const handleExportSVG = async () => {
        try {
            expandAll();
            await new Promise(resolve => setTimeout(resolve, 300));

            const flowData = getFlowData();
            if (!flowData) {
                alert('未获取到导图布局数据，请刷新后重试');
                return;
            }

            const { svg } = buildExportSvg(flowData.nodes, flowData.edges);
            const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = `${currentMap?.name || 'mindmap'}.svg`;
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('SVG Export failed:', err);
            alert('导出 SVG 失败: ' + (err as Error).message);
        }
        setShowExportModal(false);
    };

    const handleExportPDF = async () => {
        try {
            const { jsPDF } = await import('jspdf');

            // 1. 展开所有折叠节点
            expandAll();
            await new Promise(resolve => setTimeout(resolve, 300));

            const flowData = getFlowData();
            if (!flowData) {
                alert('未获取到导图布局数据，请刷新后重试');
                return;
            }

            const { svg, width, height } = buildExportSvg(flowData.nodes, flowData.edges);
            const requestedScale = Number.isFinite(pngScale) ? Math.max(2, pngScale) : 2;
            const maxSize = Number.isFinite(pngMaxSize) && pngMaxSize > 0 ? pngMaxSize : 16384;
            const maxEdge = Math.max(width, height);
            const exportScale = maxSize > 0 && maxEdge > 0
                ? Math.min(1, maxSize / (maxEdge * requestedScale))
                : 1;
            const scaledWidth = width * exportScale;
            const scaledHeight = height * exportScale;
            const pixelRatio = requestedScale;

            const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);
            const img = new Image();

            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error('SVG 加载失败'));
                img.src = url;
            });

            const pngCanvas = document.createElement('canvas');
            pngCanvas.width = Math.max(1, Math.round(scaledWidth * pixelRatio));
            pngCanvas.height = Math.max(1, Math.round(scaledHeight * pixelRatio));

            const ctx = pngCanvas.getContext('2d');
            if (!ctx) throw new Error('无法创建 Canvas 上下文');

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.fillStyle = themeMode === 'dark' ? '#0f0f23' : '#f8fafc';
            ctx.fillRect(0, 0, pngCanvas.width, pngCanvas.height);
            ctx.scale(pixelRatio, pixelRatio);
            ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);

            URL.revokeObjectURL(url);

            const pngDataUrl = pngCanvas.toDataURL('image/png', 1.0);

            const orientation = scaledWidth > scaledHeight ? 'landscape' : 'portrait';
            const pdf = new jsPDF({
                orientation,
                unit: 'px',
                format: [scaledWidth, scaledHeight],
            });

            pdf.addImage(pngDataUrl, 'PNG', 0, 0, scaledWidth, scaledHeight);
            pdf.save(`${currentMap?.name || 'mindmap'}.pdf`);
        } catch (err) {
            console.error('PDF Export failed:', err);
            alert('导出 PDF 失败: ' + (err as Error).message);
        }
        setShowExportModal(false);
    };

    const handleCopyMarkdown = useCallback(async () => {
        const md = getMapAsMarkdown();
        if (!md) return;

        try {
            await navigator.clipboard.writeText(md);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        } catch (err) {
            console.error('复制失败:', err);
            alert('复制失败，请重试');
        }
    }, [getMapAsMarkdown]);

    const handleNavigateToNode = useCallback((nodeId: string) => {
        // 这个函数会通过 MindMapCanvas 的 fitView 来定位节点
        // 在 MindMapCanvas 中监听选中节点变化并自动聚焦
        useMindMapStore.getState().selectNode(nodeId);
        // 触发自定义事件，让 MindMapCanvas 处理聚焦
        window.dispatchEvent(new CustomEvent('navigateToNode', { detail: { nodeId } }));
    }, []);

    const handleImport = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                const text = await file.text();
                const success = importFromJSON(text);
                if (!success) {
                    alert('无效的思维导图文件');
                }
            }
        };
        input.click();
    }, [importFromJSON]);

    useEffect(() => {
        const handleOpenMaps = () => setShowMapsModal(true);
        const handleTriggerImport = () => handleImport();
        window.addEventListener('mindmap-open-maps', handleOpenMaps);
        window.addEventListener('mindmap-import', handleTriggerImport);
        return () => {
            window.removeEventListener('mindmap-open-maps', handleOpenMaps);
            window.removeEventListener('mindmap-import', handleTriggerImport);
        };
    }, [handleImport]);

    const [isAiProcessing, setIsAiProcessing] = useState(false);

    const handleAiToolAction = async (action: 'cultivate' | 'wbs' | 'optimize' | 'regroup' | 'explain' | 'desensitize' | 'video_script') => {
        if (!selectedNodeId || !currentMap) {
            alert('请先选择一个节点');
            return;
        }

        const node = currentMap.nodes[selectedNodeId];
        if (!node) return;

        const envApiKey = (typeof import.meta !== 'undefined' && desktopEnvironmentKey(import.meta.env?.VITE_GEMINI_API_KEY)) as string | undefined;
        const storedApiKey = getStoredApiKey();
        const key = useMindMapStore.getState().geminiApiKey || envApiKey || storedApiKey;
        if (!hasAiAccess(key)) {
            alert('未检测到主工具箱 API 密钥，请在右上角设置。');
            return;
        }

        setIsAiProcessing(true);
        try {
            const service = new GeminiService(key);
            const { addStructureToNode, updateNode: storeUpdateNode, addNode: storeAddNode } = useMindMapStore.getState();

            if (action === 'cultivate') {
                const suggestions = await service.cultivateIdeas(node.label);
                if (suggestions.length) addStructureToNode(selectedNodeId, suggestions);
            }
            if (action === 'wbs') {
                const steps = await service.jobBreakdown(node.label);
                if (steps.length) addStructureToNode(selectedNodeId, steps);
            }
            if (action === 'optimize') {
                const optimized = await service.optimizeLabel(node.label);
                if (optimized) storeUpdateNode(selectedNodeId, { label: optimized });
            }
            if (action === 'regroup') {
                const regrouped = await service.regroup(node.label);
                if (regrouped.length) {
                    const wrapperId = storeAddNode(selectedNodeId, '改组建议');
                    addStructureToNode(wrapperId, regrouped);
                }
            }
            if (action === 'explain') {
                const explanation = await service.explainTerm(node.label);
                if (explanation) storeUpdateNode(selectedNodeId, { notes: explanation });
            }
            if (action === 'desensitize') {
                const masked = await service.desensitizeText(node.label);
                if (masked) storeUpdateNode(selectedNodeId, { label: masked });
            }
            if (action === 'video_script') {
                const content = await service.generateVideoScriptResult(node.label);
                if (content) {
                    storeAddNode(selectedNodeId, '成片描述', undefined, content);
                    alert('视频脚本已生成，请查看新增的「成片描述」节点');
                }
            }
        } catch (err) {
            console.error('AI 工具执行失败:', err);
            alert('AI 工具执行失败，请重试');
        } finally {
            setIsAiProcessing(false);
        }
    };

    return (
        <>
            <div className="toolbar">
                {/* ===== 文件操作 ===== */}
                <div className="toolbar-section">
                    <button className="toolbar-btn tooltip-bottom" onClick={() => setShowNewMapModal(true)} data-tip="新建思维导图">
                        <FilePlus size={16} />
                        <span className="label">新建</span>
                    </button>
                    <button className="toolbar-btn tooltip-bottom" onClick={() => setShowTemplatePicker(true)} data-tip="从模板创建">
                        <FileText size={16} />
                        <span className="label">模板</span>
                    </button>
                    <button className="toolbar-btn tooltip-bottom" onClick={() => setShowMapsModal(true)} data-tip="打开思维导图">
                        <FolderOpen size={16} />
                        <span className="label">打开</span>
                    </button>
                    <button data-tip="保存" className="toolbar-btn tooltip-bottom" disabled={!currentMap} >
                        <Save size={16} />
                        <span className="label">保存</span>
                    </button>
                </div>

                <div className="toolbar-divider" />

                {/* ===== 编辑操作 (WiseMapping 风格) ===== */}
                <div className="toolbar-section">
                    <button data-tip="撤销 (⌘Z / Ctrl+Z)" className="toolbar-btn tooltip-bottom" disabled={!canUndo} >
                        <Undo2 size={16} />
                        <span className="label">撤销</span>
                    </button>
                    <button data-tip="重做 (⌘Y / Ctrl+Y)" className="toolbar-btn tooltip-bottom" disabled={!canRedo} >
                        <Redo2 size={16} />
                        <span className="label">重做</span>
                    </button>
                </div>

                <div className="toolbar-divider" />

                {/* ===== 节点操作 (WiseMapping 风格) ===== */}
                <div className="toolbar-section">
                    <button data-tip="添加子节点 (Tab)" className="toolbar-btn primary tooltip-bottom" disabled={!selectedNodeId} >
                        <Plus size={16} />
                        <span className="label">子节点</span>
                    </button>
                    <button
                        className="toolbar-btn tooltip-bottom"
                        onClick={() => {
                            if (selectedNode?.parentId) {
                                const newId = addNode(selectedNode.parentId, '新主题');
                                useMindMapStore.getState().selectNode(newId);
                            }
                        }}
                        disabled={!selectedNode || !selectedNode.parentId}
                        data-tip="添加兄弟节点 (Enter)"
                    >
                        <Plus size={16} />
                        <span className="label">兄弟</span>
                    </button>
                    <button data-tip="编辑节点 (F2)" className="toolbar-btn tooltip-bottom" disabled={!selectedNode} >
                        <Pencil size={16} />
                        <span className="label">编辑</span>
                    </button>
                    <button className="toolbar-btn danger tooltip-bottom" onClick={handleDeleteNode} disabled={!selectedNode || selectedNodeId === currentMap?.rootId} data-tip="删除节点 (Delete)">
                        <Trash2 size={16} />
                        <span className="label">删除</span>
                    </button>
                </div>

                <div className="toolbar-divider" />

                {/* ===== 视图操作 ===== */}
                <div className="toolbar-section">
                    <button className="toolbar-btn tooltip-bottom" onClick={() => setShowSearch(true)} disabled={!currentMap} data-tip="搜索节点 (⌘F / Ctrl+F)">
                        <Search size={16} />
                        <span className="label">搜索</span>
                    </button>
                    <button data-tip="回到中心 (⌘0 / Ctrl+0)" className="toolbar-btn tooltip-bottom" disabled={!currentMap} >
                        <Target size={16} />
                        <span className="label">居中</span>
                    </button>
                    <button
                        className="toolbar-btn tooltip-bottom"
                        onClick={() => {
                            window.dispatchEvent(new CustomEvent('mindmap-auto-layout'));
                            setTimeout(() => window.dispatchEvent(new CustomEvent('mindmap-fit-view')), 100);
                        }}
                        disabled={!currentMap}
                        data-tip="整理布局"
                    >
                        <Sparkles size={16} />
                        <span className="label">整理</span>
                    </button>
                    <button className={`toolbar-btn ${showOutline ? 'active' : ''} tooltip-bottom`} onClick={toggleOutline} data-tip="大纲视图" >
                        <List size={16} />
                        <span className="label">大纲</span>
                    </button>
                </div>

                <div className="toolbar-divider" />

                {/* ===== 下拉菜单组（挨在一起） ===== */}
                <div className="toolbar-section">
                    <div className="toolbar-dropdown-wrapper">
                        <button
                            ref={expandTriggerRef}
                            className={`ai-tools-trigger-v2 ${expandMenuOpen ? 'open' : ''} tooltip-bottom`}
                            onClick={toggleExpandMenu}
                            data-tip="展开/收起"
                        >
                            <List size={14} className="trigger-icon" />
                            <span>展开/收起</span>
                            <ChevronDown size={14} className={`chevron ${expandMenuOpen ? 'rotate' : ''}`} />
                        </button>
                        {expandMenuOpen && (
                            <div
                                ref={expandMenuRef}
                                className="ai-tools-dropdown-v2 toolbar-dropdown-v2"
                                style={{
                                    position: 'fixed',
                                    top: expandMenuPos.top,
                                    left: expandMenuPos.left,
                                    maxHeight: expandMenuPos.maxHeight,
                                    overflowY: 'auto',
                                }}
                            >
                                <div className="dropdown-header">
                                    <span className="header-title">展开/收起</span>
                                </div>
                                <div className="dropdown-items">
                                    {expandMenuItems.map((item) => (
                                        <button
                                            key={item.id}
                                            className="dropdown-item"
                                            onClick={() => {
                                                item.action();
                                                setExpandMenuOpen(false);
                                            }}
                                        >
                                            <div className="item-icon-wrap text-blue-600 bg-blue-50">
                                                <span className="item-emoji">{item.icon}</span>
                                            </div>
                                            <div className="item-content">
                                                <div className="item-title">{item.label}</div>
                                                <div className="item-desc">{item.desc}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="toolbar-dropdown-wrapper">
                        <button
                            ref={layoutTriggerRef}
                            className={`ai-tools-trigger-v2 ${layoutMenuOpen ? 'open' : ''} tooltip-bottom`}
                            onClick={toggleLayoutMenu}
                            data-tip="布局方向"
                        >
                            <span className="trigger-icon layout-emoji">{currentLayout?.icon || '🧭'}</span>
                            <span>{currentLayout?.label || '布局方向'}</span>
                            <ChevronDown size={14} className={`chevron ${layoutMenuOpen ? 'rotate' : ''}`} />
                        </button>
                        {layoutMenuOpen && (
                            <div
                                ref={layoutMenuRef}
                                className="ai-tools-dropdown-v2 toolbar-dropdown-v2"
                                style={{
                                    position: 'fixed',
                                    top: layoutMenuPos.top,
                                    left: layoutMenuPos.left,
                                    maxHeight: layoutMenuPos.maxHeight,
                                    overflowY: 'auto',
                                }}
                            >
                                <div className="dropdown-header">
                                    <span className="header-title">布局模式</span>
                                </div>
                                <div className="dropdown-items">
                                    {LAYOUT_GROUPS.map((group) => (
                                        <div key={group.label} className="toolbar-dropdown-group">
                                            <div className="toolbar-dropdown-group-title">{group.label}</div>
                                            {group.layouts.map((layout) => (
                                                <button
                                                    key={layout.type}
                                                    className={`dropdown-item ${layoutDirection === layout.type ? 'active' : ''}`}
                                                    onClick={() => {
                                                        setLayoutDirection(layout.type);
                                                        // 不关闭菜单，方便用户切换比较不同布局
                                                    }}
                                                >
                                                    <div className="item-icon-wrap text-purple-600 bg-purple-50">
                                                        <span className="layout-emoji">{layout.icon}</span>
                                                    </div>
                                                    <div className="item-content">
                                                        <div className="item-title">
                                                            {layout.label}
                                                            {layoutDirection === layout.type && (
                                                                <span className="selected-badge">当前</span>
                                                            )}
                                                        </div>
                                                        <div className="item-desc">{layout.description}</div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <AIToolsMenu
                        disabled={!selectedNodeId}
                        isProcessing={isAiProcessing}
                        onAction={handleAiToolAction}
                    />
                </div>

                <div className="toolbar-divider" />

                {/* ===== 导入导出 ===== */}
                <div className="toolbar-section">
                    <button className="toolbar-btn tooltip-bottom" onClick={() => setShowExportModal(true)} disabled={!currentMap} data-tip="导出">
                        <Download size={16} />
                        <span className="label">导出</span>
                    </button>
                    <button data-tip="导入" className="toolbar-btn tooltip-bottom" onClick={handleImport} >
                        <Upload size={16} />
                        <span className="label">导入</span>
                    </button>
                    <button className="toolbar-btn tooltip-bottom" onClick={() => setShowSearch(true)} disabled={!currentMap} data-tip="搜索节点 (Ctrl+F)">
                        <Search size={16} />
                        <span className="label">搜索</span>
                    </button>
                    <button className={`toolbar-btn ${copySuccess ? 'success' : ''} tooltip-bottom`} onClick={handleCopyMarkdown} disabled={!currentMap} data-tip="复制 Markdown" >
                        {copySuccess ? <Check size={16} /> : <Copy size={16} />}
                        <span className="label">{copySuccess ? '已复制' : '复制'}</span>
                    </button>
                </div>

                <div className="toolbar-spacer" />

                {/* ===== 主题切换 ===== */}
                <div className="toolbar-section">
                    <button
                        className="toolbar-btn theme-toggle tooltip-bottom"
                        onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
                        data-tip="切换主题"
                    >
                        {themeMode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                    </button>
                </div>
            </div>

            {/* 新建思维导图弹窗 */}
            {
                showNewMapModal && (
                    <div className="modal-overlay" onClick={() => setShowNewMapModal(false)}>
                        <div className="modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>新建思维导图</h3>
                                <button className="close-btn" onClick={() => setShowNewMapModal(false)}>×</button>
                            </div>
                            <div className="modal-body">
                                <label>
                                    <span>思维导图名称</span>
                                    <input
                                        type="text"
                                        value={newMapName}
                                        onChange={(e) => setNewMapName(e.target.value)}
                                        placeholder="请输入名称..."
                                        autoFocus
                                        onKeyDown={(e) => e.key === 'Enter' && handleCreateMap()}
                                    />
                                </label>
                            </div>
                            <div className="modal-footer">
                                <button className="btn secondary" onClick={() => setShowNewMapModal(false)}>
                                    取消
                                </button>
                                <button
                                    className="btn primary"
                                    onClick={handleCreateMap}
                                    disabled={!newMapName.trim()}
                                >
                                    创建
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* 打开思维导图弹窗 */}
            {
                showMapsModal && (
                    <div className="modal-overlay" onClick={() => setShowMapsModal(false)}>
                        <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>我的思维导图</h3>
                                <button className="close-btn" onClick={() => setShowMapsModal(false)}>×</button>
                            </div>
                            <div className="modal-body">
                                {savedMaps.length === 0 ? (
                                    <div className="empty-state">
                                        <p>还没有保存的思维导图，快去创建第一个吧！</p>
                                    </div>
                                ) : (
                                    <div className="maps-list">
                                        {savedMaps.map((map) => (
                                            <div
                                                key={map.id}
                                                className={`map-item ${currentMap?.id === map.id ? 'active' : ''}`}
                                            >
                                                <div className="map-info" onClick={() => {
                                                    loadMap(map.id);
                                                    setShowMapsModal(false);
                                                }}>
                                                    <span className="map-name">{map.name}</span>
                                                    <span className="map-date">
                                                        {new Date(map.updatedAt).toLocaleDateString('zh-CN')}
                                                    </span>
                                                </div>
                                                <button
                                                    className="delete-btn"
                                                    onClick={() => {
                                                        if (confirm(`确定要删除"${map.name}"吗？`)) {
                                                            deleteMap(map.id);
                                                        }
                                                    }}
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* 编辑节点弹窗 */}
            {
                showEditModal && (
                    <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
                        <div className="modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>编辑节点</h3>
                                <button className="close-btn" onClick={() => setShowEditModal(false)}>×</button>
                            </div>
                            <div className="modal-body">
                                <label>
                                    <span>标题</span>
                                    <input
                                        type="text"
                                        value={editLabel}
                                        onChange={(e) => setEditLabel(e.target.value)}
                                        autoFocus
                                    />
                                </label>
                                <label>
                                    <span>备注（可选）</span>
                                    <textarea
                                        value={editNotes}
                                        onChange={(e) => setEditNotes(e.target.value)}
                                        rows={3}
                                        placeholder="为这个节点添加备注..."
                                    />
                                </label>
                            </div>
                            <div className="modal-footer">
                                <button className="btn secondary" onClick={() => setShowEditModal(false)}>
                                    取消
                                </button>
                                <button
                                    className="btn primary"
                                    onClick={handleSaveEdit}
                                    disabled={!editLabel.trim()}
                                >
                                    保存
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* 导出弹窗 */}
            {
                showExportModal && (
                    <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
                        <div className="modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>导出思维导图</h3>
                                <button className="close-btn" onClick={() => setShowExportModal(false)}>×</button>
                            </div>
                            <div className="modal-body">
                                <div className="export-options">
                                    <div className="export-settings">
                                        <div className="export-settings-title">PNG 导出设置</div>
                                        <div className="export-settings-row">
                                            <label>倍率</label>
                                            <select
                                                value={pngScale}
                                                onChange={(e) => setPngScale(Number(e.target.value))}
                                            >
                                                <option value={1}>1x</option>
                                                <option value={2}>2x</option>
                                                <option value={3}>3x</option>
                                                <option value={4}>4x</option>
                                                <option value={5}>5x</option>
                                                <option value={6}>6x</option>
                                            </select>
                                        </div>
                                        <div className="export-settings-row">
                                            <label>最大边长</label>
                                            <input
                                                type="number"
                                                min={2048}
                                                max={32768}
                                                step={512}
                                                value={pngMaxSize}
                                                onChange={(e) => setPngMaxSize(Number(e.target.value))}
                                            />
                                            <span className="unit">px</span>
                                        </div>
                                        <div className="export-settings-hint">超出上限会自动降低倍率，文字仍不清晰请提高倍率或导出 SVG</div>
                                        <div className="export-settings-hint">
                                            自动推荐倍率：
                                            {pngRecommendedScale
                                                ? ` ${Math.round(pngRecommendedScale * 10) / 10}x`
                                                : ' —'}
                                        </div>
                                    </div>
                                    <div className="export-recommendation">推荐导出 SVG，放大不糊</div>
                                    <button className="export-option" onClick={handleExportSVG}>
                                        <span className="icon">🎨</span>
                                        <span className="format">
                                            SVG 矢量 <span className="export-badge">推荐</span>
                                        </span>
                                        <span className="desc">无限放大不糊，适合编辑</span>
                                    </button>
                                    <button className="export-option" onClick={handleExportPNG}>
                                        <span className="icon">🖼️</span>
                                        <span className="format">PNG 图片</span>
                                        <span className="desc">高清图片，适合分享</span>
                                    </button>
                                    <button className="export-option" onClick={handleExportPDF}>
                                        <span className="icon">📑</span>
                                        <span className="format">PDF 文档</span>
                                        <span className="desc">适合打印和存档</span>
                                    </button>
                                    <button className="export-option" onClick={handleExportJSON}>
                                        <span className="icon">📄</span>
                                        <span className="format">JSON 文件</span>
                                        <span className="desc">备份数据，可再次导入</span>
                                    </button>
                                    <button className="export-option" onClick={handleExportMarkdown}>
                                        <span className="icon">📝</span>
                                        <span className="format">Markdown</span>
                                        <span className="desc">文本大纲格式</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* 模板选择器 */}
            <TemplatePicker
                isOpen={showTemplatePicker}
                onClose={() => setShowTemplatePicker(false)}
                onSelect={(mapData) => loadMapData(mapData)}
            />

            {/* 节点搜索 */}
            <NodeSearch
                isOpen={showSearch}
                onClose={() => setShowSearch(false)}
                onNavigateToNode={handleNavigateToNode}
            />
        </>
    );
};
