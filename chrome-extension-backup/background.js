chrome.runtime.onMessage.addListener((message) => {
  console.log('Background:', message);
});
