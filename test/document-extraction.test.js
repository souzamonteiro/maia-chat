import assert from 'node:assert/strict';
import JSZip from 'jszip';
import test from 'node:test';

import { extractDocument } from '../server/document-extraction.js';

function encoded(value) {
  return Buffer.from(value).toString('base64');
}

test('extractDocument reads text from PPTX slide XML without retaining the archive', async () => {
  const zip = new JSZip();
  zip.file(
    'ppt/slides/slide1.xml',
    '<p:sld xmlns:p="p" xmlns:a="a"><a:t>Quarterly</a:t><a:t>results</a:t></p:sld>'
  );

  const result = await extractDocument({
    name: 'report.pptx',
    contentBase64: (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64')
  });

  assert.match(result, /\[Slide 1\]/);
  assert.match(result, /Quarterly results/);
});

test('extractDocument rejects unsupported formats and missing content', async () => {
  await assert.rejects(
    extractDocument({ name: 'image.png', contentBase64: encoded('not supported') }),
    /Only PDF, DOCX, XLSX, and PPTX/
  );
  await assert.rejects(extractDocument({ name: 'report.pdf' }), /base64 document is required/);
});

test('extractDocument reports invalid PDF content as a client error', async () => {
  await assert.rejects(
    extractDocument({ name: 'Paper.pdf', contentBase64: encoded('%PDF-1.4\n') }),
    /Could not read Paper\.pdf/
  );
});
