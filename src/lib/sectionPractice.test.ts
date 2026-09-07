import {expect, it} from "vitest";
import {getSections} from "./rehearsal";
import {sectionRange} from "./sectionPractice";
import type {Song} from "../types";
const song = {duration:20, lines:[
  {id:"a",section:"Chorus",sectionId:"c1",start:1,end:3,confidence:1},
  {id:"b",section:"Chorus",sectionId:"c1",start:3,end:5,confidence:1},
  {id:"c",section:"Verse",sectionId:"v",start:5,end:8,confidence:1},
  {id:"d",section:"Chorus",sectionId:"c2",start:8,end:11,confidence:1},
]} as Song;
it("keeps repeated choruses distinct and loops all the lines in a section",()=>{
  const sections=getSections(song);
  expect(sections.map(s=>s.name)).toEqual(["Chorus 1","Verse","Chorus 2"]);
  expect(sectionRange(song,sections[0])).toEqual([0,1]);
  expect(sectionRange(song,sections[2])).toEqual([3,3]);
});
it("requires reliable timing throughout the section",()=>{
  const draft={...song,lines:song.lines.map((l,i)=>i===1?{...l,confidence:0.1}:l)};
  expect(sectionRange(draft,getSections(draft)[0])).toBeNull();
});
