import mongoose from 'mongoose';

const sourceSchema = new mongoose.Schema(
  {
    id: String, // "S1", "S2", ... as cited in the answer text
    paper: { type: mongoose.Schema.Types.ObjectId, ref: 'Paper' },
    paperTitle: String,
    section: String,
    pageStart: Number,
    pageEnd: Number,
    score: Number,
    text: String,
    cited: Boolean,
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    question: { type: String, required: true },
    answer: { type: String, required: true },
    insufficientEvidence: { type: Boolean, default: false },
    papers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Paper' }], // scope the question was asked over
    sources: [sourceSchema],
  },
  { timestamps: true }
);

export const Question = mongoose.model('Question', questionSchema);
