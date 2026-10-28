
import { GridData, ToolType, GridSelection, ProcessOptions } from '../types';

// --- Helper Functions ---

export function colToLetter(col: number): string {
  let temp = '';
  let c = col + 1;
  while (c > 0) {
    let rem = (c - 1) % 26;
    temp = String.fromCharCode(65 + rem) + temp;
    c = Math.floor((c - 1) / 26);
  }
  return temp;
}

// Helper: Remove leading empty lines from text
function trimLeadingEmptyLines(text: string): string {
  if (!text) return '';
  const lines = text.split(/\r?\n/);
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }
  return lines.join('\n');
}

function cleanBlankLines(text: string): string {
  const lines = text.split(/\r?\n/);
  const newLines: string[] = [];
  let blank = false;
  for (const line of lines) {
    if (line.trim() === '') {
      if (!blank) {
        newLines.push('');
        blank = true;
      }
    } else {
      newLines.push(line);
      blank = false;
    }
  }
  return newLines.join('\n');
}

export function autoWrapText(text: string, width: number = 18): string {
  const paragraphs = text.trim().split(/\n\s*\n/);
  const wrappedResult: string[] = [];

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/);
    if (!words || (words.length === 1 && words[0] === '')) continue;

    let line = '';
    for (const word of words) {
      if (!line) {
        line = word;
      } else if (line.length + 1 + word.length <= width) {
        line += ' ' + word;
      } else {
        wrappedResult.push(line);
        line = word;
      }

      const lastChar = line.slice(-1);
      if (line && [':', '.', '?', '!'].includes(lastChar)) {
        wrappedResult.push(line);
        line = '';
      }
    }

    if (line) {
      wrappedResult.push(line);
    }
    wrappedResult.push('');
  }

  while (wrappedResult.length > 0 && wrappedResult[wrappedResult.length - 1] === '') {
    wrappedResult.pop();
  }

  return cleanBlankLines(wrappedResult.join('\n'));
}

interface ListMarker {
  index: number;
  length: number;
  markerText: string;
  value: number;
  type: 'number' | 'ordinal' | 'special';
}

const circleMap: Record<string, number> = {
  '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5,
  '⑥': 6, '⑦': 7, '⑧': 8, '⑨': 9, '⑩': 10,
  '⑪': 11, '⑫': 12, '⑬': 13, '⑭': 14, '⑮': 15,
  '⑯': 16, '⑰': 17, '⑱': 18, '⑲': 19, '⑳': 20
};

const ordinalMap: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  firstly: 1, secondly: 2, thirdly: 3, fourthly: 4, fifthly: 5,
  sixthly: 6, seventhly: 7, eighthly: 8, ninthly: 9, tenthly: 10,
  '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5,
  '6th': 6, '7th': 7, '8th': 8, '9th': 9, '10th': 10
};

export function arrangeParallelSentences(text: string): string {
  text = (text || '').toString();
  if (!text.trim()) return '';

  const markers: ListMarker[] = [];

  // 1. Match numeric list markers: e.g. "1. Text", "2) Text", "3、文本".
  // The copied copy commonly has a space after the marker, so allow whitespace
  // between the punctuation and the first character of the sentence.
  const numRegex = /(?:^|[\s\n\r])(\d+)([\.、\)\]\}\-\u2013\u2014]+)(?=\s*[a-zA-Z\u4e00-\u9fff])/g;
  let match;
  while ((match = numRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const numStr = match[1];
    const punct = match[2];
    const val = parseInt(numStr, 10);
    const markerText = numStr + punct;
    const markerIndex = match.index + fullMatch.indexOf(markerText);
    markers.push({
      index: markerIndex,
      length: markerText.length,
      markerText,
      value: val,
      type: 'number'
    });
  }

  // 2. Match circle numbers: ①, ②, ③...
  const circleRegex = /(?:^|[\s\n\r])([①-⑳])(?=\s*[a-zA-Z\u4e00-\u9fff])/g;
  while ((match = circleRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const char = match[1];
    const val = circleMap[char] || 0;
    const markerIndex = match.index + fullMatch.indexOf(char);
    markers.push({
      index: markerIndex,
      length: char.length,
      markerText: char,
      value: val,
      type: 'special'
    });
  }

  // 3. Match English ordinals
  const ordRegex = /(?:^|[\s\n\r])\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|firstly|secondly|thirdly|fourthly|fifthly|sixthly|seventhly|eighthly|ninthly|tenthly|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\b([\.\,\:\s\-]+)(?=[a-zA-Z\u4e00-\u9fff])/gi;
  while ((match = ordRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const word = match[1];
    const punct = match[2];
    const val = ordinalMap[word.toLowerCase()] || 0;
    const markerText = word + punct;
    const markerIndex = match.index + fullMatch.indexOf(markerText);
    markers.push({
      index: markerIndex,
      length: markerText.length,
      markerText,
      value: val,
      type: 'ordinal'
    });
  }

  // Sort markers by index
  markers.sort((a, b) => a.index - b.index);

  // Filter unique non-overlapping
  const uniqueMarkers: ListMarker[] = [];
  let lastEnd = -1;
  for (const m of markers) {
    if (m.index >= lastEnd) {
      uniqueMarkers.push(m);
      lastEnd = m.index + m.length;
    }
  }

  if (uniqueMarkers.length < 2) {
    return text;
  }

  // Sequence detection
  const validChain: ListMarker[] = [];
  for (const m of uniqueMarkers) {
    if (validChain.length === 0) {
      validChain.push(m);
    } else {
      const last = validChain[validChain.length - 1];
      if (m.value > last.value && m.value - last.value <= 3) {
        validChain.push(m);
      }
    }
  }

  if (validChain.length < 2) {
    return text;
  }

  const intro = text.substring(0, validChain[0].index).trim();
  const items: string[] = [];

  for (let i = 0; i < validChain.length; i++) {
    const current = validChain[i];
    const next = validChain[i + 1];
    const startIdx = current.index;
    const endIdx = next ? next.index : text.length;
    let itemText = text.substring(startIdx, endIdx);

    if (!next) {
      let splitIdx = -1;
      const dnlMatch = itemText.match(/\r?\n\s*\r?\n/);
      if (dnlMatch && dnlMatch.index !== undefined) {
        splitIdx = dnlMatch.index;
      } else {
        const nlMatch = itemText.match(/\r?\n\s*(?=[A-Z]|If\b|Type\b|Amen\b|Share\b|Please\b|Put\b|Send\b)/);
        if (nlMatch && nlMatch.index !== undefined) {
          splitIdx = nlMatch.index;
        } else {
          const sentenceMatch = itemText.match(/[\.\!\?]\s+(?=[A-Z]|If\b|Type\b|Amen\b|Share\b|Please\b)/);
          if (sentenceMatch && sentenceMatch.index !== undefined) {
            splitIdx = sentenceMatch.index + 1;
          }
        }
      }

      if (splitIdx !== -1) {
        const endingText = itemText.substring(splitIdx).trim();
        itemText = itemText.substring(0, splitIdx).trim();
        if (endingText) {
          items.push(itemText);
          items.push('__ENDING__:' + endingText);
          continue;
        }
      }
    }

    items.push(itemText.trim());
  }

  const formattedItems: string[] = [];
  let ending = '';

  for (const item of items) {
    if (item.startsWith('__ENDING__:')) {
      ending = item.substring('__ENDING__:'.length);
      continue;
    }

    let contentStart = 0;
    let markerPart = '';

    const markerStartRegex = /^(\d+[\.、\)\]\}\-\u2013\u2014]+|[①-⑳]|(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|firstly|secondly|thirdly|fourthly|fifthly|sixthly|seventhly|eighthly|ninthly|tenthly|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)[\.\,\:\s\-]+)/i;
    const mMatch = item.match(markerStartRegex);
    if (mMatch) {
      markerPart = mMatch[0];
      contentStart = markerPart.length;
    }

    const itemContent = item.substring(contentStart).trim();
    let normalizedMarker = markerPart;
    if (markerPart) {
      normalizedMarker = markerPart.replace(/\s+$/, '') + ' ';
    }

    formattedItems.push(normalizedMarker + itemContent);
  }

  let output = '';
  if (intro) {
    output += intro + '\n';
  }
  output += formattedItems.join('\n');
  if (ending) {
    output += '\n' + ending;
  }

  return output;
}

