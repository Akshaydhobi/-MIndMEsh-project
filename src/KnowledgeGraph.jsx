
import { useMemo, useState, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import './KnowledgeGraph.css';

function KnowledgeGraph({ concepts = [], connections = [] }) {
  const [selectedId, setSelectedId] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [search, setSearch] = useState('');

  const normalizedConcepts = useMemo(
    () =>
      concepts
        .filter((concept) => concept.id || concept._id)
        .map((concept) => ({
          ...concept,
          id: String(concept.id || concept._id),
          title: concept.title || 'Untitled',
          category: concept.category || 'Other',
          description: concept.description || '',
          favorite: Boolean(concept.favorite),
          tags: Array.isArray(concept.tags) ? concept.tags : [],
        })),
    [concepts]
  );

  const categories = useMemo(
    () => [
      'All',
      ...new Set(normalizedConcepts.map((concept) => concept.category)),
    ],
    [normalizedConcepts]
  );

  const visibleConcepts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return normalizedConcepts.filter((concept) => {
      const matchesCategory =
        selectedCategory === 'All' ||
        concept.category === selectedCategory;

      const matchesFavorite =
        !favoritesOnly || concept.favorite;

      const searchableText = [
        concept.title,
        concept.category,
        concept.description,
        ...concept.tags,
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch = searchableText.includes(query);

      return matchesCategory && matchesFavorite && matchesSearch;
    });
  }, [
    normalizedConcepts,
    selectedCategory,
    favoritesOnly,
    search,
  ]);

  const graphData = useMemo(() => {
    const nodes = visibleConcepts.map((concept) => ({
      id: concept.id,
      name: concept.title,
      category: concept.category,
      description: concept.description,
      tags: concept.tags,
      favorite: concept.favorite,
    }));

    const visibleIds = new Set(nodes.map((node) => node.id));

    const getId = (value) =>
      String(
        typeof value === 'object'
          ? value?._id || value?.id || ''
          : value ?? ''
      );

    const links = connections
      .filter(
        (connection) =>
          connection.from != null && connection.to != null
      )
      .map((connection) => ({
        source: getId(connection.from),
        target: getId(connection.to),
        relationship: connection.relationship || 'related to',
      }))
      .filter(
        (link) =>
          visibleIds.has(link.source) &&
          visibleIds.has(link.target)
      );

    return { nodes, links };
  }, [visibleConcepts, connections]);

  const selectedConcept = useMemo(
    () =>
      graphData.nodes.find((node) => node.id === selectedId) || null,
    [graphData.nodes, selectedId]
  );

  const relatedConnections = useMemo(
    () =>
      selectedConcept
        ? graphData.links.filter((link) => {
            const sourceId =
              typeof link.source === 'object'
                ? String(link.source.id)
                : String(link.source);

            const targetId =
              typeof link.target === 'object'
                ? String(link.target.id)
                : String(link.target);

            return (
              sourceId === selectedConcept.id ||
              targetId === selectedConcept.id
            );
          })
        : [],
    [graphData.links, selectedConcept]
  );

  const handleNodeClick = useCallback((node) => {
    setSelectedId(String(node.id));
  }, []);

  function clearFilters() {
    setSearch('');
    setSelectedCategory('All');
    setFavoritesOnly(false);
    setSelectedId(null);
  }

  function handleSearchChange(event) {
    setSearch(event.target.value);
    setSelectedId(null);
  }

  return (
    <div className="kg-layout">
      <div className="kg-graph-panel">
        <div className="kg-toolbar">
          <div>
            <h3>Explore Your Ideas</h3>
            <p>Search, filter, and click a node to explore it.</p>
          </div>

          <div className="kg-counts">
            <span>{graphData.nodes.length} concepts</span>
            <span>{graphData.links.length} connections</span>
          </div>
        </div>

        <div className="kg-filters">
          <div className="kg-search-group">
            <label htmlFor="kg-search">Search concepts</label>
            <input
              id="kg-search"
              type="search"
              value={search}
              onChange={handleSearchChange}
              placeholder="Search title, description, category, or tag..."
            />
          </div>

          <div className="kg-filter-group">
            <label htmlFor="kg-category">Category</label>
            <select
              id="kg-category"
              value={selectedCategory}
              onChange={(event) => {
                setSelectedCategory(event.target.value);
                setSelectedId(null);
              }}
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category === 'All' ? 'All Categories' : category}
                </option>
              ))}
            </select>
          </div>

          <label className="kg-favorite-filter">
            <input
              type="checkbox"
              checked={favoritesOnly}
              onChange={(event) => {
                setFavoritesOnly(event.target.checked);
                setSelectedId(null);
              }}
            />
            ⭐ Favorites only
          </label>

          <button
            type="button"
            className="kg-reset-filter"
            onClick={clearFilters}
            disabled={
              !search &&
              selectedCategory === 'All' &&
              !favoritesOnly
            }
          >
            Clear filters
          </button>
        </div>

        {graphData.nodes.length === 0 ? (
          <div className="kg-empty">
            <span className="kg-empty-icon">🔎</span>
            <h3>No matching concepts</h3>
            <p>
              Try another search, select a different category, or turn off
              Favorites only.
            </p>
            <button
              type="button"
              className="kg-clear-button"
              onClick={clearFilters}
            >
              Show all concepts
            </button>
          </div>
        ) : (
          <>
            <div className="kg-canvas">
              <ForceGraph2D
                graphData={graphData}
                width={800}
                height={500}
                backgroundColor="#101827"
                nodeId="id"
                nodeLabel={(node) =>
                  `${node.name} · ${node.category}`
                }
                nodeColor={(node) =>
                  node.id === selectedId
                    ? '#f59e0b'
                    : node.favorite
                      ? '#fbbf24'
                      : '#60a5fa'
                }
                nodeRelSize={7}
                nodeVal={(node) =>
                  node.id === selectedId ? 2 : 1
                }
                linkColor={() => '#64748b'}
                linkDirectionalArrowLength={5}
                linkDirectionalArrowRelPos={1}
                linkLabel={(link) => link.relationship}
                onNodeClick={handleNodeClick}
                enableNodeDrag
                cooldownTicks={100}
                nodeCanvasObjectMode={() => 'after'}
                nodeCanvasObject={(node, ctx, globalScale) => {
                  const fontSize = Math.max(10 / globalScale, 3);

                  ctx.font = `${fontSize}px Sans-Serif`;
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'top';
                  ctx.fillStyle = '#f8fafc';
                  ctx.fillText(
                    node.name,
                    node.x,
                    node.y + 9 / globalScale
                  );
                }}
              />
            </div>

            <p className="kg-hint">
              Drag nodes to rearrange. Scroll to zoom. Gold nodes are favorites.
            </p>
          </>
        )}
      </div>

      <aside className="kg-details">
        {selectedConcept ? (
          <>
            <div className="kg-details-heading">
              <span className="kg-details-icon">💡</span>
              <div>
                <p className="kg-eyebrow">SELECTED CONCEPT</p>
                <h3>{selectedConcept.name}</h3>
              </div>
            </div>

            <div className="kg-category">
              {selectedConcept.category}
            </div>

            {selectedConcept.favorite && (
              <p className="kg-favorite">⭐ Favorite concept</p>
            )}

            <div className="kg-detail-section">
              <h4>Description</h4>
              <p>
                {selectedConcept.description ||
                  'No description has been added yet.'}
              </p>
            </div>

            <div className="kg-detail-section">
              <h4>Tags</h4>
              {selectedConcept.tags.length > 0 ? (
                <div className="kg-tags">
                  {selectedConcept.tags.map((tag, index) => (
                    <span key={`${tag}-${index}`}>#{tag}</span>
                  ))}
                </div>
              ) : (
                <p>No tags added.</p>
              )}
            </div>

            <div className="kg-detail-section">
              <h4>Connections ({relatedConnections.length})</h4>

              {relatedConnections.length > 0 ? (
                <ul className="kg-connection-list">
                  {relatedConnections.map((link, index) => {
                    const sourceId =
                      typeof link.source === 'object'
                        ? String(link.source.id)
                        : String(link.source);

                    const targetId =
                      typeof link.target === 'object'
                        ? String(link.target.id)
                        : String(link.target);

                    const otherId =
                      sourceId === selectedConcept.id
                        ? targetId
                        : sourceId;

                    const otherNode = graphData.nodes.find(
                      (node) => node.id === otherId
                    );

                    return (
                      <li key={`${otherId}-${index}`}>
                        <button
                          type="button"
                          className="kg-related-button"
                          onClick={() => setSelectedId(otherId)}
                        >
                          <span>
                            {otherNode?.name || 'Unknown concept'}
                          </span>
                          <small>{link.relationship}</small>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>No visible connections for this concept.</p>
              )}
            </div>

            <button
              type="button"
              className="kg-clear-button"
              onClick={() => setSelectedId(null)}
            >
              Clear selection
            </button>
          </>
        ) : (
          <div className="kg-no-selection">
            <span>👆</span>
            <h3>Select a concept</h3>
            <p>
              Click a visible node to view its description, tags, and connections.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

export default KnowledgeGraph;