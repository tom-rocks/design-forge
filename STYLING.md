# Design Forge — Styling Guide

A comprehensive styling documentation for the Design Forge application. This guide establishes the visual language, component rules, and design principles that maintain consistency across the codebase.

---

## Design Philosophy

Design Forge draws inspiration from **industrial hardware interfaces** and **Teenage Engineering** products. The aesthetic is:

- **Physical & Tactile**: Every UI element should feel like a real object with weight, depth, and material presence
- **Industrial Precision**: Clean lines, purposeful elements, no decoration for decoration's sake
- **LCD/LED Culture**: Backlit displays, indicator lights, and hardware-style feedback
- **Warm Industrial**: Not cold tech—warm greys, amber glows, molten orange accents

### What We Avoid

| ❌ Don't | ✅ Do |
|----------|-------|
| Gradient fills on buttons | Subtle edge lighting for depth |
| Generic system fonts | Monospace for technical elements |
| Bright white backgrounds | Warm grey tones |
| Flat, lifeless buttons | Physical, tactile controls |
| Random shadows | Purposeful recesses and elevation |
| Generic "AI slop" aesthetics | Distinctive, designed choices |
| Inconsistent component styles | Unified, economized CSS |

---

## Color Palette

### CSS Variables

```css
:root {
  /* Base Colors */
  --bg-dark: #1a1918;           /* Deep warm black */
  --bg-panel: #2d2a27;          /* Panel background */
  --bg-input: #1f1d1b;          /* Input fields, recessed areas */
  
  /* Text Colors */
  --text-primary: #f5f0e8;      /* Cream white - primary text */
  --text-secondary: #8a8580;    /* Muted grey - secondary text */
  --text-disabled: #4a4540;     /* Disabled/inactive text */
  
  /* Accent Colors */
  --accent-orange: #ff6d00;     /* Primary action color */
  --accent-orange-dim: #cc5500; /* Hover/pressed orange */
  
  /* LED Colors */
  --led-orange: #ff6d00;        /* Active LED, Flash model */
  --led-amber: #ffb74d;         /* 1K resolution */
  --led-cyan: #00d4ff;          /* Pro model, 4K resolution */
  --led-off: #4a4540;           /* Inactive LED */
  --led-glow-orange: rgba(255, 109, 0, 0.6);
  --led-glow-cyan: rgba(0, 212, 255, 0.6);
  --led-glow-amber: rgba(255, 183, 77, 0.6);
  
  /* LCD Screen */
  --lcd-bg: #1a1614;            /* LCD background */
  --lcd-inactive: #3a3835;      /* Unlit LCD segments */
  --lcd-border: #0d0c0b;        /* LCD inset border */
  
  /* Borders & Edges */
  --border-subtle: rgba(255, 255, 255, 0.05);
  --border-light: rgba(255, 255, 255, 0.08);
  --edge-highlight: rgba(255, 255, 255, 0.1);
  --edge-shadow: rgba(0, 0, 0, 0.3);
}
```

### Color Usage Rules

1. **Orange is for action**: Only use `--accent-orange` for elements that are actionable/enabled
2. **Grey when disabled**: Disabled buttons use `--text-disabled`, never orange
3. **Cyan for premium**: Pro model and 4K resolution use cyan to feel special
4. **Amber for standard**: 1K resolution uses warm amber
5. **Consistent LED colors**: All LEDs use the same color vocabulary

---

## Typography

### Font Stack

```css
/* Body text */
font-family: system-ui, -apple-system, sans-serif;

/* LCD displays, code, technical text */
font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
```

### LCD Text Specifications

All text on LCD/backlit displays must use these exact properties:

```css
.lcd-text {
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}

/* Inactive state */
.lcd-text {
  color: #3a3835;
  text-shadow: none;
}

/* Active/lit state */
.lcd-text.lit {
  color: var(--led-orange);
  text-shadow: 0 0 8px var(--led-glow-orange);
}
```

### Text Hierarchy

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Panel headers | 14px | 500 | `--text-primary` |
| Header subtitles | 10px | 400 | `--text-secondary` |
| Body text | 14px | 400 | `--text-primary` |
| LCD labels | 10px | 600 | See LCD rules |
| Button text | 12px | 500 | Varies by state |

---

## Components

### Panels

Panels are the primary container for UI sections.

```css
.panel {
  background: var(--bg-panel);
  border-radius: 12px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: flex-start;  /* Align to top, not center */
  gap: 8px;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid var(--border-subtle);
}

.panel-body {
  padding: 16px;
}
```

#### Header Layout Rules

- Icon (16x16) on the left
- Title text
- Optional subtitle in lighter weight
- Right-aligned controls (LED, chevron) using `margin-left: auto`
- Chevron comes before LED when both present (except Alloy block)

