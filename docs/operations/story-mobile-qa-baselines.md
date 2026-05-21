# Story Mobile QA Baselines

Run these baselines whenever the story review or public story surfaces change.

## Viewports

- Mobile narrow: 390 x 844
- Mobile small: 375 x 667
- Tablet: 768 x 1024
- Desktop control: 1440 x 1000

## Story Studio Review Page

- Header title wraps without covering status or action buttons.
- Draft editor, publish gates, review owner, and review history are reachable without horizontal scroll.
- Publish gate buttons remain visible and do not overflow on 390px width.
- Review history filter buttons wrap cleanly.
- Publish preview snapshot drawer can open and scroll independently.
- Second-review controls remain readable and tappable.

## Public Story Page

- Public story title and person lifespan wrap without clipping.
- Story body remains readable at mobile width.
- Evidence, relationships, events, places, and media sections stack in a single column.
- Open Graph/share metadata uses only published story data.
- Legacy ID URLs redirect to the slug URL.
- Draft/review story URLs still return 404.

## Capture Evidence

Save screenshot names with this pattern when visual baselines are captured:

- `story-review-390.png`
- `story-review-768.png`
- `public-story-390.png`
- `public-story-768.png`

Record the tested story ID or slug, viewport, date, and any known data gaps in the launch checklist issue.
