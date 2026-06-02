import axios from 'axios';
import * as cheerio from 'cheerio';

interface DarkWebAlert {
  id: string;
  title: string;
  source: string;
  forum: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  timestamp: string;
  details: Record<string, any>;
}

export async function scrapeTorForum(forumUrl: string): Promise<DarkWebAlert[]> {
  try {
    // Configuration pour utiliser un proxy Tor local (généralement sur le port 9050)
    const torProxy = process.env.TOR_PROXY_URL || 'http://localhost:9050';
    
    const response = await axios.get(forumUrl, {
      proxy: {
        host: torProxy.split('://')[1].split(':')[0],
        port: parseInt(torProxy.split(':')[2] || '9050')
      },
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0'
      }
    });
    
    const $ = cheerio.load(response.data);
    const alerts: DarkWebAlert[] = [];
    
    // Exemple de scraping pour un forum dark web (à adapter selon la structure réelle)
    // Cette partie dépendra de la structure HTML spécifique du forum cible
    $('div.post').each((index: number, element: any) => {
      const title = $(element).find('h3.post-title').text().trim();
      const source = $(element).find('span.post-author').text().trim();
      const timestamp = $(element).find('time.post-time').attr('datetime') || new Date().toISOString();
      
      // Déterminer la sévérité en fonction des mots-clés
      let severity: 'critical' | 'high' | 'medium' | 'low' = 'medium';
      if (title.includes('exploit') || title.includes('zero-day')) {
        severity = 'critical';
      } else if (title.includes('leak') || title.includes('stolen')) {
        severity = 'high';
      }
      
      alerts.push({
        id: `tor-${index}-${Date.now()}`,
        title,
        source,
        forum: forumUrl,
        severity,
        timestamp,
        details: {
          content: $(element).find('div.post-content').text().trim(),
          url: $(element).find('a.post-link').attr('href') || forumUrl
        }
      });
    });
    
    return alerts;
  } catch (error) {
    console.error('Tor scraping error:', error);
    throw new Error('Failed to scrape Tor forum');
  }
}

export async function scrapeI2PForum(forumUrl: string): Promise<DarkWebAlert[]> {
  // Implémentation similaire pour les forums I2P
  // Utiliserait un proxy I2P au lieu de Tor
  try {
    const i2pProxy = process.env.I2P_PROXY_URL || 'http://localhost:4444';
    
    const response = await axios.get(forumUrl, {
      proxy: {
        host: i2pProxy.split('://')[1].split(':')[0],
        port: parseInt(i2pProxy.split(':')[2] || '4444')
      },
      timeout: 30000
    });
    
    // Logique de parsing similaire à Tor
    const $ = cheerio.load(response.data);
    const alerts: DarkWebAlert[] = [];
    
    $('article.forum-post').each((index: number, element: any) => {
      const title = $(element).find('header h2').text().trim();
      const source = $(element).find('footer .author').text().trim();
      
      alerts.push({
        id: `i2p-${index}-${Date.now()}`,
        title,
        source,
        forum: forumUrl,
        severity: 'medium',
        timestamp: new Date().toISOString(),
        details: {
          content: $(element).find('.post-body').text().trim()
        }
      });
    });
    
    return alerts;
  } catch (error) {
    console.error('I2P scraping error:', error);
    throw new Error('Failed to scrape I2P forum');
  }
}

export async function monitorDarkWebForums(forums: string[]): Promise<DarkWebAlert[]> {
  const allAlerts: DarkWebAlert[] = [];
  
  for (const forum of forums) {
    try {
      if (forum.includes('.onion')) {
        const alerts = await scrapeTorForum(forum);
        allAlerts.push(...alerts);
      } else if (forum.includes('.i2p')) {
        const alerts = await scrapeI2PForum(forum);
        allAlerts.push(...alerts);
      }
    } catch (error) {
      console.warn(`Failed to scrape ${forum}:`, error);
    }
  }
  
  // Trier par timestamp (le plus récent en premier)
  return allAlerts.sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}