import { captionFonts, ensureCaptionFont, fontDefinition, fontStyle, sanitizeFontName } from './fonts.js';
export function fontPicker({patch}) {
  const select=document.querySelector('#design-font'), custom=document.querySelector('#custom-font-fields'), input=document.querySelector('#custom-font-name'), preview=document.querySelector('#font-preview'), status=document.querySelector('#font-status');
  let generation=0, current;
  for (const group of ['Clean','Bold','Rounded','Handwritten','Serif','Monospace']) {
    const options=document.createElement('optgroup');options.label=group;
    options.append(...captionFonts.filter(font=>font.group===group).map(font=>new Option(font.name,font.id)));select.append(options);
  }
  select.append(new Option('My installed font…','custom'));
  select.onchange=()=>patch({design:{font:select.value}});
  document.querySelector('#apply-custom-font').onclick=()=>{
    const name=sanitizeFontName(input.value);
    if(!name){status.textContent='Enter a font family name, such as DIN Next or Arial.';input.focus();return;}
    patch({design:{font:'custom',customFont:name}});
  };
  input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();document.querySelector('#apply-custom-font').click();}};
  function render(design) {
    if(document.activeElement!==select)select.value=design.font;
    custom.hidden=design.font!=='custom';
    if(document.activeElement!==input)input.value=design.customFont||'';
    const key=JSON.stringify([design.font,design.customFont]);if(key===current)return;current=key;
    const ticket=++generation, style=fontStyle(design);preview.style.fontFamily=style.family;preview.style.fontWeight=style.weight;
    status.textContent=design.font==='custom'?'Install this font on the computer running the studio and OBS. Missing fonts use a fallback.':'Loading font…';
    void ensureCaptionFont(design).then(ok=>{if(ticket!==generation||design.font==='custom')return;status.textContent=ok?`${fontDefinition(design).name} · some languages may use fallback glyphs.`:'Font could not load. Showing a fallback.';});
  }
  return {render};
}
