import { marked } from 'marked';

export type DocCategory = 'stock' | 'quant';

export type Heading = {
  depth: number;
  text: string;
  id: string;
};

export type StudyDoc = {
  slug: string;
  chapter: number;
  category: DocCategory;
  categoryLabel: string;
  title: string;
  subtitle: string;
  description: string;
  href: string;
  raw: string;
  html: string;
  headings: Heading[];
  searchText: string;
  readingMinutes: number;
};

const modules = import.meta.glob('../../docs/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

marked.use({
  gfm: true,
  breaks: false,
});

const slugger = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');

const stripWikiLinks = (raw: string) =>
  raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('[['))
    .join('\n')
    .trim();

const plainText = (value: string) =>
  value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/[#*_>|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const extractChapter = (path: string) => {
  const fileName = path.split('/').pop() ?? '';
  return Number.parseInt(fileName.replace('.md', ''), 10);
};

const extractHeadings = (content: string): Heading[] => {
  const counts = new Map<string, number>();

  return content
    .split('\n')
    .map((line) => /^(#{1,3})\s+(.+)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => {
      const text = match[2].replace(/#+$/, '').trim();
      const base = slugger(text);
      const count = counts.get(base) ?? 0;
      counts.set(base, count + 1);

      return {
        depth: match[1].length,
        text,
        id: count ? `${base}-${count + 1}` : base,
      };
    });
};

const addHeadingIds = (content: string, headings: Heading[]) => {
  let index = 0;

  return content
    .split('\n')
    .map((line) => {
      if (!/^(#{1,3})\s+/.test(line.trim())) return line;

      const heading = headings[index];
      index += 1;

      if (!heading) return line;
      return `${line} {#${heading.id}}`;
    })
    .join('\n');
};

const buildDoc = ([path, rawModule]: [string, unknown]): StudyDoc => {
  const chapter = extractChapter(path);
  const raw = stripWikiLinks(String(rawModule));
  const headings = extractHeadings(raw);
  const title = headings.find((heading) => heading.depth === 1)?.text ?? `${chapter}장`;
  const subtitle = headings.find((heading) => heading.depth === 2)?.text ?? '';
  const firstParagraph =
    raw
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#') && !line.startsWith('---') && !line.startsWith('```')) ?? '';
  const category: DocCategory = chapter >= 7 ? 'quant' : 'stock';
  const slug = `${chapter}`;
  const html = marked.parse(addHeadingIds(raw, headings), { async: false }) as string;
  const searchText = plainText(`${title} ${subtitle} ${raw}`);

  return {
    slug,
    chapter,
    category,
    categoryLabel: category === 'stock' ? '주식' : '퀀트',
    title,
    subtitle,
    description: plainText(firstParagraph).slice(0, 120),
    href: `/${category}/${slug}/`,
    raw,
    html,
    headings,
    searchText,
    readingMinutes: Math.max(1, Math.ceil(searchText.length / 700)),
  };
};

export const allDocs = Object.entries(modules)
  .map(buildDoc)
  .sort((a, b) => a.chapter - b.chapter);

export const stockDocs = allDocs.filter((doc) => doc.category === 'stock');
export const quantDocs = allDocs.filter((doc) => doc.category === 'quant');

export const getDocsByCategory = (category: DocCategory) =>
  category === 'stock' ? stockDocs : quantDocs;

export const getDoc = (category: DocCategory, slug: string) =>
  allDocs.find((doc) => doc.category === category && doc.slug === slug);

export const searchIndex = allDocs.map(({ title, subtitle, categoryLabel, href, searchText }) => ({
  title,
  subtitle,
  categoryLabel,
  href,
  searchText,
}));
