import { CONTENT_PLACEHOLDER, QUOTED_CONTENT_PLACEHOLDER } from '../constants/presetDefaults';

export interface ParsedSheetPreset {
  id: string;
  name: string;
  template: string;
  category?: string;
  originalTemplate: string;
  insertionType: 'already-present' | 'empty-line' | 'line-break' | 'appended';
}

/**
 * Automatically find the first empty line or line break in a template string,
 * and insert the content placeholder {{内容}} or "{{内容}}".
 */
export function detectAndInsertPlaceholder(
  template: string,
  placeholder = QUOTED_CONTENT_PLACEHOLDER
): {
  template: string;
  insertionType: 'already-present' | 'empty-line' | 'line-break' | 'appended';
} {
  if (!template) {
    return { template: placeholder, insertionType: 'appended' };
  }
  if (template.includes(CONTENT_PLACEHOLDER)) {
    return { template, insertionType: 'already-present' };
  }

  // 1. First priority: First empty line (2 or more newlines with optional whitespace in between)
  const emptyLineRegex = /(\r?\n\s*\r?\n)/;
  const emptyLineMatch = template.match(emptyLineRegex);

  if (emptyLineMatch && emptyLineMatch.index !== undefined) {
    const before = template.slice(0, emptyLineMatch.index).trimEnd();
    const after = template.slice(emptyLineMatch.index + emptyLineMatch[0].length).trimStart();
    const res = before && after
      ? `${before}\n${placeholder}\n${after}`
      : before
        ? `${before}\n${placeholder}`
        : `${placeholder}\n${after}`;
    return { template: res, insertionType: 'empty-line' };
  }

  // 2. Second priority: First line break (single newline)
  const lineBreakRegex = /(\r?\n)/;
  const lineBreakMatch = template.match(lineBreakRegex);

  if (lineBreakMatch && lineBreakMatch.index !== undefined) {
    const before = template.slice(0, lineBreakMatch.index).trimEnd();
    const after = template.slice(lineBreakMatch.index + lineBreakMatch[0].length).trimStart();
    const res = before && after
      ? `${before}\n${placeholder}\n${after}`
      : before
        ? `${before}\n${placeholder}`
        : `${placeholder}\n${after}`;
    return { template: res, insertionType: 'line-break' };
  }

  // 3. Fallback: No line breaks found, append to the end
  return {
    template: `${template.trim()} ${placeholder}`,
    insertionType: 'appended'
  };
}

export function insertPlaceholderAtFirstBreak(
  template: string,
  placeholder = QUOTED_CONTENT_PLACEHOLDER
): string {
  return detectAndInsertPlaceholder(template, placeholder).template;
}

/**
 * Standard TSV parser respecting RFC 4180 quotes used by Google Sheets.
 * When cells in Google Sheets contain newlines, they are surrounded with quotes:
 * Example: "Preset Name"\t"Line 1\n\nLine 2"
 */
export function parseTsvWithQuotes(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        currentField += '"';
        i += 2;
        continue;
      } else {
        inQuotes = !inQuotes;
        i++;
        continue;
      }
    }

    if (!inQuotes && char === '\t') {
      currentRow.push(currentField);
      currentField = '';
      i++;
      continue;
    }

    if (!inQuotes && (char === '\r' || char === '\n')) {
      if (char === '\r' && text[i + 1] === '\n') {
        i++;
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
      i++;
      continue;
    }

    currentField += char;
    i++;
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Parses raw text copied from Google Sheets into structured TemplatePreset items.
 * Specifically configured for:
 *   Column 1 (第1列): 预设名称
 *   Column 2 (第2列): 预设内容 (自动在第一个空行/断行处插入 {{内容}})
 */
export function parseGoogleSheetsPresets(
  rawText: string,
  options: {
    autoInsertPlaceholder?: boolean;
    useQuotedPlaceholder?: boolean;
    defaultCategory?: string;
  } = {}
): ParsedSheetPreset[] {
  const {
    autoInsertPlaceholder = true,
    useQuotedPlaceholder = true,
    defaultCategory = '表格导入'
  } = options;

  const placeholder = useQuotedPlaceholder ? QUOTED_CONTENT_PLACEHOLDER : CONTENT_PLACEHOLDER;
  const rows = parseTsvWithQuotes(rawText.trim());
  const results: ParsedSheetPreset[] = [];

  rows.forEach((row, index) => {
    // Filter out completely blank rows
    if (!row.length || (row.length === 1 && !row[0].trim())) return;

    let category = defaultCategory;
    let name = '';
    let rawTemplate = '';

    if (row.length === 1) {
      // If only 1 column was copied, treat it as template, or see if it has a delimiter
      const line = row[0].trim();
      rawTemplate = line;
      name = `表格预设 ${index + 1}`;
    } else if (row.length === 2) {
      // 2 columns: Column 1 = Name, Column 2 = Template
      name = row[0].trim();
      rawTemplate = row[1].trim();
    } else {
      // 3 or more columns: Column 1 = Category, Column 2 = Name, Column 3 = Template
      category = row[0].trim() || defaultCategory;
      name = row[1].trim();
      rawTemplate = row[2].trim();
    }

    // Edge case: if template was empty but name had text
    if (!rawTemplate && name) {
      rawTemplate = name;
      name = `表格预设 ${index + 1}`;
    }

    if (!rawTemplate) return;

    let finalTemplate = rawTemplate;
    let insertionType: ParsedSheetPreset['insertionType'] = 'already-present';

    if (autoInsertPlaceholder) {
      const detected = detectAndInsertPlaceholder(rawTemplate, placeholder);
      finalTemplate = detected.template;
      insertionType = detected.insertionType;
    } else if (!rawTemplate.includes(CONTENT_PLACEHOLDER)) {
      insertionType = 'appended';
    }

    results.push({
      id: `preset-sheet-${Date.now()}-${index}`,
      name: name || `表格预设 ${index + 1}`,
      template: finalTemplate,
      category,
      originalTemplate: rawTemplate,
      insertionType
    });
  });

  return results;
}