function splitThreeParts(text: string) {
  text = (text || '').toString().trim();
  if (!text) return { title: '', content: '', ending: '' };

  // Split into lines and filter out leading empty lines
  let lines = text.split(/\r?\n/);
  // Remove leading empty lines
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }

  if (lines.length > 1) {
    // Also filter content's leading empty lines
    const contentLines = lines.slice(1, -1);
    while (contentLines.length > 0 && contentLines[0].trim() === '') {
      contentLines.shift();
    }
    return {
      title: lines[0].trim(),
      content: contentLines.join('\n').trim(),
      ending: lines[lines.length - 1].trim()
    };
  } else {
    const sentences = text.match(/[^。！？?!]+[。！？?!]?/g);
    if (sentences && sentences.length > 1) {
      return {
        title: sentences[0].trim(),
        content: sentences.slice(1, -1).join('').trim(),
        ending: sentences[sentences.length - 1].trim()
      };
    } else {
      return { title: text.trim(), content: '', ending: '' };
    }
  }
}

function splitTwoParts(text: string) {
  text = (text || '').toString().trim();
  if (!text) return { title: '', content: '' };

  // Split into lines and filter out leading empty lines
  let lines = text.split(/\r?\n/);
  // Remove leading empty lines
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }

  if (lines.length > 1) {
    // Also filter content's leading empty lines
    const contentLines = lines.slice(1);
    while (contentLines.length > 0 && contentLines[0].trim() === '') {
      contentLines.shift();
    }
    return {
      title: lines[0].trim(),
      content: contentLines.join('\n').trim()
    };
  } else {
    const sentences = text.match(/[^。！？?!]+[。！？?!]?/g);
    if (sentences && sentences.length > 1) {
      return {
        title: sentences[0].trim(),
        content: sentences.slice(1).join('').trim()
      };
    } else {
      return { title: text.trim(), content: '' };
    }
  }
}

// Smart split: priority-based title extraction
// 1. Line break (first line = title)
// 2. Colon (before colon = title)
// 3. English period (first sentence = title)
// 4. Prayer keywords (before Dear God / Lord / Heavenly Father = title)
function smartSplitTwoParts(text: string) {
  text = (text || '').toString().trim();
  if (!text) return { title: '', content: '' };

  // Priority 1: Line break — if multi-line, first line = title
  let lines = text.split(/\r?\n/);
  // Remove leading empty lines
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }
  if (lines.length > 1) {
    const contentLines = lines.slice(1);
    while (contentLines.length > 0 && contentLines[0].trim() === '') {
      contentLines.shift();
    }
    return {
      title: lines[0].trim(),
      content: contentLines.join('\n').trim()
    };
  }

  // Single line from here — try other strategies
  const singleLine = lines[0].trim();

  // Priority 2: Colon — split at first colon (: or ：)
  // Skip colons between digits (Bible references like 8:28, time like 3:00)
  let colonIdx = -1;
  for (let i = 0; i < singleLine.length; i++) {
    if (singleLine[i] === ':' || singleLine[i] === '\uff1a') {
      const prevChar = i > 0 ? singleLine[i - 1] : '';
      const nextChar = i < singleLine.length - 1 ? singleLine[i + 1] : '';
      if (/\d/.test(prevChar) && /\d/.test(nextChar)) {
        continue; // Skip digit:digit (Bible refs, time)
      }
      colonIdx = i;
      break;
    }
  }
  if (colonIdx > 0 && colonIdx < singleLine.length - 1) {
    const beforeColon = singleLine.substring(0, colonIdx).trim();
    // Only split at colon if text before looks like a title (≤1 sentence ending)
    // Prevents splitting at colons deep in body text like "the blessing: He prepares"
    const sentenceEndings = (beforeColon.match(/(?<!\d)[.!?]/g) || []).length;
    if (sentenceEndings <= 1) {
      return {
        title: singleLine.substring(0, colonIdx + 1).trim(),
        content: singleLine.substring(colonIdx + 1).trim()
      };
    }
  }

  // Priority 3: Prayer keywords — split before these phrases (case-insensitive)
  // "Starter" keywords (specific greetings, safe to match broadly)
  const starterKeywords = [
    'Dear Heavenly Father',
    'Dear God',
    'Dear Lord',
    'Heavenly Father',
  ];
  // "Context-sensitive" keywords — only match at sentence boundaries (after . ! ?)
  const contextKeywords = [
    'Lord,',
    'Lord ',
  ];

  // Check starter keywords first
  for (const keyword of starterKeywords) {
    const kwIdx = singleLine.toLowerCase().indexOf(keyword.toLowerCase());
    if (kwIdx === 0) {
      // Keyword at start → keyword itself is title
      let afterIdx = keyword.length;
      while (afterIdx < singleLine.length && /[,\s]/.test(singleLine[afterIdx])) {
        afterIdx++;
      }
      const content = singleLine.substring(afterIdx).trim();
      if (content) {
        return {
          title: singleLine.substring(0, keyword.length).trim().replace(/,$/, ''),
          content
        };
      }
    } else if (kwIdx > 0) {
      const beforeKw = singleLine.substring(0, kwIdx).trim();
      const sentenceEndings = (beforeKw.match(/(?<!\d)[.!?]/g) || []).length;
      if (sentenceEndings <= 1) {
        return {
          title: beforeKw,
          content: singleLine.substring(kwIdx).trim()
        };
      }
    }
  }

  // Check context-sensitive keywords (Lord) — must be preceded by sentence-ending punctuation
  for (const keyword of contextKeywords) {
    const kwIdx = singleLine.toLowerCase().indexOf(keyword.toLowerCase());
    if (kwIdx === 0) {
      let afterIdx = keyword.length;
      while (afterIdx < singleLine.length && /[,\s]/.test(singleLine[afterIdx])) {
        afterIdx++;
      }
      const content = singleLine.substring(afterIdx).trim();
      if (content) {
        return {
          title: singleLine.substring(0, keyword.length).trim().replace(/,$/, ''),
          content
        };
      }
    } else if (kwIdx > 0) {
      // Only match if Lord is preceded by sentence-ending punctuation (. ! ?) + space
      const charsBefore = singleLine.substring(0, kwIdx);
      if (/[.!?]\s*$/.test(charsBefore)) {
        const beforeKw = charsBefore.trim();
        const sentenceEndings = (beforeKw.match(/(?<!\d)[.!?]/g) || []).length;
        if (sentenceEndings <= 1) {
          return {
            title: beforeKw,
            content: singleLine.substring(kwIdx).trim()
          };
        }
      }
    }
  }

  // Priority 4: English period — split at first period followed by a space
  const periodMatch = singleLine.match(/^(.+?\.\s)(.+)$/);
  if (periodMatch) {
    return {
      title: periodMatch[1].trim(),
      content: periodMatch[2].trim()
    };
  }
  // Also try period at end of a segment (no space required if followed by uppercase)
  const periodMatch2 = singleLine.match(/^(.+?\.)([A-Z].+)$/);
  if (periodMatch2) {
    return {
      title: periodMatch2[1].trim(),
      content: periodMatch2[2].trim()
    };
  }

  // Fallback: no split point found, entire text = title
  return { title: singleLine, content: '' };
}

// --- Main Grid Processor ---

