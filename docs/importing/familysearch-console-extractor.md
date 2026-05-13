# FamilySearch Data Extraction Scripts

A set of browser console scripts and Node.js importers to extract structured genealogical data from FamilySearch.org and import it into the Discover Their Stories Convex database.

## 🎯 Purpose

These scripts automate the tedious process of manually copying data from FamilySearch person pages. Instead of copy-pasting facts one by one, you can extract everything in JSON format and import it directly into your database.

## 📦 What's Included

1. **`fs-extractor.js`** - Browser console script for person Details pages
2. **`fs-sources-extractor.js`** - Browser console script for person Sources pages
3. **`fs-to-convex.ts`** - Node.js script to import the JSON into Convex

## 🚀 Quick Start Workflow

### Step 1: Extract Person Data

1. Navigate to a FamilySearch person Details page:
   ```
   https://www.familysearch.org/en/tree/person/details/KWCJ-4XD
   ```

2. Open Chrome DevTools (press `F12` or `Cmd+Option+I` on Mac)

3. Click the **Console** tab

4. Copy the entire contents of `fs-extractor.js` and paste into the console

5. Press Enter

6. The script will:
   - Extract all visible person data
   - Print a JSON summary to the console
   - Automatically copy the JSON to your clipboard

7. Save the JSON to a file:
   ```bash
   # In your terminal
   pbpaste > person-KWCJ-4XD.json
   ```
   
   Or manually copy from the console output.

### Step 2: Extract Sources (Optional)

1. Click the **Sources** tab on the FamilySearch person page:
   ```
   https://www.familysearch.org/en/tree/person/sources/KWCJ-4XD
   ```

2. Open DevTools Console (F12)

3. Copy and paste the entire contents of `fs-sources-extractor.js`

4. Press Enter

5. Save the output:
   ```bash
   pbpaste > sources-KWCJ-4XD.json
   ```

### Step 3: Import into Convex

```bash
cd ~/IDE/discover-their-stories

# Import person data
npx tsx scripts/fs-to-convex.ts person-KWCJ-4XD.json

# Import sources data (after importing person)
npx tsx scripts/fs-to-convex.ts sources-KWCJ-4XD.json

# Or import both at once
npx tsx scripts/fs-to-convex.ts person-KWCJ-4XD.json sources-KWCJ-4XD.json
```

## 📊 What Gets Extracted

### Person Details (`fs-extractor.js`)

- ✅ Basic Info: Name, sex, FamilySearch ID
- ✅ Vital Facts: Birth, death, burial (dates and places)
- ✅ Alternate Names: All name variations
- ✅ Events: Residence, military, immigration, custom events
- ✅ Family Relationships:
  - Parents (with FamilySearch IDs)
  - Spouses (with marriage dates/places)
  - Children (with FamilySearch IDs)
- ✅ Metadata: Quality score, source count, memory count, last changed date

### Sources (`fs-sources-extractor.js`)

- ✅ Source Title: Full descriptive title
- ✅ Source Type: Auto-detected (census, vital record, church, military, etc.)
- ✅ Repository: Archive or collection name
- ✅ URLs: Both FamilySearch source URLs and external links
- ✅ Citations: All indexed information text
- ✅ Confidence Level: Quality assessment

## 🔧 Technical Details

### Data Flow

```
FamilySearch Website
    ↓ (browser console script)
JSON File
    ↓ (Node.js import script)
Convex Database
```

### Schema Mapping

The extracted JSON maps directly to the Convex schema:

| Extracted Field | Convex Table | Notes |
|----------------|--------------|-------|
| `name`, `sex`, `living` | `persons` | Core person data |
| `birth`, `death` | `persons` | Embedded vital facts |
| `alternateNames[]` | `persons.alternateNames` | Name variations |
| `events[]` | `events` → `personEvents` | Linked via junction table |
| `parents[]`, `spouses[]`, `children[]` | *(not auto-linked)* | Requires manual linking after import |
| `sources[].title` | `sources` | Source metadata |
| `sources[].citations[]` | `citations` → `citationLinks` | Evidence with person links |

### Why Not Auto-Link Relationships?

The import script does NOT automatically create parent/spouse/child relationships because:

1. **Related persons may not exist yet** in your database
2. **Names alone are ambiguous** (need FamilySearch IDs to match)
3. **Manual review prevents errors** in family connections

**Recommended workflow:**
1. Import all ancestor persons first (run extractor on each person)
2. Then use the web UI or a separate relationship script to link them
3. Or create relationships manually with proper validation

## 🛡️ Error Handling

Both browser scripts include robust error handling:

- ✅ Gracefully handles missing fields (shows as `null` in JSON)
- ✅ Works across different FamilySearch page layouts
- ✅ Validates FamilySearch ID extraction from URL
- ✅ Provides detailed console output for debugging

The Node.js import script:

- ✅ Checks for existing persons (prevents duplicates)
- ✅ Maps event types to schema-valid values
- ✅ Skips invalid events with warnings
- ✅ Validates required environment variables

## 📝 Example JSON Output

### Person Data
```json
{
  "fsId": "KWCJ-4XD",
  "name": {
    "given": "John Strathearn",
    "surname": "Jarvie"
  },
  "sex": "male",
  "living": false,
  "birth": {
    "date": {
      "original": "3 February 1890",
      "year": 1890,
      "month": 2,
      "day": 3
    },
    "place": {
      "original": "Bathgate, Linlithgow, Scotland"
    }
  },
  "parents": [
    {
      "name": "Mathew Jarvie",
      "fsId": "2CMM-MGM"
    }
  ],
  "sourceCount": 24,
  "extractedAt": "2026-02-11T21:30:00.000Z"
}
```

### Sources Data
```json
{
  "fsId": "KWCJ-4XD",
  "sources": [
    {
      "order": 1,
      "title": "1920 United States Federal Census",
      "type": "census",
      "repository": "National Archives",
      "confidence": "high",
      "citations": [
        {
          "text": "John Jarvie, age 30, born Scotland, living in Salt Lake, Utah"
        }
      ]
    }
  ]
}
```

## 🐛 Troubleshooting

### "Could not extract FamilySearch ID from URL"
- Make sure you're on the correct page (`/tree/person/details/...` or `/tree/person/sources/...`)
- Check that the URL contains a person ID like `KWCJ-4XD`

### "No source cards found on this page"
- Make sure you clicked the **Sources** tab
- Some persons may have no sources attached
- Try scrolling down to load lazy-loaded sources

### "Person already exists with ID: ..."
- The person is already in your database
- Use the web UI to update existing persons
- Or delete the person first if you want a fresh import

### "NEXT_PUBLIC_CONVEX_URL not found"
- Make sure you're in the `discover-their-stories` directory
- Check that `.env.local` exists and has the Convex URL
- Run `npx convex dev` first to set up the environment

## 🔮 Future Enhancements

Potential improvements:

- [ ] Batch extraction (multiple persons at once)
- [ ] Auto-linking relationships using FamilySearch IDs
- [ ] Memory/photo extraction
- [ ] Research hints extraction
- [ ] Change history tracking
- [ ] Bookmark integration for import queue

## 📄 License

Part of the Discover Their Stories project. For internal use.

---

**Created:** 2026-02-11  
**Last Updated:** 2026-02-11  
**Version:** 1.0
