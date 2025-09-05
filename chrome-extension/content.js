class LinkedInExtractor {
  constructor() {
    this.isRunning = false;
    this.currentPage = 1;
    this.maxPagesPerSession = 30;
    this.extractedLeads = [];
    this.dailyEmailTarget = 100;
    this.validEmailsFound = 0;
    this.apiEndpoint = 'https://linkedin-lead-system-production.up.railway.app/api';
  }

  async start(emailTarget = 100) {
    if (this.isRunning) return;
    
    this.dailyEmailTarget = emailTarget;
    this.isRunning = true;
    this.extractedLeads = [];
    
    const filterHash = this.getFilterHash();
    console.log(`🚀 Starting extraction\n📧 Target: ${emailTarget} emails\n🔍 Filter: ${filterHash}`);
    
    // Check if filter already processed
    const processed = await this.wasProcessed(filterHash);
    if (processed) {
      if (!confirm('This filter was already extracted. Continue anyway?')) {
        this.isRunning = false;
        return;
      }
    }
    
    try {
      for (let page = 1; page <= this.maxPagesPerSession && this.isRunning; page++) {
        console.log(`📄 Page ${page}/${this.maxPagesPerSession}`);
        
        await this.waitForResults();
        const leads = this.extractFromPage();
        
        if (leads.length === 0) break;
        
        // Filter duplicates locally
        const newLeads = await this.filterDuplicates(leads);
        console.log(`Found ${leads.length} leads, ${newLeads.length} are new`);
        
        if (newLeads.length > 0) {
          await this.sendToBackend(newLeads);
          this.extractedLeads.push(...newLeads);
        }
        
        chrome.runtime.sendMessage({
          type: 'progress',
          page,
          total: this.extractedLeads.length
        });
        
        if (page < this.maxPagesPerSession) {
          if (!await this.nextPage()) break;
          await this.delay(4000);
        }
      }
      
      await this.markProcessed(filterHash);
      
      console.log(`✅ Complete! ${this.extractedLeads.length} new leads`);
      chrome.runtime.sendMessage({
        type: 'complete',
        total: this.extractedLeads.length
      });
      
    } catch (error) {
      console.error('Error:', error);
    } finally {
      this.isRunning = false;
    }
  }

  getFilterHash() {
    const filters = [];
    document.querySelectorAll('.search-reusables__filter-pill-button').forEach(pill => {
      filters.push(pill.textContent.trim());
    });
    return filters.sort().join('|') || 'no-filters';
  }

  async wasProcessed(hash) {
    const { processedFilters = [] } = await chrome.storage.local.get(['processedFilters']);
    return processedFilters.includes(hash);
  }

  async markProcessed(hash) {
    const { processedFilters = [] } = await chrome.storage.local.get(['processedFilters']);
    if (!processedFilters.includes(hash)) {
      processedFilters.push(hash);
      await chrome.storage.local.set({ processedFilters });
    }
  }

  async filterDuplicates(leads) {
    const { leadHashes = [] } = await chrome.storage.local.get(['leadHashes']);
    const existingSet = new Set(leadHashes);
    const newLeads = [];
    
    for (const lead of leads) {
      const hash = `${lead.name}|${lead.company}|${lead.title}`.toLowerCase();
      if (!existingSet.has(hash)) {
        newLeads.push(lead);
        existingSet.add(hash);
      }
    }
    
    await chrome.storage.local.set({ leadHashes: Array.from(existingSet) });
    return newLeads;
  }

  async waitForResults() {
    for (let i = 0; i < 30; i++) {
      const results = document.querySelectorAll('[data-view-name="search-entity-result"]');
      if (results.length > 0) {
        await this.delay(2000);
        return;
      }
      await this.delay(500);
    }
  }

  extractFromPage() {
    const leads = [];
    document.querySelectorAll('[data-view-name="search-entity-result"]').forEach((el, idx) => {
      try {
        const name = el.querySelector('.artdeco-entity-lockup__title a span[aria-hidden="true"]')?.textContent?.trim();
        const title = el.querySelector('.artdeco-entity-lockup__subtitle span[aria-hidden="true"]')?.textContent?.trim();
        let company = el.querySelector('.artdeco-entity-lockup__caption span[aria-hidden="true"]')?.textContent?.trim() || '';
        company = company.split('·')[0].trim();
        const location = el.querySelector('.artdeco-entity-lockup__meta span[aria-hidden="true"]')?.textContent?.trim();
        const profileUrl = el.querySelector('.artdeco-entity-lockup__title a')?.href;
        
        const fullText = el.textContent;
        const timeInRole = fullText.match(/(\d+\s+months?\s+in\s+role)/)?.[1] || '';
        const timeAtCompany = fullText.match(/(\d+\s+months?\s+in\s+company)/)?.[1] || '';
        const recentlyHired = timeInRole.includes('month') || el.querySelector('[aria-label*="Recently hired"]');
        
        if (name && title && company) {
          leads.push({
            name, title, company, location, profileUrl,
            timeInRole, timeAtCompany, recentlyHired,
            extractedAt: new Date().toISOString()
          });
        }
      } catch (err) {
        console.error(`Error extracting lead ${idx}:`, err);
      }
    });
    return leads;
  }

  async nextPage() {
    const nextBtn = document.querySelector('.artdeco-pagination__button--next:not([disabled])');
    if (!nextBtn) return false;
    nextBtn.click();
    await this.delay(3000);
    return true;
  }

  async sendToBackend(leads) {
    try {
      const response = await fetch(`${this.apiEndpoint}/leads/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads })
      });
      return await response.json();
    } catch (error) {
      console.error('Backend error:', error);
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    this.isRunning = false;
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

console.log('LinkedIn Extractor Ready');
