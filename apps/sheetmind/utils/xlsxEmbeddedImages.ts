import JSZip from 'jszip';
import * as XLSX from 'xlsx';

export interface EmbeddedImage {
    sheetName: string;
    cellAddress: string;
    dataUrl: string;
}

interface Relationship {
    target: string;
    type: string;
}

const IMAGE_MIME_TYPES: Record<string, string> = {
    bmp: 'image/bmp',
    gif: 'image/gif',
    heic: 'image/heic',
    heif: 'image/heif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    svg: 'image/svg+xml',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    webp: 'image/webp'
};

const parseXml = (xml: string): Document => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
        throw new Error('XLSX 中包含无法解析的 XML');
    }
    return doc;
};

const elementsByLocalName = (root: Document | Element, name: string): Element[] =>
    Array.from(root.getElementsByTagNameNS('*', name));

const directChildren = (root: Element, name: string): Element[] =>
    Array.from(root.childNodes).filter(
        (node): node is Element => node.nodeType === 1 && (node as Element).localName === name
    );

const firstDirectChild = (root: Element, name: string): Element | undefined =>
    directChildren(root, name)[0];

const getAttributeByLocalName = (element: Element, name: string): string | null => {
    if (element.hasAttribute(name)) return element.getAttribute(name);

    for (const attribute of Array.from(element.attributes)) {
        if (attribute.localName === name) return attribute.value;
    }
    return null;
};

const normalizePackagePath = (basePart: string, target: string): string => {
    if (target.startsWith('/')) return target.replace(/^\/+/, '');

    const baseSegments = basePart.split('/');
    baseSegments.pop();
    for (const segment of target.split('/')) {
        if (!segment || segment === '.') continue;
        if (segment === '..') {
            baseSegments.pop();
        } else {
            baseSegments.push(segment);
        }
    }
    return baseSegments.join('/');
};

const relationshipPartPath = (partPath: string): string => {
    const segments = partPath.split('/');
    const fileName = segments.pop();
    return [...segments, '_rels', `${fileName}.rels`].join('/');
};

const readXmlFile = async (zip: JSZip, path: string): Promise<Document | null> => {
    const file = zip.file(path);
    if (!file) return null;
    return parseXml(await file.async('string'));
};

const readRelationships = async (
    zip: JSZip,
    sourcePart: string
): Promise<Map<string, Relationship>> => {
    const relsDoc = await readXmlFile(zip, relationshipPartPath(sourcePart));
    const relationships = new Map<string, Relationship>();
    if (!relsDoc) return relationships;

    for (const rel of elementsByLocalName(relsDoc, 'Relationship')) {
        const id = getAttributeByLocalName(rel, 'Id');
        const target = getAttributeByLocalName(rel, 'Target');
        if (!id || !target) continue;
        relationships.set(id, {
            target: normalizePackagePath(sourcePart, target),
            type: getAttributeByLocalName(rel, 'Type') || ''
        });
    }
    return relationships;
};

const readImageAsDataUrl = async (
    zip: JSZip,
    target: string,
    cache: Map<string, string>
): Promise<string | null> => {
    const normalizedTarget = target.replace(/^\/+/, '');
    const cached = cache.get(normalizedTarget);
    if (cached) return cached;

    const file = zip.file(normalizedTarget);
    if (!file) return null;

    const extension = normalizedTarget.split('.').pop()?.toLowerCase() || '';
    const mimeType = IMAGE_MIME_TYPES[extension];
    if (!mimeType) return null;

    const dataUrl = `data:${mimeType};base64,${await file.async('base64')}`;
    cache.set(normalizedTarget, dataUrl);
    return dataUrl;
};

const readSheetParts = async (zip: JSZip): Promise<Array<{ name: string; path: string }>> => {
    const workbookPart = 'xl/workbook.xml';
    const workbookDoc = await readXmlFile(zip, workbookPart);
    if (!workbookDoc) return [];

    const workbookRels = await readRelationships(zip, workbookPart);
    const result: Array<{ name: string; path: string }> = [];

    for (const sheet of elementsByLocalName(workbookDoc, 'sheet')) {
        const name = getAttributeByLocalName(sheet, 'name');
        const relationshipId = getAttributeByLocalName(sheet, 'id');
        const relationship = relationshipId ? workbookRels.get(relationshipId) : undefined;
        if (name && relationship?.target) {
            result.push({ name, path: relationship.target });
        }
    }
    return result;
};

