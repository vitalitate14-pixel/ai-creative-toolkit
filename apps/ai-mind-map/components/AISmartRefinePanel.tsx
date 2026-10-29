import { desktopEnvironmentKey } from '@/utils/apiKeyStorage';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useMindMapStore } from '../store/mindMapStore';
import { GeminiService } from '../services/geminiService';
import { getStoredApiKey, hasAiAccess } from '../services/aiAccess';
import type { RefineMessage, RefineAction, AICreationRecord } from '../types';
import {
    Send, Sparkles, X, Check, ChevronRight, AlertCircle,
    Plus, Trash2, Edit3, Move, Layers, MessageSquare, History,
    ArrowRight, RefreshCw, BookOpen
} from 'lucide-react';

// 操作类型图标和颜色映射
const ACTION_CONFIG: Record<string, { icon: typeof Plus; color: string; label: string }> = {
    add_node: { icon: Plus, color: '#22c55e', label: '添加节点' },
    delete_node: { icon: Trash2, color: '#ef4444', label: '删除节点' },
    update_node: { icon: Edit3, color: '#3b82f6', label: '修改节点' },
    move_node: { icon: Move, color: '#f59e0b', label: '移动节点' },
    expand: { icon: Layers, color: '#8b5cf6', label: '扩展分支' },
    regroup: { icon: RefreshCw, color: '#ec4899', label: '重组结构' },
};

