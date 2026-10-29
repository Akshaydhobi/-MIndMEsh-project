require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const Concept = require('./Concept');
const Connection = require('./connection');
const LearningPath = require('./learningpath');
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to MindMesh API!' });
});

/* LEARNING PATH API */

// Get all learning paths
app.get('/api/learning-paths', async (req, res) => {
  try {
    const paths = await LearningPath.find()
      .populate('concepts.concept', 'title category')
      .sort({ createdAt: -1 });

    res.set('Cache-Control', 'no-store');
    res.json(paths);
  } catch (error) {
    console.error('Fetch learning paths error:', error);
    res.status(500).json({
      message: 'Failed to fetch learning paths',
    });
  }
});

// Create a learning path
app.post('/api/learning-paths', async (req, res) => {
  try {
    const { title, description, concepts = [] } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        message: 'Learning path title is required',
      });
    }

    if (!Array.isArray(concepts)) {
      return res.status(400).json({
        message: 'Concepts must be an array',
      });
    }

    const path = await LearningPath.create({
      title: title.trim(),
      description,
      concepts: concepts.map((item) => ({
        concept: item.concept || item,
        completed: Boolean(item.completed),
      })),
    });

    await path.populate('concepts.concept', 'title category');

    res.status(201).json(path);
  } catch (error) {
    console.error('Create learning path error:', error);
    res.status(400).json({
      message: 'Failed to create learning path',
      error: error.message,
    });
  }
});

// Update a learning path, including its order and progress
app.put('/api/learning-paths/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: 'Invalid learning path ID',
      });
    }

    const updates = {};

    if (req.body.title !== undefined) {
      if (
        typeof req.body.title !== 'string' ||
        !req.body.title.trim()
      ) {
        return res.status(400).json({
          message: 'A valid title is required',
        });
      }

      updates.title = req.body.title.trim();
    }

    if (req.body.description !== undefined) {
      updates.description = req.body.description;
    }

    if (req.body.concepts !== undefined) {
      if (!Array.isArray(req.body.concepts)) {
        return res.status(400).json({
          message: 'Concepts must be an array',
        });
      }

      updates.concepts = req.body.concepts.map((item) => ({
        concept: item.concept || item,
        completed: Boolean(item.completed),
      }));
    }

    const path = await LearningPath.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate('concepts.concept', 'title category');

    if (!path) {
      return res.status(404).json({
        message: 'Learning path not found',
      });
    }

    res.json(path);
  } catch (error) {
    console.error('Update learning path error:', error);
    res.status(400).json({
      message: 'Failed to update learning path',
      error: error.message,
    });
  }
});

// Delete a learning path
app.delete('/api/learning-paths/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid learning path ID',
      });
    }

    const path = await LearningPath.findByIdAndDelete(
      req.params.id
    );

    if (!path) {
      return res.status(404).json({
        message: 'Learning path not found',
      });
    }

    res.json({
      success: true,
      message: 'Learning path deleted',
    });
  } catch (error) {
    console.error('Delete learning path error:', error);
    res.status(500).json({
      message: 'Failed to delete learning path',
    });
  }
});
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'MindMesh backend is healthy!',
    database: mongoose.connection.readyState === 1
      ? 'connected'
      : 'disconnected',
  });
});

// Read all concepts
app.get('/api/concepts', async (req, res) => {
  try {
    const concepts = await Concept.find().sort({ createdAt: -1 });
    res.set('Cache-Control', 'no-store');
    res.json(concepts);
  } catch (error) {
    console.error('Fetch concepts error:', error);
    res.status(500).json({ message: 'Failed to fetch concepts' });
  }
});

// Create a concept
app.post('/api/concepts', async (req, res) => {
  try {
    const concept = await Concept.create({
      title: req.body.title,
      description: req.body.description,
      category: req.body.category,
      tags: req.body.tags,
      favorite: req.body.favorite,
    });

    res.status(201).json(concept);
  } catch (error) {
    res.status(400).json({
      message: 'Failed to create concept',
      error: error.message,
    });
  }
});

// Edit a concept
app.put('/api/concepts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid concept ID' });
    }

    const updated = await Concept.findByIdAndUpdate(
      id,
      {
        title: req.body.title,
        description: req.body.description,
        category: req.body.category,
        tags: req.body.tags,
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Concept not found' });
    }

    res.json(updated);
  } catch (error) {
    res.status(400).json({
      message: 'Failed to update concept',
      error: error.message,
    });
  }
});

// Toggle favorite
app.patch('/api/concepts/:id/favorite', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid concept ID' });
    }

    if (typeof req.body.favorite !== 'boolean') {
      return res.status(400).json({
        message: 'favorite must be true or false',
      });
    }

    const updated = await Concept.findByIdAndUpdate(
      req.params.id,
      { favorite: req.body.favorite },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Concept not found' });
    }

    res.json(updated);
  } catch (error) {
    res.status(400).json({
      message: 'Failed to update favorite',
      error: error.message,
    });
  }
});

// Delete a concept and its connections
app.delete('/api/concepts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid concept ID' });
    }

    const deleted = await Concept.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: 'Concept not found' });
    }

    await Connection.deleteMany({
      $or: [{ from: id }, { to: id }],
    });

    res.json({ success: true, message: 'Concept deleted' });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to delete concept',
      error: error.message,
    });
  }
});

// Read all connections
app.get('/api/connections', async (req, res) => {
  try {
    const connections = await Connection.find()
      .populate('from', 'title category')
      .populate('to', 'title category')
      .sort({ createdAt: -1 });

    res.set('Cache-Control', 'no-store');
    res.json(connections);
  } catch (error) {
    console.error('Fetch connections error:', error);
    res.status(500).json({ message: 'Failed to fetch connections' });
  }
});

// Create a connection
app.post('/api/connections', async (req, res) => {
  try {
    const { from, to, relationship } = req.body;

    if (
      !mongoose.isValidObjectId(from) ||
      !mongoose.isValidObjectId(to) ||
      from === to
    ) {
      return res.status(400).json({
        message: 'Select two different valid concepts',
      });
    }

    const concepts = await Concept.countDocuments({
      _id: { $in: [from, to] },
    });

    if (concepts !== 2) {
      return res.status(400).json({
        message: 'Both concepts must exist',
      });
    }

    const connection = await Connection.create({
      from,
      to,
      relationship: relationship || 'related to',
    });

    await connection.populate([
      { path: 'from', select: 'title category' },
      { path: 'to', select: 'title category' },
    ]);

    res.status(201).json(connection);
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 400).json({
      message: error.code === 11000
        ? 'This connection already exists'
        : 'Failed to create connection',
      error: error.message,
    });
  }
});

// Delete a connection
app.delete('/api/connections/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid connection ID' });
    }

    const deleted = await Connection.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: 'Connection not found' });
    }

    res.json({ success: true, message: 'Connection deleted' });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to delete connection',
      error: error.message,
    });
  }
});

// Handle unknown API routes with JSON, not an HTML page
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'API route not found' });
});

app.use((error, req, res, next) => {
  console.error('Server error:', error.message);

  if (res.headersSent) return next(error);

  res.status(error.status || 500).json({
    message: error.status === 400
      ? 'Invalid request body'
      : 'Internal server error',
  });
});

async function startServer() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI ||
      'mongodb://127.0.0.1:27017/mindmesh'
    );

    console.log('MongoDB connected successfully!');

    app.listen(PORT, () => {
      console.log(`MindMesh server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Unable to connect to MongoDB:', error.message);
    process.exit(1);
  }
}

startServer();