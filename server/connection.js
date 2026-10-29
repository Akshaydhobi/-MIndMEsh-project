const mongoose = require('mongoose');

const connectionSchema = new mongoose.Schema(
  {
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Concept',
      required: true,
    },
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Concept',
      required: true,
    },
    relationship: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
  },
  { timestamps: true }
);

connectionSchema.index(
  { from: 1, to: 1, relationship: 1 },
  { unique: true }
);

module.exports = mongoose.model('Connection', connectionSchema);