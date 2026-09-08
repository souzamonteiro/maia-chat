import { Router } from 'express';
import { parseDocument } from '../../public/js/attachments.js';
import { extractDocument } from '../document-extraction.js';

export const documentsRouter = Router();

documentsRouter.post('/extract', async (req, res, next) => {
  try {
    const extracted = await extractDocument(req.body || {});
    res.json(parseDocument(req.body.name, extracted));
  } catch (error) {
    next(error);
  }
});
