/**
 * FamilySearch Sources Tab Extractor
 * 
 * Run this script in the browser console on a FamilySearch person Sources page:
 * https://www.familysearch.org/en/tree/person/sources/KWCJ-4XD
 * 
 * It will extract all visible sources and their citations from the DOM.
 * The JSON can be used to populate the sources/citations tables in Convex.
 * 
 * Usage:
 * 1. Navigate to a FamilySearch person Sources page (click "Sources" tab)
 * 2. Open Chrome DevTools (F12)
 * 3. Paste this entire script into the Console tab
 * 4. Press Enter
 * 5. Copy the JSON output from the console or clipboard
 */

(function extractFamilySearchSources() {
  console.log('🔍 FamilySearch Sources Extractor v1.0');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    // Extract FamilySearch ID from URL
    const urlMatch = window.location.pathname.match(/\/tree\/person\/sources\/([A-Z0-9-]+)/);
    const fsId = urlMatch ? urlMatch[1] : null;
    
    if (!fsId) {
      throw new Error('Could not extract FamilySearch ID from URL. Are you on a person Sources page?');
    }
    
    console.log(`📋 Extracting sources for person: ${fsId}`);
    
    // Initialize result object
    const result = {
      fsId,
      extractedAt: new Date().toISOString(),
      extractedFrom: window.location.href,
      sources: []
    };
    
    // ===== FIND ALL SOURCE CARDS =====
    // FamilySearch uses various selectors depending on the page version
    const sourceCards = document.querySelectorAll([
      '.fs-person-sources__source-card',
      '[data-test="source-card"]',
      '.source-card',
      '.fs-source-card'
    ].join(', '));
    
    if (sourceCards.length === 0) {
      console.warn('⚠️  No source cards found on this page.');
      console.log('Make sure you are on the Sources tab and sources are visible.');
      return result;
    }
    
    console.log(`Found ${sourceCards.length} source cards\n`);
    
    // ===== EXTRACT EACH SOURCE =====
    sourceCards.forEach((card, index) => {
      const source = {
        order: index + 1
      };
      
      // Extract title
      const titleEl = card.querySelector([
        '.fs-person-sources__source-title',
        '[data-test="source-title"]',
        '.source-card__title',
        'h3',
        'h4'
      ].join(', '));
      
      if (titleEl) {
        source.title = titleEl.textContent.trim();
      }
      
      // Extract source URL (link to FamilySearch source)
      const sourceLink = card.querySelector('a[href*="/source/"]');
      if (sourceLink) {
        source.fsSourceUrl = sourceLink.href;
        
        // Extract FamilySearch source ID from URL
        const sourceIdMatch = sourceLink.href.match(/\/source\/([A-Z0-9-]+)/);
        if (sourceIdMatch) {
          source.fsSourceId = sourceIdMatch[1];
        }
      }
      
      // Extract repository/collection info
      const repoEl = card.querySelector([
        '.fs-person-sources__repository',
        '[data-test="repository"]',
        '.source-card__repository'
      ].join(', '));
      
      if (repoEl) {
        source.repository = repoEl.textContent.trim();
      }
      
      // Extract citation text (indexed information)
      const citationEls = card.querySelectorAll([
        '.fs-person-sources__citation-text',
        '[data-test="citation-text"]',
        '.source-card__citation',
        '.fs-source-citation-text'
      ].join(', '));
      
      source.citations = [];
      citationEls.forEach(citationEl => {
        const citationText = citationEl.textContent.trim();
        if (citationText && citationText.length > 0) {
          source.citations.push({
            text: citationText
          });
        }
      });
      
      // If no specific citation elements found, try to get all text content
      if (source.citations.length === 0) {
        const allText = card.textContent.trim();
        // Try to extract anything that looks like indexed information
        const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        lines.forEach(line => {
          // Skip title, repository, and common UI text
          if (line !== source.title && 
              line !== source.repository &&
              !line.includes('Attach') &&
              !line.includes('View') &&
              !line.includes('Details') &&
              line.length > 10) {
            source.citations.push({
              text: line
            });
          }
        });
      }
      
      // Extract URL if there's an external link
      const externalLink = card.querySelector('a[href^="http"]:not([href*="familysearch.org"])');
      if (externalLink) {
        source.externalUrl = externalLink.href;
      }
      
      // Try to determine source type from content
      const titleLower = (source.title || '').toLowerCase();
      const repoLower = (source.repository || '').toLowerCase();
      const combinedText = `${titleLower} ${repoLower}`;
      
      if (combinedText.includes('census')) {
        source.type = 'census';
      } else if (combinedText.includes('birth') || combinedText.includes('death') || combinedText.includes('marriage')) {
        source.type = 'vital_record';
      } else if (combinedText.includes('church') || combinedText.includes('baptism') || combinedText.includes('christening')) {
        source.type = 'church_record';
      } else if (combinedText.includes('military')) {
        source.type = 'military';
      } else if (combinedText.includes('immigration') || combinedText.includes('emigration') || combinedText.includes('passenger')) {
        source.type = 'immigration';
      } else if (combinedText.includes('obituary')) {
        source.type = 'obituary';
      } else if (combinedText.includes('newspaper')) {
        source.type = 'newspaper';
      } else if (combinedText.includes('photo')) {
        source.type = 'photograph';
      } else if (combinedText.includes('book')) {
        source.type = 'book';
      } else {
        source.type = 'other';
      }
      
      // Extract confidence level (if visible)
      const confidenceEl = card.querySelector([
        '.fs-person-sources__confidence',
        '[data-test="confidence"]',
        '.source-card__confidence'
      ].join(', '));
      
      if (confidenceEl) {
        const confidenceText = confidenceEl.textContent.toLowerCase();
        if (confidenceText.includes('very high') || confidenceText.includes('excellent')) {
          source.confidence = 'very_high';
        } else if (confidenceText.includes('high') || confidenceText.includes('good')) {
          source.confidence = 'high';
        } else if (confidenceText.includes('medium') || confidenceText.includes('fair')) {
          source.confidence = 'medium';
        } else if (confidenceText.includes('low') || confidenceText.includes('poor')) {
          source.confidence = 'low';
        }
      } else {
        // Default confidence based on source type
        if (source.type === 'census' || source.type === 'vital_record') {
          source.confidence = 'high';
        } else {
          source.confidence = 'medium';
        }
      }
      
      // Add to result
      result.sources.push(source);
      
      console.log(`✓ Source ${index + 1}: ${source.title || '(untitled)'} [${source.type}]`);
      if (source.citations.length > 0) {
        console.log(`  └─ ${source.citations.length} citation(s)`);
      }
    });
    
    // ===== OUTPUT =====
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Extraction complete!');
    console.log(`   Found ${result.sources.length} sources with ${result.sources.reduce((sum, s) => sum + s.citations.length, 0)} citations`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📋 JSON Output:\n');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Copy to clipboard
    const jsonStr = JSON.stringify(result, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      console.log('✅ JSON copied to clipboard!');
      console.log('\nNext steps:');
      console.log('1. Save this JSON to a file (e.g., sources-KWCJ-4XD.json)');
      console.log('2. Run: npx tsx scripts/fs-to-convex.ts --sources sources-KWCJ-4XD.json');
    }).catch(err => {
      console.warn('⚠️  Could not copy to clipboard:', err.message);
      console.log('Please copy the JSON output manually.');
    });
    
    return result;
    
  } catch (error) {
    console.error('❌ Error during extraction:', error);
    console.error(error.stack);
    return null;
  }
})();
