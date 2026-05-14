const smoothScrollEl = document.getElementById('smoothScroll');
const showIndicatorEl = document.getElementById('showIndicator');

chrome.storage.sync.get({ smoothScroll: false, showIndicator: true }, ({ smoothScroll, showIndicator }) => {
  smoothScrollEl.checked = smoothScroll;
  showIndicatorEl.checked = showIndicator;
});

smoothScrollEl.addEventListener('change', () => {
  chrome.storage.sync.set({ smoothScroll: smoothScrollEl.checked });
});

showIndicatorEl.addEventListener('change', () => {
  chrome.storage.sync.set({ showIndicator: showIndicatorEl.checked });
});
