const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const crypto = require('crypto');
const axios = require('axios');
const dns = require('dns').promises;
const net = require('net');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/linkedin-leads')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// Enhanced Lead Schema
const leadSchema = new mongoose.Schema({
  name: { type: String, required: true },
  title: { type: String, required: true },
  company: { type: String, required: true },
  location: String,
  profileUrl: String,
  companyDomain: String,
  emailAddress: String,
  emailPattern: String,
  emailVerified: { type: Boolean, default: false },
  verificationMethod: String, // 'smtp', 'catch_all', 'pattern_match'
  emailCandidates: [String],
  status: { type: String, default: 'pending' },
  extractedAt: { type: Date, default: Date.now },
  processedAt: Date,
  verifiedAt: Date,
  hash: { type: String, unique: true, required: true },
  recentlyHired: { type: Boolean, default: false },
  timeInRole: String,
  timeAtCompany: String,
  filterHash: String
});

// Enhanced Company Schema
const companySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  domain: String,
  isCatchAll: { type: Boolean, default: false },
  commonEmailPattern: String, // Store the pattern that works for this company
  verifiedPatterns: [String], // All patterns that have worked
  firstSeen: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now },
  failed: { type: Boolean, default: false }
});

const apiUsageSchema = new mongoose.Schema({
  provider: String,
  companyName: String,
  domain: String,
  success: Boolean,
  cost: Number,
  timestamp: { type: Date, default: Date.now }
});

const Lead = mongoose.model('Lead', leadSchema);
const Company = mongoose.model('Company', companySchema);
const ApiUsage = mongoose.model('ApiUsage', apiUsageSchema);

// Email pattern generator based on real data analysis
function generateEmailPatterns(lead, domain) {
  const fullName = lead.name.trim();
  const nameParts = fullName.toLowerCase().split(/\s+/);
  
  let firstName = nameParts[0] || '';
  let lastName = nameParts[nameParts.length - 1] || '';
  let middleName = nameParts.length > 2 ? nameParts[1] : '';
  
  // Clean names
  firstName = firstName.replace(/[^a-z]/g, '');
  lastName = lastName.replace(/[^a-z]/g, '');
  middleName = middleName.replace(/[^a-z]/g, '');
  
  const fi = firstName.charAt(0);
  const li = lastName.charAt(0);
  const mi = middleName.charAt(0);
  
  // Patterns ordered by frequency from your data
  const patterns = [
    { pattern: 'firstname', email: `${firstName}@${domain}`, frequency: 22 },
    { pattern: 'firstname.lastname', email: `${firstName}.${lastName}@${domain}`, frequency: 19 },
    { pattern: 'firstnamelastname', email: `${firstName}${lastName}@${domain}`, frequency: 15 },
    { pattern: 'flastname', email: `${fi}${lastName}@${domain}`, frequency: 12 },
    { pattern: 'firstname_lastname', email: `${firstName}_${lastName}@${domain}`, frequency: 8 },
    { pattern: 'f.lastname', email: `${fi}.${lastName}@${domain}`, frequency: 6 },
    { pattern: 'lastname', email: `${lastName}@${domain}`, frequency: 5 },
    { pattern: 'lastnamefirstname', email: `${lastName}${firstName}@${domain}`, frequency: 4 },
    { pattern: 'lastname.firstname', email: `${lastName}.${firstName}@${domain}`, frequency: 3 },
    { pattern: 'firstnamel', email: `${firstName}${li}@${domain}`, frequency: 2 },
    { pattern: 'firstname-lastname', email: `${firstName}-${lastName}@${domain}`, frequency: 1 },
    { pattern: 'lastnamef', email: `${lastName}${fi}@${domain}`, frequency: 1 },
    { pattern: 'lastname_firstname', email: `${lastName}_${firstName}@${domain}`, frequency: 1 },
    { pattern: 'fl', email: `${fi}${li}@${domain}`, frequency: 1 }
  ];
  
  // Add middle initial patterns if exists
  if (middleName) {
    patterns.push(
      { pattern: 'firstnamemiddleinitial.lastname', email: `${firstName}${mi}.${lastName}@${domain}`, frequency: 0.5 },
      { pattern: 'firstnamemiddleinitiallastname', email: `${firstName}${mi}${lastName}@${domain}`, frequency: 0.5 }
    );
  }
  
  // Remove invalid patterns and sort by frequency
  return patterns
    .filter(p => p.email.includes('@') && !p.email.startsWith('@'))
    .sort((a, b) => b.frequency - a.frequency);
}

