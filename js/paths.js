/** Resolve data JSON paths for local serve.py vs GitHub Pages site root. */
(function () {
  const path = window.location.pathname || '';
  const inDashboard = path.includes('/portfolio_dashboard/');
  window.DashboardPaths = {
    data: inDashboard ? '../data/' : 'data/',
    js: inDashboard ? 'js/' : 'js/',
    isLocal: inDashboard,
  };
})();
