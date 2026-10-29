
const mongoose = require('mongoose');

const learningPathSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    description: {
      type: String,
      default: '',
      maxlength: 500,
    },

    concepts: [
      {
        concept: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Concept',
          required: true,
        },

        completed: {
          type: Boolean,
          default: false,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  'LearningPath',
  learningPathSchema
);