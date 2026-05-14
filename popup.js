const checkbox = document.getElementById('smoothScroll');

chrome.storage.sync.get({ smoothScroll: false }, ({ smoothScroll }) => {
  checkbox.checked = smoothScroll;
});

checkbox.addEventListener('change', () => {
  chrome.storage.sync.set({ smoothScroll: checkbox.checked });
});
