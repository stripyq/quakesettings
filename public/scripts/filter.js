// ============================================
// Search, Filter, and Sort Functionality
// ============================================

document.addEventListener('DOMContentLoaded', function() {
  const searchInput = document.getElementById('player-search');
  const categoryFilter = document.getElementById('category-filter');
  const sensFilter = document.getElementById('sens-filter');
  const sortBy = document.getElementById('sort-by');
  const playerGrid = document.getElementById('player-grid');

  if (!playerGrid) return;

  const playerCards = Array.from(playerGrid.querySelectorAll('.player-card'));

  function filterAndSort() {
    const searchTerm = searchInput?.value.toLowerCase() || '';
    const category = categoryFilter?.value || 'all';
    const sensRange = sensFilter?.value || 'all';
    const sortValue = sortBy?.value || 'rating';

    // Filter
    playerCards.forEach(card => {
      const name = card.dataset.name || '';
      const cardCategory = card.dataset.category || '';
      const edpi = parseFloat(card.dataset.edpi);

      const matchesSearch = name.includes(searchTerm);
      const matchesCategory = category === 'all' || cardCategory === category;

      let matchesSens = true;
      if (sensRange !== 'all' && isNaN(edpi)) matchesSens = false;
      else if (sensRange === 'low') matchesSens = edpi < 800;
      else if (sensRange === 'medium') matchesSens = edpi >= 800 && edpi <= 1500;
      else if (sensRange === 'high') matchesSens = edpi > 1500;

      card.style.display = (matchesSearch && matchesCategory && matchesSens) ? '' : 'none';
    });

    // Sort
    const visibleCards = playerCards.filter(c => c.style.display !== 'none');

    visibleCards.sort((a, b) => {
      switch(sortValue) {
        case 'rating':
          return (parseFloat(b.dataset.rating) || 0) - (parseFloat(a.dataset.rating) || 0);
        case 'edpi-asc':
          return (parseFloat(a.dataset.edpi) || Infinity) - (parseFloat(b.dataset.edpi) || Infinity);
        case 'edpi-desc':
          return (parseFloat(b.dataset.edpi) || 0) - (parseFloat(a.dataset.edpi) || 0);
        case 'name':
          return (a.dataset.name || '').localeCompare(b.dataset.name || '');
        default:
          return 0;
      }
    });

    // Reorder in DOM
    visibleCards.forEach(card => playerGrid.appendChild(card));
  }

  // Event listeners
  searchInput?.addEventListener('input', filterAndSort);
  categoryFilter?.addEventListener('change', filterAndSort);
  sensFilter?.addEventListener('change', filterAndSort);
  sortBy?.addEventListener('change', filterAndSort);
});
