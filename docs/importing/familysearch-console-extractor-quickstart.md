# FamilySearch Extractor - Quick Start

The Chrome extension in `extension/` is the preferred source capture path. Use this console flow only as a legacy fallback after checking `docs/importing/familysearch-source-capture-runbook.md`.

## 🎯 One-Minute Guide

### Extract Person Data

1. **Open** FamilySearch person page: `https://www.familysearch.org/en/tree/person/details/KWCJ-4XD`
2. **Press** `F12` (DevTools)
3. **Paste** `fs-extractor.js` into Console → Enter
4. **Save** output:
   ```bash
   pbpaste > person-KWCJ-4XD.json
   ```

### Extract Sources

1. **Click** "Sources" tab
2. **Paste** `fs-sources-extractor.js` → Enter
3. **Save**:
   ```bash
   pbpaste > sources-KWCJ-4XD.json
   ```

### Import to Convex

```bash
cd ~/IDE/discover-their-stories
npx tsx scripts/fs-to-convex.ts person-KWCJ-4XD.json sources-KWCJ-4XD.json
```

Done! ✅

---

## 📂 Files

| File | Purpose | Run Where |
|------|---------|-----------|
| `fs-extractor.js` | Extract person details | Browser console on Details tab |
| `fs-sources-extractor.js` | Extract sources | Browser console on Sources tab |
| `fs-to-convex.ts` | Import JSON to database | Terminal in project directory |

## 💡 Tips

- **Name files by FamilySearch ID:** `person-KWCJ-4XD.json` keeps things organized
- **Extract parents/spouses first:** Makes relationship linking easier
- **Review before import:** Check the JSON looks correct
- **Save extraction files:** Keep for reference and re-import if needed

## ⚠️ Gotchas

- ❌ **Don't auto-link relationships** - Import persons first, link later
- ❌ **Can't update existing persons** - Import script skips duplicates
- ✅ **Sources require person import first** - Person must exist in DB

## 🔗 Full Docs

See `familysearch-console-extractor.md` for complete documentation.
