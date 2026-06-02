import axios from 'axios';
import * as cheerio from 'cheerio';

interface OSINTResult {
  id: string;
  title: string;
  source: string;
  url: string;
  content: string;
  timestamp: string;
  platform: 'twitter' | 'facebook' | 'linkedin' | 'web';
}

interface OSINTQuery {
  query: string;
  platforms: ('twitter' | 'facebook' | 'linkedin' | 'web')[];
  maxResults?: number;
}

export async function scrapeTwitter(query: string, maxResults: number = 10): Promise<OSINTResult[]> {
  try {
    // Note: In a real implementation, you would use Twitter API v2
    // This is a simplified example using web scraping
    const response = await axios.get(
      `https://twitter.com/search?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0'
        }
      }
    );
    
    const $ = cheerio.load(response.data);
    const results: OSINTResult[] = [];
    
    $('article[data-testid="tweet"]').slice(0, maxResults).each((index, element) => {
      const title = $(element).find('div[lang]').text().trim();
      const url = `https://twitter.com${$(element).find('a[role="link"]').attr('href')}`;
      const content = $(element).find('div[data-testid="tweetText"]').text().trim();
      const timestamp = $(element).find('time').attr('datetime') || new Date().toISOString();
      
      results.push({
        id: `twitter-${index}-${Date.now()}`,
        title,
        source: 'Twitter',
        url,
        content,
        timestamp,
        platform: 'twitter'
      });
    });
    
    return results;
  } catch (error) {
    console.error('Twitter scraping error:', error);
    throw new Error('Failed to scrape Twitter');
  }
}

export async function scrapeFacebook(query: string, maxResults: number = 10): Promise<OSINTResult[]> {
  try {
    // Note: Facebook requires login, so this is a simplified example
    const response = await axios.get(
      `https://www.facebook.com/search/top?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0'
        }
      }
    );
    
    const $ = cheerio.load(response.data);
    const results: OSINTResult[] = [];
    
    $('div[role="article"]').slice(0, maxResults).each((index, element) => {
      const title = $(element).find('strong').text().trim();
      const url = $(element).find('a').attr('href') || '';
      const content = $(element).text().trim();
      
      results.push({
        id: `facebook-${index}-${Date.now()}`,
        title,
        source: 'Facebook',
        url: url.startsWith('http') ? url : `https://www.facebook.com${url}`,
        content,
        timestamp: new Date().toISOString(),
        platform: 'facebook'
      });
    });
    
    return results;
  } catch (error) {
    console.error('Facebook scraping error:', error);
    throw new Error('Failed to scrape Facebook');
  }
}

export async function scrapeLinkedIn(query: string, maxResults: number = 10): Promise<OSINTResult[]> {
  try {
    const response = await axios.get(
      `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0'
        }
      }
    );
    
    const $ = cheerio.load(response.data);
    const results: OSINTResult[] = [];
    
    $('li.reusable-search__result-container').slice(0, maxResults).each((index, element) => {
      const title = $(element).find('h3').text().trim();
      const url = $(element).find('a').attr('href') || '';
      const content = $(element).find('p').text().trim();
      const timestamp = $(element).find('time').attr('datetime') || new Date().toISOString();
      
      results.push({
        id: `linkedin-${index}-${Date.now()}`,
        title,
        source: 'LinkedIn',
        url: url.startsWith('http') ? url : `https://www.linkedin.com${url}`,
        content,
        timestamp,
        platform: 'linkedin'
      });
    });
    
    return results;
  } catch (error) {
    console.error('LinkedIn scraping error:', error);
    throw new Error('Failed to scrape LinkedIn');
  }
}

export async function scrapeWeb(query: string, maxResults: number = 10): Promise<OSINTResult[]> {
  try {
    const response = await axios.get(
      `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0'
        }
      }
    );
    
    const $ = cheerio.load(response.data);
    const results: OSINTResult[] = [];
    
    $('div.g').slice(0, maxResults).each((index, element) => {
      const title = $(element).find('h3').text().trim();
      const url = $(element).find('a').attr('href') || '';
      const content = $(element).find('div[data-sncf]').text().trim();
      
      results.push({
        id: `web-${index}-${Date.now()}`,
        title,
        source: 'Web Search',
        url,
        content,
        timestamp: new Date().toISOString(),
        platform: 'web'
      });
    });
    
    return results;
  } catch (error) {
    console.error('Web search error:', error);
    throw new Error('Failed to perform web search');
  }
}

export async function runOSINTQuery(query: OSINTQuery): Promise<OSINTResult[]> {
  const { query: searchQuery, platforms, maxResults = 10 } = query;
  const allResults: OSINTResult[] = [];
  
  for (const platform of platforms) {
    try {
      let results: OSINTResult[] = [];
      
      switch (platform) {
        case 'twitter':
          results = await scrapeTwitter(searchQuery, maxResults);
          break;
        case 'facebook':
          results = await scrapeFacebook(searchQuery, maxResults);
          break;
        case 'linkedin':
          results = await scrapeLinkedIn(searchQuery, maxResults);
          break;
        case 'web':
          results = await scrapeWeb(searchQuery, maxResults);
          break;
      }
      
      allResults.push(...results);
    } catch (error) {
      console.warn(`Failed to scrape ${platform}:`, error);
    }
  }
  
  // Trier par timestamp (le plus récent en premier)
  return allResults.sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export async function generateOSINTReport(query: OSINTQuery): Promise<{
  results: OSINTResult[];
  summary: string;
  html: string;
}> {
  const results = await runOSINTQuery(query);
  
  // Générer un résumé
  const summary = `OSINT query for "${query.query}" returned ${results.length} results ` +
                  `across ${query.platforms.length} platforms. ` +
                  `Found ${results.filter(r => r.platform === 'twitter').length} Twitter posts, ` +
                  `${results.filter(r => r.platform === 'facebook').length} Facebook posts, ` +
                  `${results.filter(r => r.platform === 'linkedin').length} LinkedIn posts, and ` +
                  `${results.filter(r => r.platform === 'web').length} web results.`;
  
  // Générer un HTML simple
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>OSINT Report: ${query.query}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .result { border: 1px solid #ddd; padding: 15px; margin-bottom: 10px; }
        .platform { color: #666; font-size: 0.9em; }
      </style>
    </head>
    <body>
      <h1>OSINT Report: ${query.query}</h1>
      <p>${summary}</p>
      <h2>Results</h2>
      ${results.map(result => `
        <div class="result">
          <h3>${result.title}</h3>
          <div class="platform">${result.source} • ${new Date(result.timestamp).toLocaleString()}</div>
          <p>${result.content}</p>
          <a href="${result.url}" target="_blank">View Source</a>
        </div>
      `).join('')}
    </body>
    </html>
  `;
  
  return { results, summary, html };
}