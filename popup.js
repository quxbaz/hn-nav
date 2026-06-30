const smoothScrollEl      = document.getElementById('smoothScroll');
const showIndicatorEl     = document.getElementById('showIndicator');
const offsetEl            = document.getElementById('offset');
const offsetLabel         = document.getElementById('offsetLabel');
const scrollSpeedEl       = document.getElementById('scrollSpeed');
const scrollSpeedLabel    = document.getElementById('scrollSpeedLabel');
const swatches            = document.querySelectorAll('.swatch');

chrome.storage.sync.get({ smoothScroll: true, showIndicator: true, offset: 20, indicatorColor: '#ff6600', scrollSpeed: 5 }, ({ smoothScroll, showIndicator, offset, indicatorColor, scrollSpeed }) => {
  smoothScrollEl.checked       = smoothScroll;
  showIndicatorEl.checked      = showIndicator;
  offsetEl.value               = offset;
  offsetLabel.textContent      = offset + '%';
  scrollSpeedEl.value          = scrollSpeed;
  scrollSpeedLabel.textContent = scrollSpeed;
  setActiveSwatch(indicatorColor);
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