export const processGrid = (
  grid: GridData,
  selection: GridSelection,
  tool: ToolType,
  options: ProcessOptions = {}
): { newGrid: GridData, updatedCols: number[], columnInsertions: { at: number; count: number }[] } => {
  const { clearSource = false } = options;

  // Deep copy grid
  const newGrid = grid.map(row => [...row]);
  const updatedCols: number[] = [];
  const columnInsertions: { at: number; count: number }[] = [];

  const minR = Math.min(selection.start.row, selection.end.row);
  const maxR = Math.max(selection.start.row, selection.end.row);
  const minC = Math.min(selection.start.col, selection.end.col);
  const maxC = Math.max(selection.start.col, selection.end.col);

  // Logic branch: In-place modification (Cleaning) vs Expansion (Split/Prompt)

  if (tool === ToolType.CleanBreaks) {
    // Apply to EVERY cell in the selection
    for (let r = minR; r <= maxR; r++) {
      if (!newGrid[r]) newGrid[r] = [];
      for (let c = minC; c <= maxC; c++) {
        const val = newGrid[r][c] || '';
        const cleaned = val.replace(/\r?\n+/g, ' ').replace(/ {2,}/g, ' ').trim();
        newGrid[r][c] = cleaned;
      }
    }
    // Mark these columns as updated
    for (let c = minC; c <= maxC; c++) updatedCols.push(c);
  }
  else if (tool === ToolType.CleanTails) {
    // 自动删除结尾是 @一些名字内容啥的。还有结尾是 Veo 这种单词
    let cleanedCount = 0;
    for (let r = minR; r <= maxR; r++) {
      if (!newGrid[r]) newGrid[r] = [];
      for (let c = minC; c <= maxC; c++) {
        const val = newGrid[r][c] || '';
        if (!val) continue;

        let cleaned = val.trim();
        let changed = true;
        let originalCleaned = cleaned;

        while (changed) {
          changed = false;
          // 删除尾部的 @用户名 (包括前面的空格或标点)
          const atMatch = cleaned.match(/(?:[\s,:]*@[^\s]+)+$/);
          if (atMatch) {
            cleaned = cleaned.substring(0, cleaned.length - atMatch[0].length).trim();
            changed = true;
          }
          // 删除尾部的 Veo 或 veo (包括前面的空格)
          const veoMatch = cleaned.match(/[\s,]*veo$/i);
          if (veoMatch) {
            cleaned = cleaned.substring(0, cleaned.length - veoMatch[0].length).trim();
            changed = true;
          }
        }

        if (cleaned !== originalCleaned) {
          newGrid[r][c] = cleaned;
          cleanedCount++;
        }
      }
    }
    for (let c = minC; c <= maxC; c++) updatedCols.push(c);
    if (cleanedCount > 0) {
      updatedCols.push(-5000 - cleanedCount); // Signal: cleaned count
    }
  }
  else if (tool === ToolType.CleanEmojis) {
    // 自动删除表情符号（包含各类 emoji 和部分常见特殊符号）
    // regex 说明：匹配绝大部分 emoji 字符区间
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{200D}\u{FE0F}]/gu;
    
    // 找出有内容的源列，从右往左处理（避免列偏移，确保新列在原列右侧）
    const sourceColsWithContent: Set<number> = new Set();
    for (let c = minC; c <= maxC; c++) {
      for (let r = minR; r <= maxR; r++) {
        if ((newGrid[r]?.[c] || '').trim()) {
          sourceColsWithContent.add(c);
          break; // 列只要有内容就加入处理，检查下一列
        }
      }
    }

    let cleanedCount = 0;
    const sortedSrcCols = Array.from(sourceColsWithContent).sort((a, b) => b - a);

    for (const srcCol of sortedSrcCols) {
      for (let r = minR; r <= maxR; r++) {
        if (!newGrid[r]) newGrid[r] = [];
        const val = newGrid[r][srcCol] || '';
        
        while (newGrid[r].length <= srcCol + 1) newGrid[r].push('');

        if (val) {
          const cleaned = val
            .replace(emojiRegex, '')
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/^[ \t]+|[ \t]+$/gm, '');

          if (cleaned !== val) cleanedCount++;
          newGrid[r][srcCol + 1] = cleaned;
        } else {
          newGrid[r][srcCol + 1] = '';
        }

        // 如果用户选择了“删除原文”，则清空原列
        if (clearSource) {
           newGrid[r][srcCol] = '';
        }
      }
      if (!updatedCols.includes(srcCol + 1)) updatedCols.push(srcCol + 1);
      if (clearSource && !updatedCols.includes(srcCol)) updatedCols.push(srcCol);
    }
    
    if (cleanedCount > 0) {
      updatedCols.push(-6000 - cleanedCount); // Signal: emoji cleaned count
    }
  }
  else if (tool === ToolType.ClearChinese) {
    // Delete cells that contain Chinese HANZI characters (only in selected area)
    // Only match actual Chinese characters (CJK Unified Ideographs), NOT punctuation
    const hanziRegex = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;
    // Chinese punctuation pattern (for detection only, not deletion)
    const chinesePunctuationRegex = /[\u3000-\u303f\uff00-\uffef\u2000-\u206f]/;

    let deletedCount = 0;
    let punctuationOnlyCount = 0;

    for (let r = minR; r <= maxR; r++) {
      if (!newGrid[r]) newGrid[r] = [];
      for (let c = minC; c <= maxC; c++) {
        const val = newGrid[r][c] || '';
        if (!val) continue;

        // Check if cell contains actual Chinese characters (hanzi)
        if (hanziRegex.test(val)) {
          newGrid[r][c] = '';
          deletedCount++;
        }
        // Check if cell only has Chinese punctuation (no hanzi)
        else if (chinesePunctuationRegex.test(val)) {
          punctuationOnlyCount++;
          // Don't delete - just count for reporting
        }
      }
    }
    // Mark these columns as updated
    for (let c = minC; c <= maxC; c++) updatedCols.push(c);

    // Store stats in a special way (we'll use a convention)
    // Add negative numbers at the end to signal stats: -deletedCount, -punctuationOnlyCount
    if (deletedCount > 0 || punctuationOnlyCount > 0) {
      updatedCols.push(-1000 - deletedCount);  // Signal: deleted count
      updatedCols.push(-2000 - punctuationOnlyCount);  // Signal: punctuation only count
    }
  }
  else if (tool === ToolType.AddPromptPrefix) {
    // Add custom prefix with sequence number to each non-empty cell in the selection
    // Sequence number is based on the order of non-empty cells (row by row, left to right)
    const prefix = options.customPrefix || 'prompt';  // 默认使用 prompt
    let promptIndex = 1;

    // 创建用于检测已有前缀的正则（动态生成）
    const existingPrefixRegex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+:?\\s*`);

    for (let r = minR; r <= maxR; r++) {
      if (!newGrid[r]) newGrid[r] = [];
      for (let c = minC; c <= maxC; c++) {
        const val = newGrid[r][c] || '';
        if (val.trim()) {
          // Check if already has this prefix, avoid duplicating
          if (!existingPrefixRegex.test(val)) {
            newGrid[r][c] = `${prefix}-${promptIndex}: ${val}`;
          }
          promptIndex++;
        }
      }
    }
    // Mark these columns as updated
    for (let c = minC; c <= maxC; c++) updatedCols.push(c);

    // Store stats using special negative value convention
    updatedCols.push(-3000 - (promptIndex - 1));  // Signal: total cells updated
  }
  else if (tool === ToolType.AutoWrap) {
    // 自动断行：结果输出到右侧相邻列，原文保持不变
    const width = options.lineWidth || 18;

    // 找出有内容的源列，从右往左处理（避免列偏移）
    const sourceColsWithContent: Set<number> = new Set();
    for (let c = minC; c <= maxC; c++) {
      for (let r = minR; r <= maxR; r++) {
        if ((newGrid[r]?.[c] || '').trim()) {
          sourceColsWithContent.add(c);
          break;
        }
      }
    }

    const sortedSrcCols = Array.from(sourceColsWithContent).sort((a, b) => b - a);
    for (const srcCol of sortedSrcCols) {
      for (let r = minR; r <= maxR; r++) {
        if (!newGrid[r]) newGrid[r] = [];
        const val = newGrid[r][srcCol] || '';
        while (newGrid[r].length <= srcCol + 1) newGrid[r].push('');
        newGrid[r][srcCol + 1] = val.trim() ? autoWrapText(val, width) : '';
      }
      if (!updatedCols.includes(srcCol + 1)) updatedCols.push(srcCol + 1);
    }
  }
  else if (tool === ToolType.ArrangeParallel) {
    // 自动排列排比句：结果输出到右侧相邻列
    const sourceColsWithContent: Set<number> = new Set();
    for (let c = minC; c <= maxC; c++) {
      for (let r = minR; r <= maxR; r++) {
        if ((newGrid[r]?.[c] || '').trim()) {
          sourceColsWithContent.add(c);
          break;
        }
      }
    }

    const sortedSrcCols = Array.from(sourceColsWithContent).sort((a, b) => b - a);
    for (const srcCol of sortedSrcCols) {
      for (let r = minR; r <= maxR; r++) {
        if (!newGrid[r]) newGrid[r] = [];
        const val = newGrid[r][srcCol] || '';
        while (newGrid[r].length <= srcCol + 1) newGrid[r].push('');
        newGrid[r][srcCol + 1] = val.trim() ? arrangeParallelSentences(val) : '';
        if (clearSource) {
          newGrid[r][srcCol] = '';
        }
      }
      if (!updatedCols.includes(srcCol + 1)) updatedCols.push(srcCol + 1);
      if (clearSource && !updatedCols.includes(srcCol)) updatedCols.push(srcCol);
    }
  }
  else if (tool === ToolType.SplitLinesVertical) {
    // 按行竖向拆分：将每个单元格内的多行文本按换行拆开，逐行竖向向下放入单元格中（完整保留所有引号和格式）
    const sourceColsWithContent: Set<number> = new Set();
    for (let c = minC; c <= maxC; c++) {
      for (let r = minR; r <= maxR; r++) {
        if ((newGrid[r]?.[c] || '').trim()) {
          sourceColsWithContent.add(c);
          break;
        }
      }
    }

    const sortedSrcCols = Array.from(sourceColsWithContent).sort((a, b) => b - a);
    let totalLinesSplit = 0;

    for (const srcCol of sortedSrcCols) {
      const targetCol = clearSource ? srcCol : srcCol + 1;
      let targetRow = minR;

      for (let r = minR; r <= maxR; r++) {
        const val = newGrid[r]?.[srcCol] || '';
        if (!val.trim()) continue;

        const lines = val.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) continue;

        if (clearSource && targetCol !== srcCol) {
          newGrid[r][srcCol] = '';
        }

        for (const line of lines) {
          while (!newGrid[targetRow]) newGrid.push([]);
          while (newGrid[targetRow].length <= targetCol) newGrid[targetRow].push('');
          newGrid[targetRow][targetCol] = line;
          targetRow++;
          totalLinesSplit++;
        }
      }

      if (clearSource && targetCol === srcCol) {
        for (let r = targetRow; r <= maxR; r++) {
          if (newGrid[r]?.[srcCol]) {
            newGrid[r][srcCol] = '';
          }
        }
      }

      if (!updatedCols.includes(targetCol)) updatedCols.push(targetCol);
      if (clearSource && !updatedCols.includes(srcCol)) updatedCols.push(srcCol);
    }

    if (totalLinesSplit > 0) {
      updatedCols.push(-7000 - totalLinesSplit);
    }
  }
  else {
    // Split/Prompt Logic:
    // For SplitThree/SplitTwo: Process EACH column in selection, output to its right side
    // For VideoPrompts: Only process leftmost column (special 3-row grouping logic)

    if (tool === ToolType.VideoPrompts) {
      // VideoPrompts: Only use leftmost column, group every 3 valid rows
      const sourceCol = minC;
      updatedCols.push(sourceCol + 1);

      const validRowIndices: number[] = [];
      for (let r = minR; r <= maxR; r++) {
        const val = newGrid[r]?.[sourceCol];
        if (val && val.trim() !== "") {
          validRowIndices.push(r);
        }
      }

      for (let i = 0; i < validRowIndices.length; i += 3) {
        const idx1 = validRowIndices[i];
        const idx2 = validRowIndices[i + 1];
        const idx3 = validRowIndices[i + 2];

        const left = newGrid[idx1][sourceCol] || "";
        const center = idx2 !== undefined ? (newGrid[idx2][sourceCol] || "") : "";
        const right = idx3 !== undefined ? (newGrid[idx3][sourceCol] || "") : "";

        const prompt =
          `16:9 widescreen video in a triple-split screen format showing three screens.\n` +
          `- **Left**: ${left}\n` +
          `- **Center**: ${center}\n` +
          `- **Right**: ${right}`;

        while (newGrid[idx1].length <= sourceCol + 1) newGrid[idx1].push('');
        newGrid[idx1][sourceCol + 1] = prompt;
      }
    }
    else if (tool === ToolType.MultiPanelPrompt) {
      // MultiPanelPrompt: Collect all non-empty cells from leftmost column,
      // generate a fixed-format multi-panel image prompt
      const sourceCol = minC;
      updatedCols.push(sourceCol + 1);

      // Collect all non-empty rows in the source column
      const panelDescriptions: { row: number; text: string }[] = [];
      for (let r = minR; r <= maxR; r++) {
        const val = newGrid[r]?.[sourceCol] || '';
        if (val.trim()) {
          panelDescriptions.push({ row: r, text: val.trim() });
        }
      }

      if (panelDescriptions.length > 0) {
        // Build the formatted prompt
        const totalPanels = panelDescriptions.length;
        const panelLines = panelDescriptions.map((p, i) =>
          `画面${i + 1}：${p.text}`
        );

        const prompt =
          `多画面分割图，下面是每个画面的细节描述：\n\n` +
          panelLines.join('\n\n') +
          `\n\n请根据上述描述，生成多画面图片`;

        // Place the result in the first valid row's adjacent column
        const targetRow = panelDescriptions[0].row;
        while (newGrid[targetRow].length <= sourceCol + 1) newGrid[targetRow].push('');
        newGrid[targetRow][sourceCol + 1] = prompt;

        // Store panel count for status message
        updatedCols.push(-4000 - totalPanels);
      }
    }
    else {
      // SplitThree / SplitTwo: Process EACH selected column that HAS CONTENT
      // 
      // KEY LOGIC:
      // - "Source columns" = columns in selection that HAVE content (not empty)
      // - "Target columns" = empty columns where split results go
      // - When clearSource is enabled, ONLY delete source columns (columns that had content)

      // Step 1: Find which columns in selection actually have content
      const sourceColumnsWithContent: Set<number> = new Set();
      const originalContent: Map<number, string[]> = new Map();

      for (let c = minC; c <= maxC; c++) {
        const colContent: string[] = [];
        let hasAnyContent = false;

        for (let r = minR; r <= maxR; r++) {
          const cellVal = newGrid[r]?.[c] || '';
          colContent.push(cellVal);
          if (cellVal.trim() !== '') {
            hasAnyContent = true;
          }
        }

        // Only mark as source column if it has content
        if (hasAnyContent) {
          sourceColumnsWithContent.add(c);
          originalContent.set(c, colContent);
        }
      }

      // Step 2: Process source columns from RIGHT to LEFT
      const sortedSourceCols = Array.from(sourceColumnsWithContent).sort((a, b) => b - a);
      const resultColumnCount = tool === ToolType.SplitThree ? 3 : 2;

      for (const srcCol of sortedSourceCols) {
        const colOriginal = originalContent.get(srcCol) || [];

        // Protect the next occupied column. Existing empty columns are reused;
        // when the gap is too small, insert only the missing columns and shift
        // every row to the right before writing split results.
        const maxColumnCount = Math.max(0, ...newGrid.map(row => row.length));
        let nextOccupiedCol = -1;
        for (let c = srcCol + 1; c < maxColumnCount; c++) {
          if (newGrid.some(row => (row[c] || '').trim() !== '')) {
            nextOccupiedCol = c;
            break;
          }
        }
        if (nextOccupiedCol >= 0) {
          const availableEmptyCols = nextOccupiedCol - srcCol - 1;
          const missingCols = Math.max(0, resultColumnCount - availableEmptyCols);
          if (missingCols > 0) {
            newGrid.forEach(row => row.splice(nextOccupiedCol, 0, ...Array(missingCols).fill('')));
            for (let index = 0; index < updatedCols.length; index++) {
              if (updatedCols[index] >= nextOccupiedCol) updatedCols[index] += missingCols;
            }
            columnInsertions.push({ at: nextOccupiedCol, count: missingCols });
          }
        }

        for (let r = minR; r <= maxR; r++) {
          if (!newGrid[r]) newGrid[r] = [];
          const cellContent = colOriginal[r - minR] || '';

          if (tool === ToolType.SplitThree) {
            const res = splitThreeParts(cellContent);
            while (newGrid[r].length <= srcCol + 3) newGrid[r].push('');
            newGrid[r][srcCol + 1] = res.title;
            newGrid[r][srcCol + 2] = res.content;
            newGrid[r][srcCol + 3] = res.ending;
            if (!updatedCols.includes(srcCol + 1)) updatedCols.push(srcCol + 1);
            if (!updatedCols.includes(srcCol + 2)) updatedCols.push(srcCol + 2);
            if (!updatedCols.includes(srcCol + 3)) updatedCols.push(srcCol + 3);
          }
          else if (tool === ToolType.SplitTwo) {
            const res = splitTwoParts(cellContent);
            while (newGrid[r].length <= srcCol + 2) newGrid[r].push('');
            newGrid[r][srcCol + 1] = res.title;
            newGrid[r][srcCol + 2] = res.content;
            if (!updatedCols.includes(srcCol + 1)) updatedCols.push(srcCol + 1);
            if (!updatedCols.includes(srcCol + 2)) updatedCols.push(srcCol + 2);
          }
          else if (tool === ToolType.SmartSplit) {
            const res = smartSplitTwoParts(cellContent);
            while (newGrid[r].length <= srcCol + 2) newGrid[r].push('');
            newGrid[r][srcCol + 1] = res.title;
            newGrid[r][srcCol + 2] = res.content;
            if (!updatedCols.includes(srcCol + 1)) updatedCols.push(srcCol + 1);
            if (!updatedCols.includes(srcCol + 2)) updatedCols.push(srcCol + 2);
          }
        }
      }

      // Step 3: If clearSource, ONLY delete columns that originally had content
      if (clearSource) {
        for (const srcCol of sourceColumnsWithContent) {
          for (let r = minR; r <= maxR; r++) {
            if (newGrid[r]) {
              newGrid[r][srcCol] = '';
            }
          }
          if (!updatedCols.includes(srcCol)) updatedCols.push(srcCol);
        }
      }
    }
  }

  return { newGrid, updatedCols: Array.from(new Set(updatedCols)), columnInsertions };
};

// --- Clipboard Helpers ---

export const parsePasteData = (text: string): string[][] => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuote = false;

  // Spreadsheets only quote cells when they contain tabs, line breaks, or
  // escaped quotes. Normal copy (e.g. from text editor or LLM) often starts
  // and ends with quotes on a single line; do not strip those quotes unless
  // there are inner newlines/tabs or TSV-escaped quotes ("").
  const startsQuotedCell = (start: number): boolean => {
    let hasInnerNewlineOrTab = false;
    let hasEscapedQuote = false;

    for (let index = start + 1; index < text.length; index++) {
      const ch = text[index];
      if (ch === '\n' || ch === '\r' || ch === '\t') {
        hasInnerNewlineOrTab = true;
      }
      if (ch !== '"') continue;

      // CSV-style escaped quote: keep looking for the real closing quote.
      if (text[index + 1] === '"') {
        hasEscapedQuote = true;
        index++;
        continue;
      }

      const afterQuote = text[index + 1];
      const isClosingQuote = afterQuote === undefined || afterQuote === '\t' || afterQuote === '\r' || afterQuote === '\n';
      if (isClosingQuote) {
        return hasInnerNewlineOrTab || hasEscapedQuote;
      }
    }
    return false;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (insideQuote) {
      if (char === '"') {
        if (nextChar === '"') {
          currentCell += '"';
          i++;
        } else {
          insideQuote = false;
        }
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"' && currentCell === '' && startsQuotedCell(i)) {
        insideQuote = true;
      } else if (char === '\t') {
        currentRow.push(currentCell);
        currentCell = '';
      } else if (char === '\r' || char === '\n') {
        if (char === '\r' && nextChar === '\n') i++;
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
  }

  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  if (rows.length > 0) {
    const lastRow = rows[rows.length - 1];
    if (lastRow.length === 1 && lastRow[0] === '') {
      rows.pop();
    }
  }

  return rows;
};

export const formatForClipboard = (grid: GridData): string => {
  return grid.map(row => {
    return row.map(cell => {
      if (cell === null || cell === undefined) return '';
      if (/[\t\n\r"]/.test(cell)) {
        const escaped = cell.replace(/"/g, '""');
        return `"${escaped}"`;
      }
      return cell;
    }).join('\t');
  }).join('\n');
};

export interface ParsePreSplitOptions {
  stripQuotes?: boolean;
  stripNumbering?: boolean;
  skipEmptyLines?: boolean;
}

/**
 * 解析并清洗已拆分好的多行文案（如 Google Sheets 复制的内容、带序号或引号的分镜）
 */
export function parsePreSplitText(rawText: string, options: ParsePreSplitOptions = {}): string[] {
  const {
    stripQuotes = true,
    stripNumbering = false,
    skipEmptyLines = true
  } = options;

  if (!rawText) return [];

  let normalized = rawText.replace(/\r\n?/g, '\n');

  // 处理整个多行块被单一双引号包裹的情况（Google Sheets 单单元格多行复制格式）
  if (stripQuotes) {
    const trimmed = normalized.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
      const firstLine = trimmed.split('\n')[0].trim();
      // 仅当第一行未闭合双引号时，才说明整个块跨行被最外层引号包裹
      if (!firstLine.endsWith('"') || firstLine.length === 1) {
        const inner = trimmed.slice(1, -1);
        normalized = inner.replace(/""/g, '"');
      }
    }
  }

  const lines = normalized.split('\n');
  const result: string[] = [];

  for (const rawLine of lines) {
    let line = rawLine.trim();

    if (skipEmptyLines && !line) {
      continue;
    }

    if (stripQuotes) {
      // 去除每行首尾多余的双引号或单引号
      if (line.length >= 2 && line.startsWith('"') && line.endsWith('"')) {
        line = line.slice(1, -1).trim();
      } else if (line.length >= 2 && line.startsWith("'") && line.endsWith("'")) {
        line = line.slice(1, -1).trim();
      }
      // 还原 CSV 转义引号
      line = line.replace(/""/g, '"');
    }

    if (stripNumbering) {
      // 去除行首序号：1. / 1、 / [1] / (1) / 1- / #1 等
      line = line.replace(/^(\d+[\.、\s\-\)\]]|\[\d+\]|\(\d+\)|#\d+[:\.\s\-]*)\s*/, '').trim();
    }

    if (!skipEmptyLines || line.length > 0) {
      result.push(line);
    }
  }

  return result;
}

export const MANUAL_SPLIT_MARKER = '⟦拆分点⟧';
export const BATCH_SOURCE_MARKER = '⟦下一篇⟧';

export interface ParsedScriptBatchItem {
  id: string;
  title: string;
  sourceText: string;
  template?: string;
  segments: string[];
}

export interface ParseMultiScriptOptions extends ParsePreSplitOptions {
  direction?: 'auto' | 'rows' | 'columns';
  hasHeaderRow?: boolean;
  scriptColIndex?: number;
  titleColIndex?: number;
  templateColIndex?: number;
}

export interface SheetTableAnalysis {
  isTable: boolean;
  rowCount: number;
  colCount: number;
  hasHeader: boolean;
  headers: string[];
  scriptColIndex: number;
  titleColIndex: number;
  templateColIndex: number;
  isMultiScript: boolean;
  scriptCount: number;
  totalSegments: number;
}

const HEADER_KEYWORDS = [
  '序号', '编号', 'id', 'index', 'no', '#',
  '分镜', '文案', '台词', '剧本', '段落', '内容', '脚本', 'script', 'content', 'text', 'scene',
  '提示词', '描述词', '模版', '模板', 'prompt', 'template',
  '标题', '篇章', '集数', 'title', 'episode', 'chapter',
  '图片', '画面', 'image', 'visual'
];

/**
 * 分析来自 Google Sheets / Excel 的剪贴板表格结构
 */
export function analyzeSheetTable(
  rawText: string,
  options: ParseMultiScriptOptions = {}
): SheetTableAnalysis {
  if (!rawText.trim()) {
    return {
      isTable: false,
      rowCount: 0,
      colCount: 0,
      hasHeader: false,
      headers: [],
      scriptColIndex: 0,
      titleColIndex: -1,
      templateColIndex: -1,
      isMultiScript: false,
      scriptCount: 0,
      totalSegments: 0
    };
  }

  const rawRows = parsePasteData(rawText);
  const rows = rawRows.filter(r => r.some(c => (c || '').trim()));

  if (rows.length === 0) {
    return {
      isTable: false,
      rowCount: 0,
      colCount: 0,
      hasHeader: false,
      headers: [],
      scriptColIndex: 0,
      titleColIndex: -1,
      templateColIndex: -1,
      isMultiScript: false,
      scriptCount: 0,
      totalSegments: 0
    };
  }

  const colCount = Math.max(...rows.map(r => r.length), 1);
  const isTable = rows.length > 1 || colCount > 1;

  // 1. 表头识别
  let hasHeader = false;
  if (options.hasHeaderRow !== undefined) {
    hasHeader = options.hasHeaderRow;
  }

  const headers = hasHeader ? rows[0].map(c => (c || '').trim()) : [];
  const dataRows = hasHeader ? rows.slice(1) : rows;

  if (dataRows.length === 0) {
    return {
      isTable,
      rowCount: rows.length,
      colCount,
      hasHeader,
      headers,
      scriptColIndex: 0,
      titleColIndex: -1,
      templateColIndex: -1,
      isMultiScript: false,
      scriptCount: 0,
      totalSegments: 0
    };
  }

  // 2. 分析每列的数据特征
  interface ColStats {
    index: number;
    avgLen: number;
    multiLineCount: number;
    numericRatio: number;
    hasPromptKeywords: boolean;
  }

  const colStats: ColStats[] = [];
  for (let c = 0; c < colCount; c++) {
    const cells = dataRows.map(r => (r[c] || '').trim()).filter(Boolean);
    const avgLen = cells.length > 0 ? cells.reduce((s, v) => s + v.length, 0) / cells.length : 0;
    const multiLineCount = cells.filter(v => v.includes('\n')).length;
    const numericCount = cells.filter(v => /^(\d+|#\d+|第?\d+[集话幕]?|scene\s*\d+|[①-⑳])$/i.test(v)).length;
    const numericRatio = cells.length > 0 ? numericCount / cells.length : 0;
    const hasPromptKeywords = cells.some(v => v.includes('{{内容}}') || v.includes('{{content}}') || /masterpiece|cinematic|prompt/i.test(v));

    colStats.push({
      index: c,
      avgLen,
      multiLineCount,
      numericRatio,
      hasPromptKeywords
    });
  }

  // 3. 确定 文案列 (scriptColIndex)
  let scriptColIndex = options.scriptColIndex ?? -1;
  if (scriptColIndex < 0 || scriptColIndex >= colCount) {
    // 优先选择包含单元格内换行符最多的列
    const multiLineCols = colStats.filter(c => c.multiLineCount > 0);
    if (multiLineCols.length > 0) {
      multiLineCols.sort((a, b) => b.multiLineCount - a.multiLineCount || b.avgLen - a.avgLen);
      scriptColIndex = multiLineCols[0].index;
    } else {
      // 排除纯序号列，选择平均文本长度最大的列
      const nonNumericCols = colStats.filter(c => c.numericRatio < 0.6);
      if (nonNumericCols.length > 0) {
        nonNumericCols.sort((a, b) => b.avgLen - a.avgLen);
        scriptColIndex = nonNumericCols[0].index;
      } else {
        colStats.sort((a, b) => b.avgLen - a.avgLen);
        scriptColIndex = colStats[0]?.index ?? 0;
      }
    }
  }

  // 4. 确定 标题列 (titleColIndex) 与 模版列 (templateColIndex)
  let titleColIndex = options.titleColIndex ?? -1;
  let templateColIndex = options.templateColIndex ?? -1;

  if (titleColIndex < 0) {
    // 在文案列之前的非纯序号列，作为标题候选
    const candidateTitles = colStats.filter(c => c.index !== scriptColIndex && c.index < scriptColIndex && c.numericRatio < 0.8 && c.avgLen < 120);
    if (candidateTitles.length > 0) {
      titleColIndex = candidateTitles[0].index;
    }
  }

  if (templateColIndex < 0) {
    // 包含提示词占位符或在文案列之后的列
    const candidateTemplates = colStats.filter(c => c.index !== scriptColIndex && c.index !== titleColIndex && (c.hasPromptKeywords || c.index > scriptColIndex));
    if (candidateTemplates.length > 0) {
      templateColIndex = candidateTemplates[0].index;
    }
  }

  // 5. 判断是否属于多篇文案
  const scriptStats = colStats.find(c => c.index === scriptColIndex);
  let isMultiScript = false;
  let scriptCount = 1;

  if (options.direction === 'columns') {
    isMultiScript = colCount > 1;
    scriptCount = colCount;
  } else {
    // 单列多单元格是“每个单元格一篇”，即使其中的文案尚未换行；多列时仍以
    // 单元格内已有多行分镜作为多篇的判定条件。
    if (dataRows.length > 1 && (colCount === 1 || (scriptStats?.multiLineCount || 0) > 0)) {
      isMultiScript = true;
      scriptCount = dataRows.filter(r => (r[scriptColIndex] || '').trim()).length;
    } else {
      isMultiScript = false;
      scriptCount = 1;
    }
  }

  // 计算总分镜段落估算
  let totalSegments = 0;
  if (isMultiScript) {
    for (const r of dataRows) {
      const cellText = r[scriptColIndex] || '';
      if (cellText.trim()) {
        const segs = parsePreSplitText(cellText, options);
        totalSegments += segs.length;
      }
    }
  } else {
    if (dataRows.length > 1 && (scriptStats?.multiLineCount || 0) === 0) {
      totalSegments = dataRows.filter(r => (r[scriptColIndex] || '').trim()).length;
    } else {
      const cellText = dataRows[0]?.[scriptColIndex] || rawText;
      totalSegments = parsePreSplitText(cellText, options).length;
    }
  }

  return {
    isTable,
    rowCount: rows.length,
    colCount,
    hasHeader,
    headers,
    scriptColIndex,
    titleColIndex,
    templateColIndex,
    isMultiScript,
    scriptCount,
    totalSegments
  };
}

/**
 * 支持从 Google Sheets 一次性粘贴多篇已拆好文案（多行单元格）或单篇多段
 */
export function parseMultiScriptPreSplit(
  rawText: string,
  options: ParseMultiScriptOptions = {}
): ParsedScriptBatchItem[] {
  if (!rawText.trim()) return [];

  // 如果包含明确的下一篇标记
  if (rawText.includes(BATCH_SOURCE_MARKER)) {
    const rawBatches = rawText.split(BATCH_SOURCE_MARKER);
    return rawBatches
      .map(b => b.trim())
      .filter(Boolean)
      .map((batchStr, idx) => {
        const segs = parsePreSplitText(batchStr, options);
        return {
          id: `script-${Date.now()}-${idx}`,
          title: `篇章 #${idx + 1}`,
          sourceText: segs.join(`\n${MANUAL_SPLIT_MARKER}\n`),
          segments: segs
        };
      })
      .filter(item => item.segments.length > 0);
  }

  // 使用智能表格分析
  const analysis = analyzeSheetTable(rawText, options);
  const rawRows = parsePasteData(rawText);
  const rows = rawRows.filter(r => r.some(c => (c || '').trim()));
  const dataRows = analysis.hasHeader ? rows.slice(1) : rows;

  if (dataRows.length === 0) return [];

  // 1. 如果用户选择“按列解析”（每列是一篇不同的文案）
  if (options.direction === 'columns' && analysis.colCount > 1) {
    const results: ParsedScriptBatchItem[] = [];
    for (let c = 0; c < analysis.colCount; c++) {
      const colTitle = analysis.headers[c] || `篇章 #${c + 1}`;
      const colTexts = dataRows.map(r => r[c] || '').filter(t => t.trim());
      const segs = parsePreSplitText(colTexts.join('\n'), options);
      if (segs.length > 0) {
        results.push({
          id: `script-col-${Date.now()}-${c}`,
          title: colTitle,
          sourceText: segs.join(`\n${MANUAL_SPLIT_MARKER}\n`),
          segments: segs
        });
      }
    }
    return results;
  }

  // 2. 识别到多篇文案（表格每行是一篇，单元格内有换行段落）
  if (analysis.isMultiScript) {
    return dataRows
      .filter(r => (r[analysis.scriptColIndex] || '').trim())
      .map((row, idx) => {
        const scriptSource = row[analysis.scriptColIndex] || '';
        const rawTitle = analysis.titleColIndex >= 0 ? (row[analysis.titleColIndex] || '').trim() : '';
        const cleanTitle = rawTitle.replace(/^["']|["']$/g, '').trim();
        const title = cleanTitle || `篇章 #${idx + 1}`;
        const customTemplate = analysis.templateColIndex >= 0 ? (row[analysis.templateColIndex] || '').trim() : undefined;
        const segs = parsePreSplitText(scriptSource, options);

        return {
          id: `script-${Date.now()}-${idx}`,
          title,
          sourceText: segs.join(`\n${MANUAL_SPLIT_MARKER}\n`),
          template: customTemplate || undefined,
          segments: segs
        };
      })
      .filter(item => item.segments.length > 0);
  }

  // 3. 否则属于单篇文案：
  // 3A. 如果是多行表格但每格无内部换行：表示选中的是“一列多行作为同一篇的分镜”
  if (dataRows.length > 1) {
    const segTexts = dataRows
      .map(r => r[analysis.scriptColIndex] || '')
      .filter(t => t.trim());
    const segs = parsePreSplitText(segTexts.join('\n'), options);
    if (segs.length > 0) {
      return [{
        id: `script-${Date.now()}-0`,
        title: analysis.headers[analysis.scriptColIndex] || '文案 #1',
        sourceText: segs.join(`\n${MANUAL_SPLIT_MARKER}\n`),
        segments: segs
      }];
    }
  }

  // 3B. 单个单元格或纯文本：按换行符拆分为单篇分镜
  const cellText = dataRows[0]?.[analysis.scriptColIndex] || rawText;
  const segs = parsePreSplitText(cellText, options);
  if (segs.length === 0) return [];

  return [{
    id: `script-${Date.now()}-0`,
    title: '文案 #1',
    sourceText: segs.join(`\n${MANUAL_SPLIT_MARKER}\n`),
    segments: segs
  }];
}

// ==========================================
// 8-Second Speech / Preaching Voiceover Splitting & Number Conversion
// ==========================================

const ONES_WORDS = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'
];

