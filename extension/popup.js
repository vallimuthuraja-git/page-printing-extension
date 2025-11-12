// Redirect to full app immediately
document.addEventListener('DOMContentLoaded', async () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('fullapp.html') });
    window.close();
});
