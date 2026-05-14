(() => {
  function getComments() {
    return Array.from(document.querySelectorAll('tr.athing.comtr'));
  }

  function getIndent(row) {
    const img = row.querySelector('td.ind img');
    return img ? parseInt(img.getAttribute('width'), 10) : 0;
  }

  function getSelected() {
    return document.querySelector('tr.athing.comtr.hn-nav-selected');
  }

  const history = [];
  let historyPos = -1;
  let forceSmoothScroll = false;
  let showIndicator = true;

  chrome.storage.sync.get({ smoothScroll: false, showIndicator: true }, ({ smoothScroll, showIndicator: si }) => {
    forceSmoothScroll = smoothScroll;
    showIndicator = si;
    indicator.style.display = si ? '' : 'none';
  });
  chrome.storage.onChanged.addListener(({ smoothScroll, showIndicator: si }) => {
    if (smoothScroll) forceSmoothScroll = smoothScroll.newValue;
    if (si) {
      showIndicator = si.newValue;
      indicator.style.display = si.newValue ? '' : 'none';
    }
  });

  function animatedScrollTo(targetY) {
    const startY = window.scrollY;
    const diff = targetY - startY;
    const duration = 300;
    const startTime = performance.now();
    function step(now) {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      window.scrollTo(0, startY + diff * ease);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // circle indicator
  const indicator = document.createElement('div');
  indicator.style.cssText = `
    position: absolute;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #ff6600;
    z-index: 9999;
    pointer-events: none;
    opacity: 0;
    transition: left 300ms cubic-bezier(0.4,0,0.2,1),
                top  300ms cubic-bezier(0.4,0,0.2,1),
                opacity 150ms ease;
  `;
  document.body.appendChild(indicator);

  function updateIndicator(row) {
    const td = row.querySelector('td.default');
    if (!td) return;
    const rect = td.getBoundingClientRect();
    const x = rect.left + window.scrollX - 15;
    const y = rect.top  + window.scrollY + 22;
    if (indicator.style.opacity === '0') {
      indicator.style.transition = 'opacity 150ms ease';
      indicator.style.left = x + 'px';
      indicator.style.top  = y + 'px';
      requestAnimationFrame(() => {
        indicator.style.opacity = '1';
        requestAnimationFrame(() => {
          indicator.style.transition = `
            left 300ms cubic-bezier(0.4,0,0.2,1),
            top  300ms cubic-bezier(0.4,0,0.2,1),
            opacity 150ms ease
          `;
        });
      });
    } else {
      indicator.style.left = x + 'px';
      indicator.style.top  = y + 'px';
    }
  }

  function select(row, fromHistory = false) {
    const prev = getSelected();
    if (prev) prev.classList.remove('hn-nav-selected');
    if (!row) return;
    row.classList.add('hn-nav-selected');
    if (!fromHistory) {
      history.splice(historyPos + 1);
      history.push(row.id);
      historyPos = history.length - 1;
    }
    const target = row.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.25;
    if (forceSmoothScroll) {
      animatedScrollTo(target);
    } else {
      window.scrollTo({ top: target, behavior: 'smooth' });
    }
    if (showIndicator) updateIndicator(row);
  }

  function navigate(dir) {
    const comments = getComments();
    if (!comments.length) return;

    const current = getSelected();
    if (!current) {
      select(comments[0]);
      return;
    }

    const idx = comments.indexOf(current);
    const depth = getIndent(current);

    if (dir === 'up') {
      // parent; fallback to prev sibling if at top level
      for (let i = idx - 1; i >= 0; i--) {
        if (getIndent(comments[i]) < depth) { select(comments[i]); return; }
      }
      navigate('left');
    } else if (dir === 'down') {
      // first child if one exists, otherwise next in reading order
      if (idx + 1 < comments.length) {
        select(comments[idx + 1]);
      }
    } else if (dir === 'left') {
      // prev sibling; fallback to parent if none
      for (let i = idx - 1; i >= 0; i--) {
        if (getIndent(comments[i]) <= depth) { select(comments[i]); return; }
      }
    } else if (dir === 'right') {
      // next sibling; fallback to ancestor's next sibling if none
      for (let i = idx + 1; i < comments.length; i++) {
        if (getIndent(comments[i]) <= depth) { select(comments[i]); return; }
      }
    } else if (dir === 'pageup') {
      for (let i = idx - 1; i >= 0; i--) {
        if (getIndent(comments[i]) === 0) { select(comments[i]); return; }
      }
    } else if (dir === 'pagedown') {
      for (let i = idx + 1; i < comments.length; i++) {
        if (getIndent(comments[i]) === 0) { select(comments[i]); return; }
      }
    } else if (dir === 'histback') {
      if (historyPos > 0) {
        historyPos--;
        const row = document.getElementById(history[historyPos]);
        if (row) select(row, true);
      }
    } else if (dir === 'histfwd') {
      if (historyPos < history.length - 1) {
        historyPos++;
        const row = document.getElementById(history[historyPos]);
        if (row) select(row, true);
      }
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    let dir;
    if (e.shiftKey) {
      const shiftMap = { ArrowLeft: 'histback', ArrowRight: 'histfwd' };
      dir = shiftMap[e.key];
    } else {
      const map = {
        ArrowLeft: 'up', ArrowRight: 'down', ArrowUp: 'left', ArrowDown: 'right',
        PageUp: 'pageup', PageDown: 'pagedown',
        '.': 'histback', '/': 'histfwd',
      };
      dir = map[e.key];
    }
    if (!dir) return;

    e.preventDefault();
    navigate(dir);
  });

  // inject highlight style
  const style = document.createElement('style');
  style.textContent = `
    tr.hn-nav-selected td.default {
      background-color: #fef9c3;
      border-radius: 3px;
      box-shadow: 0 0 0 6px #fef9c3;
    }
  `;
  document.head.appendChild(style);
})();
