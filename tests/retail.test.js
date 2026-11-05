import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseProductJsonLd, ikeaTitle, parseSizeFromTitle, classifyProductUrl, imageFromUrl, cleanTitle, productsFromSearchResults, fetchProductPage } from '../server/retail.js'

const PAGE = `<html><head><script type="application/ld+json">
{ "@context": "http://schema.org", "@type": "Product", "name": "GLOSTAD",
  "image": "https://d2xjmi1k71iy2m.cloudfront.net/dairyfarm/id/images/349/1234948_PE917261_S4.jpg",
  "description": "Buy GLOSTAD 3-seat sofa, Knisa dark grey with best price on IKEA Online Furniture. ✓ 0% installment",
  "sku": "405.959.37",
  "offers": { "@type": "Offer", "url" : "https://www.ikea.co.id/en/products/sofas/sofas/glostad-art-40595937", "priceCurrency": "IDR", "price": "2295000", "availability": "http://schema.org/InStock" } }
</script></head><body>…</body></html>`

describe('schema.org product data (IKEA Indonesia pages)', () => {
  it('reads name, image, price, sku and stock', () => {
    const p = parseProductJsonLd(PAGE)
    assert.equal(p.name, 'GLOSTAD')
    assert.equal(p.priceIDR, 2295000)
    assert.equal(p.sku, '405.959.37')
    assert.equal(p.availability, 'InStock')
    assert.match(p.image, /cloudfront/)
    assert.equal(ikeaTitle(p), 'GLOSTAD 3-seat sofa, Knisa dark grey')
  })
  it('drops placeholder image folders', () => {
    const page = PAGE.replace(/"image":\s*(\[[^\]]*\]|"[^"]*")/, '"image": "https://d2xjmi1k71iy2m.cloudfront.net/dairyfarm/id/images/"')
    assert.equal(parseProductJsonLd(page).image, null)
  })
  it('ignores pages without Product data', () => {
    assert.equal(parseProductJsonLd('<script type="application/ld+json">{"@type":"Organization"}</script>'), null)
    assert.equal(parseProductJsonLd('<html></html>'), null)
  })
  it('decodes HTML entities in titles', () => {
    assert.equal(ikeaTitle({ description: 'Buy VIMUND children&#039;s chair with best price' }), "VIMUND children's chair")
  })
  it('parses real sizes from product names', () => {
    assert.deepEqual(parseSizeFromTitle('LACK coffee table, white, 118x78 cm', 'coffee_table'), { w: 1.18, d: 0.78 })
    assert.deepEqual(parseSizeFromTitle('KURILERLARK rug high pile, orange, 160 x 230 cm', 'rug'), { w: 2.3, d: 1.6 })
    assert.deepEqual(parseSizeFromTitle('MALM bed frame, high, 160x200 cm', 'bed'), { w: 1.7, d: 2.12 })
    assert.equal(parseSizeFromTitle('GLOSTAD 3-seat sofa', 'sofa'), null)
  })
  it('refuses URLs with query strings (robots.txt) without fetching', async () => {
    let called = false
    await assert.rejects(fetchProductPage('https://www.ikea.co.id/en/products/x?y=1', { fetchImpl: () => { called = true } }))
    assert.equal(called, false)
  })
  it('stops reading the page once the product data is found', async () => {
    const res = new Response(PAGE + 'x'.repeat(100000), { status: 200 })
    const p = await fetchProductPage('https://www.ikea.co.id/en/products/sofas/sofas/glostad-art-40595937', { fetchImpl: async () => res })
    assert.equal(p.priceIDR, 2295000)
  })
})

describe('marketplace URLs from Meta web search', () => {
  it('accepts product pages on Indonesian stores only', () => {
    assert.equal(classifyProductUrl('https://shop-id.tokopedia.com/view/product/1731234186184459937?_svg=1').store, 'Tokopedia')
    assert.equal(classifyProductUrl('https://shopee.co.id/Lampu-Lantai-Rotan-i.1705577770.56619607366').store, 'Shopee')
    assert.equal(classifyProductUrl('https://www.tokopedia.com/search?q=sofa'), null)
    assert.equal(classifyProductUrl('https://shopee.ph/x-i.1.2'), null)
    assert.equal(classifyProductUrl('https://www.zara.com/tr/en/sofa-p1.html'), null)
    assert.equal(classifyProductUrl('not a url'), null)
  })
  it('strips tracking parameters and reads the image from og_info', () => {
    const url = 'https://shop-id.tokopedia.com/view/product/1730183713925465383?_svg=1&og_info=%7B%22title%22%3A%22Sofa%22%2C%22image%22%3A%22https%3A%5C%2F%5C%2Fp16-oec-sg.ibyteimg.com%5C%2Fa.webp%22%7D'
    assert.equal(classifyProductUrl(url).cleanUrl, 'https://shop-id.tokopedia.com/view/product/1730183713925465383')
    assert.equal(imageFromUrl(url), 'https://p16-oec-sg.ibyteimg.com/a.webp')
  })
  it('cleans store suffixes from titles', () => {
    assert.equal(cleanTitle('￼Yohana Sofa Canesa 3s Dudukan - Shop | Tokopedia'), 'Yohana Sofa Canesa 3s Dudukan')
    assert.equal(cleanTitle('Jual Blackwhite Kloset Duduk | Shopee Indonesia'), 'Blackwhite Kloset Duduk')
  })
  it('keeps only verified product pages, deduplicated', () => {
    const out = productsFromSearchResults([
      { title: 'CANIS - Sofa Minimalis 3 Seater | XIONCO', url: 'https://shop-id.tokopedia.com/view/product/1?a=1' },
      { title: 'CANIS again', url: 'https://shop-id.tokopedia.com/view/product/1?a=2' },
      { title: '3-seater Sofas | ZARA Turkey', url: 'https://www.zara.com/tr/en/home.html' },
      { title: 'Sofa tidur', url: 'https://shopee.co.id/product/40375394/17522011373' },
    ])
    assert.deepEqual(out.map(p => p.store), ['Tokopedia', 'Shopee'])
    assert.ok(out.every(p => p.priceIDR === null && p.source === 'meta-web-search'))
  })
})
