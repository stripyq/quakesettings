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
      const edpi = parseInt(card.dataset.edpi) || 0;

      const matchesSearch = name.includes(searchTerm);
      const matchesCategory = category === 'all' || cardCategory === category;

      let matchesSens = true;
      if (sensRange === 'low') matchesSens = edpi < 800;
      else if (sensRange === 'medium') matchesSens = edpi >= 800 && edpi <= 1500;
      else if (sensRange === 'high') matchesSens = edpi > 1500;

      card.style.display = (matchesSearch && matchesCategory && matchesSens) ? '' : 'none';
    });

    // Sort
    const visibleCards = playerCards.filter(c => c.style.display !== 'none');

    visibleCards.sort((a, b) => {
      switch(sortValue) {
        case 'rating':
          return (parseInt(b.dataset.rating) || 0) - (parseInt(a.dataset.rating) || 0);
        case 'edpi-asc':
          return (parseInt(a.dataset.edpi) || 0) - (parseInt(b.dataset.edpi) || 0);
        case 'edpi-desc':
          return (parseInt(b.dataset.edpi) || 0) - (parseInt(a.dataset.edpi) || 0);
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