const readValueMetadataIndexes = async (zip: JSZip): Promise<number[]> => {
    const metadataDoc = await readXmlFile(zip, 'xl/metadata.xml');
    if (!metadataDoc) return [];

    const valueMetadata = elementsByLocalName(metadataDoc, 'valueMetadata')[0];
    if (!valueMetadata) return [];

    return directChildren(valueMetadata, 'bk').map(block => {
        const record = elementsByLocalName(block, 'rc')[0];
        return Number(getAttributeByLocalName(record, 'v') ?? -1);
    });
};

const readRichValueImageTargets = async (
    zip: JSZip
): Promise<Map<number, string>> => {
    const richValueDoc = await readXmlFile(zip, 'xl/richData/rdrichvalue.xml');
    const structureDoc = await readXmlFile(zip, 'xl/richData/rdrichvaluestructure.xml');
    if (!richValueDoc || !structureDoc) return new Map();

    const structures = elementsByLocalName(structureDoc, 's').map(structure =>
        directChildren(structure, 'k').map(key => getAttributeByLocalName(key, 'n') || '')
    );
    const richValues = elementsByLocalName(richValueDoc, 'rv');

    const localRelDoc = await readXmlFile(zip, 'xl/richData/richValueRel.xml');
    const localRelIds = localRelDoc
        ? elementsByLocalName(localRelDoc, 'rel').map(rel => getAttributeByLocalName(rel, 'id') || '')
        : [];
    const localRelationships = await readRelationships(zip, 'xl/richData/richValueRel.xml');

    const webImageDoc = await readXmlFile(zip, 'xl/richData/rdRichValueWebImage.xml');
    const webImageIds = webImageDoc
        ? elementsByLocalName(webImageDoc, 'webImageSrd').map(item => {
            const blip = elementsByLocalName(item, 'blip')[0];
            return blip ? getAttributeByLocalName(blip, 'id') || '' : '';
        })
        : [];
    const webRelationships = await readRelationships(zip, 'xl/richData/rdRichValueWebImage.xml');

    const result = new Map<number, string>();
    richValues.forEach((richValue, richValueIndex) => {
        const structureIndex = Number(getAttributeByLocalName(richValue, 's') ?? -1);
        const keys = structures[structureIndex];
        if (!keys) return;

        const values = directChildren(richValue, 'v').map(value => value.textContent?.trim() || '');
        const localImageKeyIndex = keys.indexOf('_rvRel:LocalImageIdentifier');
        const webImageKeyIndex = keys.indexOf('WebImageIdentifier');

        if (localImageKeyIndex >= 0) {
            const relationshipIndex = Number(values[localImageKeyIndex]);
            const relationshipId = localRelIds[relationshipIndex];
            const relationship = localRelationships.get(relationshipId);
            if (relationship?.target) result.set(richValueIndex, relationship.target);
            return;
        }

        if (webImageKeyIndex >= 0) {
            const webImageIndex = Number(values[webImageKeyIndex]);
            const relationshipId = webImageIds[webImageIndex];
            const relationship = webRelationships.get(relationshipId);
            if (relationship?.target) result.set(richValueIndex, relationship.target);
        }
    });

    return result;
};

const extractRichValueImages = async (
    zip: JSZip,
    sheetParts: Array<{ name: string; path: string }>,
    imageCache: Map<string, string>
): Promise<EmbeddedImage[]> => {
    const metadataIndexes = await readValueMetadataIndexes(zip);
    const richValueTargets = await readRichValueImageTargets(zip);
    if (metadataIndexes.length === 0 || richValueTargets.size === 0) return [];

    const images: EmbeddedImage[] = [];
    for (const sheetPart of sheetParts) {
        const sheetDoc = await readXmlFile(zip, sheetPart.path);
        if (!sheetDoc) continue;

        for (const cell of elementsByLocalName(sheetDoc, 'c')) {
            const cellAddress = getAttributeByLocalName(cell, 'r');
            const metadataIndex = Number(getAttributeByLocalName(cell, 'vm') ?? 0);
            if (!cellAddress || metadataIndex <= 0) continue;

            const richValueIndex = metadataIndexes[metadataIndex - 1];
            const imageTarget = richValueTargets.get(richValueIndex);
            if (!imageTarget) continue;

            const dataUrl = await readImageAsDataUrl(zip, imageTarget, imageCache);
            if (dataUrl) images.push({ sheetName: sheetPart.name, cellAddress, dataUrl });
        }
    }
    return images;
};

