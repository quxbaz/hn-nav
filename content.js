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
  let aiBackend = 'gemini';
  let geminiApiKey = '';

  chrome.storage.sync.get({ smoothScroll: true, showIndicator: true, offset: 20, indicatorColor: '#ff6600', scrollSpeed: 5, aiBackend: 'gemini', geminiApiKey: '' }, ({ smoothScroll, showIndicator: si, offset, indicatorColor, scrollSpeed, aiBackend: ab, geminiApiKey: gak }) => {
    forceSmoothScroll = smoothScroll;
    showIndicator = si;
    scrollOffset = offset / 100;
    scrollDuration = speedToDuration(scrollSpeed);
    aiBackend = ab;
    geminiApiKey = gak;
    indicator.style.display = si ? '' : 'none';
    indicatorLabel.style.display = si ? '' : 'none';
    indicator.style.background = indicatorColor;
    indicatorLabel.style.background = indicatorColor;
  });
  chrome.storage.onChanged.addListener(({ smoothScroll, showIndicator: si, offset, indicatorColor, scrollSpeed, aiBackend: ab, geminiApiKey: gak }) => {
    if (smoothScroll)    forceSmoothScroll = smoothScroll.newValue;
    if (offset)          scrollOffset = offset.newValue / 100;
    if (scrollSpeed)     scrollDuration = speedToDuration(scrollSpeed.newValue);
    if (ab)              aiBackend = ab.newValue;
    if (gak)             geminiApiKey = gak.newValue;
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

  const GEMINI_MODEL = 'gemini-3.5-flash';

  function markdownToHtml(md) {
    let s = md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    const lines = s.split('\n');
    const out = [];
    let inList = false;
    for (const line of lines) {
      const bullet = line.match(/^[*\-]\s+(.*)/);
      if (bullet) {
        if (!inList) { out.push('<ul style="margin:4px 0;padding-left:18px;">'); inList = true; }
        out.push(`<li>${bullet[1]}</li>`);
      } else {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push(line.trim() ? `<p style="margin:4px 0">${line}</p>` : '');
      }
    }
    if (inList) out.push('</ul>');
    return out.join('');
  }
  const summarizing = new WeakSet();

  async function summarize() {
    const row = getSelected();
    if (!row) return;
    if (summarizing.has(row)) return;

    const textEl = row.querySelector('.commtext');
    if (!textEl) return;

    const existing = textEl.querySelector('.hn-nav-summary');
    if (existing) { existing.remove(); return; }

    const text = textEl.innerText.trim();
    if (!text) return;

    const placeholder = document.createElement('div');
    placeholder.className = 'hn-nav-summary';
    placeholder.style.cssText = 'margin-top:8px; padding-top:8px; border-top:1px solid #e8e8e0;';
    placeholder.innerHTML = '<em style="color:#999;font-size:0.9em">Summarizing…</em>';
    textEl.appendChild(placeholder);
    summarizing.add(row);

    try {
      let result, modelName;
      if (aiBackend === 'nano') {
        if (!window.ai?.languageModel) throw new Error('On-device AI unavailable — enable #prompt-api-for-gemini-nano in chrome://flags');
        const session = await window.ai.languageModel.create();
        result = await session.prompt(`Summarize this Hacker News comment clearly and concisely:\n\n${text}`);
        modelName = 'Gemini Nano (on-device)';
      } else {
        if (!geminiApiKey) throw new Error('No API key — add your Gemini API key in the extension popup');
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: `Summarize this Hacker News comment clearly and concisely:\n\n${text}` }] }] }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        result = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? 'No result.';
        modelName = GEMINI_MODEL;
      }
      const header = document.createElement('div');
      header.style.cssText = 'font-size:10px; color:#aaa; font-family:monospace; margin-bottom:4px;';
      header.textContent = modelName;
      const body = document.createElement('div');
      body.innerHTML = markdownToHtml(result);
      placeholder.innerHTML = '';
      placeholder.appendChild(header);
      placeholder.appendChild(body);
    } catch (err) {
      placeholder.remove();
    }
    summarizing.delete(row);
  }

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
    if (prev) prev.classList.remove('hn-nav-selected');
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

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

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

    if (!e.shiftKey && e.key === 'q') {
      e.preventDefault();
      summarize();
      return;
    }

    if (e.key === 'Escape') {
      const row = getSelected();
      row?.querySelector('.hn-nav-summary')?.remove();
      return;
    }

    let dir;
    if (e.shiftKey) {
      const shiftMap = { ArrowLeft: 'histback', ArrowRight: 'histfwd' };
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
