/* ==========================================================================
   TaskFlow — Dependency Graph View (v2, polished)
   Same render(container, tasks, isLockedFn) signature as before — this is a
   drop-in replacement for the previous graphView.js, no other files change.

   New in this version:
   - Nodes have a soft drop shadow + rounded corners
   - "Ready" nodes get a subtle pulsing glow, drawing the eye to what's
     actionable right now
   - Edges animate drawing themselves in on render (stroke-dasharray trick)
   - Hovering a node highlights it plus every edge directly connected to it,
     so you can visually trace "what does this block / what does this need"
   ========================================================================== */

const GraphView = (function () {

  let stylesInjected = false;

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = `
      .gv-node { cursor: pointer; transition: filter 0.15s ease, transform 0.15s ease; transform-origin: center; }
      .gv-node:hover { filter: brightness(1.06); transform: scale(1.03); }
      .gv-node-rect { filter: drop-shadow(0 2px 4px rgba(60,50,30,0.18)); }
      .gv-node-ready .gv-node-rect { animation: gv-pulse 2.2s ease-in-out infinite; }
      @keyframes gv-pulse {
        0%, 100% { filter: drop-shadow(0 2px 4px rgba(60,50,30,0.18)) drop-shadow(0 0 0 rgba(217,164,65,0)); }
        50% { filter: drop-shadow(0 2px 4px rgba(60,50,30,0.18)) drop-shadow(0 0 8px rgba(217,164,65,0.55)); }
      }
      .gv-edge { transition: stroke 0.15s ease, stroke-width 0.15s ease, opacity 0.15s ease; }
      .gv-edge.gv-dim { opacity: 0.25; }
      .gv-edge.gv-highlight { stroke: #a15c43 !important; stroke-width: 2.5px; opacity: 1; }
      .gv-node.gv-dim { opacity: 0.35; }
    `;
    document.head.appendChild(style);
  }

  function computeLevels(tasks) {
    const byId = new Map(tasks.map(t => [t.id, t]));
    const cache = new Map();

    function levelOf(taskId, seen) {
      if (cache.has(taskId)) return cache.get(taskId);
      seen = seen || new Set();
      if (seen.has(taskId)) return 0;
      seen.add(taskId);

      const task = byId.get(taskId);
      const deps = task && task.dependencies ? task.dependencies : [];
      if (deps.length === 0) {
        cache.set(taskId, 0);
        return 0;
      }
      const maxDepLevel = Math.max(...deps.map(d => levelOf(d, seen)));
      const lvl = maxDepLevel + 1;
      cache.set(taskId, lvl);
      return lvl;
    }

    tasks.forEach(t => levelOf(t.id));
    return cache;
  }

  function statusColor(task, locked) {
    if (task.status === 'DONE') return { fill: '#8B9A6B', stroke: '#6b7a4f', text: '#ffffff' };
    if (locked) return { fill: '#e8ddc7', stroke: '#c9b98f', text: '#6b5d3f' };
    return { fill: '#f5ead1', stroke: '#d9a441', text: '#5a4a24' };
  }

  function render(container, tasks, isLockedFn) {
    if (!container) return;
    injectStyles();

    if (!tasks || tasks.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:24px;">No tasks yet — create some to see the dependency graph.</div>';
      return;
    }

    const levels = computeLevels(tasks);
    const byLevel = new Map();
    tasks.forEach(t => {
      const lvl = levels.get(t.id) || 0;
      if (!byLevel.has(lvl)) byLevel.set(lvl, []);
      byLevel.get(lvl).push(t);
    });

    const maxLevel = Math.max(...Array.from(byLevel.keys()));
    const colWidth = 200, rowHeight = 70, nodeW = 160, nodeH = 48, padding = 30;

    let maxRows = 0;
    byLevel.forEach(arr => { if (arr.length > maxRows) maxRows = arr.length; });

    const svgWidth = padding * 2 + (maxLevel + 1) * colWidth;
    const svgHeight = padding * 2 + maxRows * rowHeight;

    const pos = new Map();
    byLevel.forEach((arr, lvl) => {
      arr.forEach((t, i) => {
        pos.set(t.id, { x: padding + lvl * colWidth, y: padding + i * rowHeight, w: nodeW, h: nodeH });
      });
    });

    const edges = [];
    tasks.forEach(t => {
      (t.dependencies || []).forEach(depId => {
        const from = pos.get(depId);
        const to = pos.get(t.id);
        if (!from || !to) return;
        edges.push({ fromId: depId, toId: t.id, from, to });
      });
    });

    let edgesSvg = '';
    edges.forEach((e, i) => {
      const x1 = e.from.x + e.from.w, y1 = e.from.y + e.from.h / 2;
      const x2 = e.to.x, y2 = e.to.y + e.to.h / 2;
      const midX = (x1 + x2) / 2;
      const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
      edgesSvg += `<path class="gv-edge" data-from="${e.fromId}" data-to="${e.toId}" d="${d}" fill="none" stroke="#b7a888" stroke-width="1.5" marker-end="url(#arrowhead)" pathLength="1" style="stroke-dasharray:1; stroke-dashoffset:1; animation: gv-draw 0.5s ease forwards ${i * 0.06}s;"/>`;
    });

    let nodesSvg = '';
    tasks.forEach(t => {
      const p = pos.get(t.id);
      if (!p) return;
      const locked = isLockedFn(t);
      const c = statusColor(t, locked);
      const label = t.title.length > 18 ? t.title.slice(0, 16) + '…' : t.title;
      const icon = t.status === 'DONE' ? '✓' : locked ? '🔒' : '🔓';
      const readyClass = (!locked && t.status !== 'DONE') ? 'gv-node-ready' : '';
      nodesSvg += `
        <g class="gv-node ${readyClass}" data-id="${t.id}">
          <rect class="gv-node-rect" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="8" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>
          <text x="${p.x + 12}" y="${p.y + p.h / 2 + 5}" font-size="13" fill="${c.text}" font-family="Inter, sans-serif">${icon} ${label}</text>
        </g>`;
    });

    container.innerHTML = `
      <div style="overflow-x:auto;">
        <svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#b7a888"/>
            </marker>
          </defs>
          <style>@keyframes gv-draw { to { stroke-dashoffset: 0; } }</style>
          ${edgesSvg}
          ${nodesSvg}
        </svg>
      </div>
      <div style="display:flex;gap:16px;margin-top:12px;font-size:0.8rem;color:var(--text-muted);">
        <span>🔓 Ready</span>
        <span>🔒 Locked</span>
        <span>✓ Done</span>
      </div>
    `;

    const svgEl = container.querySelector('svg');
    const nodeEls = svgEl.querySelectorAll('.gv-node');
    const edgeEls = svgEl.querySelectorAll('.gv-edge');

    nodeEls.forEach(nodeEl => {
      nodeEl.addEventListener('mouseenter', () => {
        const id = nodeEl.dataset.id;
        const connectedIds = new Set([id]);

        edgeEls.forEach(edgeEl => {
          const touches = edgeEl.dataset.from === id || edgeEl.dataset.to === id;
          edgeEl.classList.toggle('gv-highlight', touches);
          edgeEl.classList.toggle('gv-dim', !touches);
          if (touches) {
            connectedIds.add(edgeEl.dataset.from);
            connectedIds.add(edgeEl.dataset.to);
          }
        });

        nodeEls.forEach(n => n.classList.toggle('gv-dim', !connectedIds.has(n.dataset.id)));
      });

      nodeEl.addEventListener('mouseleave', () => {
        edgeEls.forEach(edgeEl => edgeEl.classList.remove('gv-highlight', 'gv-dim'));
        nodeEls.forEach(n => n.classList.remove('gv-dim'));
      });
    });
  }

  return { render };
})();