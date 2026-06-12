**Template notes (neutral Office default):**

This is the bundled fallback template -- Microsoft's default PowerPoint
design (Office theme, 16:9). It is used when the user names no template.
Always TELL the user the neutral default is in use and that a corporate
`.potx`/`.pptx` can be supplied instead at any time.

Layout roles (address by NAME, indices may shift):

| Role      | Layout name   | Notes                                        |
|-----------|---------------|----------------------------------------------|
| Title     | `TITLE_SLIDE` | title + subtitle                             |
| Agenda    | `CONTENT`     | chapter list as bullets                      |
| Content   | `CONTENT`     | title + one body                             |
| Compare   | `TWO_COLUMN`  | title + two bodies                           |
| Blank     | `DEFAULT`     | target for `el.add` (tables/charts/shapes)   |
| Picture   | `PICTURE`     | title + picture placeholder + caption body   |
| Chapter   | `Section Header` | section divider                           |

Footer pattern (set via `footer` on every slide):

- `<presentation title> | <current year>`
- On slides with picture placeholders append the AI-image note in the
  deck language (de: "Bilder mit KI generiert", en: "Images AI-generated").
- All layouts carry footer and slide-number placeholders.

Image design constraints:

- Primary accent is `accent1` (#4F81BD, muted blue); no further
  template-specific constraints -- standard prompt rules apply.
- No chapter image: `Section Header` has no picture placeholder; image
  prompts only on `PICTURE` slides.
