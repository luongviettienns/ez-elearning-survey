# Ez-Elearning Survey / Visual System

Inspired by the UI/UX Pro Max approach: identify product/audience, establish hierarchy and tokens, design long-scroll narrative, test motion/contrast/responsiveness.

- User: Vietnamese teachers across levels; short attention window; must understand value proposition before answering.
- Page rhythm: editorial hero → statement → pain points → sticky benefits → honest cost explanation → participation CTA → 4-chapter survey → thanks.
- Visual identity: premium education technology, editorial expressive type, midnight navy, fresh lime, violet, warm ivory.
- Token colors: navy #111127, ink #171732, electric violet #6054e8, lime #cafa81, paper #f6f5f1.
- Fonts: Be Vietnam Pro for Vietnamese text + Georgia italic for emphasized human/editorial moments.
- Motion: IntersectionObserver reveals (opacity/translate); floating illustration, scroll progress, hover state; prefers-reduced-motion disables motion.
- UX: 44px+ targets, real native inputs, inline validation, clear consent, privacy explanation, links to sections, accessible legend/label, no fake testimonials/metrics.
- Conversion principle: no pricing subscription CTAs; primary conversion is legitimate teacher feedback.
- Tone: avoid guarantees that same API creates identical images as ChatGPT, absolutely no Vietnamese font errors, or every generated image is accurate.

## Motion V2 — Scroll-led emphasis (October 2026)

- Progressive enhancement: `html.motion-ready` is only applied when IntersectionObserver exists and reduced motion is **not** requested. The base page remains visible without JavaScript.
- Chapter rail: desktop-only, highlights the current storyline section, never replaces main navigation.
- Narrative section entrances: `data-reveal="rise|scale|slide-left|slide-right|tilt"`, blur-to-sharp & opacity; each plays only once at intersection.
- Kinetic title: `data-word-reveal` wraps natural text words and gradually changes opacity with scrolling. Nested italic spans and line breaks are preserved.
- New `workflow` story section: two real content panels, animated connector line, prompt detail staging, subtle scan, and disclaimer. This is a conceptual visualization, not an active AI tool.
- Pricing: number counts from zero to 1,000 **once** upon visibility; target price is a survey assumption, not a live API quote.
- Form: question-level entrances, selected option feedback, scroll progress, keyboard-visible focus; avoid animations that trap controls.
- Background parallax via CSS custom property on decorative orbs only. Scroll handler is throttled with requestAnimationFrame.
- Respect `prefers-reduced-motion` and reduce effects; no external animation dependencies.