const TENS_WORDS = [
  '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'
];

const ORDINAL_MAP: Record<string, string> = {
  one: 'first',
  two: 'second',
  three: 'third',
  four: 'fourth',
  five: 'fifth',
  six: 'sixth',
  seven: 'seventh',
  eight: 'eighth',
  nine: 'ninth',
  ten: 'tenth',
  eleven: 'eleventh',
  twelve: 'twelfth',
  thirteen: 'thirteenth',
  fourteen: 'fourteenth',
  fifteen: 'fifteenth',
  sixteen: 'sixteenth',
  seventeen: 'seventeenth',
  eighteen: 'eighteenth',
  nineteen: 'nineteenth',
  twenty: 'twentieth',
  thirty: 'thirtieth',
  forty: 'fortieth',
  fifty: 'fiftieth',
  sixty: 'sixtieth',
  seventy: 'seventieth',
  eighty: 'eightieth',
  ninety: 'ninetieth'
};

export function integerToEnglishWords(n: number): string {
  if (isNaN(n)) return '';
  if (n === 0) return 'zero';
  if (n < 0) return 'negative ' + integerToEnglishWords(Math.abs(n));

  // Natural spoken pronunciation for common 4-digit years (1100 - 1999)
  if (n >= 1100 && n <= 1999 && n % 100 !== 0) {
    const century = Math.floor(n / 100);
    const rem = n % 100;
    const centuryWord = ONES_WORDS[century] || '';
    const remWord = rem < 20
      ? ONES_WORDS[rem]
      : `${TENS_WORDS[Math.floor(rem / 10)]}${rem % 10 > 0 ? '-' + ONES_WORDS[rem % 10] : ''}`;
    return `${centuryWord} ${remWord}`.trim();
  }

  let words = '';

  if (Math.floor(n / 1_000_000_000) > 0) {
    words += integerToEnglishWords(Math.floor(n / 1_000_000_000)) + ' billion ';
    n %= 1_000_000_000;
  }

  if (Math.floor(n / 1_000_000) > 0) {
    words += integerToEnglishWords(Math.floor(n / 1_000_000)) + ' million ';
    n %= 1_000_000;
  }

  if (Math.floor(n / 1_000) > 0) {
    words += integerToEnglishWords(Math.floor(n / 1_000)) + ' thousand ';
    n %= 1_000;
  }

  if (Math.floor(n / 100) > 0) {
    words += ONES_WORDS[Math.floor(n / 100)] + ' hundred ';
    n %= 100;
  }

  if (n > 0) {
    if (n < 20) {
      words += ONES_WORDS[n];
    } else {
      const ten = Math.floor(n / 10);
      const one = n % 10;
      words += TENS_WORDS[ten] + (one > 0 ? '-' + ONES_WORDS[one] : '');
    }
  }

  return words.trim();
}