// SMTP Email Verification
async function verifyEmailSMTP(email) {
  try {
    const [localPart, domain] = email.split('@');
    
    // Get MX records
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) return { valid: false, reason: 'no_mx' };
    
    mxRecords.sort((a, b) => a.priority - b.priority);
    const mxHost = mxRecords[0].exchange;
    
    return new Promise((resolve) => {
      const socket = net.createConnection(25, mxHost);
      let step = 0;
      socket.setTimeout(10000);
      
      socket.on('data', (data) => {
        const response = data.toString();
        
        if (step === 0 && response.includes('220')) {
          socket.write(`HELO verify.com\r\n`);
          step++;
        } else if (step === 1 && response.includes('250')) {
          socket.write(`MAIL FROM:<test@verify.com>\r\n`);
          step++;
        } else if (step === 2 && response.includes('250')) {
          socket.write(`RCPT TO:<${email}>\r\n`);
          step++;
        } else if (step === 3) {
          const valid = response.includes('250');
          socket.write(`QUIT\r\n`);
          socket.end();
          resolve({ valid, reason: valid ? 'smtp_verified' : 'rejected' });
        }
      });
      
      socket.on('error', () => resolve({ valid: false, reason: 'connection_error' }));
      socket.on('timeout', () => {
        socket.destroy();
        resolve({ valid: false, reason: 'timeout' });
      });
    });
  } catch (error) {
    return { valid: false, reason: error.message };
  }
}

// Check if domain is catch-all
async function checkCatchAll(domain) {
  const randomEmail = `test${Date.now()}${Math.random()}@${domain}`;
  const result = await verifyEmailSMTP(randomEmail);
  return result.valid;
}

