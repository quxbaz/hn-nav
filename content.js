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
      const h3 = line.match(/^###\s+(.*)/);
      const h2 = line.match(/^##\s+(.*)/);
      const h1 = line.match(/^#\s+(.*)/);
      const bullet = line.match(/^[*\-]\s+(.*)/);
      if (h3 || h2 || h1) {
        if (inList) { out.push('</ul>'); inList = false; }
        const txt = (h3 || h2 || h1)[1];
        const tag = h3 ? 'h4' : h2 ? 'h3' : 'h2';
        out.push(`<${tag} style="margin:8px 0 3px;font-size:13px;">${txt}</${tag}>`);
      } else if (bullet) {
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
  const summaryCache = new WeakMap();

  function renderSummary(textEl, html, modelName) {
    const div = document.createElement('div');
    div.className = 'hn-nav-summary';
    div.style.cssText = 'margin-top:8px; padding-top:8px; border-top:1px solid #e8e8e0;';
    const header = document.createElement('div');
    header.style.cssText = 'font-size:10px; color:#aaa; font-family:monospace; margin-bottom:4px;';
    header.textContent = modelName;
    const body = document.createElement('div');
    body.innerHTML = html;
    div.appendChild(header);
    div.appendChild(body);
    const chat = textEl.querySelector('.hn-nav-chat');
    chat ? textEl.insertBefore(div, chat) : textEl.appendChild(div);
  }

  function buildPrompt(row) {
    const storyEl = document.querySelector('.titleline > a');
    const storyTitle = storyEl?.textContent ?? '';
    const storyUrl = storyEl?.href ?? '';

    const comments = getComments();
    const idx = comments.indexOf(row);
    const ancestors = [];
    let depth = getIndent(row);
    for (let i = idx - 1; i >= 0 && ancestors.length < 3; i--) {
      const d = getIndent(comments[i]);
      if (d < depth) {
        const t = comments[i].querySelector('.commtext')?.innerText?.trim() ?? '';
        ancestors.unshift(t.length > 300 ? t.slice(0, 300) + '…' : t);
        depth = d;
        if (d === 0) break;
      }
    }

    const commentText = row.querySelector('.commtext')?.innerText?.trim() ?? '';
    const parts = [];
    if (storyTitle) parts.push(`Story: ${storyTitle}\nURL: ${storyUrl}`);
    if (ancestors.length) {
      parts.push('Thread context (oldest to newest):\n' +
        ancestors.map((t, i) => `${'  '.repeat(i)}${t}`).join('\n\n'));
    }
    parts.push(`Comment to summarize:\n${commentText}`);
    return parts.join('\n\n---\n\n');
  }

  async function summarize() {
    const row = getSelected();
    if (!row) return;
    if (summarizing.has(row)) return;

    const textEl = row.querySelector('.commtext');
    if (!textEl) return;

    const existing = textEl.querySelector('.hn-nav-summary');
    if (existing) { existing.remove(); return; }

    if (summaryCache.has(row)) {
      const { html, modelName } = summaryCache.get(row);
      renderSummary(textEl, html, modelName);
      return;
    }

    if (!textEl.innerText.trim()) return;

    const placeholder = document.createElement('div');
    placeholder.className = 'hn-nav-summary';
    placeholder.style.cssText = 'margin-top:8px; padding-top:8px; border-top:1px solid #e8e8e0;';
    const header = document.createElement('div');
    header.style.cssText = 'font-size:10px; color:#aaa; font-family:monospace; margin-bottom:4px;';
    const body = document.createElement('div');
    body.innerHTML = '<em style="color:#999;font-size:0.9em">Summarizing…</em>';
    placeholder.appendChild(header);
    placeholder.appendChild(body);
    const chatWidget = textEl.querySelector('.hn-nav-chat');
    chatWidget ? textEl.insertBefore(placeholder, chatWidget) : textEl.appendChild(placeholder);
    summarizing.add(row);

    try {
      const prompt = buildPrompt(row);
      const system = 'You are a helpful assistant that summarizes Hacker News comments. Write the summary in first person as if you are the author — do not refer to "the commenter" or "the author." Be clear and concise. Use the thread context to understand what is being replied to. Preserve specific numbers, examples, product names, and concrete details — do not generalize what the author stated concretely.';
      let modelName;

      if (aiBackend === 'nano') {
        if (!window.ai?.languageModel) throw new Error('On-device AI unavailable — enable #prompt-api-for-gemini-nano in chrome://flags');
        modelName = 'Gemini Nano (on-device)';
        header.textContent = modelName;
        const session = await window.ai.languageModel.create({ systemPrompt: system });
        const stream = session.promptStreaming(prompt);
        const reader = stream.getReader();
        let fullText = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText = value; // Prompt API yields cumulative text
          body.textContent = fullText;
        }
        body.innerHTML = markdownToHtml(fullText);
        summaryCache.set(row, { html: body.innerHTML, modelName });
      } else {
        if (!geminiApiKey) throw new Error('No API key — add your Gemini API key in the extension popup');
        modelName = GEMINI_MODEL;
        header.textContent = modelName;
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${geminiApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {},
          }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error?.message ?? `HTTP ${res.status}`); }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '', fullText = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6);
            if (raw === '[DONE]') continue;
            let json;
            try { json = JSON.parse(raw); } catch (_) { continue; }
            if (json.error) throw new Error(json.error.message);
            fullText += json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            body.textContent = fullText;
          }
        }
        body.innerHTML = markdownToHtml(fullText);
        summaryCache.set(row, { html: body.innerHTML, modelName });
      }
    } catch (err) {
      body.textContent = 'Error: ' + err.message;
    }
    summarizing.delete(row);
  }

  const chatCache = new WeakMap(); // row → [{role, text}]
  const CHAT_SYSTEM = 'You are a helpful assistant answering questions about a Hacker News comment. Respond factually from your own perspective — not as the comment author. Be concise and direct.';

  function buildChatWidget(row) {
    const widget = document.createElement('div');
    widget.className = 'hn-nav-chat';
    widget.style.cssText = 'margin-top:8px; padding-top:8px; border-top:1px solid #e8e8e0; display:none;';

    const historyEl = document.createElement('div');
    const textarea = document.createElement('textarea');
    textarea.rows = 3;
    textarea.placeholder = 'Ask about this comment…';
    textarea.style.cssText = 'width:100%; box-sizing:border-box; font-size:13px; font-family:inherit; border:1px solid #ddd; border-radius:3px; padding:5px 7px; resize:none; outline:none; margin-top:4px; display:block;';

    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Send prompt';
    submitBtn.style.cssText = 'display:block; margin-top:6px; margin-left:auto; font-size:12px; padding:4px 12px; cursor:pointer; border:none; border-radius:4px; background:linear-gradient(180deg,#2e7cf6,#1460d8); color:#fff; box-shadow:0 1px 3px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.15); border:1px solid #0f4fbb; outline:none; font-weight:500;';

    const doSubmit = () => {
      const q = textarea.value.trim();
      if (!q || textarea.disabled) return;
      textarea.value = '';
      textarea.disabled = true;
      submitBtn.disabled = true;
      submitQuestion(row, historyEl, q).finally(() => {
        textarea.disabled = false;
        submitBtn.disabled = false;
        textarea.focus();
      });
    };

    submitBtn.addEventListener('click', doSubmit);

    widget.appendChild(historyEl);
    widget.appendChild(textarea);
    widget.appendChild(submitBtn);

    const history = chatCache.get(row) ?? [];
    for (let i = 0; i < history.length; i += 2) {
      appendChatMsg(historyEl, 'user', history[i].text);
      if (history[i + 1]) appendChatMsg(historyEl, 'model', history[i + 1].text);
    }

    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        doSubmit();
      }
    });

    return widget;
  }

  function appendChatMsg(container, role, text, live = false) {
    const div = document.createElement('div');
    div.style.cssText = role === 'user'
      ? 'margin:6px 0 2px; font-size:12px; color:#555; font-style:italic;'
      : 'margin:2px 0 6px; font-size:13px;';
    if (live) div.innerHTML = '<em style="color:#999">Thinking…</em>';
    else if (role === 'model') div.innerHTML = markdownToHtml(text);
    else div.textContent = text;
    container.appendChild(div);
    return div;
  }

  async function submitQuestion(row, historyEl, question) {
    appendChatMsg(historyEl, 'user', question);
    const answerDiv = appendChatMsg(historyEl, 'model', '', true);

    if (!chatCache.has(row)) chatCache.set(row, []);
    const history = chatCache.get(row);
    const context = buildPrompt(row);

    const contents = history.length === 0
      ? [{ role: 'user', parts: [{ text: `${context}\n\nQuestion: ${question}` }] }]
      : [
          { role: 'user', parts: [{ text: `${context}\n\nQuestion: ${history[0].text}` }] },
          ...history.slice(1).map(h => ({ role: h.role, parts: [{ text: h.text }] })),
          { role: 'user', parts: [{ text: question }] },
        ];

    try {
      let fullText = '';
      if (aiBackend === 'nano') {
        if (!window.ai?.languageModel) throw new Error('On-device AI unavailable');
        const msgs = contents.map(c => ({ role: c.role, content: c.parts[0].text }));
        const session = await window.ai.languageModel.create({ systemPrompt: CHAT_SYSTEM, initialPrompts: msgs.slice(0, -1) });
        const stream = session.promptStreaming(contents.at(-1).parts[0].text);
        const reader = stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText = value;
          answerDiv.textContent = fullText;
        }
      } else {
        if (!geminiApiKey) throw new Error('No API key — add your Gemini API key in the extension popup');
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${geminiApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: CHAT_SYSTEM }] }, contents, generationConfig: {} }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error?.message ?? `HTTP ${res.status}`); }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6);
            if (raw === '[DONE]') continue;
            let json; try { json = JSON.parse(raw); } catch (_) { continue; }
            if (json.error) throw new Error(json.error.message);
            fullText += json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            answerDiv.textContent = fullText;
          }
        }
      }
      answerDiv.innerHTML = markdownToHtml(fullText);
      history.push({ role: 'user', text: question }, { role: 'model', text: fullText });
    } catch (err) {
      answerDiv.textContent = 'Error: ' + err.message;
    }
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
    if (prev) {
      prev.classList.remove('hn-nav-selected');
      prev.querySelector('.hn-nav-chat')?.remove();
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
    const textEl = row.querySelector('.commtext');
    if (textEl) textEl.appendChild(buildChatWidget(row));
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
      if (idx === 0) {
        const target = Math.max(0, window.scrollY - window.innerHeight * 0.35);
        forceSmoothScroll ? animatedScrollTo(target) : window.scrollBy({ top: -window.innerHeight * 0.35, behavior: 'smooth' });
        return;
      }
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

  let storySummarizing = false;

  async function summarizeStory() {
    const existing = document.getElementById('hn-nav-story-summary');
    if (existing) { existing.remove(); return; }
    if (storySummarizing) return;

    const link = document.querySelector('.titleline > a') || document.querySelector('a.titlelink');
    if (!link) return;

    const commentForm = document.querySelector('form[action="comment"]');
    const insertBefore = commentForm?.closest('tr');
    const tbody = insertBefore?.parentElement;
    if (!tbody) return;

    const summaryRow = document.createElement('tr');
    summaryRow.id = 'hn-nav-story-summary';
    const pad = document.createElement('td');
    pad.setAttribute('colspan', '2');
    const summaryTd = document.createElement('td');
    summaryTd.style.cssText = 'padding: 6px 0 14px;';
    const header = document.createElement('div');
    header.style.cssText = 'font-size:10px; color:#aaa; font-family:monospace; margin-bottom:5px;';
    header.textContent = GEMINI_MODEL;
    const body = document.createElement('div');
    body.innerHTML = '<em style="color:#999;font-size:0.9em">Summarizing article…</em>';
    summaryTd.appendChild(header);
    summaryTd.appendChild(body);
    summaryRow.appendChild(pad);
    summaryRow.appendChild(summaryTd);
    tbody.insertBefore(summaryRow, insertBefore);
    storySummarizing = true;

    try {
      if (!geminiApiKey) throw new Error('No API key — add your Gemini API key in the extension popup');
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: 'Summarize this article clearly and concisely. Preserve key facts, numbers, and specific details.' }] },
          contents: [{ parts: [
            { fileData: { mimeType: 'text/html', fileUri: link.href } },
            { text: 'Summarize this article.' },
          ]}],
          generationConfig: {},
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error?.message ?? `HTTP ${res.status}`); }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '', fullText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') continue;
          let json; try { json = JSON.parse(raw); } catch (_) { continue; }
          if (json.error) throw new Error(json.error.message);
          fullText += json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          body.textContent = fullText;
        }
      }
      body.innerHTML = markdownToHtml(fullText);
    } catch (err) {
      body.textContent = 'Error: ' + err.message;
    }
    storySummarizing = false;
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

    <div style="${groupCss}">AI</div>
    <div style="${rowCss}"><span>Summarize story link</span>${k('Shift')}+${k('Q')}</div>
    <div style="${rowCss}"><span>AI summary</span>${k('q')}</div>
    <div style="${rowCss}"><span>Toggle chat</span>${k('Space')}</div>
    <div style="${rowCss}"><span>Submit prompt</span>${k('Ctrl')}+${k('Enter')}</div>
    <div style="${rowCss}"><span>Close chat / dismiss</span>${k('Esc')}</div>

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
    if (e.key === 'Escape' && e.target.tagName === 'TEXTAREA') {
      const row = getSelected();
      const chat = row?.querySelector('.hn-nav-chat');
      if (chat && e.target === chat.querySelector('textarea')) {
        chat.style.display = 'none';
        e.preventDefault();
        return;
      }
    }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === '?') { e.preventDefault(); toggleHelp(); return; }
    if (e.key === 'Escape' && document.getElementById('hn-nav-story-summary')) { document.getElementById('hn-nav-story-summary').remove(); return; }
    if (e.key === 'Escape' && helpModal.style.display === 'flex') { helpModal.style.display = 'none'; return; }

    if (e.shiftKey && e.key === 'Q') {
      e.preventDefault();
      summarizeStory();
      return;
    }

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

    if (!e.shiftKey && e.key === ' ') {
      e.preventDefault();
      const row = getSelected();
      if (!row) return;
      const widget = row.querySelector('.hn-nav-chat');
      if (!widget) return;
      const visible = widget.style.display !== 'none';
      widget.style.display = visible ? 'none' : '';
      if (!visible) widget.querySelector('textarea')?.focus();
      return;
    }

    if (!e.shiftKey && e.key === 'q') {
      e.preventDefault();
      summarize();
      return;
    }

    if (e.key === 'Escape') {
      const row = getSelected();
      if (!row) return;
      const chat = row.querySelector('.hn-nav-chat');
      if (chat && document.activeElement === chat.querySelector('textarea')) {
        chat.style.display = 'none';
        return;
      }
      row.querySelector('.hn-nav-summary')?.remove();
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
