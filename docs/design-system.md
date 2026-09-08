# Design system

The full-screen concept is `design-concept.png` (built-in Image Gen). The implementation uses a 60px toolbar, 220px outline, flexible white document and 320px inspector at 1440px. It expands at 1700px and collapses into Project / Editor / AI / Preview tabs below 800px.

| Token | Light | Dark |
|---|---|---|
| background | #f8f7fa | #19171d |
| surface | #ffffff | #211e26 |
| accent | #8767a5 | #baa0d6 |
| accent subtle | #f0eaf6 | #342b40 |
| text | #302b38 | #e7e0ed |
| muted | #938c9c | #a49baa |
| border | #e6e1eb | #38313f |

Controls use a 5px radius, dialogs 8px, 1px borders. Shadows are reserved for overlays. Spacing follows 4/8/12/16/20/24/32. UI typography uses system sans at 12–14px; document titles use a Chinese serif at 34–40px. The code editor uses Cascadia Code / Consolas at 14px and 25px line height. Lucide icons are 16px; model logos come from LobeHub with a generic fallback.

The concept sample text is illustrative, not preloaded user data. The home screen starts empty. Provider names and model names come from saved configuration. No imaginary provider is shipped.

## Fidelity review

Compared `design-concept.png` with the rendered desktop and mobile screenshots:

| Aspect | Rendered result / decision |
| --- | --- |
| Three-column workspace | Preserved outline / document / inspector hierarchy; 220px and 320px sidebars at 1440px. |
| Muted lavender palette | Preserved pale surfaces, fine borders and restrained purple active states. |
| Editorial document | Preserved serif character title, generous writing margins and section rules; prose uses system fonts for reliable offline rendering. |
| Source editing | Separate real Monaco mode replaces the concept's decorative code-style text. |
| Inspector controls | Added explicit Provider and model controls because connection selection is necessary for a functioning app. |
| Copy and empty state | Removed fictional model data; suggestions and context reflect actual project/configuration. |
| Mobile | Replaced three simultaneous columns with four bottom navigation actions; 390px viewport has no document-level horizontal overflow. |

Screenshot fixtures contain fictional author text and a local protocol test Provider. The application does not seed these into fresh databases.