```jsx
<PanelHeader>
  <Icon className="w-4 h-4" />
  Title <span className="header-subtitle">subtitle text</span>
  <div className="header-right">
    <ChevronDown />  {/* For collapsible panels */}
    <LED />
  </div>
</PanelHeader>
```

---

### Buttons

All buttons have **subtle edge lighting** to feel physical and tactile.

#### Base Button Style

```css
.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s ease;
  
  /* Edge lighting - the key to tactile feel */
  box-shadow: 
    inset 0 1px 0 var(--edge-highlight),  /* Top edge light */
    inset 0 -1px 0 var(--edge-shadow);     /* Bottom edge shadow */
}
```

#### Button States

```css
/* Inactive/Default */
.btn {
  background: var(--bg-panel);
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
}

/* Hover (inactive) */
.btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

/* Active/Selected */
.btn.active {
  background: var(--accent-orange);
  color: white;
  border-color: transparent;
}

/* Active + Hover - MUST stay orange, slightly brighter */
.btn.active:hover {
  background: #ff8533;  /* Lighter orange */
  color: white;
}

/* Disabled */
.btn:disabled {
  background: var(--bg-input);
  color: var(--text-disabled);
  cursor: not-allowed;
  opacity: 0.6;
}
```

#### Button Groups

When buttons are grouped (like tabs), use unified styling:

```css
.btn-group {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.btn-group .btn {
  flex: 1;
  padding: 6px 12px;
  border-radius: 4px;
}
```

**Critical Rule**: Never create new button styles. Use and extend `.btn` and `.btn-group`.

---

### LED Indicators

LEDs provide status feedback throughout the UI.

```css
.led {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: all 0.3s ease;
}

/* Off state */
.led, .led.off {
  background: var(--led-off);
  box-shadow: none;
}

/* On state */
.led.on {
  background: var(--led-orange);
  box-shadow: 0 0 8px var(--led-glow-orange);
}

/* Blinking state - for guiding user attention */
.led.blink {
  animation: led-blink 1s ease-in-out infinite;
}

@keyframes led-blink {
  0%, 100% { 
    background: var(--led-off);  /* Dark grey, NOT white */
    box-shadow: none; 
  }
  50% { 
    background: var(--led-orange);
    box-shadow: 0 0 8px var(--led-glow-orange);
  }
}
```

#### LED Usage

| Location | Behavior |
|----------|----------|
| Prompt textarea | Blinks when empty, solid when filled |
| Refine block | Blinks when awaiting image selection |
| Alloy header | On when references > 0 |
| Forge Specs header | On when non-default settings selected |

---

### LCD Screens

LCD screens show configuration options with a backlit aesthetic. **All options are always visible**, just lit or unlit.

#### Structure

```css
.lcd-screen {
  background: linear-gradient(180deg, #1a1614 0%, #12100e 100%);
  border: 2px solid #0d0c0b;
  border-radius: 4px;
  padding: 8px 12px;
  
  /* Recessed appearance */
  box-shadow: 
    inset 0 2px 4px rgba(0, 0, 0, 0.5),
    inset 0 0 0 1px rgba(0, 0, 0, 0.3);
}
```

#### LCD Items

```css
.lcd-item {
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--lcd-inactive);
  text-shadow: none;
  transition: color 0.3s, text-shadow 0.3s;
}

.lcd-item.lit {
  color: var(--led-orange);
  text-shadow: 0 0 8px var(--led-glow-orange);
}

/* Special colors */
.lcd-item.lit.flash { color: var(--led-orange); }
.lcd-item.lit.pro { color: var(--led-cyan); text-shadow: 0 0 8px var(--led-glow-cyan); }
.lcd-item.lit.res-1k { color: var(--led-amber); text-shadow: 0 0 8px var(--led-glow-amber); }
.lcd-item.lit.res-2k { color: var(--led-orange); }
.lcd-item.lit.res-4k { color: var(--led-cyan); text-shadow: 0 0 8px var(--led-glow-cyan); }
```

#### Icons in LCD

Use inline SVGs, not Unicode symbols. Icons should be simple, geometric, and match the LCD text size.

```jsx
// ✅ Correct - inline SVG
<svg className="lcd-icon" viewBox="0 0 16 16" width="12" height="12">
  <rect x="3" y="2" width="10" height="12" rx="1" />
</svg>

// ❌ Wrong - Unicode symbol
<span>◆</span>
```

---

### Scrollbars

Custom scrollbars maintain the industrial aesthetic.

```css
/* Webkit (Chrome, Safari) */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.5);
}

/* Firefox */
html {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.3) rgba(0, 0, 0, 0.1);
}
```

---

### Lightbox / Modals

