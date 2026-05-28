const smoothScrollEl      = document.getElementById('smoothScroll');
const showIndicatorEl     = document.getElementById('showIndicator');
const offsetEl            = document.getElementById('offset');
const offsetLabel         = document.getElementById('offsetLabel');
const scrollSpeedEl       = document.getElementById('scrollSpeed');
const scrollSpeedLabel    = document.getElementById('scrollSpeedLabel');
const swatches            = document.querySelectorAll('.swatch');
const backendGeminiEl     = document.getElementById('backendGemini');
const backendNanoEl       = document.getElementById('backendNano');
const geminiApiKeyEl      = document.getElementById('geminiApiKey');
const apiKeySectionEl     = document.getElementById('apiKeySection');

chrome.storage.sync.get({ smoothScroll: true, showIndicator: true, offset: 20, indicatorColor: '#ff6600', scrollSpeed: 5, aiBackend: 'gemini', geminiApiKey: '' }, ({ smoothScroll, showIndicator, offset, indicatorColor, scrollSpeed, aiBackend, geminiApiKey }) => {
  smoothScrollEl.checked       = smoothScroll;
  showIndicatorEl.checked      = showIndicator;
  offsetEl.value               = offset;
  offsetLabel.textContent      = offset + '%';
  scrollSpeedEl.value          = scrollSpeed;
  scrollSpeedLabel.textContent = scrollSpeed;
  setActiveSwatch(indicatorColor);
  (aiBackend === 'nano' ? backendNanoEl : backendGeminiEl).checked = true;
  apiKeySectionEl.style.display = aiBackend === 'nano' ? 'none' : '';
  geminiApiKeyEl.value = geminiApiKey;
});

smoothScrollEl.addEventListener('change', () => {
  chrome.storage.sync.set({ smoothScroll: smoothScrollEl.checked });
});

showIndicatorEl.addEventListener('change', () => {
  chrome.storage.sync.set({ showIndicator: showIndicatorEl.checked });
});

offsetEl.addEventListener('input', () => {
  const val = parseInt(offsetEl.value, 10);
  offsetLabel.textContent = val + '%';
  chrome.storage.sync.set({ offset: val });
});

scrollSpeedEl.addEventListener('input', () => {
  const val = parseInt(scrollSpeedEl.value, 10);
  scrollSpeedLabel.textContent = val;
  chrome.storage.sync.set({ scrollSpeed: val });
});

swatches.forEach(swatch => {
  swatch.addEventListener('click', () => {
    const color = swatch.dataset.color;
    setActiveSwatch(color);
    chrome.storage.sync.set({ indicatorColor: color });
  });
});

function setActiveSwatch(color) {
  swatches.forEach(s => s.classList.toggle('active', s.dataset.color === color));
}

[backendGeminiEl, backendNanoEl].forEach(el => {
  el.addEventListener('change', () => {
    chrome.storage.sync.set({ aiBackend: el.value });
    apiKeySectionEl.style.display = el.value === 'nano' ? 'none' : '';
  });
});

geminiApiKeyEl.addEventListener('change', () => {
  chrome.storage.sync.set({ geminiApiKey: geminiApiKeyEl.value });
});