// Main lead enrichment function
async function enrichLead(lead) {
  try {
    console.log(`🔍 Processing: ${lead.name} at ${lead.company}`);
    
    // Check/resolve company domain
    let company = await Company.findOne({ 
      name: { $regex: new RegExp(`^${lead.company}$`, 'i') }
    });
    
    if (!company || (!company.domain && !company.failed)) {
      const domain = await resolveCompanyDomain(lead.company);
      
      if (domain) {
        const isCatchAll = await checkCatchAll(domain);
        company = await Company.findOneAndUpdate(
          { name: lead.company },
          { domain, isCatchAll, lastUpdated: new Date(), failed: false },
          { upsert: true, new: true }
        );
        console.log(`🌐 Domain: ${domain} (Catch-all: ${isCatchAll})`);
      } else {
        await Company.findOneAndUpdate(
          { name: lead.company },
          { failed: true, lastUpdated: new Date() },
          { upsert: true }
        );
        return;
      }
    }

    if (company && company.domain) {
      const emailPatterns = generateEmailPatterns(lead, company.domain);
      console.log(`📧 Testing ${emailPatterns.length} patterns for ${lead.name}`);
      
      let verifiedEmail = null;
      let verifiedPattern = null;
      let verificationMethod = null;
      
      // If we know a pattern works for this company, try it first
      if (company.commonEmailPattern) {
        const knownPattern = emailPatterns.find(p => p.pattern === company.commonEmailPattern);
        if (knownPattern) {
          const result = await verifyEmailSMTP(knownPattern.email);
          if (result.valid) {
            verifiedEmail = knownPattern.email;
            verifiedPattern = knownPattern.pattern;
            verificationMethod = 'pattern_match';
            console.log(`✅ Known pattern worked: ${verifiedEmail}`);
          }
        }
      }
      
      // If catch-all domain, use most common pattern
      if (!verifiedEmail && company.isCatchAll) {
        verifiedEmail = emailPatterns[0].email;
        verifiedPattern = emailPatterns[0].pattern;
        verificationMethod = 'catch_all';
        console.log(`📮 Catch-all domain: ${verifiedEmail}`);
      }
      
      // Otherwise, test each pattern
      if (!verifiedEmail) {
        for (const pattern of emailPatterns) {
          console.log(`  Testing: ${pattern.email} (${pattern.pattern})`);
          const result = await verifyEmailSMTP(pattern.email);
          
          if (result.valid) {
            verifiedEmail = pattern.email;
            verifiedPattern = pattern.pattern;
            verificationMethod = 'smtp';
            
            // Update company's known pattern
            await Company.findByIdAndUpdate(company._id, {
              commonEmailPattern: verifiedPattern,
              $addToSet: { verifiedPatterns: verifiedPattern }
            });
            
            console.log(`  ✅ Verified: ${verifiedEmail}`);
            break;
          }
        }
      }
      
      // Update lead
      if (verifiedEmail) {
        await Lead.findByIdAndUpdate(lead._id, {
          companyDomain: company.domain,
          emailAddress: verifiedEmail,
          emailPattern: verifiedPattern,
          emailVerified: true,
          verificationMethod,
          emailCandidates: emailPatterns.map(p => p.email),
          status: 'email_verified',
          processedAt: new Date(),
          verifiedAt: new Date()
        });
      } else {
        await Lead.findByIdAndUpdate(lead._id, {
          companyDomain: company.domain,
          emailCandidates: emailPatterns.map(p => p.email),
          status: 'no_valid_email',
          processedAt: new Date()
        });
      }
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    await Lead.findByIdAndUpdate(lead._id, {
      status: 'failed',
      processedAt: new Date()
    });
  }
}

// Domain resolution
async function resolveCompanyDomain(companyName) {
  try {
    const cleanName = companyName.replace(/[^\w\s]/g, '').trim();
    const query = `${cleanName} official website`;
    
    // Try Bright Data
    if (process.env.BRIGHT_DATA_API_KEY) {
      try {
        const response = await axios.post('https://api.brightdata.com/request', {
          zone: 'domain_finder',
          url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
          format: 'raw'
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.BRIGHT_DATA_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        });

        const domain = extractDomainFromHTML(response.data, companyName);
        if (domain) {
          await ApiUsage.create({
            provider: 'bright_data',
            companyName,
            domain,
            success: true,
            cost: 0.0015
          });
          return domain;
        }
      } catch (error) {
        console.log(`Bright Data failed: ${error.message}`);
      }
    }
    
    // Fallback to DataForSEO
    if (process.env.DATAFORSEO_USERNAME && process.env.DATAFORSEO_PASSWORD) {
      const auth = Buffer.from(`${process.env.DATAFORSEO_USERNAME}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64');
      
      const response = await axios.post(
        'https://api.dataforseo.com/v3/serp/google/organic/live/advanced',
        [{
          keyword: query,
          location_code: 2840,
          language_code: "en",
          device: "desktop",
          os: "windows",
          depth: 10
        }],
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const items = response.data?.tasks?.[0]?.result?.[0]?.items || [];
      for (const item of items) {
        if (!item.url) continue;
        const url = new URL(item.url);
        const domain = url.hostname.replace('www.', '');
        if (isRelevantDomain(domain, companyName)) {
          await ApiUsage.create({
            provider: 'dataforseo',
            companyName,
            domain,
            success: true,
            cost: 0.0006
          });
          return domain;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Domain resolution error: ${error.message}`);
    return null;
  }
}

function extractDomainFromHTML(html, companyName) {
  const urlRegex = /https?:\/\/(www\.)?([^\/\s"'>]+)/gi;
  const matches = [];
  let match;
  
  while ((match = urlRegex.exec(html)) !== null) {
    const domain = match[2].toLowerCase();
    if (isRelevantDomain(domain, companyName)) {
      matches.push(domain);
    }
  }
  
  return matches[0] || null;
}

function isRelevantDomain(domain, companyName) {
  const skipDomains = [
    'linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com',
    'wikipedia.org', 'youtube.com', 'glassdoor.com', 'indeed.com'
  ];
  
  if (skipDomains.some(skip => domain.includes(skip))) return false;
  
  const companyWords = companyName.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(' ')
    .filter(word => word.length > 2);
  
  const domainParts = domain.split('.');
  
  for (const word of companyWords) {
    if (domainParts.some(part => part.includes(word) || word.includes(part))) {
      return true;
    }
  }
  
  return false;
}

// API Routes
app.post('/api/leads/batch', async (req, res) => {
  try {
    const { leads } = req.body;
    const processedLeads = [];
    
    for (const lead of leads) {
      const hash = crypto.createHash('md5')
        .update(`${lead.name}-${lead.company}-${lead.title}`.toLowerCase())
        .digest('hex');
      
      const existingLead = await Lead.findOne({ hash });
      if (existingLead) continue;
      
      const newLead = new Lead({ ...lead, hash });
      await newLead.save();
      processedLeads.push(newLead);
    }
    
    console.log(`✅ Received ${processedLeads.length} new leads`);
    
    // Start processing
    setTimeout(processLeads, 2000);
    
    res.json({ success: true, processed: processedLeads.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/leads/stats', async (req, res) => {
  try {
    const totalLeads = await Lead.countDocuments();
    const verifiedEmails = await Lead.countDocuments({ emailVerified: true });
    const pendingLeads = await Lead.countDocuments({ status: 'pending' });
    const failedLeads = await Lead.countDocuments({ status: 'failed' });
    const totalCompanies = await Company.countDocuments();
    const catchAllCompanies = await Company.countDocuments({ isCatchAll: true });
    
    const patternStats = await Lead.aggregate([
      { $match: { emailPattern: { $exists: true } } },
      { $group: { _id: "$emailPattern", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    res.json({
      totalLeads,
      verifiedEmails,
      pendingLeads,
      failedLeads,
      totalCompanies,
      catchAllCompanies,
      patternStats,
      conversionRate: totalLeads > 0 ? (verifiedEmails / totalLeads * 100).toFixed(2) : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/export/csv', async (req, res) => {
  try {
    const leads = await Lead.find({ emailVerified: true }).sort('-extractedAt');
    
    let csv = 'Name,Title,Company,Location,Email,Pattern,Verification Method,Domain,Extracted Date\n';
    leads.forEach(lead => {
      csv += `"${lead.name}","${lead.title}","${lead.company}","${lead.location || ''}","${lead.emailAddress}","${lead.emailPattern}","${lead.verificationMethod}","${lead.companyDomain}","${new Date(lead.extractedAt).toLocaleDateString()}"\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=verified_leads.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1,
    brightData: !!process.env.BRIGHT_DATA_API_KEY,
    dataForSeo: !!process.env.DATAFORSEO_USERNAME
  });
});

// Background processing
async function processLeads() {
  try {
    const pendingLeads = await Lead.find({ status: 'pending' }).limit(5);
    
    if (pendingLeads.length === 0) return;
    
    console.log(`🔄 Processing ${pendingLeads.length} leads...`);
    
    for (const lead of pendingLeads) {
      await enrichLead(lead);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    const remainingLeads = await Lead.countDocuments({ status: 'pending' });
    if (remainingLeads > 0) {
      setTimeout(processLeads, 5000);
    }
  } catch (error) {
    console.error(`Processing error: ${error.message}`);
    setTimeout(processLeads, 10000);
  }
}

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  setTimeout(processLeads, 5000);
});
