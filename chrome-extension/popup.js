let isExtracting = false;

document.getElementById('startBtn').addEventListener('click', async () => {
  const emailTarget = parseInt(document.getElementById('emailTarget').value) || 100;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab.url.includes('linkedin.com')) {
    document.getElementById('status').innerHTML = '<span style="color:red">Please navigate to LinkedIn Sales Navigator first!</span>';
    return;
  }
  
  chrome.tabs.sendMessage(tab.id, { type: 'start', emailTarget });
  document.getElementById('startBtn').disabled = true;
  document.getElementById('stopBtn').disabled = false;
  document.getElementById('status').textContent = 'Starting extraction...';
  isExtracting = true;
});

document.getElementById('stopBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { type: 'stop' });
  document.getElementById('startBtn').disabled = false;
  document.getElementById('stopBtn').disabled = true;
  isExtracting = false;
  document.getElementById('status').textContent = 'Stopped';
});

document.getElementById('exportBtn').addEventListener('click', () => {
  // Use your actual Railway URL here
  const railwayUrl = 'YOUR-ACTUAL-RAILWAY-URL.railway.app';
  window.open(`https://${railwayUrl}/api/export/csv`);
});

document.getElementById('statsBtn').addEventListener('click', async () => {
  // Use your actual Railway URL here
  const railwayUrl = 'YOUR-ACTUAL-RAILWAY-URL.railway.app';
  document.getElementById('stats').textContent = 'Loading...';
  
  try {
    const response = await fetch(`https://${railwayUrl}/api/leads/stats`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const stats = await response.json();
    document.getElementById('stats').innerHTML = `
      <strong>Stats:</strong><br>
      Total: ${stats.totalLeads}<br>
      Verified: ${stats.verifiedEmails}<br>
      Pending: ${stats.pendingLeads}<br>
      Success Rate: ${stats.conversionRate}%
    `;
  } catch (error) {
    document.getElementById('stats').innerHTML = `<span style="color:red">Error: ${error.message}</span>`;
  }
});

// Listen for progress updates
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'progress') {
    document.getElementById('status').innerHTML = message.status || `Page ${message.page}: ${message.total} leads extracted`;
    document.getElementById('stats').innerHTML = `Current session: ${message.total} leads`;
  } else if (message.type === 'complete') {
    document.getElementById('status').innerHTML = `<strong>✅ Complete! ${message.total} leads extracted</strong>`;
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    isExtracting = false;
  }
});
