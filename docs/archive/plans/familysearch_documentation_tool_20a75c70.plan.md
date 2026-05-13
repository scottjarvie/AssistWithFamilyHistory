---
name: FamilySearch Documentation Tool
overview: Build a browser extension to extract FamilySearch person/sources data, paired with a Next.js app that generates raw documentation and AI-enhanced contextualized reports using OpenRouter or an export/import workflow.
todos:
  - id: setup-nextjs
    content: Initialize Next.js 14 with Tailwind, ShadCN, and Convex
    status: pending
  - id: convex-schema
    content: Create Convex schema for People, Sources, and Documents
    status: pending
    dependencies:
      - setup-nextjs
  - id: extension-base
    content: Create Chrome extension with manifest v3 and basic popup
    status: pending
  - id: extension-scraper
    content: Build content script to extract FamilySearch page data
    status: pending
    dependencies:
      - extension-base
  - id: extension-expand
    content: Add auto-expand logic for indexed information sections
    status: pending
    dependencies:
      - extension-scraper
  - id: dashboard-ui
    content: Build dashboard page with PersonCard list
    status: pending
    dependencies:
      - convex-schema
  - id: person-page
    content: Create person detail page with raw document viewer
    status: pending
    dependencies:
      - dashboard-ui
  - id: raw-doc-gen
    content: Build raw document markdown generator from extracted data
    status: pending
    dependencies:
      - person-page
  - id: openrouter-api
    content: Implement OpenRouter API route for AI processing
    status: pending
    dependencies:
      - setup-nextjs
  - id: context-doc
    content: Build contextualized document component with AI integration
    status: pending
    dependencies:
      - raw-doc-gen
      - openrouter-api
  - id: export-import
    content: Create export prompt dialog and import results dialog
    status: pending
    dependencies:
      - raw-doc-gen
---

# FamilySearch Documentation Tool

## Architecture Overview

```mermaid
flowchart TB
    subgraph BrowserExt [Browser Extension]
        ExtUI[Extension Popup]
        Scraper[Page Scraper]
        Expander[Auto-Expand Indexed Info]
    end
    
    subgraph NextApp [Next.js App]
        Dashboard[Dashboard UI]
        RawDoc[Raw Document Generator]
        AIProcessor[OpenRouter Processor]
        ExportImport[Export/Import Module]
        ContextDoc[Contextualized Document]
    end
    
    subgraph Storage [Convex Database]
        People[People Collection]
        Sources[Sources Collection]
        Documents[Documents Collection]
    end
    
    FS[FamilySearch Page] --> Scraper
    Scraper --> Expander
    Expander --> ExtUI
    ExtUI -->|Send to App| Dashboard
    Dashboard --> RawDoc
    RawDoc --> Storage
    RawDoc --> AIProcessor
    RawDoc --> ExportImport
    AIProcessor --> ContextDoc
    ExportImport -->|Import Results| ContextDoc
    ContextDoc --> Storage
```

---

## Phase 1: Project Setup

- Initialize Next.js 14 app with App Router
- Configure Tailwind CSS and ShadCN UI components
- Set up Convex database with schema for People, Sources, and Documents
- Create base Chrome extension structure (manifest v3)

---

## Phase 2: Browser Extension

The extension will:

1. **Detect FamilySearch pages** - Activate when on `familysearch.org/tree/person/sources/*` URLs
2. **Auto-expand indexed information** - Programmatically click all "SHOW" buttons to reveal hidden data
3. **Extract structured data** including:

- Person info (name, dates, ID)
- All sources with metadata (date, title, created by, tags)
- Indexed information from each source (the key genealogical data)
- Web page links and citations
- Reason statements

4. **Send to Next.js app** via local API or clipboard export

**Key files:**

- `extension/manifest.json` - Extension configuration
- `extension/content.js` - Page scraping logic
- `extension/popup.html/js` - Extension UI with "Extract" button

---

## Phase 3: Next.js App Core

### Pages/Routes:

- `/` - Dashboard listing all captured people
- `/person/[id]` - View person with raw + contextualized docs
- `/settings` - OpenRouter API key configuration

### Key Components:

- `PersonCard` - Summary card for dashboard
- `RawDocumentViewer` - Displays extracted raw data in clean markdown
- `ContextualizedDocument` - AI-enhanced formatted report
- `ExportPromptDialog` - Generates prompt + JSON for external AI
- `ImportResultsDialog` - Paste JSON response from external AI

---

## Phase 4: Document Generation

### Raw Document Format

Markdown document with sections:

- Person Overview (name, dates, ID)
- Sources List (all sources with full details)
- Indexed Information (expanded data from each source)
- Citations and Links

### Contextualized Document (AI-Generated)

- Executive Summary
- Verified Facts (with source citations)
- Potential Duplicates/Repetition Analysis
- Interpretations and Connections
- Research Suggestions
- Timeline of Events

---

## Phase 5: AI Integration

### OpenRouter In-App Processing

- API route `/api/process` that calls OpenRouter
- Configurable model selection (GPT-4, Claude, etc.)
- Streaming response for long documents
- Store results in Convex

### Export/Import Workflow

- **Export**: Generate a comprehensive prompt + raw JSON data as copyable text
- **Import**: Paste structured JSON response, app parses and stores contextualized document

---

## Data Schema (Convex)

```typescript
// People - the genealogical subjects
people: {
  familySearchId: string,      // e.g., "KWCJ-4X6"
  name: string,
  birthDate: string,
  deathDate: string,
  extractedAt: number,
}

// Sources - individual source records
sources: {
  personId: Id<"people">,
  title: string,
  date: string,
  citation: string,
  webPageUrl: string,
  indexedInfo: object,         // The valuable expanded data
  tags: string[],
  createdBy: string,
  reasonAttached: string,
}

// Documents - generated outputs
documents: {
  personId: Id<"people">,
  type: "raw" | "contextualized",
  content: string,             // Markdown content
  generatedAt: number,
  aiModel: string,             // Which model generated it
}
```

---

## File Structure

```javascript
/FamilyHistory/
├── extension/                    # Chrome Extension
│   ├── manifest.json
│   ├── content.js               # Page scraping
│   ├── popup.html
│   ├── popup.js
│   └── styles.css
├── app/                         # Next.js App
│   ├── layout.tsx
│   ├── page.tsx                 # Dashboard
│   ├── person/[id]/page.tsx
│   ├── settings/page.tsx
│   └── api/
│       └── process/route.ts     # OpenRouter API
├── components/
│   ├── ui/                      # ShadCN components
│   ├── PersonCard.tsx
│   ├── RawDocumentViewer.tsx
│   ├── ContextualizedDocument.tsx
│   ├── ExportPromptDialog.tsx
│   └── ImportResultsDialog.tsx
├── convex/
│   ├── schema.ts
│   ├── people.ts
│   ├── sources.ts
│   └── documents.ts
├── lib/
│   ├── openrouter.ts            # OpenRouter client
│   └── prompts.ts               # AI prompt templates
└── package.json
```

---

## Future Enhancement: FamilySearch API

Once API access is approved:

- Add OAuth flow for FamilySearch authentication
- Create `/api/familysearch/[personId]` route