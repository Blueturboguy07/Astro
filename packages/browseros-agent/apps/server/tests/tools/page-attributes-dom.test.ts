import { describe, expect, it } from 'bun:test'
import { buildContentMarkdownExpression } from '@browseros/browser-core/content-markdown'
import { buildAttributeLinesExpression } from '@browseros/browser-mcp/tools/page-attributes'
import { parseHTML } from 'linkedom'

/* Astro 0.2.4 QA, F-070 (UC-31): the star rating of books.toscrape.com is
   only a class ("star-rating Three"); no Chat Mode tool could see it. The
   page scripts run here against a small DOM. */

const BOOKS = `<html><body><ol class="row">
<li><article class="product_pod">
  <div class="image_container"><a href="a-light/index.html"><img src="a.jpg" alt="A Light in the Attic" class="thumbnail"></a></div>
  <p class="star-rating Three"><i class="icon-star"></i><i class="icon-star"></i><i class="icon-star"></i><i class="icon-star"></i><i class="icon-star"></i></p>
  <h3><a href="a-light/index.html" title="A Light in the Attic">A Light in the ...</a></h3>
  <div class="product_price"><p class="price_color">£51.77</p></div>
</article></li>
<li><article class="product_pod">
  <p class="star-rating One"><i class="icon-star"></i></p>
  <h3><a href="tipping/index.html" title="Tipping the Velvet">Tipping the Velvet</a></h3>
</article></li>
</ol>
<div class="review"><span role="img" aria-label="4.5 out of 5 stars"></span> 120 reviews</div>
<div class="stars"><i class="fa fa-star"></i><i class="fa fa-star"></i><i class="fa fa-star-half"></i></div>
<img src="poster.jpg" alt="Star Wars poster">
<input type="password" value="secret" class="pw">
</body></html>`

function run(expression: string, html = BOOKS): string {
  const { document } = parseHTML(html)
  const evaluate = new Function(
    'document',
    'window',
    'getComputedStyle',
    `return ${expression}`,
  )
  return evaluate(document, { innerHeight: 800, innerWidth: 1200 }, () => ({
    display: 'block',
    visibility: 'visible',
  }))
}

describe('read format="attributes" / grep over="attributes"', () => {
  it('lists the rating class next to the title, in page order', () => {
    const lines = run(buildAttributeLinesExpression({ maxLines: 100 })).split(
      '\n',
    )
    const rating = lines.indexOf('p class="star-rating Three"')
    const title = lines.findIndex((l) =>
      l.includes('title="A Light in the Attic"'),
    )
    expect(rating).toBeGreaterThan(-1)
    expect(title).toBeGreaterThan(rating)
    expect(lines).toContain('p class="price_color" | £51.77')
    expect(lines).toContain('p class="star-rating One"')
    expect(lines).toContain('span role="img" aria-label="4.5 out of 5 stars"')
  })

  it('never lists form values', () => {
    const out = run(buildAttributeLinesExpression({ maxLines: 100 }))
    expect(out).toContain('input class="pw"')
    expect(out).not.toContain('secret')
  })

  it('takes a selector and says when the list is cut', () => {
    const scoped = run(
      buildAttributeLinesExpression({ selector: 'ol', maxLines: 3 }),
    )
    expect(scoped.split('\n')[0]).toBe('ol class="row"')
    expect(scoped).toContain(
      '[list cut at 3 elements; pass a selector to narrow it]',
    )
    expect(
      run(buildAttributeLinesExpression({ selector: '#none', maxLines: 3 })),
    ).toBe('')
  })
})

describe('read markdown: rating hints', () => {
  const md = run(buildContentMarkdownExpression({}))

  it('shows icon-only ratings by their class or label', () => {
    expect(md).toContain('[class="star-rating Three"]')
    expect(md).toContain('[class="star-rating One"]')
    expect(md).toContain('[4.5 out of 5 stars]')
    expect(md).toContain(
      '[class="stars" icons: fa fa-star, fa fa-star, fa fa-star-half]',
    )
  })

  it('keeps titles and prices and adds no hint to other images', () => {
    expect(md).toContain('£51.77')
    expect(md).toContain('Tipping the Velvet')
    expect(md).not.toContain('Star Wars')
  })
})
