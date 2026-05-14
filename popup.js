const smoothScrollEl  = document.getElementById('smoothScroll');
const showIndicatorEl = document.getElementById('showIndicator');
const offsetEl        = document.getElementById('offset');
const offsetLabel     = document.getElementById('offsetLabel');

chrome.storage.sync.get({ smoothScroll: false, showIndicator: true, offset: 20 }, ({ smoothScroll, showIndicator, offset }) => {
  smoothScrollEl.checked  = smoothScroll;
  showIndicatorEl.checked = showIndicator;
  offsetEl.value          = offset;
  offsetLabel.textContent = offset + '%';
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