export function integerToOrdinalWords(n: number): string {
  const cardinal = integerToEnglishWords(n);
  const parts = cardinal.split(/([ -])/);
  const lastWord = parts[parts.length - 1];

  if (ORDINAL_MAP[lastWord]) {
    parts[parts.length - 1] = ORDINAL_MAP[lastWord];
  } else if (lastWord.endsWith('y')) {
    parts[parts.length - 1] = lastWord.slice(0, -1) + 'ieth';
  } else if (lastWord.endsWith('hundred') || lastWord.endsWith('thousand') || lastWord.endsWith('million') || lastWord.endsWith('billion')) {
    parts[parts.length - 1] = lastWord + 'th';
  } else {
    parts[parts.length - 1] = lastWord + 'th';
  }
  return parts.join('');
}

/**
 * 将文案中所有阿拉伯数字转换为自然英文单词：
 * - 圣经章节与时间 (3:16 -> three sixteen, 3:16-18 -> three sixteen to eighteen)
 * - 序数词 (1st -> first, 2nd -> second, 3rd -> third, 21st -> twenty-first)
 * - 货币金额 ($50 -> fifty dollars, $1 -> one dollar)
 * - 百分比 (50% -> fifty percent)
 * - 小数 (3.5 -> three point five)
 * - 大数字与千分位 (1,000 -> one thousand, 250,000 -> two hundred fifty thousand)
 * - 普通整数 (24 -> twenty-four, 7 -> seven)
 */
