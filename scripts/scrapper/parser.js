import * as cheerio from 'cheerio';
const normalize = (value) => value.replace(/\s+/g, ' ').trim();
const unique = (items) => [...new Set(items)];
export function parseApiPage(html, sourceUrl) {
    const $ = cheerio.load(html);
    // VitePress normally renders documentation inside .vp-doc.
    const doc = $('.vp-doc').first().length ? $('.vp-doc').first() : $('main').first();
    if (!doc.length)
        throw new Error(`No documentation content found at ${sourceUrl}`);
    // Remove elements that are ancillary to the documentation body.
    doc.find('script,style,.header-anchor,.copy,.copy-code,.line-numbers-wrapper,.vp-code-title').remove();
    const headings = doc.find('h1,h2,h3,h4,h5,h6').toArray();
    const entries = [];
    const stack = [];
    const pageTitle = normalize(doc.find('h1').first().text()) || normalize($('title').text());
    const page = { title: pageTitle, url: sourceUrl, description: '', entries };
    for (const heading of headings) {
        const level = Number(heading.tagName[1]);
        const headingEl = $(heading);
        const name = normalize(headingEl.text());
        if (!name)
            continue;
        const id = headingEl.attr('id') || name.toLowerCase().replace(/[^\w-]+/g, '-');
        const entry = {
            name, id, level, url: `${sourceUrl.split('#')[0]}#${encodeURIComponent(id)}`,
            description: '', signatures: [], aliases: [], examples: [], notes: [], children: [],
        };
        const descriptions = [];
        // Collect siblings only until the next heading, preserving nesting by using flat heading order.
        let node = headingEl.next();
        while (node.length && !/^h[1-6]$/i.test(node[0]?.tagName || '')) {
            const tag = node[0]?.tagName?.toLowerCase();
            if (tag === 'p') {
                const text = normalize(node.text());
                if (text) {
                    const alias = text.match(/^Aliases?\s*:\s*(.+)$/i);
                    if (alias)
                        entry.aliases.push(...alias[1].split(/,\s*/).map(normalize));
                    else
                        descriptions.push(text);
                }
            }
            else if (tag === 'ul' || tag === 'ol') {
                node.children('li').each((_, li) => {
                    const text = normalize($(li).text());
                    if (text) {
                        const alias = text.match(/^Aliases?\s*:\s*(.+)$/i);
                        if (alias)
                            entry.aliases.push(...alias[1].split(/,\s*/).map(normalize));
                        else
                            entry.notes.push(text);
                    }
                });
            }
            else if (tag === 'div' || tag === 'pre') {
                const seen = new Set();
                node.find('pre').addBack('pre').each((_, pre) => {
                    const el = $(pre);
                    const codeEl = el.find('code').first();
                    // VitePress may use spans for syntax-highlighting and line numbers.
                    const lines = el.find('.line').toArray();
                    const code = (lines.length ? lines.map(line => $(line).text()).join('\n') : codeEl.length ? codeEl.text() : el.text()).trim();
                    if (!code || seen.has(code))
                        return;
                    seen.add(code);
                    const classes = `${el.attr('class') || ''} ${codeEl.attr('class') || ''} ${el.parent().attr('class') || ''}`;
                    const language = classes.match(/(?:language-|\blang-)([\w+-]+)/)?.[1] || null;
                    entry.examples.push({ language, code });
                    if (/\b(function|interface|type|declare|export\s+(?:function|interface|type|const))\b/.test(code) && code.length < 2000) {
                        entry.signatures.push(code);
                    }
                });
                if (!node.find('pre').length && tag === 'div') {
                    const classes = node.attr('class') || '';
                    if (/custom-block|warning|tip|danger|info/.test(classes)) {
                        const note = normalize(node.text());
                        if (note)
                            entry.notes.push(note);
                    }
                }
            }
            node = node.next();
        }
        entry.description = descriptions.join('\n\n');
        entry.signatures = unique(entry.signatures);
        entry.aliases = unique(entry.aliases);
        if (level === 1) {
            page.description = entry.description;
            // h1 is a page header, not a method. Retain its examples if present.
            entries.push(entry);
            stack.length = 0;
            stack.push(entry);
            continue;
        }
        while (stack.length && stack[stack.length - 1].level >= level)
            stack.pop();
        if (stack.length)
            stack[stack.length - 1].children.push(entry);
        else
            entries.push(entry);
        stack.push(entry);
    }
    return page;
}
