/**
 * FamilySearch Person Details Extractor
 * 
 * Run this script in the browser console on a FamilySearch person Details page:
 * https://www.familysearch.org/en/tree/person/details/KWCJ-4XD
 * 
 * It will extract all visible data from the DOM and output as JSON.
 * The JSON can be directly imported into the Discover Their Stories Convex database.
 * 
 * Usage:
 * 1. Navigate to a FamilySearch person Details page
 * 2. Open Chrome DevTools (F12)
 * 3. Paste this entire script into the Console tab
 * 4. Press Enter
 * 5. Copy the JSON output from the console or clipboard
 */

(function extractFamilySearchPerson() {
  console.log('🔍 FamilySearch Person Extractor v1.0');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    // Extract FamilySearch ID from URL
    const urlMatch = window.location.pathname.match(/\/tree\/person\/details\/([A-Z0-9-]+)/);
    const fsId = urlMatch ? urlMatch[1] : null;
    
    if (!fsId) {
      throw new Error('Could not extract FamilySearch ID from URL. Are you on a person Details page?');
    }
    
    console.log(`📋 Extracting data for person: ${fsId}`);
    
    // Initialize person object
    const person = {
      fsId,
      extractedAt: new Date().toISOString(),
      extractedFrom: window.location.href,
    };
    
    // ===== EXTRACT NAME =====
    const nameEl = document.querySelector('.fs-person-vitals__name, h1[data-test="person-name"]');
    if (nameEl) {
      const fullName = nameEl.textContent.trim();
      const nameParts = fullName.split(' ').filter(p => p.length > 0);
      
      if (nameParts.length >= 2) {
        person.name = {
          given: nameParts.slice(0, -1).join(' '),
          surname: nameParts[nameParts.length - 1]
        };
      } else {
        person.name = {
          given: fullName,
          surname: ''
        };
      }
      console.log(`✓ Name: ${fullName}`);
    }
    
    // ===== EXTRACT SEX =====
    const sexEl = document.querySelector('[data-test="person-sex"], .fs-person-details__sex-value');
    if (sexEl) {
      const sexText = sexEl.textContent.trim().toLowerCase();
      person.sex = sexText.includes('male') ? 'male' : sexText.includes('female') ? 'female' : 'unknown';
      console.log(`✓ Sex: ${person.sex}`);
    } else {
      person.sex = 'unknown';
    }
    
    // ===== EXTRACT QUALITY SCORE =====
    const qualityEl = document.querySelector('.fs-person-quality-score, [data-test="quality-score"]');
    if (qualityEl) {
      person.qualityScore = qualityEl.textContent.trim();
      console.log(`✓ Quality Score: ${person.qualityScore}`);
    }
    
    // ===== EXTRACT LIVING STATUS =====
    person.living = document.querySelector('[data-test="living-status"]')?.textContent.includes('Living') || false;
    console.log(`✓ Living: ${person.living}`);
    
    // ===== HELPER: Parse date from FamilySearch format =====
    function parseDate(dateStr) {
      if (!dateStr || dateStr === '—') return null;
      
      const result = { original: dateStr };
      
      // Extract year (4 digits)
      const yearMatch = dateStr.match(/\b(\d{4})\b/);
      if (yearMatch) {
        result.year = parseInt(yearMatch[1]);
      }
      
      // Extract month
      const months = {
        january: 1, jan: 1,
        february: 2, feb: 2,
        march: 3, mar: 3,
        april: 4, apr: 4,
        may: 5,
        june: 6, jun: 6,
        july: 7, jul: 7,
        august: 8, aug: 8,
        september: 9, sep: 9, sept: 9,
        october: 10, oct: 10,
        november: 11, nov: 11,
        december: 12, dec: 12,
      };
      
      for (const [monthName, monthNum] of Object.entries(months)) {
        const regex = new RegExp(`\\b${monthName}\\b`, 'i');
        if (regex.test(dateStr)) {
          result.month = monthNum;
          
          // Try to find day
          const dayMatch = dateStr.match(/\b(\d{1,2})\b/);
          if (dayMatch) {
            result.day = parseInt(dayMatch[1]);
          }
          break;
        }
      }
      
      // Check for approximate indicators
      result.approximate = /about|circa|abt|ca|approx/i.test(dateStr);
      
      return result;
    }
    
    // ===== HELPER: Parse place =====
    function parsePlace(placeStr) {
      if (!placeStr || placeStr === '—') return null;
      return { original: placeStr.trim() };
    }
    
    // ===== EXTRACT VITAL FACTS =====
    const vitalSections = document.querySelectorAll('.fs-person-vitals__fact, [data-test="vitals-fact"]');
    
    vitalSections.forEach(section => {
      const label = section.querySelector('.fs-person-vitals__label, [data-test="fact-label"]')?.textContent.trim().toLowerCase();
      const value = section.querySelector('.fs-person-vitals__value, [data-test="fact-value"]');
      
      if (!label || !value) return;
      
      const dateEl = value.querySelector('.fs-person-vitals__date, [data-test="fact-date"]');
      const placeEl = value.querySelector('.fs-person-vitals__place, [data-test="fact-place"]');
      
      const factData = {
        date: dateEl ? parseDate(dateEl.textContent.trim()) : null,
        place: placeEl ? parsePlace(placeEl.textContent.trim()) : null
      };
      
      // Remove nulls
      if (!factData.date) delete factData.date;
      if (!factData.place) delete factData.place;
      
      if (label.includes('birth')) {
        person.birth = factData;
        console.log(`✓ Birth: ${dateEl?.textContent || ''} ${placeEl?.textContent || ''}`);
      } else if (label.includes('death')) {
        person.death = factData;
        console.log(`✓ Death: ${dateEl?.textContent || ''} ${placeEl?.textContent || ''}`);
      } else if (label.includes('burial')) {
        person.burial = factData;
        console.log(`✓ Burial: ${dateEl?.textContent || ''} ${placeEl?.textContent || ''}`);
      }
    });
    
    // ===== EXTRACT ALTERNATE NAMES =====
    person.alternateNames = [];
    const nameCards = document.querySelectorAll('.fs-person-names__card, [data-test="alternate-name"]');
    
    nameCards.forEach(card => {
      const nameType = card.querySelector('.fs-person-names__type, [data-test="name-type"]')?.textContent.trim();
      const nameValue = card.querySelector('.fs-person-names__name, [data-test="name-value"]')?.textContent.trim();
      
      if (nameValue && nameType !== 'Preferred') {
        const nameParts = nameValue.split(' ').filter(p => p.length > 0);
        person.alternateNames.push({
          type: nameType || 'AlsoKnownAs',
          given: nameParts.slice(0, -1).join(' ') || nameValue,
          surname: nameParts[nameParts.length - 1] || ''
        });
      }
    });
    
    if (person.alternateNames.length > 0) {
      console.log(`✓ Alternate Names: ${person.alternateNames.length} found`);
    }
    
    // ===== EXTRACT OTHER EVENTS =====
    person.events = [];
    const eventSections = document.querySelectorAll('.fs-person-details__event, [data-test="event-card"]');
    
    eventSections.forEach(section => {
      const eventType = section.querySelector('.fs-person-details__event-type, [data-test="event-type"]')?.textContent.trim();
      const dateEl = section.querySelector('.fs-person-details__event-date, [data-test="event-date"]');
      const placeEl = section.querySelector('.fs-person-details__event-place, [data-test="event-place"]');
      const descEl = section.querySelector('.fs-person-details__event-description, [data-test="event-description"]');
      
      if (eventType) {
        const event = {
          type: eventType.toLowerCase().replace(/\s+/g, '_'),
          customType: eventType
        };
        
        if (dateEl) event.date = parseDate(dateEl.textContent.trim());
        if (placeEl) event.place = parsePlace(placeEl.textContent.trim());
        if (descEl) event.description = descEl.textContent.trim();
        
        person.events.push(event);
      }
    });
    
    if (person.events.length > 0) {
      console.log(`✓ Events: ${person.events.length} found`);
    }
    
    // ===== EXTRACT FAMILY =====
    
    // Parents
    person.parents = [];
    const parentSections = document.querySelectorAll('.fs-person-parents__parent, [data-test="parent"]');
    
    parentSections.forEach(section => {
      const nameLink = section.querySelector('a[href*="/tree/person/details/"]');
      if (nameLink) {
        const name = nameLink.textContent.trim();
        const fsIdMatch = nameLink.href.match(/\/tree\/person\/details\/([A-Z0-9-]+)/);
        
        person.parents.push({
          name,
          fsId: fsIdMatch ? fsIdMatch[1] : null
        });
      }
    });
    
    if (person.parents.length > 0) {
      console.log(`✓ Parents: ${person.parents.length} found`);
    }
    
    // Spouses
    person.spouses = [];
    const spouseSections = document.querySelectorAll('.fs-person-families__spouse, [data-test="spouse-card"]');
    
    spouseSections.forEach(section => {
      const nameLink = section.querySelector('a[href*="/tree/person/details/"]');
      if (nameLink) {
        const name = nameLink.textContent.trim();
        const fsIdMatch = nameLink.href.match(/\/tree\/person\/details\/([A-Z0-9-]+)/);
        
        const spouse = {
          name,
          fsId: fsIdMatch ? fsIdMatch[1] : null
        };
        
        // Try to find marriage info
        const marriageCard = section.querySelector('.fs-person-families__marriage, [data-test="marriage-fact"]');
        if (marriageCard) {
          const marriageDate = marriageCard.querySelector('.fs-person-families__marriage-date, [data-test="marriage-date"]');
          const marriagePlace = marriageCard.querySelector('.fs-person-families__marriage-place, [data-test="marriage-place"]');
          
          if (marriageDate) spouse.marriageDate = marriageDate.textContent.trim();
          if (marriagePlace) spouse.marriagePlace = marriagePlace.textContent.trim();
        }
        
        person.spouses.push(spouse);
      }
    });
    
    if (person.spouses.length > 0) {
      console.log(`✓ Spouses: ${person.spouses.length} found`);
    }
    
    // Children
    person.children = [];
    const childSections = document.querySelectorAll('.fs-person-families__child, [data-test="child"]');
    
    childSections.forEach(section => {
      const nameLink = section.querySelector('a[href*="/tree/person/details/"]');
      if (nameLink) {
        const name = nameLink.textContent.trim();
        const fsIdMatch = nameLink.href.match(/\/tree\/person\/details\/([A-Z0-9-]+)/);
        
        person.children.push({
          name,
          fsId: fsIdMatch ? fsIdMatch[1] : null
        });
      }
    });
    
    if (person.children.length > 0) {
      console.log(`✓ Children: ${person.children.length} found`);
    }
    
    // ===== EXTRACT SOURCE/MEMORY COUNTS =====
    const sourceCount = document.querySelector('[data-test="source-count"], .fs-person-sources__count');
    if (sourceCount) {
      person.sourceCount = parseInt(sourceCount.textContent.match(/\d+/)?.[0] || '0');
      console.log(`✓ Sources: ${person.sourceCount}`);
    }
    
    const memoryCount = document.querySelector('[data-test="memory-count"], .fs-person-memories__count');
    if (memoryCount) {
      person.memoryCount = parseInt(memoryCount.textContent.match(/\d+/)?.[0] || '0');
      console.log(`✓ Memories: ${person.memoryCount}`);
    }
    
    // ===== EXTRACT CHANGE HISTORY =====
    const changesLink = document.querySelector('[data-test="latest-changes"], .fs-person-changes__link');
    if (changesLink) {
      const changesText = changesLink.textContent;
      const dateMatch = changesText.match(/(\d{1,2}\s+\w+\s+\d{4})/);
      const contributorMatch = changesText.match(/by\s+(.+)$/);
      
      person.lastChanged = {
        date: dateMatch ? dateMatch[1] : null,
        contributor: contributorMatch ? contributorMatch[1].trim() : null
      };
      console.log(`✓ Last Changed: ${person.lastChanged.date || 'unknown'}`);
    }
    
    // ===== OUTPUT =====
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Extraction complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📋 JSON Output:\n');
    console.log(JSON.stringify(person, null, 2));
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Copy to clipboard
    const jsonStr = JSON.stringify(person, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      console.log('✅ JSON copied to clipboard!');
      console.log('\nNext steps:');
      console.log('1. Save this JSON to a file (e.g., person-KWCJ-4XD.json)');
      console.log('2. Run: npx tsx scripts/fs-to-convex.ts person-KWCJ-4XD.json');
    }).catch(err => {
      console.warn('⚠️  Could not copy to clipboard:', err.message);
      console.log('Please copy the JSON output manually.');
    });
    
    return person;
    
  } catch (error) {
    console.error('❌ Error during extraction:', error);
    console.error(error.stack);
    return null;
  }
})();