export function convertNumbersToEnglishWords(text: string): string {
  if (!text) return '';

  let res = text;

  // 1. 圣经章节 / 时间格式: 如 John 3:16 -> John three sixteen, 3:16-18 -> three sixteen to eighteen
  res = res.replace(/\b(\d+):(\d+)(?:-(\d+))?\b/g, (_m, c, v, vEnd) => {
    const chap = integerToEnglishWords(parseInt(c, 10));
    const verse = integerToEnglishWords(parseInt(v, 10));
    if (vEnd) {
      const verseEnd = integerToEnglishWords(parseInt(vEnd, 10));
      return `${chap} ${verse} to ${verseEnd}`;
    }
    return `${chap} ${verse}`;
  });

  // 2. 序数词: 1st, 2nd, 3rd, 4th, 21st, 100th 等
  res = res.replace(/\b(\d+)(st|nd|rd|th)\b/gi, (_m, numStr) => {
    const num = parseInt(numStr, 10);
    return integerToOrdinalWords(num);
  });

  // 3. 货币金额: $50, $1, $1,000, $25.50
  res = res.replace(/\$([0-9,]+(?:\.[0-9]+)?)\b/g, (_m, numStr) => {
    const cleanNum = parseFloat(numStr.replace(/,/g, ''));
    if (isNaN(cleanNum)) return _m;
    if (Number.isInteger(cleanNum)) {
      return `${integerToEnglishWords(cleanNum)} ${cleanNum === 1 ? 'dollar' : 'dollars'}`;
    }
    const intPart = Math.floor(cleanNum);
    const decPart = Math.round((cleanNum - intPart) * 100);
    return `${integerToEnglishWords(intPart)} dollars and ${integerToEnglishWords(decPart)} cents`;
  });

  // 4. 百分比: 50%, 99.5%
  res = res.replace(/\b([0-9,]+(?:\.[0-9]+)?)\s*%/g, (_m, numStr) => {
    const cleanNum = parseFloat(numStr.replace(/,/g, ''));
    if (isNaN(cleanNum)) return _m;
    if (Number.isInteger(cleanNum)) {
      return `${integerToEnglishWords(cleanNum)} percent`;
    }
    const [intStr, decStr] = numStr.split('.');
    const decWords = (decStr || '').split('').map(d => ONES_WORDS[parseInt(d, 10)] || 'zero').join(' ');
    return `${integerToEnglishWords(parseInt(intStr.replace(/,/g, ''), 10))} point ${decWords} percent`;
  });

  // 5. 小数: 3.5 -> three point five
  res = res.replace(/\b(\d+)\.(\d+)\b/g, (_m, intPart, decPart) => {
    const intWords = integerToEnglishWords(parseInt(intPart, 10));
    const decWords = decPart.split('').map((d: string) => ONES_WORDS[parseInt(d, 10)] || 'zero').join(' ');
    return `${intWords} point ${decWords}`;
  });

  // 6. 带千分位逗号的整数: 1,000 -> one thousand
  res = res.replace(/\b\d{1,3}(?:,\d{3})+\b/g, (m) => {
    const num = parseInt(m.replace(/,/g, ''), 10);
    return isNaN(num) ? m : integerToEnglishWords(num);
  });

  // 7. 普通整数: 24 -> twenty-four, 7 -> seven
  res = res.replace(/\b\d+\b/g, (m) => {
    const num = parseInt(m, 10);
    return isNaN(num) ? m : integerToEnglishWords(num);
  });

  // 清洗多余空格
  return res.replace(/\s+/g, ' ').trim();
}

