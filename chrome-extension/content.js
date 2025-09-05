class LinkedInExtractor {
  constructor() {
    this.isRunning = false;
    this.currentPage = 1;
    this.maxPagesPerSession = 30;
    this.extractedLeads = [];
    this.dailyEmailTarget = 100;
    this.validEmailsFound = 0;
    // UPDATE THIS WITH YOUR ACTUAL RAILWAY URL
    this.apiEndpoint = 'https://linkedin-lead-system-v2-production.up.railway.app/api';
  }

  async start(emailTarget = 100) {
    if (this.isRunning) return;
    
    this.dailyEmailTarget = emailTarget;
    this.isRunning = true;
    this.extractedLeads = [];
    
    console.log(`🚀 Starting extraction - Target: ${emailTarget} emails`);
    
    // Visual feedback
    this.showStatus('Starting extraction...');
    
    try {
      for (let page = 1; page <= this.maxPagesPerSession && this.isRunning; page++) {
        this.showStatus(`Processing page ${page}...`);
        console.log(`📄 Processing page ${page}`);
        
        await this.waitForResults();
        const leads = this.extractFromPage();
        
        if (leads.length === 0) {
          console.log('No leads found on this page');
          this.showStatus('No more leads found');
          break;
        }
        
        console.log(`Found ${leads.length} leads on page ${page}`);
        this.showStatus(`Found ${leads.length} leads on page ${page}`);
        
        // Mark extracted leads visually
        this.markExtractedLeads();
        
        // Send to backend
        if (leads.length > 0) {
          const result = await this.sendToBackend(leads);
          if (result && result.success) {
            this.extractedLeads.push(...leads);
            this.showStatus(`Saved ${this.extractedLeads.length} total leads`);
          } else {
            console.error('Failed to save leads');
            this.showStatus('Error saving leads - check console');
          }
        }
        
        // Send progress to popup
        chrome.runtime.sendMessage({
          type: 'progress',
          page,
          total: this.extractedLeads.length,
          status: `Page ${page}: ${this.extractedLeads.length} leads extracted`
        });
        
        // Go to next page
        if (page < this.maxPagesPerSession && this.isRunning) {
          const hasNext = await this.nextPage();
          if (!hasNext) {
            console.log('No more pages');
            break;
          }
          await this.delay(4000);
        }
      }
      
      this.showStatus(`✅ Complete! Extracted ${this.extractedLeads.length} leads`);
      console.log(`✅ Extraction complete: ${this.extractedLeads.length} leads`);
      
    } catch (error) {
      console.error('Extraction error:', error);
      this.showStatus(`Error: ${error.message}`);
    } finally {
      this.isRunning = false;
    }
  }

  showStatus(message) {
    // Create or update status overlay
    let statusDiv = document.getElementById('linkedin-extractor-status');
    if (!statusDiv) {
      statusDiv = document.createElement('div');
      statusDiv.id = 'linkedin-extractor-status';
      statusDiv.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: #0073b1;
        color: white;
        padding: 15px;
        border-radius: 8px;
        z-index: 10000;
        font-family: -apple-system, sans-serif;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        max-width: 300px;
      `;
      document.body.appendChild(statusDiv);
    }
    statusDiv.textContent = message;
    
    // Auto-hide after 5 seconds for completion messages
    if (message.includes('✅')) {
      setTimeout(() => {
        if (statusDiv) statusDiv.remove();
      }, 5000);
    }
  }

  markExtractedLeads() {
    // Add visual indicator to extracted leads
    document.querySelectorAll('[data-view-name="search-entity-result"]').forEach(el => {
      if (!el.dataset.extracted) {
        el.dataset.extracted = 'true';
        el.style.opacity = '0.7';
        el.style.borderLeft = '4px solid #28a745';
        
        // Add extracted badge
        const badge = document.createElement('div');
        badge.textContent = '✓ Extracted';
        badge.style.cssText = `
          position: absolute;
          top: 10px;
          right: 10px;
          background: #28a745;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: bold;
          z-index: 100;
        `;
        el.style.position = 'relative';
        el.appendChild(badge);
      }
    });
  }

  async waitForResults() {
    console.log('Waiting for results to load...');
    for (let i = 0; i < 30; i++) {
      const results = document.querySelectorAll('[data-view-name="search-entity-result"]');
      if (results.length > 0) {
        console.log(`Found ${results.length} results`);
        await this.delay(2000);
        return;
      }
      await this.delay(500);
    }
    console.log('No results found after waiting');
  }

  extractFromPage() {
    const leads = [];
    const results = document.querySelectorAll('[data-view-name="search-entity-result"]');
    
    console.log(`Extracting from ${results.length} result cards`);
    
    results.forEach((el, idx) => {
      try {
        const nameEl = el.querySelector('.artdeco-entity-lockup__title a span[aria-hidden="true"]');
        const titleEl = el.querySelector('.artdeco-entity-lockup__subtitle span[aria-hidden="true"]');
        const captionEl = el.querySelector('.artdeco-entity-lockup__caption span[aria-hidden="true"]');
        const locationEl = el.querySelector('.artdeco-entity-lockup__meta span[aria-hidden="true"]');
        const linkEl = el.querySelector('.artdeco-entity-lockup__title a');
        
        const name = nameEl?.textContent?.trim();
        const title = titleEl?.textContent?.trim();
        let company = captionEl?.textContent?.trim() || '';
        company = company.split('·')[0].trim();
        const location = locationEl?.textContent?.trim();
        const profileUrl = linkEl?.href;
        
        if (name && title && company) {
          leads.push({
            name,
            title,
            company,
            location,
            profileUrl,
            extractedAt: new Date().toISOString()
          });
          console.log(`Extracted: ${name} - ${title} at ${company}`);
        }
      } catch (err) {
        console.error(`Error extracting lead ${idx}:`, err);
      }
    });
    
    return leads;
  }

  async nextPage() {
    const nextBtn = document.querySelector('.artdeco-pagination__button--next:not([disabled])');
    if (!nextBtn) {
      console.log('No next button found or it is disabled');
      return false;
    }
    console.log('Clicking next page');
    nextBtn.click();
    await this.delay(3000);
    return true;
  }

  async sendToBackend(leads) {
    try {
      console.log(`Sending ${leads.length} leads to backend: ${this.apiEndpoint}/leads/batch`);
      const response = await fetch(`${this.apiEndpoint}/leads/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('Backend response:', result);
      return result;
    } catch (error) {
      console.error('Backend error:', error);
      this.showStatus(`Backend error: ${error.message}`);
      return null;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    this.isRunning = false;
    this.showStatus('Extraction stopped');
  }
}

const extractor = new LinkedInExtractor();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'start') {
    extractor.start(message.emailTarget);
    sendResponse({ status: 'started' });
  } else if (message.type === 'stop') {
    extractor.stop();
    sendResponse({ status: 'stopped' });
  }
  return true;
});

console.log('LinkedIn Extractor Ready - Check if API endpoint is configured correctly');
