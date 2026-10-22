import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';
import { Paper } from '../models/Paper.js';
import { HttpError } from '../middleware/errors.js';
import { enqueuePaper } from '../services/processingQueue.js';
import { deletePaperVectors } from '../services/aiService.js';

fs.mkdirSync(config.uploadDir, { recursive: true });

export const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (_req, _file, cb) => cb(null, `${crypto.randomBytes(16).toString('hex')}.pdf`),
  }),
  limits: { fileSize: config.maxUploadBytes, files: 10 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);
    cb(ok ? null : new HttpError(400, `${file.originalname} is not a PDF`), ok);
  },
});

/** Checks the file really starts with the PDF magic bytes, not just a .pdf name. */
export async function validateUploadedPdf(file) {
  file.cleanup = () => fsp.rm(file.path, { force: true });
  const handle = await fsp.open(file.path, 'r');
  const { buffer } = await handle.read(Buffer.alloc(5), 0, 5, 0);
  await handle.close();
  if (buffer.toString('latin1') !== '%PDF-') throw new HttpError(400, `${file.originalname} is not a valid PDF`);
}

export async function removePaperCompletely(paper) {
  await fsp.rm(path.join(config.uploadDir, paper.storedName), { force: true });
  try {
    await deletePaperVectors(paper._id);
  } catch (err) {
    console.warn(`Could not delete vectors for ${paper._id}: ${err.message}`);
  }
  await paper.deleteOne();
}

const router = Router();

async function getOwnedPaper(userId, paperId) {
  const paper = await Paper.findOne({ _id: paperId, owner: userId });
  if (!paper) throw new HttpError(404, 'Paper not found');
  return paper;
}

router.get('/:id', async (req, res) => {
  res.json({ paper: await getOwnedPaper(req.userId, req.params.id) });
});

router.get('/:id/file', async (req, res) => {
  const paper = await getOwnedPaper(req.userId, req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(paper.originalName)}"`);
  res.sendFile(paper.storedName, { root: config.uploadDir });
});

router.patch('/:id', async (req, res) => {
  const paper = await getOwnedPaper(req.userId, req.params.id);
  const title = String(req.body?.title || '').trim();
  if (!title) throw new HttpError(400, 'Title cannot be empty');
  paper.title = title;
  paper.titleEditedByUser = true;
  await paper.save();
  res.json({ paper });
});

router.post('/:id/reprocess', async (req, res) => {
  const paper = await getOwnedPaper(req.userId, req.params.id);
  if (paper.status === 'queued' || paper.status === 'processing') {
    throw new HttpError(409, 'This paper is already being processed');
  }
  paper.status = 'queued';
  paper.error = '';
  await paper.save();
  enqueuePaper(paper._id);
  res.json({ paper });
});

router.delete('/:id', async (req, res) => {
  await removePaperCompletely(await getOwnedPaper(req.userId, req.params.id));
  res.json({ ok: true });
});

export default router;