const extractDrawingImages = async (
    zip: JSZip,
    sheetParts: Array<{ name: string; path: string }>,
    imageCache: Map<string, string>
): Promise<EmbeddedImage[]> => {
    const images: EmbeddedImage[] = [];

    for (const sheetPart of sheetParts) {
        const sheetDoc = await readXmlFile(zip, sheetPart.path);
        if (!sheetDoc) continue;

        const drawing = elementsByLocalName(sheetDoc, 'drawing')[0];
        const drawingId = drawing ? getAttributeByLocalName(drawing, 'id') : null;
        if (!drawingId) continue;

        const sheetRelationships = await readRelationships(zip, sheetPart.path);
        const drawingPart = sheetRelationships.get(drawingId)?.target;
        if (!drawingPart) continue;

        const drawingDoc = await readXmlFile(zip, drawingPart);
        if (!drawingDoc) continue;
        const drawingRelationships = await readRelationships(zip, drawingPart);

        const anchors = [
            ...elementsByLocalName(drawingDoc, 'oneCellAnchor'),
            ...elementsByLocalName(drawingDoc, 'twoCellAnchor')
        ];

        for (const anchor of anchors) {
            const from = firstDirectChild(anchor, 'from');
            const blip = elementsByLocalName(anchor, 'blip')[0];
            const relationshipId = blip ? getAttributeByLocalName(blip, 'embed') : null;
            if (!from || !relationshipId) continue;

            const column = Number(firstDirectChild(from, 'col')?.textContent ?? -1);
            const row = Number(firstDirectChild(from, 'row')?.textContent ?? -1);
            if (column < 0 || row < 0) continue;

            const imageTarget = drawingRelationships.get(relationshipId)?.target;
            if (!imageTarget) continue;

            const dataUrl = await readImageAsDataUrl(zip, imageTarget, imageCache);
            if (!dataUrl) continue;

            images.push({
                sheetName: sheetPart.name,
                cellAddress: XLSX.utils.encode_cell({ r: row, c: column }),
                dataUrl
            });
        }
    }

    return images;
};

const shouldReplaceCell = (cell: XLSX.CellObject | undefined): boolean => {
    if (!cell) return true;
    const value = String(cell.v ?? '').trim();
    return value === '' || value === '#VALUE!' || value === '#N/A';
};

const extendSheetRange = (sheet: XLSX.WorkSheet, cellAddress: string): void => {
    const imageCell = XLSX.utils.decode_cell(cellAddress);
    if (!sheet['!ref']) {
        sheet['!ref'] = XLSX.utils.encode_range(imageCell, imageCell);
        return;
    }

    const range = XLSX.utils.decode_range(sheet['!ref']);
    range.s.r = Math.min(range.s.r, imageCell.r);
    range.s.c = Math.min(range.s.c, imageCell.c);
    range.e.r = Math.max(range.e.r, imageCell.r);
    range.e.c = Math.max(range.e.c, imageCell.c);
    sheet['!ref'] = XLSX.utils.encode_range(range);
};

/**
 * Recover images pasted as cell values from the XLSX package and merge them
 * into the SheetJS workbook as data URLs. Google Sheets' Values API represents
 * these cells as empty values, while the exported XLSX retains the media and
 * the cell-to-image relationship metadata.
 */
export const mergeEmbeddedImagesFromXlsx = async (
    xlsxData: ArrayBuffer,
    workbook: XLSX.WorkBook
): Promise<number> => {
    const embeddedImages = await extractEmbeddedImagesFromXlsx(xlsxData);

    let mergedCount = 0;
    for (const image of embeddedImages) {
        const safeSheetName = image.sheetName.replace(/[:\/\\?*\[\]]/g, '_');
        const sheet = workbook.Sheets[image.sheetName] || workbook.Sheets[safeSheetName];
        if (!sheet || !shouldReplaceCell(sheet[image.cellAddress])) continue;

        sheet[image.cellAddress] = { t: 's', v: image.dataUrl };
        extendSheetRange(sheet, image.cellAddress);
        mergedCount += 1;
    }

    return mergedCount;
};

export const extractEmbeddedImagesFromXlsx = async (
    xlsxData: ArrayBuffer
): Promise<EmbeddedImage[]> => {
    const zip = await JSZip.loadAsync(xlsxData);
    const sheetParts = await readSheetParts(zip);
    if (sheetParts.length === 0) return [];

    const imageCache = new Map<string, string>();
    const richValueImages = await extractRichValueImages(zip, sheetParts, imageCache);
    const drawingImages = await extractDrawingImages(zip, sheetParts, imageCache);

    const uniqueImages = new Map<string, EmbeddedImage>();
    for (const image of [...drawingImages, ...richValueImages]) {
        uniqueImages.set(`${image.sheetName}\u0000${image.cellAddress}`, image);
    }

    return Array.from(uniqueImages.values());
};