```css
.lightbox-overlay {
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(8px);
}

.lightbox-button {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.6);
  color: var(--text-primary);
  border: none;
  
  /* Consistent with other buttons */
  box-shadow: 
    inset 0 1px 0 var(--edge-highlight),
    inset 0 -1px 0 var(--edge-shadow);
}
```

**Rule**: No text labels in lightbox. Icons only (download, close/X). Users know what they mean.

---

## Animation Guidelines

### Timing

```css
/* Quick interactions */
--transition-fast: 0.15s ease;

/* Standard transitions */
--transition-normal: 0.2s ease;

/* Emphasis animations */
--transition-slow: 0.3s ease;
```

### Motion Principles

1. **Purposeful**: Every animation communicates state change
2. **Quick**: Don't make users wait
3. **Subtle**: Enhance, don't distract
4. **Consistent**: Same type of action = same animation

### Common Animations

```css
/* Expand/collapse chevron */
.chevron {
  transition: transform 0.2s ease;
}
.chevron.expanded {
  transform: rotate(180deg);
}

/* LED blink */
@keyframes led-blink {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

/* Fade in content */
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

---

## Layout Rules

### Spacing Scale

```css
--space-xs: 4px;
--space-sm: 8px;
--space-md: 12px;
--space-lg: 16px;
--space-xl: 24px;
```

### Border Radius Scale

```css
--radius-sm: 4px;   /* Small elements, LCD screens */
--radius-md: 6px;   /* Buttons */
--radius-lg: 8px;   /* Button groups */
--radius-xl: 12px;  /* Panels */
```

### Z-Index Scale

```css
--z-base: 0;
--z-dropdown: 10;
--z-sticky: 20;
--z-overlay: 100;
--z-modal: 1000;
--z-tooltip: 1100;
```

---

## Icon Guidelines

### Sources

1. **Lucide React** for standard icons (Zap, Gem, ChevronDown, etc.)
2. **Inline SVG** for custom icons (ingot, ratio shapes)
3. **Never Unicode symbols** for important UI elements

### Sizing

| Context | Size |
|---------|------|
| Panel header | 16x16 (w-4 h-4) |
| Button icon | 16x16 |
| LCD icon | 12x12 |
| Status indicator | 8x8 |

### Style

```css
.icon {
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}
```

---

## State Management Principles

### Visual Feedback

1. **Disabled** → Grey, reduced opacity, no interaction
2. **Inactive** → Subtle, but visible and interactive
3. **Hover** → Slight highlight, cursor change
4. **Active/Selected** → Orange, prominent
5. **Loading** → Animation, disabled interaction
6. **Error** → (Use sparingly, prefer prevention)

### Workflow Guidance

Use blinking LEDs to guide users through required steps:

```jsx
// Prompt LED blinks when empty
<LED className={!prompt.trim() ? 'blink' : prompt.trim() ? 'on' : 'off'} />

// Refine LED blinks when awaiting image
<LED className={mode === 'refine' && !editImage ? 'blink' : editImage ? 'on' : 'off'} />
```

---

## Code Organization

### CSS Class Naming

- Use descriptive, hyphenated names: `.panel-header`, `.lcd-screen`, `.btn-group`
- Prefix component-specific styles: `.specs-btn`, `.alloy-lcd`
- State modifiers: `.active`, `.disabled`, `.lit`, `.blink`

### Style Economization

**Critical Rule**: Before creating a new style, check if an existing one can be used or extended.

```css
/* ❌ Don't create redundant styles */
.forge-button { ... }
.refine-button { ... }
.items-button { ... }

/* ✅ Use unified styles with modifiers */
.btn { ... }
.btn.active { ... }
.btn.large { ... }
```

### File Structure

```
src/
  index.css          # Global styles, variables, utilities
  components/
    Component.tsx    # Component logic
                     # Component styles in index.css or co-located
```

---

## Quick Reference

### The Golden Rules

1. **Orange = Enabled/Active** — Grey otherwise
2. **Edge lighting on all buttons** — Creates tactile feel
3. **LCD shows all options** — Lit or unlit, never hidden
4. **LEDs guide workflow** — Blink for attention, solid for state
5. **No Unicode symbols** — Use SVGs for icons
6. **Economize styles** — Reuse, don't recreate
7. **Warm, not cold** — This is a forge, not a hospital

### Common Mistakes

| Mistake | Fix |
|---------|-----|
| Orange disabled button | Use grey (`--text-disabled`) |
| Gradient on button | Use edge lighting only |
| Different button styles | Use unified `.btn` class |
| Unicode symbols in LCD | Use inline SVGs |
| White blinking LED off-state | Use `--led-off` (dark grey) |
| Centered panel header text | Align to `flex-start` |
| Text labels in lightbox | Icons only |

---

*Last updated: January 2026*
