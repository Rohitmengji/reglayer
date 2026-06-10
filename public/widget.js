/**
 * RegLayer Embeddable Compliance Widget
 * 
 * Sites include this in their footer to show a floating badge:
 * <script src="https://reglayer.vercel.app/widget.js" data-site="SITE_ID"></script>
 *
 * This creates a small "Verified by RegLayer" badge in the corner.
 */

(function() {
  'use strict';

  // Find our script tag to get config
  var scripts = document.querySelectorAll('script[data-site]');
  var script = scripts[scripts.length - 1];
  if (!script) return;

  var siteId = script.getAttribute('data-site');
  var position = script.getAttribute('data-position') || 'bottom-left';
  var theme = script.getAttribute('data-theme') || 'dark';
  
  if (!siteId) return;

  // Create widget container
  var container = document.createElement('div');
  container.id = 'reglayer-badge';
  container.setAttribute('role', 'complementary');
  container.setAttribute('aria-label', 'Accessibility compliance status');

  // Position styles
  var positions = {
    'bottom-left': 'bottom:16px;left:16px;',
    'bottom-right': 'bottom:16px;right:16px;',
    'top-left': 'top:16px;left:16px;',
    'top-right': 'top:16px;right:16px;',
  };

  container.style.cssText = 'position:fixed;z-index:9990;' + (positions[position] || positions['bottom-left']) + 'transition:transform 0.2s ease,opacity 0.2s ease;transform:translateY(0);opacity:1;';

  // Create badge link
  var link = document.createElement('a');
  link.href = 'https://reglayer.vercel.app/report/public/' + siteId;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = 'View accessibility report on RegLayer';
  link.style.cssText = 'display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;text-decoration:none;font-family:system-ui,-apple-system,sans-serif;font-size:12px;font-weight:500;box-shadow:0 2px 8px rgba(0,0,0,0.12);transition:transform 0.15s ease,box-shadow 0.15s ease;' + (theme === 'dark' ? 'background:#1f2937;color:#e5e7eb;border:1px solid #374151;' : 'background:#ffffff;color:#374151;border:1px solid #e5e7eb;');

  // Hover effect
  link.addEventListener('mouseenter', function() {
    link.style.transform = 'translateY(-2px)';
    link.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  });
  link.addEventListener('mouseleave', function() {
    link.style.transform = 'translateY(0)';
    link.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
  });

  // Shield SVG icon
  var icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + (theme === 'dark' ? '#10b981' : '#059669') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z"/><path d="M9 12l2 2 4-4"/></svg>';

  link.innerHTML = icon + '<span>Verified by <strong style="font-weight:700;">RegLayer</strong></span>';

  container.appendChild(link);
  document.body.appendChild(container);

  // Fetch and show score (optional enhancement)
  fetch('https://reglayer.vercel.app/api/badge/' + siteId + '/json')
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      if (data && data.score !== null) {
        var scoreEl = document.createElement('span');
        scoreEl.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:20px;border-radius:10px;font-size:10px;font-weight:700;padding:0 6px;margin-left:4px;' + (data.score >= 90 ? 'background:#d1fae5;color:#065f46;' : data.score >= 60 ? 'background:#fef3c7;color:#92400e;' : 'background:#fee2e2;color:#991b1b;');
        scoreEl.textContent = data.score + '%';
        link.appendChild(scoreEl);
      }
    })
    .catch(function() { /* ignore */ });
})();
