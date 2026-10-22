import mongoose from 'mongoose';

export const PAPER_STATUS = ['queued', 'processing', 'ready', 'failed'];

const paperSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    titleEditedByUser: { type: Boolean, default: false },
    originalName: { type: String, required: true },
    storedName: { type: String, required: true },
    size: Number,

    status: { type: String, enum: PAPER_STATUS, default: 'queued', index: true },
    error: { type: String, default: '' },
    numPages: Number,
    numChunks: Number,
    wordCount: Number,
    sections: [String],
    processedAt: Date,
  },
  { timestamps: true }
);

export const Paper = mongoose.model('Paper', paperSchema);
