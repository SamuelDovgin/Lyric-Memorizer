/** Offline, deterministic keyword suggestions; never edits a song. */
import {createRequire} from 'node:module';
const emojis = createRequire(import.meta.url)('emojilib');
import {readFileSync} from 'node:fs';
const normalize = text => text.normalize('NFKC').toLowerCase().replaceAll('_', ' ').replace(/[^\p{L}\p{N}\s]/gu, '').trim();
const index = new Map();
for (const [emoji, words] of Object.entries(emojis)) {
  for (const [position, word] of words.entries()) {
    const key = normalize(word);
    if (!key) continue;
    const entries = index.get(key) ?? [];
    if (!entries.some(entry => entry.emoji === emoji)) entries.push({emoji, keyword:word, score:position === 0 ? 100 : 70});
    index.set(key, entries);
  }
}
for (const entries of index.values()) entries.sort((a,b) => b.score-a.score || (a.emoji < b.emoji ? -1 : a.emoji > b.emoji ? 1 : 0));
if (process.argv.includes('--stats')) {
  console.log(JSON.stringify({emojis:Object.keys(emojis).length, searchTerms:index.size, keywordLinks:[...index.values()].reduce((n, v) => n+v.length,0)},null,2));
} else {
  const fileIndex = process.argv.indexOf('--file');
  const text = fileIndex >= 0 ? readFileSync(process.argv[fileIndex+1], 'utf8') : process.argv.slice(2).join(' ');
  if (!text) throw new Error('Provide lyric text or --file path-to-lyrics.txt');
  const stop = new Set('a an the i you he she it we they me my your our their is are was were be been to of in on at and or but if as with for do does did would could should'.split(' '));
  const lines = text.split(/\r?\n/).map((line, lineIndex) => {
    const words = line.split(/\s+/).filter(Boolean);
    const matches=[];
    for (let wordIndex=0;wordIndex<words.length;wordIndex++) {
      for (let length=Math.min(3,words.length-wordIndex);length>=1;length--) {
        const phrase=normalize(words.slice(wordIndex, wordIndex+length).join(' '));
        if (stop.has(phrase)) continue;
        let candidates=index.get(phrase), matched=phrase;
        if (!candidates && length===1 && phrase.endsWith('s') && !phrase.endsWith('ss')) {
          matched=phrase.slice(0,-1); candidates=index.get(matched);
        }
        if (candidates) matches.push({wordIndex,anchor:words[wordIndex],phrase,matched,opening:wordIndex<5,candidates:candidates.slice(0,5)});
      }
    }
    return {lineIndex,lineText:line,matches};
  });
  console.log(JSON.stringify(lines,null,2));
}
