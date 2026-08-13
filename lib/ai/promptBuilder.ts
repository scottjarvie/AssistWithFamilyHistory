/**
 * Prompt Builder
 * 
 * Purpose: Build prompts for AI processing stages
 * 
 * Key Elements:
 * - System prompts for each stage
 * - User prompt construction
 * - Context formatting
 * 
 * Dependencies:
 * - None
 * 
 * Last Updated: Initial setup
 */

export const SYSTEM_PROMPTS = {
  normalize: `You are an expert genealogist analyzing historical sources. Your task is to extract and normalize information from a single genealogical source.

For the given source, extract:
1. A one-sentence summary of what this source tells us
2. All entities mentioned (people, places, organizations)
3. All dates with their types and precision
4. All places with their context
5. Relationships between people
6. Key claims/facts this source asserts
7. Your confidence level in the source's reliability

Respond in valid JSON matching the expected schema. Be precise and cite specific fields from the source.`,

  cluster: `You are an expert genealogist analyzing multiple sources for the same person. Your task is to identify which sources are duplicates, represent the same event, or contain overlapping information.

For the given normalized sources, identify:
1. Clusters of related sources (same record, same event, overlapping info)
2. The primary/best source in each cluster
3. Sources that stand alone (not related to others)

Respond in valid JSON matching the expected schema. Explain your reasoning for each cluster.`,

  synthesize: `You are an expert genealogist creating a comprehensive research dossier. Your task is to synthesize information from multiple sources into a cohesive analysis.

Based on the normalized and clustered sources, create:
1. An executive summary of what we know about this person
2. Verified facts with source citations and confidence levels
3. Identified conflicts between sources
4. A chronological timeline of events
5. Suggestions for further research

Distinguish clearly between what the sources explicitly state vs. what you infer.
Respond in valid JSON matching the expected schema.`,
};

/**
 * Build the user prompt for the normalize stage
 */
export function buildNormalizePrompt(source: {
  id: string;
  title: string;
  rawText: string;
  indexed?: { fields: { label: string; value: string }[] };
}): string {
  let prompt = `Analyze this genealogical source:

**Source ID:** ${source.id}
**Title:** ${source.title}

`;

  if (source.indexed?.fields && source.indexed.fields.length > 0) {
    prompt += "**Indexed Information:**\n";
    for (const field of source.indexed.fields) {
      prompt += `- ${field.label}: ${field.value}\n`;
    }
    prompt += "\n";
  }

  if (source.rawText) {
    prompt += `**Full Text:**\n${source.rawText}\n`;
  }

  return prompt;
}

/**
 * Build the user prompt for the cluster stage
 */
export function buildClusterPrompt(
  normalizedSources: Array<{
    sourceId: string;
    summary: string;
    claims: string[];
  }>
): string {
  let prompt = `Analyze these ${normalizedSources.length} normalized sources and identify clusters:\n\n`;

  for (const source of normalizedSources) {
    prompt += `**${source.sourceId}:**\n`;
    prompt += `Summary: ${source.summary}\n`;
    prompt += `Claims: ${source.claims.join("; ")}\n\n`;
  }

  return prompt;
}

/**
 * Build the user prompt for the synthesize stage
 */
export function buildSynthesizePrompt(
  personName: string,
  normalizedSources: Array<{
    sourceId: string;
    summary: string;
    dates: Array<{ date: string; type: string }>;
    places: Array<{ name: string; type: string }>;
    relationships: Array<{ person1: string; person2: string; type: string }>;
    claims: string[];
  }>,
  clusters: {
    clusters: Array<{
      id: string;
      type: string;
      sourceIds: string[];
      reason: string;
    }>;
    standalone: string[];
  }
): string {
  let prompt = `Create a comprehensive research dossier for **${personName}**.

## Analyzed Sources (${normalizedSources.length} total)

`;

  for (const source of normalizedSources) {
    prompt += `### ${source.sourceId}\n`;
    prompt += `- Summary: ${source.summary}\n`;
    if (source.dates.length > 0) {
      prompt += `- Dates: ${source.dates.map(d => `${d.type}: ${d.date}`).join(", ")}\n`;
    }
    if (source.places.length > 0) {
      prompt += `- Places: ${source.places.map(p => `${p.type}: ${p.name}`).join(", ")}\n`;
    }
    if (source.claims.length > 0) {
      prompt += `- Claims: ${source.claims.join("; ")}\n`;
    }
    prompt += "\n";
  }

  prompt += `## Source Clusters

`;
  for (const cluster of clusters.clusters) {
    prompt += `- **${cluster.id}** (${cluster.type}): ${cluster.sourceIds.join(", ")} - ${cluster.reason}\n`;
  }

  if (clusters.standalone.length > 0) {
    prompt += `\nStandalone sources: ${clusters.standalone.join(", ")}\n`;
  }

  return prompt;
}

/**
 * Build an export prompt for external AI
 */
export function buildExportPrompt(
  stage: "normalize" | "cluster" | "synthesize",
  data: unknown
): string {
  const systemPrompt = SYSTEM_PROMPTS[stage];
  
  return `# AI Processing Request for Assist With Family History

## Instructions
${systemPrompt}

## Data to Process
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

## Expected Output Format
Please respond with valid JSON only, following the schema requirements above.`;
}
