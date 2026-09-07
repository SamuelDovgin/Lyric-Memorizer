import {expect, it} from "vitest";
import {densityCandidates, pinsAtDensity} from "./emojiDensity";
import type {Song} from "../types";
it("uses only reviewed pins and increases smoothly across the slider", () => {
  const words=Array.from({length:60},(_,i)=>`word${i}`);
  const text=words.join(' ');
  const pins=words.map((anchor,wordIndex)=>({lineId:'l',lineText:text,wordIndex,anchor,emoji:'🔑',meaning:'Reviewed',confidence:wordIndex}));
  const song={lines:[{id:'l',text}],emojiPins:pins} as unknown as Song;
  const candidates=densityCandidates(song);
  expect(pinsAtDensity(candidates,0)).toHaveLength(0);
  expect(pinsAtDensity(candidates,50)).toHaveLength(30);
  expect(pinsAtDensity(candidates,100)).toHaveLength(60);
  expect(pinsAtDensity(candidates,1)[0].confidence).toBe(59);
  for(let d=0;d<100;d++) {
    const old=pinsAtDensity(candidates,d), next=pinsAtDensity(candidates,d+1);
    expect(next.length-old.length).toBeLessThanOrEqual(1);
    expect(next.slice(0,old.length)).toEqual(old);
  }
});
it("never generates dictionary pins and excludes stale annotations", () => {
  const song={lines:[{id:'l',text:'door phone'}],emojiPins:[]} as unknown as Song;
  expect(densityCandidates(song)).toEqual([]);
  song.emojiPins=[{lineId:'l',lineText:'old',wordIndex:0,anchor:'old',emoji:'❌',meaning:'Old'}];
  expect(densityCandidates(song)).toEqual([]);
});