export interface Split8sOptions {
  quote?: boolean;      // 每一段是否用引号引用，默认 true
  maxWords?: number;    // 英文每段上限（默认 20 词，确保 8s 内必定读完）
  minWords?: number;    // 英文每段下限（默认 14 词，保证信息量并尽量少拆）
  maxChars?: number;    // 中文每段上限（默认 32 字，确保 8s 内必定读完）
  minChars?: number;    // 中文每段下限（默认 22 字）
}

/**
 * 8秒讲道口播自然断句拆分算法：
 * 1. 移除所有换行符，将全文平铺为连续文本流
 * 2. 将所有阿拉伯数字转换为纯英文单词（避免数字朗读跨度问题）
 * 3. 按照人说话讲道的自然语速（130-150词/分，8秒约16-20词）进行分段
 * 4. 贪心策略：优先按 8s 长度拆分，尽量少拆，但严格确保每段在 8s 内能读完（不超过20词）
 * 5. 符合自然讲道说话断句习惯（完整句优先 > 分号破折号 > 逗号 > 连词转折句读，严禁在冠词/介词/代词处断裂）
 * 6. 每段独立一行，每一段均使用双引号包裹
 */
export function splitText8sSermon(rawText: string, options: Split8sOptions = {}): string[] {
  const {
    quote = true,
    maxWords = 20,
    minWords = 14,
    maxChars = 32,
    minChars = 22
  } = options;

  if (!rawText || !rawText.trim()) return [];

  // 1. 移除所有换行符，平铺为空格分隔的连续文本流
  let text = rawText.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

  // 2. 将所有阿拉伯数字替换为自然英文词汇
  text = convertNumbersToEnglishWords(text);

  if (!text) return [];

  // 检测语言倾向（中文字符数 vs 英文单词数）
  const chineseCharMatches = text.match(/[\u4e00-\u9fa5]/g);
  const chineseCharCount = chineseCharMatches ? chineseCharMatches.length : 0;
  const latinWordMatches = text.match(/[a-zA-Z]+/g);
  const latinWordCount = latinWordMatches ? latinWordMatches.length : 0;

  const isChineseDominant = chineseCharCount > latinWordCount;

  // 格式化输出辅助函数：确保每段被双引号包裹且内部引号不冲突
  const formatSegment = (seg: string): string => {
    const clean = seg.replace(/^["'“”«»]+|["'“”«»]+$/g, '').trim();
    if (!clean) return '';
    return quote ? `"${clean}"` : clean;
  };

  // --- 中文 8 秒讲道口播拆分 ---
  if (isChineseDominant) {
    const chars = Array.from(text);
    const results: string[] = [];
    let cur = 0;

    while (cur < chars.length) {
      const remaining = chars.length - cur;
      if (remaining <= maxChars) {
        const seg = chars.slice(cur).join('').trim();
        if (seg) results.push(formatSegment(seg));
        break;
      }

      // 寻找最优断句点 [cur + minChars, cur + maxChars]
      let bestK = cur + maxChars;
      let highestScore = -Infinity;

      const scanStart = Math.max(cur + minChars, cur + 10);
      const scanEnd = Math.min(cur + maxChars, chars.length);

      for (let k = scanStart; k <= scanEnd; k++) {
        const charCount = k - cur;
        const prevChar = chars[k - 1];
        const remainingAfter = chars.length - k;

        let score = charCount * 2.0;

        // 句末标点
        if (['。', '！', '？', '!'].includes(prevChar)) {
          score += 150;
        } else if (['；', '…', '—'].includes(prevChar)) {
          score += 90;
        } else if (['，', '、', ','].includes(prevChar)) {
          score += 60;
        }

        // 连词断句
        const nextTwo = chars.slice(k, k + 2).join('');
        if (['因为', '所以', '但是', '而且', '如果', '那么', '并且', '哪怕', '虽然', '因此'].includes(nextTwo)) {
          score += 45;
        }

        // 避免留出孤儿尾巴（少于6个字）
        if (remainingAfter > 0 && remainingAfter < 6) {
          score -= 80;
        }

        if (score > highestScore) {
          highestScore = score;
          bestK = k;
        }
      }

      const seg = chars.slice(cur, bestK).join('').trim();
      if (seg) results.push(formatSegment(seg));
      cur = bestK;
    }

    return results.filter(Boolean);
  }

  // --- 英文 8 秒讲道口播拆分 ---
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const results: string[] = [];
  let cur = 0;

  const SPOKEN_CONJUNCTIONS = new Set([
    'and', 'but', 'because', 'so', 'for', 'yet', 'that', 'which', 'who', 'whom', 'whose',
    'where', 'when', 'while', 'as', 'since', 'although', 'though', 'even', 'if', 'unless',
    'until', 'or', 'nor', 'then', 'therefore', 'moreover', 'furthermore'
  ]);

  const PREACHING_DISCOURSE_MARKERS = new Set([
    'remember', 'notice', 'listen', 'look', 'behold', 'now', 'today', 'indeed', 'truly', 'amen'
  ]);

  const PREPOSITIONS = new Set([
    'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'into', 'through', 'about', 'over', 'under', 'upon'
  ]);

  while (cur < words.length) {
    const remaining = words.length - cur;

    // 若剩余词数在 8s 安全上限内（<= 20词），且不会超长，直接收拢为最后一段
    if (remaining <= maxWords) {
      const seg = words.slice(cur).join(' ').trim();
      if (seg) results.push(formatSegment(seg));
      break;
    }

    // 贪心搜索区间：尽量少拆，向 18-20 词靠拢，但严格不超过 maxWords (20词)
    // 允许在 8 词以上若遇到完整句终点或重点冒号/破折号时优雅断句，避免把下一句的开头截断为怪异短句
    const scanStart = Math.max(cur + 8, cur + 1);
    const scanEnd = Math.min(cur + maxWords, words.length);

    let bestK = Math.min(cur + maxWords, words.length);
    let highestScore = -Infinity;

    for (let k = scanStart; k <= scanEnd; k++) {
      const wordCount = k - cur;
      const prevWord = words[k - 1];
      const nextWord = words[k] || '';
      const remainingAfter = words.length - k;

      const cleanPrev = prevWord.replace(/^['"(“]+|['")”]+$/g, '');
      const lastChar = cleanPrev.slice(-1);
      const secondLast = cleanPrev.slice(-2, -1);
      const isSentenceEnd = ['.', '!', '?'].includes(lastChar) || (['.', '!', '?'].includes(secondLast) && ['"', "'"].includes(lastChar));
      const isMajorPause = [';', ':', '—'].includes(lastChar) || cleanPrev.endsWith('--');
      const isComma = lastChar === ',';

      // 若词数小于 13 词，仅在句末标点或意群大停顿（: ; —）处允许断句；禁止在逗号或普通连词处过早断开
      if (wordCount < 13 && !isSentenceEnd && !isMajorPause) {
        continue;
      }

      // 长度贪心加分（越接近 18-20 词，分段越少，8s 利用率越充分）
      let score = wordCount * 2.5;

      if (isSentenceEnd) {
        score += 180; // 完整句子终止，讲道呼吸停顿最佳点
      } else if (isMajorPause) {
        score += 130; // 意群大停顿
      } else if (isComma) {
        score += 65;  // 逗号从句呼吸停顿
      }

      // 后词开始的自然口语连词或逻辑转换词
      const cleanNext = nextWord.toLowerCase().replace(/^['"(“]+/, '').replace(/[',"!?:;]+$/, '');
      if (SPOKEN_CONJUNCTIONS.has(cleanNext)) {
        score += 48; // "and...", "because...", "so that..."
      } else if (PREACHING_DISCOURSE_MARKERS.has(cleanNext)) {
        score += 42; // "remember...", "listen..."
      } else if (PREPOSITIONS.has(cleanNext)) {
        score += 24; // 介词短语起始
      }

      // 语法自然度惩罚（杜绝机械硬切产生口播怪异感）：
      const cleanPrevLower = cleanPrev.toLowerCase().replace(/^[^\w]+|[^\w]+$/g, '');

      // 1. 绝不在冠词处截断 (e.g. "...in the")
      if (['the', 'a', 'an'].includes(cleanPrevLower)) {
        score -= 300;
      }
      // 2. 绝不在悬空介词处截断 (e.g. "...walk with", "...heart of")
      if (['of', 'in', 'to', 'for', 'with', 'by', 'at', 'on', 'from', 'into', 'about', 'upon'].includes(cleanPrevLower)) {
        score -= 250;
      }
      // 3. 绝不在悬空连词处截断 (连词应作为下一句气口的开始，而不是上一句的尾巴)
      if (['and', 'but', 'or', 'so', 'because', 'that', 'which'].includes(cleanPrevLower)) {
        score -= 200;
      }
      // 4. 绝不在未接谓语的主格代词处截断
      if (['i', 'we', 'he', 'she', 'they', 'you', 'it', 'my', 'our', 'his', 'her', 'their', 'your'].includes(cleanPrevLower)) {
        score -= 150;
      }
      // 5. 避免在末尾留下小于 5 个词的孤儿尾巴
      if (remainingAfter > 0 && remainingAfter < 5) {
        score -= 90;
      }

      if (score > highestScore) {
        highestScore = score;
        bestK = k;
      }
    }

    const seg = words.slice(cur, bestK).join(' ').trim();
    if (seg) results.push(formatSegment(seg));
    cur = bestK;
  }

  return results.filter(Boolean);
}
