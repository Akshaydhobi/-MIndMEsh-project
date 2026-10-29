
import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';

const API = (
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
).replace(/\/$/, '');

const EMPTY_FORM = {
  title: '',
  description: '',
  category: 'Programming',
  tags: '',
};

const CATEGORIES = [
  'Programming',
  'Web Development',
  'Database',
  'Design',
  'Computer Science',
  'Other',
];

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    cache: 'no-store',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        `Server returned non-JSON data (HTTP ${response.status}). Check the API URL and backend routes.`
      );
    }
  }

  if (!response.ok) {
    throw new Error(data?.message || `Request failed (${response.status})`);
  }

  return data;
}

function App() {
  const [concepts, setConcepts] = useState([]);
  const [connections, setConnections] = useState([]);
  const [learningPaths, setLearningPaths] = useState([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [relationship, setRelationship] = useState('related to');

  const [pathTitle, setPathTitle] = useState('');
  const [pathDescription, setPathDescription] = useState('');

  const [status, setStatus] = useState('Connecting to MindMesh...');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    setError('');
    setStatus('Loading MindMesh...');

    try {
      const [conceptData, connectionData, pathData] = await Promise.all([
        request('/concepts'),
        request('/connections'),
        request('/learning-paths'),
      ]);

      if (
        !Array.isArray(conceptData) ||
        !Array.isArray(connectionData) ||
        !Array.isArray(pathData)
      ) {
        throw new Error('The server returned an unexpected data format.');
      }

      setConcepts(conceptData);
      setConnections(connectionData);
      setLearningPaths(pathData);
      setStatus('Connected to MongoDB');
    } catch (err) {
      setError(err.message);
      setStatus('Unable to load MindMesh data');
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredConcepts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return concepts.filter((concept) => {
      const searchable = [
        concept.title,
        concept.description,
        concept.category,
        ...(Array.isArray(concept.tags) ? concept.tags : []),
      ]
        .join(' ')
        .toLowerCase();

      return (
        searchable.includes(query) &&
        (category === 'All' || concept.category === category) &&
        (!favoritesOnly || concept.favorite)
      );
    });
  }, [concepts, search, category, favoritesOnly]);

  const favoriteCount = concepts.filter((item) => item.favorite).length;

  const connectedIds = new Set(
    connections.flatMap((item) => [
      item.from?._id || item.from,
      item.to?._id || item.to,
    ])
  );

  const connectedCount = concepts.filter((item) =>
    connectedIds.has(item._id)
  ).length;

  const connectedPercentage = concepts.length
    ? Math.round((connectedCount / concepts.length) * 100)
    : 0;

  function updateForm(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  async function saveConcept(event) {
    event.preventDefault();

    const title = form.title.trim();

    if (!title) {
      setError('Please enter a concept title.');
      return;
    }

    const tags = [
      ...new Set(
        form.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      ),
    ];

    const payload = {
      title,
      description: form.description.trim(),
      category: form.category,
      tags,
    };

    setBusy(true);
    setError('');

    try {
      if (editingId) {
        const updated = await request(`/concepts/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });

        setConcepts((previous) =>
          previous.map((item) =>
            item._id === editingId ? updated : item
          )
        );
      } else {
        const created = await request('/concepts', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        setConcepts((previous) => [created, ...previous]);
      }

      resetForm();
      setStatus('Concept saved to MongoDB');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function editConcept(concept) {
    setEditingId(concept._id);

    setForm({
      title: concept.title,
      description: concept.description || '',
      category: concept.category || 'Programming',
      tags: (concept.tags || []).join(', '),
    });

    document.getElementById('concept-form')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  async function deleteConcept(id) {
    if (!window.confirm('Permanently delete this concept?')) return;

    setError('');

    try {
      await request(`/concepts/${id}`, { method: 'DELETE' });

      setConcepts((previous) =>
        previous.filter((item) => item._id !== id)
      );

      setConnections((previous) =>
        previous.filter(
          (item) =>
            (item.from?._id || item.from) !== id &&
            (item.to?._id || item.to) !== id
        )
      );

      // Remove this concept from every saved learning path.
      const affectedPaths = learningPaths.filter((path) =>
        (path.concepts || []).some(
          (step) => (step.concept?._id || step.concept) === id
        )
      );

      for (const path of affectedPaths) {
        const remaining = path.concepts
          .filter((step) => (step.concept?._id || step.concept) !== id)
          .map((step) => ({
            concept: step.concept?._id || step.concept,
            completed: Boolean(step.completed),
          }));

        await request(`/learning-paths/${path._id}`, {
          method: 'PUT',
          body: JSON.stringify({ concepts: remaining }),
        });
      }

      if (affectedPaths.length) {
        await loadData();
      }

      if (editingId === id) resetForm();
      setStatus('Concept deleted');
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleFavorite(concept) {
    setError('');

    try {
      const updated = await request(
        `/concepts/${concept._id}/favorite`,
        {
          method: 'PATCH',
          body: JSON.stringify({ favorite: !concept.favorite }),
        }
      );

      setConcepts((previous) =>
        previous.map((item) =>
          item._id === concept._id ? updated : item
        )
      );
    } catch (err) {
      setError(err.message);
    }
  }

  async function addConnection(event) {
    event.preventDefault();

    if (!from || !to || from === to) {
      setError('Choose two different concepts.');
      return;
    }

    setError('');

    try {
      const created = await request('/connections', {
        method: 'POST',
        body: JSON.stringify({ from, to, relationship }),
      });

      setConnections((previous) => [created, ...previous]);
      setFrom('');
      setTo('');
      setRelationship('related to');
      setStatus('Connection saved to MongoDB');
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteConnection(id) {
    setError('');

    try {
      await request(`/connections/${id}`, { method: 'DELETE' });

      setConnections((previous) =>
        previous.filter((item) => item._id !== id)
      );
    } catch (err) {
      setError(err.message);
    }
  }

  function getTitle(id) {
    return concepts.find((item) => item._id === id)?.title ||
      'Unknown concept';
  }

  // LEARNING PATHS

  async function createLearningPath(event) {
    event.preventDefault();

    const title = pathTitle.trim();

    if (!title) {
      setError('Enter a learning path title.');
      return;
    }

    setError('');

    try {
      const created = await request('/learning-paths', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description: pathDescription.trim(),
          concepts: [],
        }),
      });

      setLearningPaths((previous) => [created, ...previous]);
      setPathTitle('');
      setPathDescription('');
      setStatus('Learning path saved to MongoDB');
    } catch (err) {
      setError(err.message);
    }
  }

  async function updateLearningPath(path, steps) {
    setError('');

    const payload = {
      concepts: steps.map((step) => ({
        concept: step.concept?._id || step.concept,
        completed: Boolean(step.completed),
      })),
    };

    try {
      const updated = await request(`/learning-paths/${path._id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      setLearningPaths((previous) =>
        previous.map((item) =>
          item._id === updated._id ? updated : item
        )
      );

      setStatus('Learning path progress saved to MongoDB');
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteLearningPath(id) {
    if (!window.confirm('Delete this learning path?')) return;

    setError('');

    try {
      await request(`/learning-paths/${id}`, { method: 'DELETE' });

      setLearningPaths((previous) =>
        previous.filter((item) => item._id !== id)
      );

      setStatus('Learning path deleted');
    } catch (err) {
      setError(err.message);
    }
  }

  function addConceptToPath(path, conceptId) {
    if (!conceptId) return;

    const steps = path.concepts || [];

    const exists = steps.some(
      (step) => (step.concept?._id || step.concept) === conceptId
    );

    if (exists) {
      setError('This concept is already in the learning path.');
      return;
    }

    updateLearningPath(path, [
      ...steps.map((step) => ({
        concept: step.concept?._id || step.concept,
        completed: Boolean(step.completed),
      })),
      { concept: conceptId, completed: false },
    ]);
  }

  function togglePathStep(path, index, completed) {
    const steps = (path.concepts || []).map((step, i) => ({
      concept: step.concept?._id || step.concept,
      completed: i === index ? completed : Boolean(step.completed),
    }));

    updateLearningPath(path, steps);
  }

  function movePathStep(path, index, direction) {
    const steps = (path.concepts || []).map((step) => ({
      concept: step.concept?._id || step.concept,
      completed: Boolean(step.completed),
    }));

    const target = index + direction;

    if (target < 0 || target >= steps.length) return;

    [steps[index], steps[target]] = [steps[target], steps[index]];

    updateLearningPath(path, steps);
  }

  function removePathStep(path, index) {
    const steps = (path.concepts || [])
      .filter((_, i) => i !== index)
      .map((step) => ({
        concept: step.concept?._id || step.concept,
        completed: Boolean(step.completed),
      }));

    updateLearningPath(path, steps);
  }

  return (
    <div className="app">
      <nav className="navbar">
        <a className="logo" href="#home">
          Mind<span>Mesh</span>
        </a>

        <div className="nav-links">
          <a href="#dashboard">Dashboard</a>
          <a href="#concept-form">Add Concept</a>
          <a href="#concepts">Concepts</a>
          <a href="#connections">Connections</a>
          <a href="#learning">Learning Paths</a>
        </div>
      </nav>

      <main className="main-content">
        <section className="hero" id="home">
          <p className="welcome">YOUR PERSONAL KNOWLEDGE SPACE</p>
          <h1>
            Build your knowledge <span>network.</span>
          </h1>
          <p className="subtitle">
            Capture ideas, connect concepts, and organize your learning
            in one place.
          </p>
          <a className="hero-button" href="#concept-form">
            + Add a concept
          </a>
          <p role="status" style={{ marginTop: 14, fontSize: 13 }}>
            {status}
          </p>
        </section>

        {error && (
          <div
            className="empty-state"
            role="alert"
            style={{ marginBottom: 20 }}
          >
            <p>{error}</p>
            <button
              className="primary-button"
              onClick={() => {
                setError('');
                loadData();
              }}
            >
              Retry loading
            </button>
          </div>
        )}

        <section id="dashboard" className="section">
          <div className="section-heading">
            <div>
              <p className="section-label">OVERVIEW</p>
              <h2>Your dashboard</h2>
              <p className="section-description">
                An overview of your growing knowledge network.
              </p>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-icon">🧠</span>
              <div><p>Total concepts</p><h2>{concepts.length}</h2></div>
            </div>
            <div className="stat-card">
              <span className="stat-icon">❤️</span>
              <div><p>Favorites</p><h2>{favoriteCount}</h2></div>
            </div>
            <div className="stat-card">
              <span className="stat-icon">🔗</span>
              <div><p>Connections</p><h2>{connections.length}</h2></div>
            </div>
            <div className="stat-card">
              <span className="stat-icon">📈</span>
              <div><p>Concepts connected</p><h2>{connectedPercentage}%</h2></div>
            </div>
          </div>
        </section>

        <section className="section" id="concept-form">
          <div className="section-heading">
            <div>
              <p className="section-label">KNOWLEDGE CAPTURE</p>
              <h2>{editingId ? 'Edit concept' : 'Add a new concept'}</h2>
              <p className="section-description">
                Your concepts are saved in MongoDB.
              </p>
            </div>
          </div>

          <form className="concept-form" onSubmit={saveConcept}>
            <label htmlFor="title">Concept title *</label>
            <input
              id="title"
              name="title"
              value={form.title}
              onChange={updateForm}
              maxLength={100}
              required
              placeholder="e.g. React Hooks"
            />

            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={form.description}
              onChange={updateForm}
              maxLength={1000}
              rows={4}
              placeholder="What have you learned?"
            />

            <label htmlFor="category">Category</label>
            <select
              id="category"
              name="category"
              value={form.category}
              onChange={updateForm}
            >
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>

            <label htmlFor="tags">Tags</label>
            <input
              id="tags"
              name="tags"
              value={form.tags}
              onChange={updateForm}
              placeholder="javascript, frontend, hooks"
            />
            <p className="field-hint">Separate tags with commas.</p>

            <div className="concept-form-actions">
              <button className="primary-button" disabled={busy}>
                {busy
                  ? 'Saving...'
                  : editingId ? 'Save changes' : 'Add concept'}
              </button>
              {editingId && (
                <button
                  className="edit-button"
                  type="button"
                  onClick={resetForm}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="section" id="concepts">
          <div className="section-heading">
            <div>
              <p className="section-label">YOUR KNOWLEDGE BASE</p>
              <h2>My concepts</h2>
              <p className="section-description">
                Search, filter, edit, and organize your concepts.
              </p>
            </div>
            <span className="count-badge">
              {filteredConcepts.length} concepts
            </span>
          </div>

          <div className="search-wrapper">
            <span aria-hidden="true">🔎</span>
            <input
              className="search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search titles, descriptions, categories, or tags..."
              aria-label="Search concepts"
            />
          </div>

          <div className="filter-row">
            <button
              type="button"
              className={`filter-button ${category === 'All' ? 'active' : ''}`}
              onClick={() => setCategory('All')}
            >
              All categories
            </button>

            {CATEGORIES.map((item) => (
              <button
                type="button"
                key={item}
                className={`filter-button ${category === item ? 'active' : ''}`}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}

            <button
              type="button"
              className={`filter-button ${favoritesOnly ? 'active' : ''}`}
              aria-pressed={favoritesOnly}
              onClick={() => setFavoritesOnly((previous) => !previous)}
            >
              ❤️ Favorites
            </button>
          </div>

          <div className="concept-list">
            {filteredConcepts.map((concept) => (
              <article className="concept-item" key={concept._id}>
                <span className="concept-icon">💡</span>

                <div className="concept-details">
                  <h3>{concept.title}</h3>
                  <p>{concept.description || 'No description added yet.'}</p>
                  <span className="category-badge">{concept.category}</span>

                  <div className="tag-list">
                    {(concept.tags || []).map((tag, index) => (
                      <span className="tag-badge" key={`${tag}-${index}`}>
                        #{tag}
                      </span>
                    ))}
                  </div>

                  <p className="section-description">
                    Created {concept.createdAt
                      ? new Date(concept.createdAt).toLocaleDateString()
                      : 'recently'}
                  </p>
                </div>

                <div className="concept-actions">
                  <button
                    type="button"
                    className="favorite-button"
                    aria-pressed={Boolean(concept.favorite)}
                    onClick={() => toggleFavorite(concept)}
                  >
                    {concept.favorite ? '❤️ Favorited' : '♡ Favorite'}
                  </button>

                  <button
                    type="button"
                    className="edit-button"
                    onClick={() => editConcept(concept)}
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => {
                      document.getElementById('learning')?.scrollIntoView({
                        behavior: 'smooth',
                      });
                    }}
                  >
                    + Learning path
                  </button>

                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => deleteConcept(concept._id)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}

            {filteredConcepts.length === 0 && (
              <div className="empty-state">
                <span>🧠</span>
                <h3>No concepts found</h3>
                <p>Add a concept or change your search and filters.</p>
              </div>
            )}
          </div>
        </section>

        <section className="section" id="connections">
          <div className="section-heading">
            <div>
              <p className="section-label">KNOWLEDGE NETWORK</p>
              <h2>Concept connections</h2>
              <p className="section-description">
                Describe how two concepts relate to each other.
              </p>
            </div>
          </div>

          <form className="connection-form" onSubmit={addConnection}>
            <div className="connection-fields">
              <div className="form-group">
                <label htmlFor="from">First concept</label>
                <select
                  id="from"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  required
                >
                  <option value="">Select concept</option>
                  {concepts.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relationship-arrow" aria-hidden="true">↔</div>

              <div className="form-group">
                <label htmlFor="to">Second concept</label>
                <select
                  id="to"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  required
                >
                  <option value="">Select concept</option>
                  {concepts.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label htmlFor="relationship">Relationship</label>
            <input
              id="relationship"
              value={relationship}
              onChange={(event) => setRelationship(event.target.value)}
              maxLength={100}
              required
              placeholder="e.g. depends on, is part of, related to"
            />

            <button
              className="primary-button"
              disabled={concepts.length < 2}
            >
              Create connection
            </button>
          </form>

          <div className="connections-list">
            <h3 className="list-heading">
              Saved connections ({connections.length})
            </h3>

            {connections.map((item) => (
              <div className="connection-item" key={item._id}>
                <div className="connection-concepts">
                  <span className="connection-node">
                    {item.from?.title ||
                      getTitle(item.from?._id || item.from)}
                  </span>

                  <div className="connection-middle">
                    <span className="relationship-label">
                      {item.relationship}
                    </span>
                    <span className="connection-line">↔</span>
                  </div>

                  <span className="connection-node">
                    {item.to?.title ||
                      getTitle(item.to?._id || item.to)}
                  </span>
                </div>

                <button
                  type="button"
                  className="delete-button"
                  onClick={() => deleteConnection(item._id)}
                >
                  Remove
                </button>
              </div>
            ))}

            {connections.length === 0 && (
              <div className="empty-state">
                <span>🔗</span>
                <h3>No connections yet</h3>
                <p>Add at least two concepts to connect them.</p>
              </div>
            )}
          </div>
        </section>

        <section className="section learning-section" id="learning">
          <p className="section-label">PERSONAL GROWTH</p>
          <h2>My learning paths</h2>
          <p className="section-description">
            Create multiple roadmaps, organize concepts, and track
            completion. Progress is saved in MongoDB.
          </p>

          <form
            className="concept-form"
            onSubmit={createLearningPath}
            style={{ marginTop: 20 }}
          >
            <label htmlFor="pathTitle">Learning path title *</label>
            <input
              id="pathTitle"
              value={pathTitle}
              onChange={(event) => setPathTitle(event.target.value)}
              maxLength={100}
              required
              placeholder="e.g. React Roadmap"
            />

            <label htmlFor="pathDescription">Description</label>
            <textarea
              id="pathDescription"
              value={pathDescription}
              onChange={(event) => setPathDescription(event.target.value)}
              maxLength={500}
              rows={2}
              placeholder="What do you want to learn?"
            />

            <button className="primary-button" type="submit">
              Create learning path
            </button>
          </form>

          {learningPaths.map((path) => {
            const steps = path.concepts || [];
            const completed = steps.filter((step) => step.completed).length;
            const percentage = steps.length
              ? Math.round((completed / steps.length) * 100)
              : 0;

            return (
              <div
                className="learning-content"
                key={path._id}
                style={{ marginTop: 20 }}
              >
                <div style={{ width: '100%', minWidth: 0 }}>
                  <h3>{path.title}</h3>
                  <p>
                    {path.description || 'Your personal learning roadmap.'}
                  </p>

                  <p style={{ marginTop: 10 }}>
                    {completed} of {steps.length} steps completed
                    {' '}({percentage}%)
                  </p>

                  <div
                    style={{
                      height: 8,
                      background: '#e5e7eb',
                      borderRadius: 10,
                      overflow: 'hidden',
                      margin: '10px 0 18px',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${percentage}%`,
                        background: '#6c63ff',
                        transition: 'width 0.2s',
                      }}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor={`add-concept-${path._id}`}>
                      Add a concept to this path
                    </label>

                    <select
                      id={`add-concept-${path._id}`}
                      value=""
                      onChange={(event) =>
                        addConceptToPath(path, event.target.value)
                      }
                    >
                      <option value="">Select a concept</option>

                      {concepts
                        .filter((concept) =>
                          !steps.some(
                            (step) =>
                              (step.concept?._id || step.concept) ===
                              concept._id
                          )
                        )
                        .map((concept) => (
                          <option key={concept._id} value={concept._id}>
                            {concept.title}
                          </option>
                        ))}
                    </select>
                  </div>

                  {steps.map((step, index) => {
                    const conceptId =
                      step.concept?._id || step.concept;

                    const title =
                      step.concept?.title || getTitle(conceptId);

                    return (
                      <div
                        className="connection-item"
                        key={`${conceptId}-${index}`}
                      >
                        <div className="connection-concepts">
                          <span>{index + 1}.</span>
                          <span className="connection-node">
                            {title}
                          </span>

                          <label>
                            <input
                              type="checkbox"
                              checked={Boolean(step.completed)}
                              onChange={(event) =>
                                togglePathStep(
                                  path,
                                  index,
                                  event.target.checked
                                )
                              }
                            />
                            {' '}Completed
                          </label>
                        </div>

                        <div className="concept-actions">
                          <button
                            type="button"
                            className="edit-button"
                            disabled={index === 0}
                            onClick={() =>
                              movePathStep(path, index, -1)
                            }
                          >
                            ↑
                          </button>

                          <button
                            type="button"
                            className="edit-button"
                            disabled={index === steps.length - 1}
                            onClick={() =>
                              movePathStep(path, index, 1)
                            }
                          >
                            ↓
                          </button>

                          <button
                            type="button"
                            className="delete-button"
                            onClick={() => removePathStep(path, index)}
                          >
                            Remove step
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    className="delete-button"
                    style={{ marginTop: 15 }}
                    onClick={() => deleteLearningPath(path._id)}
                  >
                    Delete learning path
                  </button>
                </div>
              </div>
            );
          })}

          {learningPaths.length === 0 && (
            <div className="empty-state" style={{ marginTop: 20 }}>
              <span>🗺️</span>
              <h3>No learning paths yet</h3>
              <p>Create your first roadmap above.</p>
            </div>
          )}
        </section>

        <footer className="footer">
          <a className="logo" href="#home">
            Mind<span>Mesh</span>
          </a>
          <p>Organize ideas. Discover connections. Keep learning.</p>
          <a href="#home">Back to top ↑</a>
        </footer>
      </main>
    </div>
  );
}

export default App;