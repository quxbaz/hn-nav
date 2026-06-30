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
  let forceSmoothScroll = true;
  let showIndicator = true;
  let scrollOffset = 0.20;
  let scrollDuration = 325;

  chrome.storage.sync.get({ smoothScroll: true, showIndicator: true, offset: 20, indicatorColor: '#ff6600', scrollSpeed: 5 }, ({ smoothScroll, showIndicator: si, offset, indicatorColor, scrollSpeed }) => {
    forceSmoothScroll = smoothScroll;
    showIndicator = si;
    scrollOffset = offset / 100;
    scrollDuration = speedToDuration(scrollSpeed);
    indicator.style.display = si ? '' : 'none';
    indicatorLabel.style.display = si ? '' : 'none';
    indicator.style.background = indicatorColor;
    indicatorLabel.style.background = indicatorColor;
  });
  chrome.storage.onChanged.addListener(({ smoothScroll, showIndicator: si, offset, indicatorColor, scrollSpeed }) => {
    if (smoothScroll)    forceSmoothScroll = smoothScroll.newValue;
    if (offset)          scrollOffset = offset.newValue / 100;
    if (scrollSpeed)     scrollDuration = speedToDuration(scrollSpeed.newValue);
    if (indicatorColor) {
      indicator.style.background = indicatorColor.newValue;
      indicatorLabel.style.background = indicatorColor.newValue;
    }
    if (si) {
      showIndicator = si.newValue;
      indicator.style.display = si.newValue ? '' : 'none';
    }
  });

  function speedToDuration(speed) {
    return Math.round(550 - speed * 45);
  }

  function animatedScrollTo(targetY) {
    const startY = window.scrollY;
    const diff = targetY - startY;
    const duration = scrollDuration;
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

  const indicatorLabel = document.createElement('div');
  indicatorLabel.style.cssText = `
    position: fixed;
    top: 4px;
    left: 4px;
    font-size: 8.5px;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    color: #fff;
    background: #ff6600;
    padding: 2px 4px;
    border-radius: 3px;
    z-index: 9999;
    pointer-events: none;
    opacity: 0;
    transition: opacity 150ms ease;
  `;
  document.body.appendChild(indicatorLabel);

  function updateIndicator(row) {
    const td = row.querySelector('td.default');
    if (!td) return;
    const rect = td.getBoundingClientRect();
    const x = rect.left + window.scrollX - 15;
    const y = rect.top  + window.scrollY + 22;

    // top-level counter tag (find ancestor if nested)
    const comments = getComments();
    const topLevel = comments.filter(c => getIndent(c) === 0);
    let topRow = row;
    if (getIndent(row) !== 0) {
      const idx = comments.indexOf(row);
      for (let i = idx - 1; i >= 0; i--) {
        if (getIndent(comments[i]) === 0) { topRow = comments[i]; break; }
      }
    }
    const a = topLevel.indexOf(topRow) + 1;
    const b = topLevel.length;
    indicatorLabel.textContent = `${a} / ${b}`;
    indicatorLabel.style.opacity = '1';

    if (indicator.style.opacity === '0') {
      indicator.style.transition = 'opacity 150ms ease';
      indicator.style.left = x + 'px';
      indicator.style.top  = y + 'px';
      requestAnimationFrame(() => {
        indicator.style.opacity = '1';
        requestAnimationFrame(() => {
          indicator.style.transition = `left 300ms cubic-bezier(0.4,0,0.2,1), top 300ms cubic-bezier(0.4,0,0.2,1), opacity 150ms ease`;
        });
      });
    } else {
      indicator.style.left = x + 'px';
      indicator.style.top  = y + 'px';
    }
  }

  function select(row, fromHistory = false, scrollTarget = null) {
    const prev = getSelected();
    if (prev) {
      prev.classList.remove('hn-nav-selected');
    }
    if (!row) return;
    row.classList.add('hn-nav-selected');
    if (!fromHistory) {
      history.splice(historyPos + 1);
      history.push(row.id);
      historyPos = history.length - 1;
    }
    const target = scrollTarget !== null ? scrollTarget :
      row.getBoundingClientRect().top + window.scrollY - window.innerHeight * scrollOffset;
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
      // parent
      for (let i = idx - 1; i >= 0; i--) {
        if (getIndent(comments[i]) < depth) { select(comments[i]); return; }
      }
      // fallback: prev sibling
      for (let i = idx - 1; i >= 0; i--) {
        if (getIndent(comments[i]) <= depth) { select(comments[i]); return; }
      }
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
      // nothing to navigate to — scroll to top
      forceSmoothScroll ? animatedScrollTo(0) : window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (dir === 'right') {
      // next sibling; fallback to ancestor's next sibling if none
      for (let i = idx + 1; i < comments.length; i++) {
        if (getIndent(comments[i]) <= depth) { select(comments[i]); return; }
      }
    } else if (dir === 'pageup') {
      if (idx === 0) {
        const target = Math.max(0, window.scrollY - window.innerHeight * 0.85);
        forceSmoothScroll ? animatedScrollTo(target) : window.scrollBy({ top: -window.innerHeight * 0.85, behavior: 'smooth' });
        return;
      }
      for (let i = idx - 1; i >= 0; i--) {
        if (getIndent(comments[i]) === 0) { select(comments[i]); return; }
      }
    } else if (dir === 'pagedown') {
      for (let i = idx + 1; i < comments.length; i++) {
        if (getIndent(comments[i]) === 0) { select(comments[i]); return; }
      }
    } else if (dir === 'home') {
      select(comments[0], false, 0);
    } else if (dir === 'end') {
      select(comments[comments.length - 1]);
    } else if (dir === 'histback') {
      if (historyPos > 0) {
        historyPos--;
        const row = document.getElementById(history[historyPos]);
        if (row) select(row, true);
      }
    } else if (dir === 'dfsback') {
      if (idx > 0) select(comments[idx - 1]);
    } else if (dir === 'histfwd') {
      if (historyPos < history.length - 1) {
        historyPos++;
        const row = document.getElementById(history[historyPos]);
        if (row) select(row, true);
      }
    } else if (dir === 'upvote') {
      if (current) {
        const unlink = current.querySelector('a[id^="un_"]');
        (unlink || current.querySelector('a[id^="up_"]'))?.click();
      }
    }
  }

  const helpModal = document.createElement('div');
  helpModal.style.cssText = `
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.45);
    z-index: 99999;
    align-items: center;
    justify-content: center;
  `;
  const helpBox = document.createElement('div');
  helpBox.style.cssText = `
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(32,33,36,0.12), 0 8px 32px rgba(32,33,36,0.18);
    padding: 16px 20px 20px;
    width: 380px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12px;
    color: #202124;
    max-height: 90vh;
    overflow-y: auto;
  `;
  const kbdCss = 'display:inline-block; background:#f1f3f4; border:1px solid #dadce0; border-bottom-width:2px; border-radius:3px; padding:1px 6px; font-family:monospace; font-size:11px; color:#333; white-space:nowrap;';
  const rowCss = 'display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid #f0f0f0;';
  const groupCss = 'font-size:10px; font-weight:600; color:#888; text-transform:uppercase; letter-spacing:0.06em; padding:12px 0 4px;';
  const k = (...keys) => keys.map(k => `<kbd style="${kbdCss}">${k}</kbd>`).join(' ');

  helpBox.innerHTML = `
    <div style="font-weight:600; font-size:14px; margin-bottom:4px; color:#202124;">Keyboard Shortcuts</div>

    <div style="${groupCss}">Navigation</div>
    <div style="${rowCss}"><span>Parent comment</span>${k('←')}</div>
    <div style="${rowCss}"><span>First child / next</span>${k('→')}</div>
    <div style="${rowCss}"><span>Previous sibling</span>${k('↑')}</div>
    <div style="${rowCss}"><span>Next sibling</span>${k('↓')}</div>
    <div style="${rowCss}"><span>Prev / next top-level</span><span>${k('PgUp')} ${k('PgDn')}</span></div>
    <div style="${rowCss}"><span>First / last comment</span><span>${k('Home')} ${k('End')}</span></div>
    <div style="${rowCss}"><span>Last node of prev sibling</span>${k('Shift')}+${k('↑')}</div>
    <div style="${rowCss}"><span>History back</span><span>${k('.')} ${k('Shift')}+${k('←')}</span></div>
    <div style="${rowCss}"><span>History forward</span><span>${k('/')} ${k('Shift')}+${k('→')}</span></div>

    <div style="${groupCss}">Actions</div>
    <div style="${rowCss}"><span>Toggle upvote</span><span>${k('u')} ${k('w')}</span></div>
    <div style="${rowCss}"><span>Open story link</span>${k('o')}</div>
    <div style="${rowCss}"><span>Open link in comment</span>${k('l')}</div>

    <div style="${groupCss}">Help</div>
    <div style="display:flex; justify-content:space-between; align-items:center; padding:5px 0;"><span>Show this dialog</span>${k('?')}</div>
  `;
  helpModal.appendChild(helpBox);
  document.body.appendChild(helpModal);

  helpModal.addEventListener('click', e => { if (e.target === helpModal) helpModal.style.display = 'none'; });

  function toggleHelp() {
    const visible = helpModal.style.display === 'flex';
    helpModal.style.display = visible ? 'none' : 'flex';
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === '?') { e.preventDefault(); toggleHelp(); return; }
    if (e.key === 'Escape' && helpModal.style.display === 'flex') { helpModal.style.display = 'none'; return; }

    if (!e.shiftKey && e.key === 'o') {
      e.preventDefault();
      const link = document.querySelector('.titleline > a') || document.querySelector('a.titlelink');
      if (link) {
        const a = document.createElement('a');
        a.href = link.href;
        a.target = '_blank';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      return;
    }

    if (!e.shiftKey && e.key === 'l') {
      e.preventDefault();
      const row = getSelected();
      if (!row) return;
      const link = row.querySelector('.commtext a[href]');
      if (link) {
        const a = document.createElement('a');
        a.href = link.href;
        a.target = '_blank';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      return;
    }

    let dir;
    if (e.shiftKey) {
      const shiftMap = { ArrowLeft: 'histback', ArrowRight: 'histfwd', ArrowUp: 'dfsback' };
      dir = shiftMap[e.key];
    } else {
      const map = {
        ArrowLeft: 'up', ArrowRight: 'down', ArrowUp: 'left', ArrowDown: 'right',
        PageUp: 'pageup', PageDown: 'pagedown',
        Home: 'home', End: 'end',
        '.': 'histback', '/': 'histfwd',
        u: 'upvote', w: 'upvote',
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
      background-color: #fdfbde;
      border-radius: 3px;
      box-shadow: 0 0 0 6px #fdfbde;
    }
  `;
  document.head.appendChild(style);
})();
