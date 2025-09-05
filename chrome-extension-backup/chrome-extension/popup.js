document.getElementById('startBtn').addEventListener('click', async () => {
  const emailTarget = parseInt(document.getElementById('emailTarget').value) || 100;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab.url.includes('linkedin.com')) {
    alert('Please navigate to LinkedIn Sales Navigator');
    return;
  }
  
  chrome.tabs.sendMessage(tab.id, { type: 'start', emailTarget });
  document.getElementById('startBtn').disabled = true;
  document.getElementById('stopBtn').disabled = false;
  document.getElementById('status').textContent = 'Extracting...';
});

document.getElementById('stopBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { type: 'stop' });
  document.getElementById('startBtn').disabled = false;
  document.getElementById('stopBtn').disabled = true;
});

document.getElementById('exportBtn').addEventListener('click', () => {
  window.open('https://linkedin-lead-system-production.up.railway.app/api/export/csv');
});

document.getElementById('statsBtn').addEventListener('click', async () => {
  const response = await fetch('https://linkedin-lead-system-production.up.railway.app/api/leads/stats');
  const stats = await response.json();
  document.getElementById('stats').innerHTML = `
    Total: ${stats.totalLeads}<br>
    Verified: ${stats.verifiedEmails}<br>
    Rate: ${stats.conversionRate}%
  `;
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'progress') {
    document.getElementById('status').textContent = `Page ${message.page}: ${message.total} leads`;
  } else if (message.type === 'complete') {
    document.getElementById('status').textContent = `Complete! ${message.total} leads`;
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
  }
});
