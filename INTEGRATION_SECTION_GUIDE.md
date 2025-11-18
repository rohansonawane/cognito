# Integration Section Content Guide

## Current Content Structure

The "INTEGRATE COGNITO" section is located in `web/src/App.tsx` starting at line **1042**.

### Current Content:

1. **Pill Badge** (Line 1044):
   - Text: "Integrate **Cognito**" (Cognito is styled with gradient)

2. **Headline** (Line 1048):
   - Text: "Bring the AI canvas into your product"

3. **Description** (Lines 1049-1051):
   - Text: "Deliver real-time visual intelligence inside your app. Empower teams to sketch, annotate, and receive AI-crafted insights instantly—whether they're solving equations, designing interfaces, or collaborating across devices."

4. **Tech Stack** (Lines 1055-1069):
   - Automatically generated from `techStack` array (lines 289-417)
   - Currently includes: React, TypeScript, Vite, Tailwind CSS, OpenAI, Gemini

5. **Use Cases** (Lines 1074-1081):
   - Generated from `integrationUseCases` array (lines 419-427)
   - Currently 4 use cases:
     - 🖍️ AI Whiteboard
     - 📝 Smart Notes
     - 🎓 LMS Companion
     - ⚙️ Platform Add-on

6. **CTA Button** (Lines 1082-1085):
   - Text: "INTEGRATE NOW"
   - Link: `https://forms.gle/EunESTAMAMsato776`

---

## How to Update Content

### Option 1: Quick Text Updates

Edit directly in `web/src/App.tsx`:

#### Update Headline (Line 1048):
```tsx
<h2 id="integration-title">Your new headline here</h2>
```

#### Update Description (Lines 1049-1051):
```tsx
<p>
  Your new description text here.
</p>
```

#### Update Pill Badge (Line 1044):
```tsx
<span className="integration-pill">Your Text <span className="integration-brand">Cognito</span></span>
```

#### Update CTA Button (Line 1082-1085):
```tsx
<a className="btn accent integration-action" href="YOUR_LINK_HERE" target="_blank" rel="noopener noreferrer" title="Request an integration">
  YOUR BUTTON TEXT
  <ArrowUpRight size={16} />
</a>
```

---

### Option 2: Update Use Cases

Edit the `integrationUseCases` array (lines 419-427):

```tsx
const integrationUseCases = useMemo(
  () => [
    { icon: '🖍️', title: 'AI Whiteboard', blurb: 'Your description here.' },
    { icon: '📝', title: 'Smart Notes', blurb: 'Your description here.' },
    { icon: '🎓', title: 'LMS Companion', blurb: 'Your description here.' },
    { icon: '⚙️', title: 'Platform Add-on', blurb: 'Your description here.' },
    // Add more use cases here
  ],
  []
);
```

**Note**: The `blurb` field is currently not displayed. To show it, update line 1076-1079:

```tsx
<article key={useCase.title} className="usecase-card">
  <span className="usecase-icon" aria-hidden="true">{useCase.icon}</span>
  <h3>{useCase.title}</h3>
  <p>{useCase.blurb}</p> {/* Add this line */}
</article>
```

---

### Option 3: Update Tech Stack

Edit the `techStack` array (lines 289-417):

```tsx
const techStack = useMemo(
  () => [
    {
      name: 'React',
      slug: 'react',
      icon: (/* SVG icon code */),
    },
    // Add more technologies here
  ],
  []
);
```

---

## Content Recommendations

### Current Content Assessment:

✅ **Headline**: Clear and action-oriented  
✅ **Description**: Comprehensive, covers key benefits  
✅ **Use Cases**: Good variety, covers different scenarios  
⚠️ **Use Case Descriptions**: Currently not displayed (only titles show)  
✅ **CTA Button**: Clear call-to-action with external link  

### Suggested Improvements:

1. **Show Use Case Descriptions**:
   - Currently only titles are visible
   - Consider adding the `blurb` text to the UI (see Option 2 above)

2. **Add More Use Cases** (if needed):
   - Education platforms
   - Design tools
   - Collaboration software
   - Documentation tools

3. **Update Description** (if product focus changes):
   - Add specific industries
   - Mention integration methods
   - Include pricing/trial information

4. **Update CTA Link**:
   - Ensure the Google Form link is active
   - Or replace with your actual integration page

---

## File Location

**Main File**: `web/src/App.tsx`
- Integration section: Lines **1042-1089**
- Use cases array: Lines **419-427**
- Tech stack array: Lines **289-417**

**Styling File**: `web/src/styles.css`
- Integration styles: Lines **297-475**

---

## Quick Update Example

To update just the headline and description:

```tsx
// In web/src/App.tsx, around line 1048-1051
<div className="integration-headline">
  <h2 id="integration-title">Your New Headline</h2>
  <p>
    Your new description that explains what Cognito does and how it can be integrated.
  </p>
</div>
```

---

## After Making Changes

1. **Test locally**:
   ```bash
   cd web
   npm run dev
   ```

2. **Build and deploy**:
   ```bash
   npm run build
   git add -A
   git commit -m "Update integration section content"
   git push origin main
   ```

3. **Deploy to AWS** (see `DEPLOY_AWS.md`):
   ```bash
   ssh -i ~/Downloads/Cognitoapp.pem ubuntu@ec2-3-12-155-210.us-east-2.compute.amazonaws.com "cd ~/cognito && git pull && cd web && npm run build && pm2 restart ai-canvas"
   ```

---

## Current Content Status

✅ **Content is complete and functional**  
✅ **All sections are properly styled**  
⚠️ **Use case descriptions are defined but not displayed**  
✅ **Responsive design is working**  

**Recommendation**: The content is good as-is. Consider adding use case descriptions to the UI if you want more detail visible to users.