export const AISmartRefinePanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const {
        currentMap,
        selectedNodeId,
        geminiApiKey,
        aiCreationHistory,
        getMapAsMarkdown,
        addNode,
        updateNode,
        deleteNode,
        addStructureToNode,
        pushHistory,
    } = useMindMapStore();

    const [messages, setMessages] = useState<RefineMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [pendingActions, setPendingActions] = useState<RefineAction[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const envApiKey = (typeof import.meta !== 'undefined' && desktopEnvironmentKey(import.meta.env?.VITE_GEMINI_API_KEY)) as string | undefined;
    const storedApiKey = getStoredApiKey();
    const apiKey = geminiApiKey || envApiKey || storedApiKey;
    const hasApiKey = hasAiAccess(apiKey);

    // 滚动到底部
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    // 获取当前选中节点信息
    const getSelectedNodeContext = useCallback(() => {
        if (!currentMap || !selectedNodeId) return '';
        const node = currentMap.nodes[selectedNodeId];
        if (!node) return '';

        const parts = [`节点名称：${node.label}`];
        if (node.notes) parts.push(`备注：${node.notes}`);

        // 获取父节点路径
        let pathParts: string[] = [];
        let currentId: string | null = selectedNodeId;
        while (currentId) {
            const n = currentMap.nodes[currentId];
            if (n) {
                pathParts.unshift(n.label);
                currentId = n.parentId;
            } else {
                break;
            }
        }
        if (pathParts.length > 1) {
            parts.push(`路径：${pathParts.join(' → ')}`);
        }

        // 获取子节点
        if (node.children && node.children.length > 0) {
            const childLabels = node.children
                .map(id => currentMap.nodes[id]?.label)
                .filter(Boolean);
            parts.push(`子节点：${childLabels.join('、')}`);
        }

        return parts.join('\n');
    }, [currentMap, selectedNodeId]);

    // 格式化创建历史
    const formatCreationHistory = useCallback(() => {
        if (aiCreationHistory.length === 0) return '';

        return aiCreationHistory
            .filter(record => record.type === 'create')
            .slice(-3) // 只取最近3条创建记录
            .map(record => {
                const typeLabel = record.type === 'create' ? '初始创建' : '扩展';
                return `[${typeLabel}] 用户输入: "${record.userInput.slice(0, 100)}${record.userInput.length > 100 ? '...' : ''}"
结果摘要: ${record.resultSummary || 'AI生成了思维导图结构'}`;
            })
            .join('\n\n');
    }, [aiCreationHistory]);

    // 构建对话历史字符串
    const buildConversationHistory = useCallback(() => {
        return messages
            .filter(m => !m.isLoading)
            .slice(-10)
            .map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`)
            .join('\n');
    }, [messages]);

    // 根据节点标签找到节点ID
    const findNodeByLabel = useCallback((label: string): string | null => {
        if (!currentMap) return null;
        for (const [id, node] of Object.entries(currentMap.nodes)) {
            if (node.label === label) return id;
        }
        // 尝试模糊匹配
        for (const [id, node] of Object.entries(currentMap.nodes)) {
            if (node.label.includes(label) || label.includes(node.label)) return id;
        }
        return null;
    }, [currentMap]);

    // 应用单个操作
    const applyAction = useCallback((action: RefineAction) => {
        if (!currentMap) return false;

        pushHistory(); // 记录历史，支持撤销

        switch (action.type) {
            case 'add_node': {
                const parentId = action.parentNodeId
                    ? findNodeByLabel(action.parentNodeLabel || '')
                    : currentMap.rootId;
                if (!parentId) return false;

                if (action.children && action.children.length > 0) {
                    // 批量添加结构
                    addStructureToNode(parentId, action.children.map(c => ({
                        label: c.label,
                        description: c.notes,
                        children: c.children?.map(cc => ({
                            label: cc.label,
                            description: cc.notes,
                        })),
                    })));
                } else if (action.newLabel) {
                    addNode(parentId, action.newLabel, undefined, action.newNotes);
                }
                return true;
            }
            case 'update_node': {
                const nodeId = findNodeByLabel(action.targetNodeLabel || '');
                if (!nodeId) return false;

                const updates: { label?: string; notes?: string } = {};
                if (action.newLabel) updates.label = action.newLabel;
                if (action.newNotes) updates.notes = action.newNotes;
                updateNode(nodeId, updates);
                return true;
            }
            case 'delete_node': {
                const nodeId = findNodeByLabel(action.targetNodeLabel || '');
                if (!nodeId || nodeId === currentMap.rootId) return false;
                deleteNode(nodeId);
                return true;
            }
            case 'expand': {
                const nodeId = findNodeByLabel(action.targetNodeLabel || '');
                if (!nodeId) return false;
                if (action.children && action.children.length > 0) {
                    addStructureToNode(nodeId, action.children.map(c => ({
                        label: c.label,
                        description: c.notes,
                        children: c.children?.map(cc => ({
                            label: cc.label,
                            description: cc.notes,
                        })),
                    })));
                }
                return true;
            }
            default:
                return false;
        }
    }, [currentMap, findNodeByLabel, addNode, updateNode, deleteNode, addStructureToNode, pushHistory]);

    // 应用所有待确认的操作
    const applyAllActions = useCallback(() => {
        let successCount = 0;
        pendingActions.forEach(action => {
            if (applyAction(action)) {
                successCount++;
            }
        });
        setPendingActions([]);

        // 添加系统消息
        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'system',
            content: `✅ 已成功应用 ${successCount} 个修改`,
            timestamp: Date.now(),
        }]);
    }, [pendingActions, applyAction]);

    // 发送消息
    const handleSend = async (customPrompt?: string) => {
        const prompt = customPrompt || inputValue.trim();
        if (!prompt || !hasApiKey || !currentMap) return;

        const userMessage: RefineMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: prompt,
            timestamp: Date.now(),
        };

        const loadingMessage: RefineMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            isLoading: true,
        };

        setMessages(prev => [...prev, userMessage, loadingMessage]);
        setInputValue('');
        setIsLoading(true);

        try {
            const service = new GeminiService(apiKey);
            const mapStructure = getMapAsMarkdown();
            const creationHistory = formatCreationHistory();
            const conversationHistory = buildConversationHistory();
            const selectedContext = getSelectedNodeContext();

            const response = await service.smartRefineChat(
                prompt,
                mapStructure,
                creationHistory,
                conversationHistory,
                selectedContext
            );

            // 更新消息
            setMessages(prev =>
                prev.map(m =>
                    m.id === loadingMessage.id
                        ? {
                            ...m,
                            content: response.reply,
                            isLoading: false,
                            suggestedActions: response.suggestedActions?.map((a, idx) => ({
                                id: `action-${Date.now()}-${idx}`,
                                type: a.type as any,
                                description: a.description,
                                targetNodeLabel: a.targetNodeLabel,
                                parentNodeId: a.parentNodeLabel ? findNodeByLabel(a.parentNodeLabel) || undefined : undefined,
                                parentNodeLabel: a.parentNodeLabel,
                                newLabel: a.newLabel,
                                newNotes: a.newNotes,
                                children: a.children,
                            })),
                        }
                        : m
                )
            );

            // 如果有建议的操作，设置为待确认
            if (response.suggestedActions && response.suggestedActions.length > 0) {
                setPendingActions(response.suggestedActions.map((a, idx) => ({
                    id: `action-${Date.now()}-${idx}`,
                    type: a.type as any,
                    description: a.description,
                    targetNodeLabel: a.targetNodeLabel,
                    parentNodeId: a.parentNodeLabel ? findNodeByLabel(a.parentNodeLabel) || undefined : undefined,
                    parentNodeLabel: a.parentNodeLabel,
                    newLabel: a.newLabel,
                    newNotes: a.newNotes,
                    children: a.children,
                })));
            }
        } catch (error) {
            console.error('Smart refine error:', error);
            setMessages(prev =>
                prev.map(m =>
                    m.id === loadingMessage.id
                        ? { ...m, content: '抱歉，发生错误，请重试。', isLoading: false }
                        : m
                )
            );
        } finally {
            setIsLoading(false);
        }
    };

    // 快捷操作
    const quickActions = [
        { label: '完善选中分支', prompt: '请帮我完善当前选中的分支，补充缺失的内容' },
        { label: '找出缺失模块', prompt: '请分析当前思维导图，找出可能缺失的重要模块' },
        { label: '优化整体结构', prompt: '请帮我优化思维导图的整体结构，使其更加清晰' },
        { label: '精简冗余内容', prompt: '请帮我找出并精简思维导图中重复或冗余的内容' },
    ];

    // 处理键盘事件
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="smart-refine-panel">
            {/* 头部 */}
            <div className="refine-header">
                <div className="header-title">
                    <Sparkles size={20} className="title-icon" />
                    <span>AI 智能完善</span>
                    <span className="beta-tag">Beta</span>
                </div>
                <div className="header-actions">
                    <button
                        className={`history-btn ${showHistory ? 'active' : ''} tooltip-bottom`}
                        onClick={() => setShowHistory(!showHistory)}
                        data-tip="查看创建历史"
                    >
                        <History size={18} />
                    </button>
                    <button className="close-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* 创建历史面板 */}
            {showHistory && (
                <div className="creation-history-panel">
                    <div className="history-title">
                        <BookOpen size={16} />
                        <span>创建历史记录</span>
                    </div>
                    {aiCreationHistory.length === 0 ? (
                        <div className="history-empty">
                            暂无创建历史记录
                        </div>
                    ) : (
                        <div className="history-list">
                            {aiCreationHistory.slice(-5).reverse().map((record: AICreationRecord) => (
                                <div key={record.id} className="history-item">
                                    <div className="history-type">
                                        {record.type === 'create' ? '🎯 初始创建' : '📝 ' + record.type}
                                    </div>
                                    <div className="history-input">
                                        用户输入：{record.userInput.slice(0, 50)}
                                        {record.userInput.length > 50 ? '...' : ''}
                                    </div>
                                    <div className="history-time">
                                        {new Date(record.timestamp).toLocaleString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* 消息区域 */}
            <div className="refine-messages">
                {messages.length === 0 ? (
                    <div className="refine-welcome">
                        <div className="welcome-icon">🧠</div>
                        <h3>智能对话式完善</h3>
                        <p>
                            告诉我你想如何完善这个思维导图，我会先理解你的意图，
                            然后给出精准的修改建议。
                        </p>
                        <div className="quick-actions">
                            {quickActions.map((action, idx) => (
                                <button
                                    key={idx}
                                    className="quick-action-btn"
                                    onClick={() => handleSend(action.prompt)}
                                    disabled={isLoading}
                                >
                                    <ChevronRight size={14} />
                                    {action.label}
                                </button>
                            ))}
                        </div>
                        {selectedNodeId && currentMap && (
                            <div className="selected-node-hint">
                                <AlertCircle size={14} />
                                <span>
                                    当前选中：{currentMap.nodes[selectedNodeId]?.label}
                                </span>
                            </div>
                        )}
                    </div>
                ) : (
                    messages.map(msg => (
                        <div key={msg.id} className={`refine-message ${msg.role}`}>
                            <div className="message-avatar">
                                {msg.role === 'user' ? '👤' : msg.role === 'system' ? '⚙️' : '🧠'}
                            </div>
                            <div className="message-body">
                                {msg.isLoading ? (
                                    <div className="typing-indicator">
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                    </div>
                                ) : (
                                    <>
                                        <div className="message-content">{msg.content}</div>
                                        {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                                            <div className="suggested-actions">
                                                <div className="actions-title">
                                                    建议的修改操作：
                                                </div>
                                                {msg.suggestedActions.map((action, idx) => {
                                                    const config = ACTION_CONFIG[action.type] || ACTION_CONFIG.add_node;
                                                    const Icon = config.icon;
                                                    return (
                                                        <div key={idx} className="action-item">
                                                            <div
                                                                className="action-icon"
                                                                style={{ backgroundColor: `${config.color}20`, color: config.color }}
                                                            >
                                                                <Icon size={14} />
                                                            </div>
                                                            <div className="action-info">
                                                                <div className="action-type">{config.label}</div>
                                                                <div className="action-desc">{action.description}</div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* 待确认操作栏 */}
            {pendingActions.length > 0 && (
                <div className="pending-actions-bar">
                    <div className="pending-info">
                        <AlertCircle size={16} />
                        <span>有 {pendingActions.length} 个修改待确认</span>
                    </div>
                    <div className="pending-buttons">
                        <button
                            className="reject-btn"
                            onClick={() => setPendingActions([])}
                        >
                            取消
                        </button>
                        <button
                            className="apply-btn"
                            onClick={applyAllActions}
                        >
                            <Check size={16} />
                            应用修改
                        </button>
                    </div>
                </div>
            )}

            {/* 输入区域 */}
            <div className="refine-input-area">
                <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="描述你想如何完善这个思维导图..."
                    disabled={isLoading || !hasApiKey}
                    rows={1}
                />
                <button
                    className="send-btn"
                    onClick={() => handleSend()}
                    disabled={!inputValue.trim() || isLoading || !hasApiKey}
                >
                    <Send size={18} />
                </button>
            </div>

            {!hasApiKey && (
                <div className="no-api-warning">
                    请先在主工具箱设置 API 密钥
                </div>
            )}

            <style>{`
                .smart-refine-panel {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: linear-gradient(180deg, #1a1a2e 0%, #16162a 100%);
                    border-radius: 16px;
                    overflow: hidden;
                }

                .refine-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 16px 20px;
                    background: rgba(255, 255, 255, 0.03);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                }

                .header-title {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-weight: 600;
                    font-size: 16px;
                    color: #f0f0f0;
                }

                .title-icon {
                    color: #a855f7;
                }

                .beta-tag {
                    font-size: 10px;
                    padding: 2px 6px;
                    background: linear-gradient(135deg, #a855f7, #6366f1);
                    border-radius: 4px;
                    color: white;
                    font-weight: 500;
                }

                .header-actions {
                    display: flex;
                    gap: 8px;
                }

                .history-btn, .close-btn {
                    padding: 8px;
                    border: none;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 8px;
                    color: #888;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .history-btn:hover, .close-btn:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: #fff;
                }

                .history-btn.active {
                    background: rgba(168, 85, 247, 0.2);
                    color: #a855f7;
                }

                .creation-history-panel {
                    padding: 16px;
                    background: rgba(168, 85, 247, 0.05);
                    border-bottom: 1px solid rgba(168, 85, 247, 0.2);
                    max-height: 200px;
                    overflow-y: auto;
                }

                .history-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: #a855f7;
                    font-weight: 500;
                    margin-bottom: 12px;
                }

                .history-empty {
                    color: #666;
                    font-size: 13px;
                    text-align: center;
                    padding: 20px;
                }

                .history-list {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .history-item {
                    padding: 12px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 8px;
                    border-left: 3px solid #a855f7;
                }

                .history-type {
                    font-size: 12px;
                    color: #a855f7;
                    margin-bottom: 4px;
                }

                .history-input {
                    font-size: 13px;
                    color: #ccc;
                    margin-bottom: 4px;
                }

                .history-time {
                    font-size: 11px;
                    color: #666;
                }

                .refine-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                }

                .refine-welcome {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    text-align: center;
                    padding: 20px;
                }

                .welcome-icon {
                    font-size: 48px;
                    margin-bottom: 16px;
                }

                .refine-welcome h3 {
                    color: #f0f0f0;
                    margin-bottom: 8px;
                }

                .refine-welcome p {
                    color: #888;
                    font-size: 14px;
                    max-width: 280px;
                    line-height: 1.5;
                    margin-bottom: 24px;
                }

                .quick-actions {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    width: 100%;
                    max-width: 280px;
                }

                .quick-action-btn {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 16px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    color: #ccc;
                    font-size: 13px;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .quick-action-btn:hover:not(:disabled) {
                    background: rgba(168, 85, 247, 0.1);
                    border-color: rgba(168, 85, 247, 0.3);
                    color: #fff;
                }

                .quick-action-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .selected-node-hint {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-top: 16px;
                    padding: 8px 12px;
                    background: rgba(99, 102, 241, 0.1);
                    border-radius: 8px;
                    color: #818cf8;
                    font-size: 12px;
                }

                .refine-message {
                    display: flex;
                    gap: 12px;
                    margin-bottom: 16px;
                }

                .refine-message.user {
                    flex-direction: row-reverse;
                }

                .refine-message.system {
                    justify-content: center;
                }

                .refine-message.system .message-body {
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid rgba(34, 197, 94, 0.2);
                    color: #22c55e;
                    font-size: 13px;
                    padding: 8px 16px;
                    border-radius: 20px;
                }

                .message-avatar {
                    width: 36px;
                    height: 36px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 18px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 10px;
                    flex-shrink: 0;
                }

                .message-body {
                    max-width: 80%;
                    padding: 12px 16px;
                    border-radius: 16px;
                    background: rgba(255, 255, 255, 0.05);
                }

                .refine-message.user .message-body {
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: white;
                }

                .refine-message.assistant .message-body {
                    background: rgba(255, 255, 255, 0.08);
                    color: #e0e0e0;
                }

                .message-content {
                    font-size: 14px;
                    line-height: 1.6;
                    white-space: pre-wrap;
                }

                .suggested-actions {
                    margin-top: 16px;
                    padding-top: 16px;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                }

                .actions-title {
                    font-size: 12px;
                    color: #888;
                    margin-bottom: 12px;
                }

                .action-item {
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    padding: 12px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 10px;
                    margin-bottom: 8px;
                }

                .action-icon {
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 8px;
                    flex-shrink: 0;
                }

                .action-info {
                    flex: 1;
                }

                .action-type {
                    font-size: 11px;
                    color: #888;
                    margin-bottom: 4px;
                }

                .action-desc {
                    font-size: 13px;
                    color: #ccc;
                }

                .typing-indicator {
                    display: flex;
                    gap: 4px;
                    padding: 8px 0;
                }

                .typing-indicator span {
                    width: 8px;
                    height: 8px;
                    background: #a855f7;
                    border-radius: 50%;
                    animation: typing 1.4s infinite ease-in-out both;
                }

                .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
                .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

                @keyframes typing {
                    0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
                    40% { transform: scale(1); opacity: 1; }
                }

                .pending-actions-bar {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px 20px;
                    background: linear-gradient(90deg, rgba(168, 85, 247, 0.1), rgba(99, 102, 241, 0.1));
                    border-top: 1px solid rgba(168, 85, 247, 0.2);
                }

                .pending-info {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: #a855f7;
                    font-size: 14px;
                }

                .pending-buttons {
                    display: flex;
                    gap: 8px;
                }

                .reject-btn, .apply-btn {
                    padding: 8px 16px;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .reject-btn {
                    background: transparent;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    color: #ccc;
                }

                .reject-btn:hover {
                    background: rgba(255, 255, 255, 0.05);
                }

                .apply-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: linear-gradient(135deg, #22c55e, #16a34a);
                    border: none;
                    color: white;
                }

                .apply-btn:hover {
                    filter: brightness(1.1);
                }

                .refine-input-area {
                    display: flex;
                    align-items: flex-end;
                    gap: 12px;
                    padding: 16px 20px;
                    background: rgba(0, 0, 0, 0.2);
                    border-top: 1px solid rgba(255, 255, 255, 0.08);
                }

                .refine-input-area textarea {
                    flex: 1;
                    min-height: 44px;
                    max-height: 120px;
                    padding: 12px 16px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    color: #f0f0f0;
                    font-size: 14px;
                    resize: none;
                    outline: none;
                    transition: border-color 0.2s;
                }

                .refine-input-area textarea:focus {
                    border-color: rgba(168, 85, 247, 0.5);
                }

                .refine-input-area textarea::placeholder {
                    color: #666;
                }

                .send-btn {
                    width: 44px;
                    height: 44px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: linear-gradient(135deg, #a855f7, #6366f1);
                    border: none;
                    border-radius: 12px;
                    color: white;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .send-btn:hover:not(:disabled) {
                    filter: brightness(1.1);
                    transform: translateY(-1px);
                }

                .send-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .no-api-warning {
                    padding: 12px;
                    text-align: center;
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                    font-size: 13px;
                }
            `}</style>
        </div>
    );
};
