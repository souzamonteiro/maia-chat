import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { XMLParser } from 'fast-xml-parser';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import readXlsxFile from 'read-excel-file/node';
import JSZip from 'jszip';
import { config } from './config.js';
import { AppError } from './errors.js';

const supportedExtensions = new Set(['.pdf', '.docx', '.xlsx', '.pptx']);
const xmlParser = new XMLParser({ ignoreAttributes: true, preserveOrder: true });
const execFileAsync = promisify(execFile);

function extractionError(message, code = 'document_extraction_failed') {
  return new AppError(message, { status: 400, type: 'invalid_request_error', code });
}

function extension(name) {
  return path.extname(String(name || '')).toLowerCase();
}

function decodeDocument(contentBase64) {
  if (typeof contentBase64 !== 'string' || !contentBase64) {
    throw extractionError('A base64 document is required.', 'document_content_required');
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(contentBase64) || contentBase64.length % 4 === 1) {
    throw extractionError('The document content is not valid base64.', 'invalid_document_encoding');
  }
  const buffer = Buffer.from(contentBase64, 'base64');
  if (buffer.length === 0) throw extractionError('The document cannot be empty.');
  if (buffer.length > config.maxDocumentBytes) {
    throw extractionError(
      `Documents must be ${Math.floor(config.maxDocumentBytes / 1024 / 1024)} MiB or smaller.`,
      'document_too_large'
    );
  }
  return buffer;
}

function textFromXml(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && '#text' in value) return value['#text'];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return textFromXml(Object.values(value));
  }
  if (!Array.isArray(value)) return '';
  return value
    .flatMap((node) => {
      if (node['w:t'] !== undefined) return textFromXml(node['w:t']);
      if (node['a:t'] !== undefined) return textFromXml(node['a:t']);
      return textFromXml(node);
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const text = (await parser.getText()).text || '';
    if (!text.trim()) {
      throw extractionError(
        'The PDF contains no selectable text. Scanned PDFs require OCR before upload.',
        'pdf_text_unavailable'
      );
    }
    return text;
  } catch (error) {
    return extractPdfWithPdftotext(buffer, error);
  } finally {
    await parser.destroy();
  }
}

async function extractPdfWithPdftotext(buffer, parserError) {
  const directory = await mkdtemp('/tmp/maia-pdf-');
  const inputPath = path.join(directory, 'document.pdf');
  try {
    await writeFile(inputPath, buffer, { mode: 0o600 });
    const { stdout } = await execFileAsync('pdftotext', [inputPath, '-'], {
      maxBuffer: Math.max(config.maxDocumentBytes, 10 * 1024 * 1024)
    });
    const text = stdout.trim();
    if (text) return text;
  } catch {
    // Preserve the stable extraction error below when both PDF readers fail.
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  throw parserError;
}

async function extractDocx(buffer) {
  return (await mammoth.extractRawText({ buffer })).value || '';
}

async function extractXlsx(buffer) {
  const sheets = await readXlsxFile(buffer);
  return sheets
    .map(({ name, data }) => [`[Sheet: ${name}]`, ...data.map((row) => row.join('\t'))].join('\n'))
    .join('\n\n');
}

async function extractPptx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));
  if (slideNames.length === 0) throw extractionError('The presentation has no readable slides.');
  return (
    await Promise.all(
      slideNames.map(async (name, index) => {
        const xml = await zip.files[name].async('string');
        const text = textFromXml(xmlParser.parse(xml));
        return `[Slide ${index + 1}]\n${text}`;
      })
    )
  ).join('\n\n');
}

export async function extractDocument({ name, contentBase64 }) {
  const type = extension(name);
  if (!supportedExtensions.has(type)) {
    throw extractionError('Only PDF, DOCX, XLSX, and PPTX files can be extracted.');
  }

  const buffer = decodeDocument(contentBase64);
  try {
    if (type === '.pdf') return await extractPdf(buffer);
    if (type === '.docx') return await extractDocx(buffer);
    if (type === '.xlsx') return await extractXlsx(buffer);
    return await extractPptx(buffer);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw extractionError(
      `Could not read ${path.basename(name)}. The file may be invalid, encrypted, or unsupported.`,
      'document_extraction_failed'
    );
  }
}
