import { describe, expect, it } from 'vitest';
import {
  fingerprintOf,
  groupIssues,
  MAX_SNIPPET_LENGTH,
  normalizeSelector,
  scrubSnippet,
} from '../../../src/scanner/results/issues.js';
import { page, rule } from '../../helpers/scan-data.js';

describe('normalizeSelector (spec 6.6)', () => {
  it.each([
    ['ul > li:nth-child(3) > a', 'ul > li > a'],
    ['div:nth-of-type(2) img', 'div img'],
    ['#product-123456 > button', '#* > button'],
    ['#shopify-section-template--1234__main .btn', '#* .btn'],
    ['#header', '#header'],
    ['#h1', '#h1'],
    ['.css-1a2b3c4 > span', '.* > span'],
    ['.sc-AxjAm.button', '.*.button'],
    ['.jsx-123456789 a', '.* a'],
    ['.svelte-xyz12ab p', '.* p'],
    ['.css-ab', '.css-ab'],
    ['  main   >  a ', 'main > a'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeSelector(input)).toBe(expected);
  });
});

describe('fingerprintOf', () => {
  it('is sha256 of rule|template|selector', () => {
    const fp = fingerprintOf('image-alt', 'product', 'img');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintOf('image-alt', 'product', 'img')).toBe(fp);
    expect(fingerprintOf('image-alt', 'collection', 'img')).not.toBe(fp);
  });
});

describe('scrubSnippet (spec 11.5)', () => {
  it('removes value attributes in every quoting style', () => {
    expect(scrubSnippet('<input type="text" value="secret" name="q">')).toBe(
      '<input type="text" name="q">',
    );
    expect(scrubSnippet("<input value='secret'>")).toBe('<input>');
    expect(scrubSnippet('<input value=secret>')).toBe('<input>');
    expect(scrubSnippet('<input VALUE = "x">')).toBe('<input>');
  });

  it('removes emails and phone numbers', () => {
    expect(scrubSnippet('<a href="mailto:jane.doe@example.co.uk">jane.doe@example.co.uk</a>')).toBe(
      '<a href="mailto:[email]">[email]</a>',
    );
    expect(scrubSnippet('<p>Call +1 (555) 123-4567 today</p>')).toBe('<p>Call [phone] today</p>');
    expect(scrubSnippet('<p>Call 020 7946 0958</p>')).toBe('<p>Call [phone]</p>');
  });

  it('keeps prices, years and short numbers', () => {
    expect(scrubSnippet('<p>$19.99 since 2019, size 42</p>')).toBe(
      '<p>$19.99 since 2019, size 42</p>',
    );
  });

  it('truncates to 2,000 characters', () => {
    const long = scrubSnippet(`<div>${'a'.repeat(5_000)}</div>`);
    expect(long.length).toBe(MAX_SNIPPET_LENGTH);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('groupIssues (P1-09)', () => {
  it('turns the same element on 50 pages of one template into 1 issue with 50 occurrences', () => {
    const pages = Array.from({ length: 50 }, (_, i) =>
      page(`https://s.test/products/p${i}`, 'product', [
        rule('button-name', [`#add-${100_000 + i} > .css-${'abcdef'.slice(i % 3)}x1y2z`]),
      ]),
    );
    const issues = groupIssues(pages);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      ruleId: 'button-name',
      templateKey: 'product',
      occurrenceCount: 50,
    });
    expect(issues[0]!.pageUrls).toHaveLength(50);
  });

  it('keeps the same element on different templates apart', () => {
    const issues = groupIssues([
      page('https://s.test/', 'home', [rule('image-alt', ['img'])]),
      page('https://s.test/cart', 'cart', [rule('image-alt', ['img'])]),
    ]);
    expect(issues).toHaveLength(2);
  });

  it('counts each (page, target) once and takes the highest impact', () => {
    const issues = groupIssues([
      page('https://s.test/a', 'page', [
        rule('color-contrast', ['p.faint', 'p.faint'], 'moderate'),
      ]),
      page('https://s.test/b', 'page', [rule('color-contrast', ['p.faint'], 'serious')]),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ occurrenceCount: 2, impact: 'serious' });
  });

  it('marks issues seen only as "incomplete" as needing review', () => {
    const issues = groupIssues([
      page('https://s.test/a', 'page', [], {
        incomplete: [rule('color-contrast', ['h1'], 'serious')],
      }),
      page('https://s.test/b', 'page', [rule('color-contrast', ['p'])], {
        incomplete: [rule('color-contrast', ['p'], 'serious')],
      }),
    ]);
    expect(issues.find((i) => i.selector === 'h1')!.needsReview).toBe(true);
    expect(issues.find((i) => i.selector === 'p')!.needsReview).toBe(false);
  });

  it('ignores pages that were not scanned OK', () => {
    expect(
      groupIssues([
        page('https://s.test/a', 'page', [rule('image-alt', ['img'])], { status: 'timeout' }),
      ]),
    ).toEqual([]);
  });

  it('flattens iframe and shadow DOM targets', () => {
    const issues = groupIssues([
      page('https://s.test/a', 'page', [
        {
          ruleId: 'label',
          impact: 'critical',
          tags: [],
          nodes: [
            {
              target: ['iframe#chat', 'my-widget >>> input'],
              html: '<input>',
              failureSummary: '',
              impact: 'critical',
            },
          ],
        },
      ]),
    ]);
    expect(issues[0]!.occurrences[0]!.target).toBe('iframe#chat |> my-widget >>> input');
  });

  it('scrubs snippets', () => {
    const issues = groupIssues([
      page('https://s.test/a', 'page', [
        {
          ruleId: 'label',
          impact: 'critical',
          tags: [],
          nodes: [
            {
              target: ['input'],
              html: '<input value="me@x.com">',
              failureSummary: undefined,
              impact: 'critical',
            },
          ],
        },
      ]),
    ]);
    expect(issues[0]!.htmlSnippet).toBe('<input>');
  });
});
