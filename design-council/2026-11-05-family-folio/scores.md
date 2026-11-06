**Stop rule:** every category ≥ 8, ahead of baseline by ≥ 1.5 on (weighted) average, no regression in Capability preserved and every capability probe passing. Round cap 4. Judges (in order): Codex gpt-6.1-sol → Claude Opus 5.5.

| Round | Judge | Ours avg | Baseline avg | Lift | Lowest category | Best reference avg | Passes |
|---|---|---|---|---|---|---|---|
| 1 | Codex gpt-6.1-sol | 6.8 | 5.4 | +1.4 | 4.5 | 8.2 | no |
| 2 | Codex gpt-6.1-sol | 8.0 | 5.9 | +2.1 | 7.5 | 8.2 | no |

**Category changes:**
- Round 2: Expanded completed private-page checkpoint. Readers/public/specialist workflows excluded. Baselines are preserved original/reconstructed views with invented data; compared within this round, not directly with round1 scope.

Averages are weighted by category weight and are only comparable within a round (same judge, same categories).

<details><summary>Round 1 by category</summary>

| Judge | Set | Find | Dense | Capab† | AI | Hier | Type | Icon | Space | Colour | Cons | Fit | Cost | Avg |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Codex gpt-6.1-sol | **Ours** | 7.0 | 6.5 | 8.0 | 4.5 | 7.0 | 7.5 | 7.0 | 7.0 | 7.5 | 7.0 | 7.5 | 4.5 | 6.8 |
| Codex gpt-6.1-sol | Baseline | 5.5 | 6.5 | 6.5 | 3.5 | 5.5 | 6.0 | 6.5 | 7.0 | 3.0 | 4.0 | 5.5 | 4.5 | 5.4 |
| Codex gpt-6.1-sol | Ref: GitHub Issues · dense research/work list | 8.5 | 9.0 | 9.0 | 5.0 | 8.0 | 8.0 | 8.5 | 8.5 | 8.0 | 9.0 | 9.0 | 7.5 | 8.2 |
| Codex gpt-6.1-sol | Ref: US National Archives · genealogist resources | 7.5 | 7.5 | 8.0 | 5.0 | 6.5 | 6.0 | 4.5 | 6.5 | 5.5 | 5.5 | 7.0 | 7.0 | 6.5 |
| Codex gpt-6.1-sol | Ref: UK National Archives · census research guide | 8.0 | 7.5 | 8.5 | 5.0 | 7.0 | 6.5 | 6.5 | 6.5 | 7.5 | 7.5 | 8.0 | 7.5 | 7.2 |

Capability probes (ours): 20 passed, none failed.

</details>

<details open><summary>Round 2 by category</summary>

| Judge | Set | Find | Dense | Capab† | AI | Hier | Type | Icon | Space | Colour | Cons | Fit | Cost | Avg |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Codex gpt-6.1-sol | **Ours** | 8.0 | 7.5 | 8.0 | 8.5 | 8.0 | 8.0 | 8.0 | 7.5 | 8.5 | 8.0 | 8.5 | 7.5 | 8.0 |
| Codex gpt-6.1-sol | Baseline | 6.5 | 5.5 | 6.5 | 5.5 | 6.0 | 6.5 | 6.5 | 5.5 | 4.0 | 5.5 | 6.0 | 7.5 | 5.9 |
| Codex gpt-6.1-sol | Ref: GitHub Issues · dense research/work list | 8.5 | 9.0 | 9.0 | 5.0 | 8.5 | 8.0 | 8.5 | 8.5 | 8.0 | 9.0 | 8.5 | 7.5 | 8.2 |
| Codex gpt-6.1-sol | Ref: US National Archives · genealogist resources | 7.0 | 7.5 | 8.0 | 5.0 | 7.0 | 6.5 | 5.5 | 7.0 | 7.0 | 6.5 | 8.0 | 7.0 | 6.9 |
| Codex gpt-6.1-sol | Ref: UK National Archives · census research guide | 8.0 | 7.5 | 8.5 | 5.0 | 7.5 | 7.0 | 6.5 | 7.5 | 7.5 | 7.5 | 8.5 | 7.5 | 7.4 |

Capability probes (ours): 38 passed, none failed.

</details>

† blocking: a drop below baseline blocks the round.
