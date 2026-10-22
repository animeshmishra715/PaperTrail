import path from 'node:path';
import { config } from '../config.js';
import { Paper } from '../models/Paper.js';
import { processPaperFile } from './aiService.js';

// A tiny in-process job queue: PDFs are processed in the background, two at a time,
// so an upload request returns immediately and the UI polls the paper's status.
const CONCURRENCY = 2;
const waiting = [];
let running = 0;

export function enqueuePaper(paperId) {
  waiting.push(String(paperId));
  pump();
}

function pump() {
  while (running < CONCURRENCY && waiting.length) {
    const id = waiting.shift();
    running++;
    runJob(id).finally(() => {
      running--;
      pump();
    });
  }
}

async function runJob(paperId) {
  const paper = await Paper.findById(paperId);
  if (!paper) return; // deleted while queued
  paper.status = 'processing';
  paper.error = '';
  await paper.save();

  try {
    const result = await processPaperFile(paper._id, path.join(config.uploadDir, paper.storedName), paper.originalName);
    const update = {
      status: 'ready',
      numPages: result.num_pages,
      numChunks: result.num_chunks,
      wordCount: result.word_count,
      sections: result.sections,
      processedAt: new Date(),
    };
    const fresh = await Paper.findById(paperId);
    if (!fresh) return;
    if (!fresh.titleEditedByUser && result.title) update.title = result.title.slice(0, 300);
    await Paper.updateOne({ _id: paperId }, update);
  } catch (err) {
    console.error(`Processing failed for paper ${paperId}:`, err.message);
    await Paper.updateOne({ _id: paperId }, { status: 'failed', error: err.message });
  }
}

// Papers left half-done by a server restart are picked up again.
export async function resumePendingJobs() {
  const pending = await Paper.find({ status: { $in: ['queued', 'processing'] } }).select('_id');
  pending.forEach((p) => enqueuePaper(p._id));
  if (pending.length) console.log(`Re-queued ${pending.length} unfinished paper(s)`);
}
