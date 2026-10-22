import { Router } from 'express';
import { Workspace } from '../models/Workspace.js';
import { Paper } from '../models/Paper.js';
import { Question } from '../models/Question.js';
import { HttpError } from '../middleware/errors.js';
import { upload, removePaperCompletely, validateUploadedPdf } from './papers.js';
import { enqueuePaper } from '../services/processingQueue.js';
import { askQuestion } from '../services/aiService.js';

const router = Router();

export async function getOwnedWorkspace(userId, workspaceId) {
  const ws = await Workspace.findOne({ _id: workspaceId, owner: userId });
  if (!ws) throw new HttpError(404, 'Workspace not found');
  return ws;
}

router.get('/', async (req, res) => {
  const workspaces = await Workspace.find({ owner: req.userId }).sort({ updatedAt: -1 }).lean();
  const counts = await Paper.aggregate([
    { $match: { workspace: { $in: workspaces.map((w) => w._id) } } },
    { $group: { _id: '$workspace', count: { $sum: 1 } } },
  ]);
  const byId = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
  res.json({ workspaces: workspaces.map((w) => ({ ...w, paperCount: byId[String(w._id)] || 0 })) });
});

router.post('/', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw new HttpError(400, 'Workspace name is required');
  const ws = await Workspace.create({ owner: req.userId, name, description: req.body?.description || '' });
  res.status(201).json({ workspace: ws });
});

router.get('/:id', async (req, res) => {
  res.json({ workspace: await getOwnedWorkspace(req.userId, req.params.id) });
});

router.patch('/:id', async (req, res) => {
  const ws = await getOwnedWorkspace(req.userId, req.params.id);
  if (req.body?.name !== undefined) ws.name = String(req.body.name).trim();
  if (req.body?.description !== undefined) ws.description = String(req.body.description);
  await ws.save();
  res.json({ workspace: ws });
});

router.delete('/:id', async (req, res) => {
  const ws = await getOwnedWorkspace(req.userId, req.params.id);
  const papers = await Paper.find({ workspace: ws._id });
  for (const paper of papers) await removePaperCompletely(paper);
  await Question.deleteMany({ workspace: ws._id });
  await ws.deleteOne();
  res.json({ ok: true });
});

// ---- Papers inside a workspace ----

router.get('/:id/papers', async (req, res) => {
  const ws = await getOwnedWorkspace(req.userId, req.params.id);
  const papers = await Paper.find({ workspace: ws._id }).sort({ createdAt: -1 });
  res.json({ papers });
});

router.post('/:id/papers', upload.array('files', 10), async (req, res) => {
  const files = req.files || [];
  let ws;
  try {
    ws = await getOwnedWorkspace(req.userId, req.params.id);
    if (!files.length) throw new HttpError(400, 'Choose at least one PDF file');
    await Promise.all(files.map(validateUploadedPdf));
  } catch (err) {
    await Promise.all(files.map((f) => f.cleanup?.()));
    throw err;
  }

  const papers = await Paper.insertMany(
    files.map((f) => ({
      owner: req.userId,
      workspace: ws._id,
      title: f.originalname.replace(/\.pdf$/i, '').slice(0, 300),
      originalName: f.originalname,
      storedName: f.filename,
      size: f.size,
      status: 'queued',
    }))
  );
  papers.forEach((p) => enqueuePaper(p._id));
  await Workspace.updateOne({ _id: ws._id }, { $currentDate: { updatedAt: true } });
  res.status(201).json({ papers });
});

// ---- Question answering ----

router.post('/:id/ask', async (req, res) => {
  const ws = await getOwnedWorkspace(req.userId, req.params.id);
  const question = String(req.body?.question || '').trim();
  if (question.length < 2) throw new HttpError(400, 'Type a question first');

  const filter = { workspace: ws._id, status: 'ready' };
  if (Array.isArray(req.body?.paperIds) && req.body.paperIds.length) filter._id = { $in: req.body.paperIds };
  const papers = await Paper.find(filter).select('_id title');
  if (!papers.length) throw new HttpError(400, 'No processed papers to ask about yet. Upload a PDF and wait until it is ready.');

  const result = await askQuestion(question, papers);
  const entry = await Question.create({
    owner: req.userId,
    workspace: ws._id,
    question,
    answer: result.answer,
    insufficientEvidence: result.insufficient_evidence,
    papers: papers.map((p) => p._id),
    sources: result.sources.map((s) => ({
      id: s.id,
      paper: s.paper_id,
      paperTitle: s.paper_title,
      section: s.section,
      pageStart: s.page_start,
      pageEnd: s.page_end,
      score: s.score,
      text: s.text,
      cited: s.cited,
    })),
  });
  res.json({ question: entry });
});

router.get('/:id/questions', async (req, res) => {
  const ws = await getOwnedWorkspace(req.userId, req.params.id);
  const questions = await Question.find({ workspace: ws._id }).sort({ createdAt: 1 }).limit(200);
  res.json({ questions });
});

router.delete('/:id/questions', async (req, res) => {
  const ws = await getOwnedWorkspace(req.userId, req.params.id);
  await Question.deleteMany({ workspace: ws._id });
  res.json({ ok: true });
});

export default router;
