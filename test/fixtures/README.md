# Test Fixtures

## neutral-template.pptx

The neutral test template all integration/contract/stress tests run
against. It is **derived from Microsoft's default PowerPoint template**
(the file PowerPoint uses for "new presentation"), so its XML is
Office-authored and guaranteed spec-clean -- a hand-built predecessor
carried subtle spec violations that made every derived deck trigger
PowerPoint's repair dialog.

Properties:

- 16:9 (13.333" x 7.5"), Office default theme, notes master included
- 11 standard layouts; five renamed to the role names the tests use:
  `TITLE_SLIDE` (title+subtitle), `CONTENT` (title+body), `TWO_COLUMN`
  (title+2 body), `DEFAULT` (blank), `PICTURE` (title+picture+body)
- one seed slide with a note (so the notes master part exists);
  pptc's seed builder strips slides/notes anyway
- passes `pptc tpl validate`

### Regeneration (one-time tool, NOT a runtime/test dependency)

Generated with python-pptx, which bundles the Microsoft default
template (`pptx/templates/default.pptx`):

```python
from pptx import Presentation
from pptx.util import Inches

p = Presentation()                     # Microsoft default template
p.slide_width = Inches(13.333)
p.slide_height = Inches(7.5)
for i, name in {0: "TITLE_SLIDE", 1: "CONTENT", 3: "TWO_COLUMN",
                6: "DEFAULT", 8: "PICTURE"}.items():
    p.slide_layouts[i].name = name
slide = p.slides.add_slide(p.slide_layouts[0])
slide.placeholders[0].text = "Seed"
slide.notes_slide.notes_text_frame.text = "Seed-Notiz"
p.save("test/fixtures/neutral-template.pptx")
```

Run with any Python that has `python-pptx` installed
(`pip install python-pptx`). The committed .pptx is the source of
truth -- regeneration is only needed when the fixture's layout set
must change.
